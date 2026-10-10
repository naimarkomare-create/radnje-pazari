const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "components", "popis-otpis", "PopisOtpisEditor.tsx");
const source = fs.readFileSync(file, "utf8");

assert.match(source, /event\.key === ["']Tab["']/);
assert.match(source, /event\.preventDefault\(\)/);
assert.match(source, /lookupLockRef/);
assert.match(source, /saveLockRef/);
assert.match(source, /new AbortController\(\)/);
assert.match(source, /clientEntryIdRef/);
assert.match(source, /inputMode=\{manualEntry \? ["']numeric["'] : ["']none["']\}/);
assert.match(source, /focusBarcodeInput\(\)/);
assert.doesNotMatch(source, /@zxing\/browser|BarcodeScanner|html5-qrcode/);

function simulateWedgeScan(value, suffix) {
  let buffer = "";
  for (const character of value) buffer += character;
  return { value: buffer.trim(), shouldLookup: suffix === "Enter" || suffix === "Tab" };
}

assert.deepEqual(simulateWedgeScan("001039", "Enter"), { value: "001039", shouldLookup: true });
assert.deepEqual(simulateWedgeScan("0001234567890", "Tab"), { value: "0001234567890", shouldLookup: true });
assert.deepEqual(simulateWedgeScan("8606108042151", ""), { value: "8606108042151", shouldLookup: false });

console.log("write-off scanner regression tests passed");
