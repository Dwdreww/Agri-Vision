"use strict";

const STATUS_TYPES = new Set(["monitor", "risk", "healthy"]);
const USER_CONDITIONS = new Set(["normal", "concerning", "unsure"]);

function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} is missing or invalid`);
  }
  return value.trim();
}

function monthOf(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    throw new Error("createdAt must be a Firestore timestamp");
  }
  const date = timestamp.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("createdAt is invalid");
  }
  return date.toISOString().slice(0, 7);
}

// This explicit whitelist is the only content written to researchResults.
function sanitizedResearchResult(scan) {
  const topClass = requiredText(scan.topClass, "topClass", 120);
  const modelVersion = requiredText(scan.modelVersion, "modelVersion", 120);
  if (!STATUS_TYPES.has(scan.statusType)) {
    throw new Error("statusType is invalid");
  }
  if (typeof scan.topConfidence !== "number" ||
      !Number.isFinite(scan.topConfidence) ||
      scan.topConfidence < 0 || scan.topConfidence > 100) {
    throw new Error("topConfidence must be between 0 and 100");
  }
  if (!Number.isInteger(scan.detectionCount) ||
      scan.detectionCount < 0 || scan.detectionCount > 10000) {
    throw new Error("detectionCount is invalid");
  }

  const result = {
    topClass,
    topConfidence: scan.topConfidence,
    detectionCount: scan.detectionCount,
    statusType: scan.statusType,
    modelVersion,
    month: monthOf(scan.createdAt),
  };
  if (scan.userCondition != null && scan.userCondition !== "") {
    if (!USER_CONDITIONS.has(scan.userCondition)) {
      throw new Error("userCondition is invalid");
    }
    result.userCondition = scan.userCondition;
  }
  return result;
}

module.exports = { sanitizedResearchResult };
