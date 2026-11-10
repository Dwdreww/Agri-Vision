const inspect = 'Inspect the pineapple in the field and note any changes.';
const unclear = {
  title: 'The photo check was unclear',
  next: 'Take a clearer photo in daylight and inspect the pineapple in the field.'
};

const assessments = {
  'no disease': {
    title: 'No condition spotted in this photo',
    next: 'Continue routine care and inspect the pineapple if you notice a change.'
  },
  'fruit fasciation disorder': {
    title: 'Possible fruit fasciation',
    next: 'Check whether the fruit looks flattened or fan-shaped. Record what you see.'
  },
  'multiple crown disorder': {
    title: 'Possible multiple crowns',
    next: 'Count the crowns on the fruit and take another photo to track its growth.'
  },
  'fruit rot disease': {
    title: 'Possible fruit rot',
    next: 'Check for soft spots or decay. Keep suspect fruit separate while you assess it.'
  },
  'crown rot disease': { title: 'Possible crown rot', next: inspect },
  'root rot disease': { title: 'Possible root rot', next: inspect },
  'mealybug wilt disease': { title: 'Possible mealybug wilt', next: inspect }
};

export function scanAssessment(label, photoOnly = false, detectionOnly = false) {
  if (photoOnly) return {
    title: 'Saved photo',
    next: 'Record what you see and plan a follow-up visit.'
  };
  if (detectionOnly || typeof label !== 'string') return unclear;
  return assessments[label.replaceAll('_', ' ').trim().toLowerCase()] || unclear;
}
