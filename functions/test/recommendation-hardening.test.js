"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { CONDITIONS, prepareScan, validateContent, requestGemini, PROMPT_VERSION } = require("../recommendations");

const scanFor = condition => ({ topClass: condition.label, topConfidence: 82.5, detectionCount: 1,
  statusType: condition.type === "healthy" ? "healthy" : "risk", modelVersion: "audit-v1" });
const preparedFor = condition => prepareScan(scanFor(condition));
const contentFor = condition => ({ analysis: `${condition.description} This is a model-reported possibility; inspect the plant in person.`,
  concerns: condition.type === "healthy" ? [] : [condition.description], actions: condition.actions, tips: [] });
const envelope = content => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(content) }] } }] });
const response = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });

for (const condition of CONDITIONS) {
  test(`${condition.label}: provider contract, approved care and private-data boundary`, async () => {
    const scan = { ...scanFor(condition), topClass: `  ${condition.label.toUpperCase().replaceAll(" ", "__")}  `,
      note: "PRIVATE_NOTE", uid: "PRIVATE_ACCOUNT", farmName: "PRIVATE_FARM", preparedImage: "PRIVATE_IMAGE" };
    const prepared = prepareScan(scan);
    assert.equal(prepared.condition?.label, condition.label);
    const advice = await requestGemini(prepared, { apiKey: "private-key", fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const payload = JSON.parse(body.contents[0].parts[0].text);
      const text = JSON.stringify(body);
      for (const secret of ["PRIVATE_NOTE", "PRIVATE_ACCOUNT", "PRIVATE_FARM", "PRIVATE_IMAGE", "private-key"]) assert.ok(!text.includes(secret));
      if (prepared.agronomist) {
        assert.deepEqual(payload.immediateActions, condition.actions.map(action => action.text));
        assert.equal(payload.topics.length, 10);
        return response(envelope({ actions: payload.immediateActions, sections: Array(10).fill("a") }));
      }
      assert.equal(payload.reviewedGuidance[0].type, condition.type);
      assert.deepEqual(payload.reviewedGuidance[0].actions, condition.actions);
      assert.match(body.systemInstruction.parts[0].text, /No Disease/);
      assert.match(body.systemInstruction.parts[0].text, /physiological/);
      assert.ok(body.generationConfig.responseSchema.properties.actions.items.properties.text.enum.includes(condition.actions[0].text));
      return response(envelope(contentFor(condition)));
    } });
    assert.equal(advice.source, "gemini");
    assert.equal(advice.actions.length, condition.actions.length);
    assert.notEqual(PROMPT_VERSION, "pineapple-care-v2");
  });
}

test("ordinary uncertainty and assessment disclaimers work in every class", () => {
  const disclaimers = [
    "This scanner does not assess ripeness, freshness, or food safety.",
    "A photo does not establish a diagnosis.",
    "This is not a definitive medical diagnosis.",
    "No infection is confirmed by this scan.",
    "An infection cannot be confirmed from this result.",
    "A photo can't confirm a diagnosis.",
    "A photo can’t confirm a diagnosis.",
    "This prediction is not guaranteed.",
    "This is a possible developmental disorder, rather than a confirmed infection."
  ];
  for (const condition of CONDITIONS) {
    for (const disclaimer of disclaimers) assert.doesNotThrow(() => validateContent({ ...contentFor(condition), tips: [disclaimer] }, preparedFor(condition)), `${condition.label}: ${disclaimer}`);
  }
});

test("negation in one field cannot hide an affirmative claim in another", () => {
  const condition = CONDITIONS[0];
  const prepared = preparedFor(condition);
  for (const patch of [
    { analysis: "This is not", tips: ["confirmed. Inspect the plant."] },
    { analysis: "This is not a diagnosis. The infection is confirmed." },
    { analysis: "The plant is healthy and disease-free." },
    { analysis: "The diagnosis is certain." },
    { analysis: "This is not a diagnosis. Apply pesticide." },
    { analysis: "This scanner does not assess ripeness. The fruit is safe to eat." },
    { analysis: "No infection is confirmed. The infection is confirmed." },
    { tips: ["Burn all plants in the growing area."] }
  ]) assert.throws(() => validateContent({ ...contentFor(condition), ...patch }, prepared), error => error.code === "AI_RESPONSE_REJECTED");
});

test("unreviewed care steps are rejected even when they contain no banned treatment words", () => {
  const condition = CONDITIONS[0];
  assert.throws(() => validateContent({ ...contentFor(condition), actions: [{ text: "Burn all plants in the growing area.", reason: "Remove the issue." }] }, preparedFor(condition)), error => error.code === "AI_RESPONSE_REJECTED");
});

test("mixed detections receive reviewed guidance for each reported supported class only", async () => {
  const healthy = CONDITIONS.find(c => c.type === "healthy");
  const risk = CONDITIONS[0];
  const prepared = prepareScan({ ...scanFor(healthy), detectionCount: 2, detections: [
    { class_name: risk.label, efficientnet_confidence_percent: 65 },
    { class_name: "Invented Disease", efficientnet_confidence_percent: 90 },
    { class_name: risk.label, efficientnet_confidence_percent: 64 }
  ] });
  const result = await requestGemini(prepared, { apiKey: "key", fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    const payload = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(payload.reviewedGuidance.map(c => c.label), [healthy.label, risk.label]);
    assert.equal(payload.context.mixedConditions, true);
    return response(envelope({ ...contentFor(risk), actions: [risk.actions[0]] }));
  } });
  assert.equal(result.source, "gemini");
});

test("unknown, missing and zero-detection inputs never call Gemini directly", async () => {
  for (const scan of [{}, { topClass: "Unknown" }, { ...scanFor(CONDITIONS[0]), detectionCount: 0 }, { ...scanFor(CONDITIONS[0]), topConfidence: null }]) {
    let called = false;
    await assert.rejects(requestGemini(prepareScan(scan), { apiKey: "key", fetchImpl: async () => { called = true; return response({}); } }), error => error.status === 400);
    assert.equal(called, false);
  }
});

test("malformed and incomplete provider envelopes return specific recoverable reasons", async () => {
  const prepared = preparedFor(CONDITIONS[0]);
  const cases = [
    [null, "AI_RESPONSE_INVALID"], [{}, "AI_RESPONSE_INVALID"],
    [{ candidates: {} }, "AI_RESPONSE_INVALID"],
    [{ candidates: [{ finishReason: "STOP", content: { parts: {} } }] }, "AI_RESPONSE_INVALID"],
    [{ candidates: [{ finishReason: "STOP", content: { parts: [null] } }] }, "AI_RESPONSE_INVALID"],
    [{ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "internal only" }] } }] }, "AI_RESPONSE_INVALID"],
    [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, "AI_INCOMPLETE"],
    [{ candidates: [{ finishReason: "SAFETY" }] }, "AI_BLOCKED"],
    [{ promptFeedback: { blockReason: "SAFETY" } }, "AI_BLOCKED"]
  ];
  for (const [value, code] of cases) await assert.rejects(requestGemini(prepared, { apiKey: "key", fetchImpl: async () => response(value) }), error => error.code === code, code);
  for (const value of ["not JSON", "x".repeat(65537)]) await assert.rejects(requestGemini(prepared, { apiKey: "key", fetchImpl: async () => ({ ok: true, text: async () => value }) }), error => error.code === "AI_RESPONSE_INVALID");
});

test("provider HTTP failures distinguish configuration, limits and availability without exposing raw errors", async () => {
  for (const [status, code] of [[400, "AI_CONFIGURATION"], [401, "AI_CONFIGURATION"], [403, "AI_CONFIGURATION"], [404, "AI_CONFIGURATION"], [429, "AI_RATE_LIMITED"], [500, "AI_PROVIDER_UNAVAILABLE"], [503, "AI_PROVIDER_UNAVAILABLE"]]) {
    let calls = 0;
    await assert.rejects(requestGemini(preparedFor(CONDITIONS[0]), { apiKey: "private-key", fetchImpl: async () => {
      calls++; return { ok: false, status, headers: new Headers({ "Retry-After": "15" }), text: async () => "PRIVATE_PROVIDER_ERROR" };
    } }), error => error.code === code && !error.message.includes("PRIVATE") && (status !== 429 || error.retryAfter === 15));
    assert.equal(calls, 1);
  }
});

test("schema violations, extra keys, duplicate steps and oversized fields are rejected", () => {
  const condition = CONDITIONS[0];
  for (const patch of [
    { analysis: "x".repeat(701) }, { actions: [] }, { actions: [condition.actions[0], condition.actions[0]] },
    { actions: [{ ...condition.actions[0], unexpected: "value" }] }, { tips: ["x".repeat(241)] },
    { extra: "value" }, { concerns: [null] }
  ]) assert.throws(() => validateContent({ ...contentFor(condition), ...patch }, preparedFor(condition)), error => ["AI_RESPONSE_INVALID", "AI_RESPONSE_REJECTED"].includes(error.code));
});

test("streamed provider responses are bounded before buffering the entire body", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65537)); },
    cancel() { cancelled = true; }
  });
  await assert.rejects(requestGemini(preparedFor(CONDITIONS[0]), { apiKey: "key",
    fetchImpl: async () => new Response(stream, { status: 200 })
  }), error => error.code === "AI_RESPONSE_INVALID");
  assert.equal(cancelled, true);
});

test("valid streamed responses ignore thinking parts and preserve only final JSON", async () => {
  const condition = CONDITIONS[0];
  const value = envelope(contentFor(condition));
  value.candidates[0].content.parts.unshift({ text: "INTERNAL_REASONING", thought: true });
  const result = await requestGemini(preparedFor(condition), { apiKey: "key",
    fetchImpl: async () => new Response(JSON.stringify(value), { status: 200 })
  });
  assert.equal(result.source, "gemini");
  assert.equal(JSON.stringify(result).includes("INTERNAL_REASONING"), false);
});

test("HTTP-date retry guidance is bounded and invalid retry hints use a safe default", async () => {
  const now = () => new Date("2026-10-22T12:00:00Z");
  for (const [header, expected] of [["Thu, 22 Oct 2026 12:02:00 GMT", 120], ["999999", 86400], ["garbage", 60], ["-1", 60]]) {
    await assert.rejects(requestGemini(preparedFor(CONDITIONS[0]), { apiKey: "key", now,
      fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": header }) })
    }), error => error.code === "AI_RATE_LIMITED" && error.retryAfter === expected);
  }
});

test("the timeout also bounds a response that stalls while reading its body", async () => {
  let providerSignal;
  await assert.rejects(requestGemini(preparedFor(CONDITIONS[0]), { apiKey: "key", timeoutMs: 5,
    fetchImpl: async (_url, options) => {
      providerSignal = options.signal;
      return { ok: true, text: () => new Promise(() => {}) };
    }
  }), error => error.code === "AI_TIMEOUT");
  assert.equal(providerSignal.aborted, true);
});
