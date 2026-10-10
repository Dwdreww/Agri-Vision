"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("research CSV exports only approved columns and escapes spreadsheet formulas", async () => {
  const { buildResearchCsv } = await import("../../src/research-csv.js");
  const csv = buildResearchCsv([{ month: "2026-10", statusType: "healthy", topClass: '=HYPERLINK("private")',
    topConfidence: 90, detectionCount: 1, modelVersion: "pilot-v1", userCondition: "normal",
    note: "PRIVATE NOTE", email: "private@example.com", uid: "private-uid", photo: "PRIVATE PHOTO" }]);
  assert.equal(csv.split("\r\n")[0], "month,statusType,topClass,topConfidence,detectionCount,modelVersion,userCondition");
  assert.ok(csv.includes('"\'=HYPERLINK(""private"")"'));
  for (const privateValue of ["PRIVATE NOTE", "private@example.com", "private-uid", "PRIVATE PHOTO"]) assert.ok(!csv.includes(privateValue));
});
