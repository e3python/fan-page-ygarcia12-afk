const fs = require('fs');
const cheerio = require('cheerio');

// --- Configuration ---
const FILE_PATH = 'index.html';
const MAX_SCORE = 12; 

// --- Feedback Storage ---
let score = 0;
let feedbackRows = [];

// --- Helper Function ---
function addResult(category, passed, msg, points = 0) {
    const status = passed ? '✅' : '❌';
    if (passed) score += points;
    feedbackRows.push(`| ${status} | **${category}** | ${msg} |`);
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

    // --- CRITERIA 1: HTML STRUCTURE (3 pts) ---
    const usedTags = ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li'].filter(tag => $(tag).length > 0);
    if (usedTags.length >= 3) {
        addResult('Structure', true, `Used ${usedTags.length} different tags.`, 3);
    } else {
        addResult('Structure', false, `Only used ${usedTags.length} tags. Try adding lists or headers!`, 1);
    }

    // --- CRITERIA 2: CODE HYGIENE / COMMENTS (3 pts) ---
    const commentRegex = /<!--[\s\S]*?-->/g;
    if (commentRegex.test(htmlContent)) {
        addResult('Comments', true, 'Code is documented with comments.', 3);
    } else {
        addResult('Comments', false, 'No comments `<!-- -->` found.', 0);
    }

    // --- CRITERIA 3: CONTENT (3 pts) ---
    const hasPara = $('p').length >= 1;
    const hasList = $('ul').length > 0 || $('ol').length > 0;
    
    if (hasPara && hasList) {
        addResult('Content', true, 'Includes both paragraphs and lists.', 3);
    } else {
        addResult('Content', false, 'Missing a List or Paragraphs.', 1);
    }

    // --- CRITERIA 4: HIERARCHY (3 pts) ---
    if ($('h1').length === 1) {
        addResult('Hierarchy', true, 'Has exactly one Main Title (H1).', 3);
    } else {
        addResult('Hierarchy', false, `Found ${$('h1').length} H1 tags. (Should be exactly 1).`, 0);
    }

    // --- GENERATE SUMMARY ---
    const summary = `
# 📝 Grading Report: HTML Fan Page

| Status | Category | Feedback |
| :---: | :--- | :--- |
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