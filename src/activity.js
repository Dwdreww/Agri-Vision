import { t } from './i18n.js';
import { classifyCondition } from './conditions.js';
import { conditionLabel, timestampMs } from './utils.js';

export function localDateKey(value) {
  // Date-only field records must retain their calendar date in every timezone.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && localDateKey(date) === value ? value : '';
  }
  const millis = timestampMs(value);
  if (!millis) return '';
  const date = new Date(millis);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const defaultActivityFilters = { search: '', type: 'all', datePreset: 'all', farmId: '', plotId: '', from: '', to: '', status: 'all' };

export const activityStatusOptions = {
  scan: [['healthy', 'Healthy'], ['risk', 'Risk'], ['monitor', 'Monitor']],
  observation: [['normal', 'Normal'], ['concerning', 'Concerning'], ['unsure', 'Unsure']],
  task: [['upcoming', 'Upcoming'], ['today', 'Due today'], ['overdue', 'Overdue'], ['done', 'Done']]
};

export function taskStatus(task, today = localDateKey(new Date())) {
  if (task.completedAt) return 'done';
  const due = localDateKey(task.dueDate);
  if (!due) return 'undated';
  return due === today ? 'today' : due < today ? 'overdue' : 'upcoming';
}

export function dateRange(preset, today, from = '', to = '') {
  if (preset === 'custom') return { from, to };
  if (preset === 'all') return { from: '', to: '' };
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - (preset === '7' ? 6 : preset === '30' ? 29 : 0));
  return { from: localDateKey(start), to: today };
}

export function changeActivityFilter(filters, key, value, plots = []) {
  const next = { ...filters, [key]: value };
  if (key === 'type') next.status = 'all';
  if (key === 'farmId' && value && plots.find(plot => plot.id === filters.plotId)?.farmId !== value) next.plotId = '';
  return next;
}

export function buildActivity(data, { search = '', type = 'all', farmId = '', plotId = '', from = '', to = '', status = 'all', datePreset = 'custom' } = {}, today = localDateKey(new Date())) {
  ({ from, to } = dateRange(datePreset, today, from, to));
  const query = search.trim().toLowerCase();
  const entries = [
    ...data.scans.map(record => ({ type: 'scan', record, date: localDateKey(record.createdAt) })),
    ...data.observations.map(record => ({ type: 'observation', record, date: localDateKey(record.observedAt) || localDateKey(record.createdAt) })),
    ...data.tasks.map(record => ({ type: 'task', record, date: localDateKey(record.dueDate) }))
  ];
  return entries.map(entry => {
    const plot = data.plots.find(item => item.id === entry.record.plotId);
    const farm = data.farms.find(item => item.id === (entry.record.farmId || plot?.farmId));
    const status = entry.type === 'task' ? taskStatus(entry.record, today) : entry.type === 'scan' ? entry.record.statusType : entry.record.condition;
    return { ...entry, status, archived: Boolean(plot?.archivedAt || farm?.archivedAt), key: `${entry.type}:${entry.record.id}`, plot, farm };
  }).filter(entry => {
    const { record, plot, farm } = entry;
    if (type !== 'all' && type !== entry.type) return false;
    if (farmId && farm?.id !== farmId) return false;
    if (plotId && record.plotId !== plotId) return false;
    if (from && (!entry.date || entry.date < from)) return false;
    if (to && (!entry.date || entry.date > to)) return false;
    if (type !== 'all' && status !== 'all' && entry.status !== status) return false;
    const text = [entry.type, plot?.name, farm?.name, record.topClass, record.statusLabel,
      record.statusType, record.title, record.note, record.notes, record.dueDate, entry.date,
      record.condition && conditionLabel(record.condition),
      entry.type === 'scan' && classifyCondition(record.topClass).label,
      t(record.topClass), t(record.statusLabel), record.condition && t(conditionLabel(record.condition))].filter(Boolean).join(' ').toLowerCase();
    return !query || text.includes(query);
  }).sort((a, b) => {
    const rank = date => !date ? 3 : date === today ? 0 : date > today ? 1 : 2;
    return rank(a.date) - rank(b.date)
      || (a.date > today && b.date > today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
      || timestampMs(b.record.createdAt) - timestampMs(a.record.createdAt) || a.key.localeCompare(b.key);
  });
}

export function activityPage(entries, limit = 50) { return { entries: entries.slice(0, limit), remaining: Math.max(0, entries.length - limit) }; }

export function nextLocalMidnight(now = new Date()) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(); }

export function groupActivity(entries) {
  const groups = [];
  for (const entry of entries) {
    let group = groups.at(-1);
    if (!group || group.date !== entry.date) { group = { date: entry.date, entries: [] }; groups.push(group); }
    group.entries.push(entry);
  }
  return groups;
}
