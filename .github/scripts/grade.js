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
    // STEP 2: LOAD PARSER (Cheerio with Location Info)
    // =========================================================
    // We enable sourceCodeLocationInfo to get the exact line/index of tags
    const $ = cheerio.load(htmlContent, { sourceCodeLocationInfo: true });

    // =========================================================
    // STEP 3: MANUAL H1 PLACEMENT CHECK
    // =========================================================
    // Logic: If the H1 starts BEFORE the Body tag, it's a structure error.
    let h1PlacementError = false;
    
    const bodyTag = $('body').get(0);
    const h1Tag = $('h1').get(0);

    // Helper to safely get start index (works for parse5/cheerio versions)
    function getStartIndex(node) {
        if (!node) return null;
        if (typeof node.startIndex === 'number') return node.startIndex;
        if (node.sourceCodeLocation && typeof node.sourceCodeLocation.startOffset === 'number') return node.sourceCodeLocation.startOffset;
        return null;
    }

    const bodyStart = getStartIndex(bodyTag);
    const h1Start = getStartIndex(h1Tag);

    // Scenario A: H1 and Body both exist and have locations.
    if (bodyStart !== null && h1Start !== null) {
        if (h1Start < bodyStart) {
            h1PlacementError = true;
        }
    } 
    // Scenario B: Body has NO location (Implicitly created by parser) BUT user wrote "<body>" in file.
    // This means content (like H1) forced the body open before the actual <body> tag appeared.
    else if (bodyTag && bodyStart === null && htmlContent.toLowerCase().includes('<body')) {
        h1PlacementError = true;
    }
    // Scenario C: H1 exists but NO body tag at all in DOM (Rare, but possible if malformed)
    else if (h1Tag && !bodyTag) {
        h1PlacementError = true;
    }

    // =========================================================
    // STEP 4: SYNTAX SCORING
    // =========================================================
    let syntaxScore = 3;
    let syntaxMsg = "Syntax looks clean.";
    
    const hasBadList = criticalErrors.some(e => e.message.includes('<ul>') && e.message.includes('content'));

    if (h1PlacementError) {
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
    // STEP 5: STRUCTURE & SEMANTICS
    // =========================================================
    
    // Count Valid Tags (Check if they have content)
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

    if (syntaxScore === 1) {
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
    // STEP 6: CODE HYGIENE
    // =========================================================
    const commentRegex = /<!--[\s\S]*?-->/g;
    const hasComments = commentRegex.test(htmlContent);
    let hygieneScore = hasComments ? 3 : 0;
    let hygieneMsg = hasComments ? "Comments found!" : "No comments found.";

    // =========================================================
    // STEP 7: CONTENT
    // =========================================================
    const hasH1 = isValidTag('h1');
    const hasP = isValidTag('p');
    
    let contentScore = 1;
    let contentMsg = "Page is missing major requirements.";

    if (hasH1 && hasP && hasValidList) {
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