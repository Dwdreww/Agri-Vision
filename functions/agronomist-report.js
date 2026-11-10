"use strict";

const reportTemplate = require("./agronomist-prompt");

const conditions = {
  "No Disease": {
    label: "No condition spotted in this photo",
    nature: "Continue routine care and check the fruit and leaves in person for any changes.",
    check: "Look for changes in fruit shape, soft spots or damaged leaves during your regular field visit."
  },
  "Fruit Fasciation Disorder": {
    label: "Possible fruit fasciation",
    nature: "A flattened or fan-shaped fruit can indicate a growth disorder. Note its shape, firmness and any separate signs of decay.",
    check: "Photograph the fruit from different sides and compare its shape with other fruit from the same block."
  },
  "Multiple Crown Disorder": {
    label: "Possible multiple crowns",
    nature: "Multiple crowns can be a growth disorder. Count the crowns, check their attachment and look for damage around them.",
    check: "Record the number of crowns and how they develop before deciding how to handle the fruit."
  },
  "Fruit Rot Disease": {
    label: "Possible fruit rot",
    nature: "Check the fruit for soft areas, leaking tissue and decay. Keep suspect fruit apart while you arrange an in-person assessment.",
    check: "Mark where suspect fruit was found and look for similar changes nearby during your next inspection."
  }
};

// Market profiles follow Philippine DA and DOST-PCAARRD cultivar references.
// https://bafs.da.gov.ph/wp-content/uploads/2025/04/IG-for-PNS-Pineapple.pdf
// https://ispweb.pcaarrd.dost.gov.ph/queen-pineapple/
// https://www.da.gov.ph/philippines-to-help-develop-myanmars-pina-fiber-industry/
const cultivars = {
  smooth_cayenne: {
    label: "Smooth Cayenne",
    maturity: "Compare Smooth Cayenne fruit against the maturity guide for your intended fresh or processing buyer.",
    market: "For Smooth Cayenne, check both fresh-market and processor grading. Ask about shape requirements before sorting unusually shaped fruit."
  },
  queen_formosa: {
    label: "Queen (Formosa)",
    maturity: "Use Queen (Formosa) maturity and quality guidance when checking fruit for the fresh market.",
    market: "For Queen (Formosa), ask fresh-market buyers or local processors what grades they accept after inspecting fruit quality."
  },
  red_spanish: {
    label: "Red Spanish",
    maturity: "Check fruit maturity separately from leaf quality if you also grow Red Spanish for piña fiber.",
    market: "For Red Spanish, track fruit and piña fiber as separate products. Check leaf quality with your fiber buyer and keep suspect material separate."
  }
};

const aliases = new Map([
  ["smooth cayenne", "smooth_cayenne"], ["hawaiian", "smooth_cayenne"], ["smooth cayenne hawaiian", "smooth_cayenne"],
  ["queen", "queen_formosa"], ["formosa", "queen_formosa"], ["african queen", "queen_formosa"],
  ["queen formosa", "queen_formosa"], ["queen formosa african queen", "queen_formosa"],
  ["red spanish", "red_spanish"], ["spanish red", "red_spanish"], ["native philippine red", "red_spanish"],
  ["red spanish native philippine red", "red_spanish"]
]);

const growthStages = {
  vegetative: "At the leaf-growth stage, focus on plant establishment and recording leaf changes. Return to fruit and harvest checks once fruit has developed.",
  floral_forcing: "During flower induction, record timing and compare development across the block. Discuss changes to the program with your adviser.",
  fruit_development: "While fruit is developing, compare its shape and growth on repeat visits and check for changes in the surrounding plants.",
  harvest_window: "Near harvest, check fruit in person against buyer maturity and grade requirements. Separate any suspect fruit during sorting."
};

function reportContext(scan) {
  const variety = typeof scan.cultivar === "string"
    ? scan.cultivar.toLowerCase().replace(/[^a-z]+/g, " ").trim() : "";
  return {
    cultivar: aliases.get(variety) || null,
    stage: typeof scan.growthStage === "string" && Object.hasOwn(growthStages, scan.growthStage) ? scan.growthStage : null
  };
}

function supportsAgronomist(label) { return Object.hasOwn(conditions, label); }

function reportChoices(condition) {
  const { nature, check } = conditions[condition];
  return [
    ["Photo assessment and field checks (Pagsusuri)", nature, nature + " Compare it with nearby fruit before deciding what to do."],
    ["Ripeness, maturity and sweetness (Pagkahinog)", "Check maturity in the field with your cultivar or buyer guide. Use a measured reading if sweetness matters to your buyer.", "Compare shell development with fruit from the same planting. Record measured sweetness separately from the photo check."],
    ["Harvest and salvage (Pag-aani)", "Make harvest decisions after inspecting fruit in person and checking buyer requirements. Keep visibly damaged or suspect fruit separate.", "Sort sound fruit by your buyer’s grade. Ask your agriculture office about handling suspect fruit and local storage guidance."],
    ["Primary nutrients (Pangunahing pataba)", "Review your existing nitrogen, phosphorus and potassium plan with a local adviser before changing it.", "Bring your soil test, recent fertilizer history and growth stage to a local adviser for a feeding plan."],
    ["Secondary and micronutrients (Micronutrients)", "Check soil or tissue results before treating a suspected nutrient shortage.", "Ask an adviser whether a nutrient test is warranted before adding calcium, boron, zinc or magnesium."],
    ["Low-cost organic inputs (Likas-kayang pataba)", "Discuss locally available plant or fruit ferments, calcium preparations, ash and compost-based inputs with your adviser before applying them.", "Compare low-cost organic inputs using local extension guidance. Confirm suitability and application instructions for your field."],
    ["Soil health and drainage (Lupa at daloy ng tubig)", "Check where water pools after rain and clear blocked drains where it is safe to do so.", "Use a soil test to guide pH changes. Review raised beds and drainage with your adviser for areas that stay wet."],
    ["Pests and vectors (Pamamahala sa peste)", "Look at the plant base, leaf undersides and fruit for insects or new damage. Photograph anything unusual for identification.", "Check nearby plants for similar damage and ask an adviser to identify pests before choosing a control."],
    ["Sanitation and biosecurity (Sanitasyon)", "Separate suspect fruit during handling. Clean tools and containers between batches according to local guidance.", "Keep a record of affected plants and ask your agriculture office about suitable sanitation and disposal procedures."],
    ["Irrigation and moisture (Pandarilig)", "Check soil moisture before watering and note spots that stay wet after rain.", "Inspect crowns and low areas for trapped water. Adjust watering based on actual field moisture and crop stage."],
    ["Weather protection (Init, ulan at bagyo)", "Inspect the block after heavy rain or strong winds for standing water and leaning plants.", "Review shade, drainage and support needs before extreme weather. Check fruit for sun or storm damage afterward."],
    ["Input costs (Gastos at badyet)", "List labor, materials and transport separately. Use current supplier quotes and check cost per application before buying.", "Compare farm-made and purchased inputs using your own local quotes, application area and labor costs."],
    ["Returns and market options (Kita at pagbebenta)", "Use your actual saleable harvest, buyer quotes and costs to compare market options.", "Ask buyers about grade and processing options. Base a return estimate on measured quantities and written quotes."],
    ["Action plan (Mga hakbang)", "Now: check the fruit in person. Next: record changes and seek advice if needed. Next cycle: review field records and adjust care with your adviser.", "Now: mark and photograph the sample. At follow-up: compare the fruit and nearby plants. Before the next cycle: review recurring issues with your adviser."],
    ["Follow-up and re-scan (Pagsusubaybay)", check + " Re-scan at your next field visit or sooner if symptoms worsen.", check + " Contact your Municipal Agriculture Office if damage spreads or you need help identifying the cause."]
  ];
}

const prompt = `Apply the grower report template below to the actual saved scan data supplied separately. The app rules in this paragraph take precedence over conflicting directions in the template. Use result.condition and result.regions as the photo assessment. Use the template's Healthy topic for No Disease, its Fruit Fasciation topic for Fruit Fasciation Disorder, its Multiple Crown topic for Multiple Crown Disorder, and its Fruit Rot topic for Fruit Rot Disease. Use confidence and disagreement only to prioritize field checks. Treat diagnoses, severity, causes, treatment and harvest instructions, rates, recipes, prices, yields, and numeric targets in the template as unverified examples. Use only the reviewed choices supplied with the scan. The app adds known cultivar and growth stage privately; use general guidance for missing context and never infer field notes.

Return the JSON selection specified by the app schema. Choose up to four exact immediate action texts in practical order and one option, "a" or "b", for each of the fifteen topics in order. The app renders these selections as the report. Keep the condition tentative and prioritize the field checks and follow-up from the applicable template topic.

--- Grower report template ---
${reportTemplate}
--- End grower report template ---`;

function buildAgronomistRequest(prepared, approvedActions) {
  const choices = reportChoices(prepared.input.condition);
  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify({
      result: {
        condition: prepared.input.condition,
        confidence: prepared.input.confidence,
        regions: prepared.input.regions
      },
      immediateActions: approvedActions,
      topics: choices.map(([title, a, b]) => ({ title, a, b }))
    }) }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          actions: { type: "ARRAY", minItems: 1, maxItems: 4, items: { type: "STRING", enum: approvedActions } },
          sections: { type: "ARRAY", minItems: choices.length, maxItems: choices.length, items: { type: "STRING", enum: ["a", "b"] } }
        },
        required: ["actions", "sections"]
      }
    }
  };
}

function assembleAgronomist(value, prepared, actions) {
  const choices = reportChoices(prepared.input.condition);
  const actionByText = new Map(actions.map(action => [action.text, action]));
  if (!value || typeof value !== "object" || Object.keys(value).length !== 2
      || !Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 4
      || new Set(value.actions).size !== value.actions.length || !value.actions.every(text => actionByText.has(text))
      || !Array.isArray(value.sections) || value.sections.length !== choices.length
      || !value.sections.every(choice => choice === "a" || choice === "b")) return null;

  const profile = cultivars[prepared.reportContext.cultivar];
  const stage = growthStages[prepared.reportContext.stage];
  const sections = choices.map(([title, a, b], index) => ({ title, text: value.sections[index] === "a" ? a : b }));
  if (profile) {
    sections[0].text += ` Recorded variety: ${profile.label}.`;
    sections[1].text += ` ${profile.maturity}`;
    sections[12].text += ` ${profile.market}`;
  }
  if (stage) sections[13].text += ` ${stage}`;

  const label = conditions[prepared.input.condition].label;
  const mixed = new Set(prepared.input.regions.map(region => region.condition)).size > 1;
  const wording = prepared.input.confidence < 65 || mixed
    ? "The photo is hard to interpret. Check the pineapple in the field before deciding what to do."
    : "Check the pineapple in the field to see whether this photo assessment matches what you observe.";
  // A possible rot finding should surface before routine care in a mixed scan.
  const rotAction = actions.find(action => action.text === "Inspect the fruit for visible damage and areas of decay.");
  const priority = rotAction ? [rotAction.text, ...value.actions.filter(text => text !== rotAction.text)].slice(0, 4) : value.actions;
  return {
    analysis: `${label}. ${wording}`,
    concerns: [],
    actions: priority.map(text => ({ ...actionByText.get(text) })),
    tips: [],
    sections
  };
}

module.exports = { reportContext, supportsAgronomist, buildAgronomistRequest, assembleAgronomist };
