// Explicit live audit: synthetic metadata only, no user records or images.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadAiEnvironment } from './local-ai-config.mjs';
const { CONDITIONS, MODEL, PROMPT_VERSION, prepareScan, requestGemini } = createRequire(import.meta.url)('../functions/recommendations.js');

if (!process.argv.includes('--live')) {
  console.log('Usage: node scripts/check-ai-recommendations.mjs --live [--only=category|category] [--output=path]. Makes up to eight sequential Gemini requests using synthetic model results only.');
  process.exit(0);
}
const { GEMINI_API_KEY } = loadAiEnvironment(path.join(os.homedir(), '.config/agri-vision/ai.env'));
if (!GEMINI_API_KEY) throw new Error('Configure the private Gemini key before running the live audit.');
const cases = CONDITIONS.map(condition => ({ name: condition.label, scan: {
  topClass: condition.label, topConfidence: 82.5, detectionCount: 1,
  statusType: condition.type === 'healthy' ? 'healthy' : 'risk', modelVersion: 'recommendation-audit-v1',
  detections: [{ class_name: condition.label, efficientnet_confidence_percent: 82.5 }]
} }));
cases.push({ name: 'Mixed: No Disease + Crown Rot Disease', scan: {
  topClass: 'No Disease', topConfidence: 82.5, detectionCount: 2, statusType: 'monitor', modelVersion: 'recommendation-audit-v1',
  detections: [{ class_name: 'No Disease', efficientnet_confidence_percent: 82.5 }, { class_name: 'Crown Rot Disease', efficientnet_confidence_percent: 64 }]
} });
const report = { testedAt: new Date().toISOString(), model: MODEL, promptVersion: PROMPT_VERSION,
  syntheticDataOnly: true, privateRecordsUsed: false, automaticRetries: false, cases: [] };
const selectedNames = process.argv.find(value => value.startsWith('--only='))?.slice('--only='.length).split('|');
if (selectedNames?.some(name => !cases.some(item => item.name === name))) throw new Error('Unknown audit category.');
for (const item of cases.filter(item => !selectedNames || selectedNames.includes(item.name))) {
  const start = Date.now();
  let httpStatus;
  const fetchImpl = async (...args) => { const response = await fetch(...args); httpStatus = response.status; return response; };
  let result;
  try {
    const recommendation = await requestGemini(prepareScan(item.scan), { apiKey: GEMINI_API_KEY, fetchImpl });
    result = { condition: item.name, passed: true, httpStatus, elapsedMs: Date.now() - start,
      source: recommendation.source, actionCount: recommendation.actions.length };
  } catch (error) {
    result = { condition: item.name, passed: false, httpStatus: httpStatus ?? null, elapsedMs: Date.now() - start,
      code: error.code || 'UNKNOWN', message: error.message };
  }
  report.cases.push(result);
  console.log(JSON.stringify(result));
}
report.passed = report.cases.every(result => result.passed);
const output = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length);
if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.passed ? 0 : 1;
