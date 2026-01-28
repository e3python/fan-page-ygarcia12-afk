const fs = require('fs');
const cheerio = require('cheerio');

// --- Configuration ---
const FILE_PATH = 'index.html';
const MAX_SCORE = 12; 

// --- Feedback Storage ---
let score = 0;
let feedbackRows = [];

// --- Helper Function ---
function addResult(category, scoreEarned, maxPoints, msg) {
    const passed = scoreEarned === maxPoints;
    const icon = passed ? '✅' : (scoreEarned > 0 ? '⚠️' : '❌');
    score += scoreEarned;
    feedbackRows.push(`| ${icon} | **${category}** | ${scoreEarned}/${maxPoints} pts | ${msg} |`);
}

try {
    // 1. Check if file exists
    if (!fs.existsSync(FILE_PATH)) {
        console.error('❌ FATAL: index.html not found!');
        if (process.env.GITHUB_STEP_SUMMARY) {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ❌ FATAL ERROR\n\nCould not find \`index.html\`. Did you name your file correctly?`);
        }
        process.exit(1);
    }

    const htmlContent = fs.readFileSync(FILE_PATH, 'utf8');
    const $ = cheerio.load(htmlContent);

    // =========================================================
    // RUBRIC ROW 1: HTML Structure & Semantics (Max 3 pts)
    // Criteria: 3+ different tags + Logical Hierarchy (One H1)
    // =========================================================
    const uniqueTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'br', 'hr'].filter(tag => $(tag).length > 0);
    const h1Count = $('h1').length;
    
    let structureScore = 1; // Default to Novice
    let structureMsg = "Used fewer than 2 tags.";

    if (uniqueTags.length >= 3 && h1Count === 1) {
        structureScore = 3; // Master Engineer
        structureMsg = `Excellent! Used ${uniqueTags.length} unique tags and exactly one Main Title (H1).`;
    } else if (uniqueTags.length >= 2) {
        structureScore = 2; // Apprentice
        if (h1Count !== 1) {
            structureMsg = `Good tag variety (${uniqueTags.length} tags), but hierarchy needs work (found ${h1Count} H1 tags).`;
        } else {
            structureMsg = `Good start, but try using more tag types (only found ${uniqueTags.length}).`;
        }
    }
    addResult('Structure & Semantics', structureScore, 3, structureMsg);


    // =========================================================
    // RUBRIC ROW 2: Code Hygiene (Max 3 pts)
    // Criteria: Comments present
    // =========================================================
    const commentRegex = /<!--[\s\S]*?-->/g;
    const hasComments = commentRegex.test(htmlContent);
    
    if (hasComments) {
        addResult('Code Hygiene', 3, 3, 'Comments found! Good job documenting your code.');
    } else {
        addResult('Code Hygiene', 0, 3, 'No comments found. Use `<!-- Note -->` to label sections.');
    }


    // =========================================================
    // RUBRIC ROW 3: Content & Planning (Max 3 pts)
    // Criteria: Substantial page (Title + Para + List)
    // =========================================================
    const hasH1 = $('h1').length > 0;
    const hasP = $('p').length > 0;
    const hasList = $('ul').length > 0 || $('ol').length > 0;

    let contentScore = 1;
    let contentMsg = "Page is missing major requirements (Title, List, or Paragraphs).";

    if (hasH1 && hasP && hasList) {
        contentScore = 3;
        contentMsg = "Page is substantial! Includes Title, Paragraphs, and a List.";
    } else if (hasH1 && (hasP || hasList)) {
        contentScore = 2;
        const missing = !hasP ? "Paragraphs" : "List";
        contentMsg = `Good start, but missing a ${missing}.`;
    }
    addResult('Content & Planning', contentScore, 3, contentMsg);


    // =========================================================
    // RUBRIC ROW 4: Syntax & Bugs (Max 3 pts)
    // Criteria: Valid syntax, content appears on screen
    // =========================================================
    // Cheerio is forgiving, so we check if body text exists and is substantial.
    // If syntax is very broken, text usually won't render or will be very short.
    const bodyText = $('body').text().trim();
    
    if (bodyText.length > 50) {
        addResult('Syntax & Bugs', 3, 3, 'Code renders content to the screen correctly.');
    } else if (bodyText.length > 0) {
        addResult('Syntax & Bugs', 2, 3, 'Content appears very thin. Check for unclosed tags.');
    } else {
        addResult('Syntax & Bugs', 1, 3, 'Page appears empty. Major syntax errors likely.');
    }


    // =========================================================
    // FINAL REPORT
    // =========================================================
    const summary = `
# 📝 Grading Report: HTML Fan Page

| Status | Category | Score | Feedback |
| :---: | :--- | :--- | :--- |
${feedbackRows.join('\n')}

### 🏆 Total Score: ${score} / ${MAX_SCORE}
`;

    // 1. Write to GitHub Action Summary (The "Pretty" View)
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }

    // 2. Write to a file for the PR Commenter
    fs.writeFileSync('grading-feedback.md', summary);

    // 3. Console Output (For Logs)
    console.log(summary);

    if (score < 8) process.exit(1); // Mark X if score is low

} catch (error) {
    console.error(error);
    process.exit(1);
}