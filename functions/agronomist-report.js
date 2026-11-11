"use strict";

const reportTemplate = require("./agronomist-prompt");

const conditions = {
  "Unclassified": {
    label: "The scanner could not classify this photo",
    nature: "Check the fruit and crown in person. Compare their shape and surface with nearby pineapples.",
    check: "Photograph the whole fruit and crown in clear light. Include a closer photo of any area that has changed."
  },
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

const exclusiveObservations = [
  ["The visible shell is mostly green.", "The visible shell is mostly yellow or orange.", "The visible shell has both green and yellow areas.", "The visible shell has a reddish tint."],
  ["The visible shell eyes look rounded or raised.", "The visible shell eyes look flat."],
  ["One crown is visible.", "More than one crown is visible."],
  ["The fruit appears flattened or fan-shaped.", "The fruit appears cylindrical.", "The fruit appears tapered."]
];
const photoObservations = [
  ...exclusiveObservations.flat(),
  "The fruit appears uneven in shape.",
  "The top has a dense cluster of leaves.",
  "Spines are visible along the edges of the leaves.",
  "A dark or discolored patch is visible on the fruit.",
  "The fruit surface has a visible break or damaged spot.",
  "The fruit or crown is partly hidden or outside the frame."
];

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

function supportsAgronomist(label) { return label !== "Unclassified" && Object.hasOwn(conditions, label); }

function reportChoices(condition) {
  const { label, nature, check } = conditions[condition];
  return [
    ["Image Check & Diagnosis",
      [`${label}.`, nature],
      [`${label}.`, nature, check]],
    ["Variety Identification",
      ["Check your planting records to confirm the variety."],
      ["Ask your planting-material supplier to confirm the variety."]],
    ["Ripeness & Sweetness Check",
      ["Check maturity in person using your cultivar or buyer’s guide.", "Use a measured sweetness reading if your buyer requires one."],
      ["Compare shell development with fruit from the same planting.", "Use the buyer’s maturity requirements to plan harvest timing."]],
    ["Harvest or Discard Decision",
      ["Inspect the fruit in person before deciding to harvest.", "Keep damaged or suspect fruit separate and ask your agriculture office about handling it."],
      ["Sort sound fruit by your buyer’s grade.", "Ask your agriculture office about storage and disposal for suspect fruit."]],
    ["Store-Bought Fertilizer to Use (With Prices)",
      ["Bring your soil test and fertilizer history to a local adviser before changing what you apply.", "Ask a supplier for the current peso price once you know which product you need."],
      ["Review your current feeding plan with a local adviser.", "Use the product label and local guidance to confirm the rate and compare current prices per application."]],
    ["Cheap Homemade / Organic Option (With Prices)",
      ["Ask your local agriculture office which organic inputs suit your soil and crop stage.", "Add up your actual material and labor costs before choosing an option."],
      ["Compare locally available compost-based inputs with your adviser.", "Check the cost of materials and preparation in pesos before applying anything."]],
    ["What NOT to Do (Mistakes to Avoid)",
      ["Avoid changing fertilizer based on the photo alone.", "Keep suspect fruit out of containers with sound fruit."],
      ["Avoid spraying before confirming the cause in the field.", "Keep suspect fruit separate during sorting."]],
    ["Watering & Soil Care",
      ["Check soil moisture before watering.", "Inspect drains where water pools after rain."],
      ["Look for low spots that stay wet and check for blocked drainage.", "Use a soil test and local advice before changing soil pH."]],
    ["Cleanliness & Pest Control",
      ["Clean tools and containers between batches using local sanitation guidance.", "Check the plant base, leaf undersides and fruit for insects or new damage."],
      ["Separate suspect fruit during handling and clean tools before the next batch.", "Photograph any insects or new damage and ask your agriculture office to identify the cause."]],
    ["Estimated Cost vs. Selling Value (Profit Guide)",
      ["Add your actual input, labor and transport costs in pesos.", "Use the amount you can sell and your buyer’s current quote to estimate the return."],
      ["Get current quotes for the grades your buyer accepts.", "Compare expected sales with your costs using the weight or count you can actually sell."]]
  ];
}

const prompt = `Apply the grower report template below to the supplied photo and scan data. The app rules in this paragraph take precedence over conflicting directions in the template. Use result.condition and result.regions as the scanner result. Use the template's Healthy topic for No Disease, its Fruit Fasciation topic for Fruit Fasciation Disorder, its Multiple Crown topic for Multiple Crown Disorder, and its Fruit Rot topic for Fruit Rot Disease. For Unclassified, use general observation and field checks without assigning a condition. Use confidence and disagreement only to prioritize field checks. Treat diagnoses, severity, causes, treatment and harvest instructions, rates, recipes, prices, yields, and numeric targets in the template as unverified examples. Use only the reviewed choices supplied with the scan. The app adds known cultivar and growth stage privately; use general guidance for missing context and never infer field notes.

Return the JSON selection specified by the app schema. Choose up to four exact immediate action texts in practical order and one option, "a" or "b", for each of the ten topics in order. The app renders these selections as the report. Keep the condition tentative and prioritize the field checks and follow-up from the applicable template topic. Do not guess the variety or growth stage from a photo.

When the schema asks for photoObservations, select up to three statements directly supported by the image. Read the image itself for visible details. Do not select a statement solely because the scanner reported a condition. Use an empty list when the pineapple or its features are unclear. Avoid contradictory choices and use at most one statement each for shell color, eye shape, crown count and fruit shape. Treat shell color as an observation and do not infer ripeness, sweetness, internal quality or safety from it.

--- Grower report template ---
${reportTemplate}
--- End grower report template ---`;

function buildAgronomistRequest(prepared, approvedActions, hasPhoto) {
  const condition = prepared.photoReview ? "Unclassified" : prepared.input.condition;
  const choices = reportChoices(condition);
  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify({
      result: {
        condition,
        confidence: prepared.photoReview ? null : prepared.input.confidence,
        regions: prepared.photoReview ? [] : prepared.input.regions
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
          sections: { type: "ARRAY", minItems: choices.length, maxItems: choices.length, items: { type: "STRING", enum: ["a", "b"] } },
          ...(hasPhoto && { photoObservations: { type: "ARRAY", maxItems: 3, items: { type: "STRING", enum: photoObservations } } })
        },
        required: ["actions", "sections", ...(hasPhoto ? ["photoObservations"] : [])]
      }
    }
  };
}

function assembleAgronomist(value, prepared, actions, hasPhoto) {
  const condition = prepared.photoReview ? "Unclassified" : prepared.input.condition;
  const choices = reportChoices(condition);
  const actionByText = new Map(actions.map(action => [action.text, action]));
  if (!value || typeof value !== "object" || Object.keys(value).length !== (hasPhoto ? 3 : 2)
      || !Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 4
      || new Set(value.actions).size !== value.actions.length || !value.actions.every(text => actionByText.has(text))
      || !Array.isArray(value.sections) || value.sections.length !== choices.length
      || !value.sections.every(choice => choice === "a" || choice === "b")) return null;
  if (hasPhoto && (!Array.isArray(value.photoObservations) || value.photoObservations.length > 3
      || new Set(value.photoObservations).size !== value.photoObservations.length
      || !value.photoObservations.every(observation => photoObservations.includes(observation))
      || exclusiveObservations.some(group => group.filter(observation => value.photoObservations.includes(observation)).length > 1))) return null;

  const profile = cultivars[prepared.reportContext.cultivar];
  const stage = growthStages[prepared.reportContext.stage];
  const sections = choices.map(([title, a, b], index) => ({ title, text: (value.sections[index] === "a" ? a : b).join("\n") }));
  if (hasPhoto && value.photoObservations.length) {
    sections[0].text = [...value.photoObservations, sections[0].text].join("\n");
    const shellColor = value.photoObservations.find(observation => exclusiveObservations[0].includes(observation));
    if (shellColor) sections[2].text = `${shellColor}\n${sections[2].text}`;
  }
  if (profile) {
    sections[1].text = `Recorded variety: ${profile.label}.`;
    sections[2].text += `\n${profile.maturity}`;
    sections[9].text += `\n${profile.market}`;
  }
  if (stage) sections[3].text += `\n${stage}`;

  const label = conditions[condition].label;
  const mixed = new Set(prepared.input.regions.map(region => region.condition)).size > 1;
  const wording = prepared.photoReview ? "Use the visible details to guide an in-person check."
    : prepared.input.confidence < 65 || mixed
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
    ...(hasPhoto && { photoObservations: value.photoObservations }),
    sections
  };
}

module.exports = { reportContext, supportsAgronomist, buildAgronomistRequest, assembleAgronomist };
