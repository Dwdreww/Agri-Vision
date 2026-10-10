// These are the seven classes supported by the current model, not a complete
// catalogue of pineapple conditions. Sources and mapping notes: docs/conditions.md.
export const conditionTypes = {
  pathological: { label: 'Pathological disease', description: 'An infectious disease associated with a plant pathogen.' },
  physiological: { label: 'Physiological disorder', description: 'A growth or development disorder associated with plant or growing conditions.' },
  healthy: { label: 'No disease detected', description: 'The model classified the sample as No Disease. Continue routine monitoring.' },
  unclassified: { label: 'Unclassified', description: 'This result has no established condition type. Review the scan before drawing a conclusion.' }
};

export const supportedConditions = [
  { label: 'Crown Rot Disease', type: 'pathological', description: 'Rot affecting the crown or central tissues.' },
  { label: 'Fruit Rot Disease', type: 'pathological', description: 'Rot affecting the pineapple fruit.' },
  { label: 'Mealybug Wilt Disease', type: 'pathological', description: 'Wilt associated with viruses and mealybug feeding.' },
  { label: 'Root Rot Disease', type: 'pathological', description: 'Rot affecting the root system.' },
  { label: 'Fruit Fasciation Disorder', type: 'physiological', description: 'Abnormal development resulting in a flattened or distorted fruit.' },
  { label: 'Multiple Crown Disorder', type: 'physiological', description: 'Development of more than one crown on a fruit.' },
  { label: 'No Disease', type: 'healthy', description: 'No disease class was predicted for the sample.' }
];

function normalize(label) { return String(label || '').replaceAll('_', ' ').trim().toLowerCase(); }

export function classifyCondition(label) {
  const condition = supportedConditions.find(item => normalize(item.label) === normalize(label));
  const type = condition?.type || 'unclassified';
  return { ...conditionTypes[type], type, condition };
}
