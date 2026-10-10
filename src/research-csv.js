const columns = ['month', 'statusType', 'topClass', 'topConfidence', 'detectionCount', 'modelVersion', 'userCondition'];

function cell(value) {
  const raw = value == null ? '' : String(value);
  const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildResearchCsv(results) {
  return [columns.join(','), ...results.map(result => columns.map(key => cell(result[key])).join(','))].join('\r\n');
}
