const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'public', 'super-admin.html');
let html = fs.readFileSync(filePath, 'utf8');

// Remove the orphaned block: everything between the end of the new dashboard div
// and the start of the Schools Tab comment (the duplicate old content)
// The new dashboard ends with:  </div>\n\n            <!-- Schools Tab -->
// The orphan block looks like it's inside a <div id="tab-schools"... but with old stat cards inside it

// Strategy: find the second occurrence of <!-- Schools Tab --> and remove from the first </div> after the dashboard to that second occurrence
const dashboardEnd = html.indexOf('            </div>\n\n            <!-- Schools Tab -->');
const secondSchoolsComment = html.indexOf('<!-- Schools Tab -->', dashboardEnd + 10);

if (dashboardEnd > -1 && secondSchoolsComment > -1) {
    // Remove from end of dashboard div to the second Schools Tab comment
    const before = html.slice(0, dashboardEnd + '            </div>'.length + 2);
    const after = html.slice(secondSchoolsComment - 12); // keep the "            "
    html = before + after;
    fs.writeFileSync(filePath, html);
    console.log('SUCCESS - removed duplicate block. Lines:', html.split('\n').length);
} else {
    console.log('Pattern not found. dashboardEnd:', dashboardEnd, 'secondSchoolsComment:', secondSchoolsComment);
    // Print context around position 188 lines
    const lines = html.split('\n');
    for (let i = 185; i < 200; i++) {
        console.log(i+1 + ': ' + lines[i]);
    }
}
