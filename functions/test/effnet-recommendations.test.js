"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { CONDITIONS, PROMPT_VERSION, prepareScan, standardRecommendation, requestGemini } = require("../recommendations");
const reportTemplate = require("../agronomist-prompt");
const metrics = require("../../models/efficientnet_metrics.json");
const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const names = ["No Disease", "Fruit Fasciation Disorder", "Fruit Rot Disease", "Multiple Crown Disorder"];
const region = (index, confidence = 42) => ({
  classifier_class_index: index, classifier_class_name: metrics.class_indices[index],
  classification_available: true, efficientnet_confidence_percent: confidence,
  detector_class_name: "bird", yolo_confidence_percent: 99.1,
  class_name: names[index].replaceAll(" ", "_"), pretty_class_name: names[index]
});
const scan = detections => ({
  // An incorrect summary must not replace the actual EffNet output.
  topClass: "Crown Rot Disease", topConfidence: 98, statusType: "monitor",
  detectionCount: detections.length, detections, classificationAvailable: true,
  inferenceMode: "region-classification", modelVersion: "yolov8m-5d4a90cdc7a2-effnetb0-43adddf64b22-roi-v1",
  note: "PRIVATE_NOTE", userCondition: "concerning", farmId: "PRIVATE_FARM"
});

for (const [index, name] of names.entries()) {
  test(`${name}: recommendations use the supplied EffNet mapping and relevant basic actions`, async () => {
    const prepared = prepareScan(scan([region(index)]));
    assert.equal(prepared.inconclusive, false);
    assert.equal(prepared.input.condition, name);
    assert.equal(prepared.input.confidence, 42);
    assert.equal(prepared.input.classifier, "EfficientNet-B0");
    assert.equal(prepared.input.classificationScope, "yolo-regions");
    const condition = CONDITIONS.find(item => item.label === name);
    assert.deepEqual(standardRecommendation(prepared).actions, condition.actions);
    const result = await requestGemini(prepared, { apiKey: "test-only-key", photo, fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const payload = JSON.parse(body.contents[0].parts[0].text);
      assert.equal(payload.result.condition, name);
      assert.deepEqual(body.contents[0].parts[1].inlineData, { mimeType: "image/jpeg", data: photo.toString("base64") });
      assert.deepEqual(payload.immediateActions, condition.actions.map(action => action.text));
      assert.equal(payload.topics.length, 15);
      const prompt = body.systemInstruction.parts[0].text;
      assert.ok(prompt.includes(reportTemplate));
      assert.match(prompt, /Review both before applying the report instructions/);
      assert.match(prompt, /take precedence over conflicting directions/);
      assert.match(reportTemplate, /^### 15\. FOLLOW-UP MONITORING/m);
      const text = JSON.stringify(body);
      for (const forbidden of ["bird", "99.1", "PRIVATE_NOTE", "PRIVATE_FARM"]) assert.ok(!text.includes(forbidden), forbidden);
      const content = { actions: payload.immediateActions, sections: Array(15).fill("a") };
      return { ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(content) }] } }] }) };
    } });
    assert.equal(result.source, "gemini");
    assert.ok(result.actions.length >= 2);
    assert.equal(PROMPT_VERSION, "pineapple-agronomist-v7");
    assert.equal(result.sections.length, 15);
    assert.match(result.analysis, /hard to interpret/);
    assert.doesNotMatch(JSON.stringify(result.sections), /Recorded variety/);
  });
}

test("mixed regions retain all EffNet conditions and prioritize a nonhealthy classification", () => {
  const prepared = prepareScan(scan([region(0, 95), region(2, 45), region(1, 55)]));
  assert.equal(prepared.input.condition, "Fruit Fasciation Disorder");
  assert.equal(prepared.input.confidence, 55);
  assert.deepEqual(prepared.input.regions.map(item => item.condition), ["No Disease", "Fruit Rot Disease", "Fruit Fasciation Disorder"]);
});

test("crop v3 excludes results rejected by the classifier threshold from condition advice", () => {
  const result = scan([{ ...region(2, 49), classification_accepted: false }]);
  result.modelVersion = "yolov8m-28a5c00ab63b-effnetb0-5b0e1f7211aa-roi-v3";
  result.inferenceMode = undefined;
  const prepared = prepareScan(result);
  assert.equal(prepared.inconclusive, true);
  assert.deepEqual(prepared.input.regions, []);
  assert.equal(prepared.condition, null);
  assert.equal(standardRecommendation(prepared).source, "standard");
});

test("crop v2 model versions retain the verified EffNet mapping when older records omit inferenceMode", () => {
  const input = { ...scan([region(2, 54)]),
    modelVersion: "yolov8m-28a5c00ab63b-effnetb0-43adddf64b22-roi-v2" };
  delete input.inferenceMode;
  const prepared = prepareScan(input);
  assert.equal(prepared.input.classifier, "EfficientNet-B0");
  assert.equal(prepared.input.condition, "Fruit Rot Disease");
  assert.equal(prepared.input.confidence, 54);
});

test("missing, inconsistent or detection-only classifier data cannot trigger condition AI", async () => {
  const cases = [scan([]), scan([{ ...region(2), classifier_class_name: "No_Disease" }]),
    scan([{ ...region(2), classification_available: false }]), scan([{ ...region(2), efficientnet_confidence_percent: null }]),
    { ...scan([region(2)]), detectionCount: 2 }, { ...scan([region(2)]), classificationAvailable: false }];
  for (const input of cases) {
    const prepared = prepareScan(input);
    assert.equal(prepared.inconclusive, true);
    let called = false;
    await assert.rejects(requestGemini(prepared, { apiKey: "test", fetchImpl: async () => { called = true; } }));
    assert.equal(called, false);
  }
});

test("known cultivar and growth stage personalize locally while private text stays out of the provider request", async () => {
  for (const [cultivar, expected] of [
    ["Smooth_Cayenne", "Smooth Cayenne"], ["Queen / Formosa", "Queen (Formosa)"], ["Native Philippine Red", "Red Spanish"]
  ]) {
    const result = await requestGemini(prepareScan({ ...scan([region(2, 82)]), cultivar, growthStage: "harvest_window" }), {
      apiKey: "test", fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        const payload = JSON.parse(body.contents[0].parts[0].text);
        assert.deepEqual(Object.keys(payload), ["result", "immediateActions", "topics"]);
        for (const privateData of ["harvest_window", "PRIVATE_NOTE", "PRIVATE_FARM", "Recorded variety:"]) {
          assert.ok(!JSON.stringify(payload).includes(privateData), privateData);
        }
        return { ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [
          { text: JSON.stringify({ actions: payload.immediateActions.slice(1), sections: Array(15).fill("b") }) }
        ] } }] }) };
      }
    });
    assert.ok(result.sections[0].text.includes(expected));
    assert.ok(result.sections[12].text.includes(expected));
    assert.match(result.sections[13].text, /Near harvest/);
    assert.match(result.actions[0].text, /areas of decay/);
  }
});

test("agronomist output rejects omitted sections, invented advice, and numeric claims", async () => {
  const prepared = prepareScan({ ...scan([region(3)]), cultivar: "Unknown private notes", growthStage: "Unknown private stage" });
  assert.deepEqual(prepared.reportContext, { cultivar: null, stage: null });
  for (const content of [
    { actions: [prepared.condition.actions[0].text], sections: Array(14).fill("a") },
    { actions: [prepared.condition.actions[0].text], sections: Array(15).fill("Apply 10 mL of bleach.") },
    { actions: ["Apply two spoonfuls of bleach."], sections: Array(15).fill("a") }
  ]) {
    await assert.rejects(requestGemini(prepared, { apiKey: "test", fetchImpl: async () => ({
      ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: {
        parts: [{ text: JSON.stringify(content) }]
      } }] })
    }) }), error => error.code === "AI_RESPONSE_REJECTED");
  }
});
