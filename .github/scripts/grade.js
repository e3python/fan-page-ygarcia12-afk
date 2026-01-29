const fs = require('fs');
const cheerio = require('cheerio');
const { HtmlValidate } = require('html-validate');

const FILE_PATH = 'index.html';
const MAX_SCORE = 12; 

let score = 0;
let feedbackRows = [];

function addResult(category, scoreEarned, maxPoints, msg) {
    const passed = scoreEarned === maxPoints;
    const icon = passed ? '✅' : (scoreEarned > 0 ? '⚠️' : '❌');
    score += scoreEarned;
    feedbackRows.push(`| ${icon} | **${category}** | ${scoreEarned}/${maxPoints} pts | ${msg} |`);
}

try {
    if (!fs.existsSync(FILE_PATH)) {
        console.error('❌ FATAL: index.html not found!');
        process.exit(1);
    }

    const htmlContent = fs.readFileSync(FILE_PATH, 'utf8');

    // =========================================================
    // STEP 0: TEMPLATE / LOW EFFORT DETECTION
    // =========================================================
    const $ = cheerio.load(htmlContent, { sourceCodeLocationInfo: true });
    
    // FIX: Use root().text() to catch text even if it's outside <body> due to broken tags
    const allText = $.root().text().replace(/\s+/g, ' ').trim();
    const characterCount = allText.length;
    
    // Check for "Default/Boilerplate" titles
    const pageTitle = $('title').text().trim().toLowerCase();
    // It is default if it is 'document', 'title', or empty
    const isDefaultTitle = pageTitle === 'document' || pageTitle === 'title' || pageTitle === '';

    // Check for valid block tags
    const hasBlockTags = $('body').find('p, h1, h2, h3, li, div').length > 0;
    
    // DRAFT STATE DETECTION
    // High character count (>60) but NO structure tags.
    const isDraftState = characterCount > 60 && !hasBlockTags;

    // FAIL CONDITION: Minimal text AND no tags.
    if (characterCount < 40 && !hasBlockTags) {
        addResult('Project Status', 0, 12, `❌ **Unsubmitted / Incomplete:** Your page only has ${characterCount} characters of text. Please add your content!`);
        const summary = `
# 📝 Grading Report: HTML Fan Page
| Status | Category | Score | Feedback |
| :---: | :--- | :--- | :--- |
${feedbackRows.join('\n')}
### 🏆 Total Score: 0 / ${MAX_SCORE}
`;
        if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
        fs.writeFileSync('grading-feedback.md', summary);
        console.log(summary);
        process.exit(1);
    }

    // =========================================================
    // STEP 1: STRICT VALIDATION (html-validate)
    // =========================================================
    const validator = new HtmlValidate({
        extends: ["html-validate:recommended"],
        rules: {
            "close-order": "error", 
            "no-implicit-close": "error",
            "element-permitted-content": "error",
            "element-permitted-order": "error",
            "void-style": "off",
            "no-trailing-whitespace": "off",
            "missing-doctype": "off"
        }
    });

    const report = validator.validateString(htmlContent);
    const validErrors = report && report.results && report.results.length > 0 && report.results[0].messages ? report.results[0].messages : [];
    const criticalErrors = validErrors.filter(msg => msg.severity === 2);
    
    // =========================================================
    // STEP 2: MANUAL H1 PLACEMENT CHECK
    // =========================================================
    let h1PlacementError = false;
    const bodyTag = $('body').get(0);
    const h1Tag = $('h1').get(0);

    function getStartIndex(node) {
        if (!node) return null;
        if (typeof node.startIndex === 'number') return node.startIndex;
        if (node.sourceCodeLocation && typeof node.sourceCodeLocation.startOffset === 'number') return node.sourceCodeLocation.startOffset;
        return null;
    }

    const bodyStart = getStartIndex(bodyTag);
    const h1Start = getStartIndex(h1Tag);

    if (bodyStart !== null && h1Start !== null) {
        if (h1Start < bodyStart) h1PlacementError = true;
    } else if (bodyTag && bodyStart === null && htmlContent.toLowerCase().includes('<body')) {
        h1PlacementError = true;
    } else if (h1Tag && !bodyTag) {
        h1PlacementError = true;
    }

    // =========================================================
    // STEP 3: SYNTAX SCORING
    // =========================================================
    let syntaxScore = 3;
    let syntaxMsg = "Syntax looks clean.";
    
    const hasBadList = criticalErrors.some(e => e.message.includes('<ul>') && e.message.includes('content'));

    if (isDraftState) {
        syntaxScore = 1; 
        syntaxMsg = "⚠️ **Draft Detected:** You have content, but no HTML tags! Wrap your title in `<h1>` and text in `<p>` tags.";
    } else if (h1PlacementError) {
        syntaxScore = 1;
        syntaxMsg = "❌ Critical Syntax: Your `<h1>` tag is placed BEFORE the `<body>` tag. It must be inside.";
    } else if (criticalErrors.length > 0) {
        syntaxScore = 1;
        if (hasBadList) {
            syntaxMsg = "❌ Critical Syntax: You have text directly inside a `<ul>`. Text MUST be inside `<li>` tags.";
        } else {
            syntaxMsg = `❌ Major Syntax Errors: Found ${criticalErrors.length} errors. (e.g., ${criticalErrors[0].message})`;
        }
    }

    // =========================================================
    // STEP 4: STRUCTURE & SEMANTICS
    // =========================================================
    let validTagCount = 0;
    function isValidTag(tagName) {
        const el = $(tagName);
        if (el.length === 0) return false;
        return el.text().trim().length > 0;
    }

    if (isValidTag('h1')) validTagCount++;
    if (isValidTag('h2') || isValidTag('h3')) validTagCount++;
    if (isValidTag('p')) validTagCount++;
    
    const hasValidList = $('ul').children('li').length > 0 || $('ol').children('li').length > 0;
    if (hasValidList) validTagCount++;

    const h1Count = $('h1').length;
    let structureScore = 1;
    let structureMsg = "Used fewer than 2 tag types.";

    if (isDraftState) {
        structureScore = 1;
        structureMsg = "⚠️ **Next Step:** You need to pick which tags (`h1`, `p`, `ul`) match your content.";
    } else if (syntaxScore === 1) {
        structureScore = 1; 
        structureMsg = "⚠️ Cannot rate Structure because Syntax is broken. Fix your HTML errors first!";
    } else if (validTagCount >= 3 && h1Count === 1) {
        structureScore = 3;
        structureMsg = `Excellent! Used ${validTagCount} valid tag types correctly.`;
    } else if (validTagCount >= 2) {
        structureScore = 2;
        structureMsg = "Good start, but try using more tag types (like Lists or Subtitles).";
    }

    // =========================================================
    // STEP 5: CODE HYGIENE
    // =========================================================
    const commentRegex = /<!--[\s\S]*?-->/g;
    const hasComments = commentRegex.test(htmlContent);
    let hygieneScore = hasComments ? 3 : 0;
    let hygieneMsg = hasComments ? "Comments found!" : "No comments found.";

    // =========================================================
    // STEP 6: CONTENT
    // =========================================================
    const hasH1 = isValidTag('h1');
    const hasP = isValidTag('p');
    let contentScore = 1;
    let contentMsg = "Page is missing major requirements.";

    if (isDraftState) {
        contentScore = 2; 
        contentMsg = "✅ **Content Found:** Good job writing your text! Now turn it into code.";
    } else if (hasH1 && hasP && hasValidList) {
        contentScore = 3;
        contentMsg = "Page is substantial! (Title + Para + List)";
    } else if (hasH1 && (hasP || hasValidList)) {
        contentScore = 2;
        contentMsg = "Good start, but missing Paragraphs or a List.";
    }

    // =========================================================
    // FINAL REPORT
    // =========================================================
    addResult('Structure & Semantics', structureScore, 3, structureMsg);
    addResult('Code Hygiene', hygieneScore, 3, hygieneMsg);
    addResult('Content & Planning', contentScore, 3, contentMsg);
    addResult('Syntax & Bugs', syntaxScore, 3, syntaxMsg);

    // BONUS CHECK: Did they customize the Browser Tab Title?
    // This isn't in the rubric, but it's an "Exceeded Expectations" marker.
    if (!isDefaultTitle && !isDraftState) {
        feedbackRows.push(`| 🌟 | **Bonus: Browser Title** | -- | You changed the browser tab name to "${pageTitle}". Way to go above and beyond! |`);
    }

    const summary = `
# 📝 Grading Report: HTML Fan Page

| Status | Category | Score | Feedback |
| :---: | :--- | :--- | :--- |
${feedbackRows.join('\n')}

### 🏆 Total Score: ${score} / ${MAX_SCORE}
`;

    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    fs.writeFileSync('grading-feedback.md', summary);
    console.log(summary);

    if (score < 8) process.exit(1); 

} catch (error) {
    console.error(error);
    process.exit(1);
}