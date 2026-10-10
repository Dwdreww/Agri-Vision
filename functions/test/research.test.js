"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { sanitizedResearchResult } = require("../research");

const scan = {
  topClass: "No Disease",
  topConfidence: 92.4,
  detectionCount: 2,
  statusType: "healthy",
  modelVersion: "yolo-v1+effnet-v1",
  createdAt: { toDate: () => new Date("2026-10-01T00:15:00+08:00") },
  userCondition: "normal",
  uid: "private-account-id",
  farmId: "private-farm-id",
  plotId: "private-plot-id",
  note: "private observation",
  preparedImagePath: "users/private-account-id/scans/one/prepared.jpg",
  annotatedImagePath: "users/private-account-id/scans/one/annotated.jpg",
  detections: [{ bbox: [1, 2, 3, 4] }],
};

test("research copy includes only approved fields and UTC month", () => {
  assert.deepEqual(sanitizedResearchResult(scan), {
    topClass: "No Disease",
    topConfidence: 92.4,
    detectionCount: 2,
    statusType: "healthy",
    modelVersion: "yolo-v1+effnet-v1",
    month: "2026-09",
    userCondition: "normal",
  });
});

test("research copy omits an unset user condition", () => {
  const result = sanitizedResearchResult({ ...scan, userCondition: null });
  assert.equal(Object.hasOwn(result, "userCondition"), false);
});

test("research copy rejects malformed prediction and condition", () => {
  assert.throws(() => sanitizedResearchResult({ ...scan, topConfidence: 101 }));
  assert.throws(() => sanitizedResearchResult({ ...scan, detectionCount: -1 }));
  assert.throws(() => sanitizedResearchResult({ ...scan, userCondition: "severe" }));
  assert.throws(() => sanitizedResearchResult({ ...scan, createdAt: "2026-10-01" }));
});
