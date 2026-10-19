export function setupProgress(data) {
  const farms = data.farms.filter(farm => !farm.archivedAt);
  const untouched = item => !item.updatedAt || item.updatedAt === item.createdAt;
  const namedFarms = farms.filter(farm => !(farm.id === 'starter-farm' && farm.name === 'My growing space' && untouched(farm)));
  const farm = namedFarms[0] || farms[0];
  const plots = data.plots.filter(plot => !plot.archivedAt && namedFarms.some(item => item.id === plot.farmId));
  const namedPlots = plots.filter(plot => !(plot.id === 'starter-plot' && plot.name === 'Pineapple checks' && untouched(plot)));
  const plot = namedPlots[0] || plots[0];
  const done = [Boolean(namedFarms.length), Boolean(namedPlots.length), data.scans.some(scan => namedPlots.some(area => area.id === scan.plotId))];
  return { farm, plot, done, completed: done.filter(Boolean).length, complete: done.every(Boolean) };
}

export const setupPreferenceKey = uid => `agriVisionSetupHidden:${uid}:v1`;
export function isSetupHidden(storage, uid) {
  try { return storage?.getItem(setupPreferenceKey(uid)) === 'true'; } catch { return false; }
}
export function rememberSetupHidden(storage, uid, hidden) {
  try { storage?.setItem(setupPreferenceKey(uid), String(hidden)); } catch { /* Checklist can still be toggled for this visit. */ }
}
