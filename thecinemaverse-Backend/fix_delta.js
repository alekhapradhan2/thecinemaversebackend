const fs = require('fs');
const p = 'c:\\Users\\BYTEIQ\\Documents\\thecinemaversebackend\\thecinemaverse-Backend\\server.js';
let content = fs.readFileSync(p, 'utf8');

const targetStr = `  // §4b  PREVIOUS STORED CUMULATIVE TOTAL
  const previousIndiaNetNum = parseToRupeesGlobal(movie.boxOffice?.total || "0");
  const previousOverseasNum = parseToRupeesGlobal(movie.boxOffice?.overseasCollection || "0");
  const previousGrossNum = parseToRupeesGlobal(movie.boxOffice?.grossCollection || "0");

  // §4c  DAILY DELTAS
  let dailyNetNum = scrapedIndiaNetNum - previousIndiaNetNum;
  let dailyOverseasNum = scrapedOverseasNum - previousOverseasNum;

  // Data Correction Handling
  if (dailyNetNum < 0 || dailyOverseasNum < 0) {`;

const replaceStr = `  const yesterdayEntry = existingDays.find(d => d.date === yesterdayStr);

  // §4b  PREVIOUS STORED CUMULATIVE TOTAL
  let previousIndiaNetNum = parseToRupeesGlobal(movie.boxOffice?.total || "0");
  let previousOverseasNum = parseToRupeesGlobal(movie.boxOffice?.overseasCollection || "0");
  const previousGrossNum = parseToRupeesGlobal(movie.boxOffice?.grossCollection || "0");

  if (yesterdayEntry) {
    previousIndiaNetNum -= parseToRupeesGlobal(yesterdayEntry.net || "0");
    previousOverseasNum -= parseToRupeesGlobal(yesterdayEntry.overseas || "0");
  }

  // §4c  DAILY DELTAS
  let dailyNetNum = scrapedIndiaNetNum - previousIndiaNetNum;
  let dailyOverseasNum = scrapedOverseasNum - previousOverseasNum;

  // Data Correction Handling
  if (dailyNetNum < 0 || dailyOverseasNum < 0) {`;

// Normalize line endings for replacement to work across OS
content = content.replace(/\r\n/g, '\n');
const targetStrNormalized = targetStr.replace(/\r\n/g, '\n');

if (content.includes(targetStrNormalized)) {
    content = content.replace(targetStrNormalized, replaceStr);
} else {
    console.error("Target string not found (part 1)!");
}

const targetStr2 = `  const dailyGrossRaw = dailyGrossNum > 0 ? formatINR(dailyGrossNum) : "";

  // §4c-guard  ZERO / NEGATIVE DELTA — Sacnilk hasn't updated yet.
  const yesterdayEntry = existingDays.find(d => d.date === yesterdayStr);
  if (dailyNetNum === 0 && dailyOverseasNum === 0 && !yesterdayEntry) {`;

const replaceStr2 = `  const dailyGrossRaw = dailyGrossNum > 0 ? formatINR(dailyGrossNum) : "";

  // §4c-guard  ZERO / NEGATIVE DELTA — Sacnilk hasn't updated yet.
  if (dailyNetNum === 0 && dailyOverseasNum === 0 && !yesterdayEntry) {`;

const targetStr2Normalized = targetStr2.replace(/\r\n/g, '\n');
if (content.includes(targetStr2Normalized)) {
    content = content.replace(targetStr2Normalized, replaceStr2);
    fs.writeFileSync(p, content);
    console.log("Successfully patched server.js");
} else {
    console.error("Target string not found (part 2)!");
}
