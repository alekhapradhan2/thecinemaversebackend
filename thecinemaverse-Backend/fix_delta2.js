const fs = require('fs');
const p = 'c:\\Users\\BYTEIQ\\Documents\\thecinemaversebackend\\thecinemaverse-Backend\\server.js';
let content = fs.readFileSync(p, 'utf8');

const targetStr = `  if (yesterdayEntry) {
    previousIndiaNetNum -= parseToRupeesGlobal(yesterdayEntry.net || "0");
    previousOverseasNum -= parseToRupeesGlobal(yesterdayEntry.overseas || "0");
  }`;

const replaceStr = `  if (yesterdayEntry) {
    let sumBeforeYesterdayNet = 0;
    let sumBeforeYesterdayOverseas = 0;
    for (const d of existingDays) {
      if (d.date !== yesterdayStr) {
        sumBeforeYesterdayNet += parseToRupeesGlobal(d.net || "0");
        sumBeforeYesterdayOverseas += parseToRupeesGlobal(d.overseas || "0");
      }
    }
    previousIndiaNetNum = sumBeforeYesterdayNet;
    previousOverseasNum = sumBeforeYesterdayOverseas;
  }`;

// Normalize line endings for replacement to work across OS
content = content.replace(/\r\n/g, '\n');
const targetStrNormalized = targetStr.replace(/\r\n/g, '\n');

if (content.includes(targetStrNormalized)) {
    content = content.replace(targetStrNormalized, replaceStr);
    fs.writeFileSync(p, content);
    console.log("Successfully patched server.js with robust self-healing delta logic");
} else {
    console.error("Target string not found!");
}
