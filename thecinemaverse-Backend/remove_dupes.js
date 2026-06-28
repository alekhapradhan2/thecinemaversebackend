const fs = require('fs');
const file = 'c:/Users/BYTEIQ/Documents/Ollypidea/Ollypedia-Backend/server.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// 0-indexed: 6559 to 6664
if (lines[6559].includes('async function generateWeekendAI(movie, days, weekendNum, totalNet) {') && 
    lines[6663].includes('}')) {
    lines.splice(6559, 106); // 6559 to 6664 inclusive is 106 lines. 6664 is likely empty or a comment.
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    console.log('Successfully removed duplicate functions.');
} else {
    console.log('Error: Lines do not match expected functions. Safety abort.');
}
