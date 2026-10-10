import assert from 'node:assert/strict';
import test from 'node:test';
import { activityPage, buildActivity as buildActivityForDay, changeActivityFilter, dateRange, defaultActivityFilters, groupActivity, localDateKey, nextLocalMidnight, taskStatus } from '../src/activity.js';
import { classifyCondition, supportedConditions } from '../src/conditions.js';

const buildActivity = (data, filters, today = '2026-10-08') => buildActivityForDay(data, filters, today);

const data = {
  farms: [{ id: 'farm', name: 'North Farm', archivedAt: true }],
  plots: [{ id: 'plot', farmId: 'farm', name: 'Queen Block', archivedAt: true }],
  scans: [{ id: 'shared-id', plotId: 'plot', topClass: 'Fruit_Rot_Disease', createdAt: new Date(2026, 9, 8, 9), statusType: 'risk' },
    { id: 'legacy', topClass: 'No Detection', createdAt: null }],
  observations: [{ id: 'shared-id', plotId: 'plot', condition: 'concerning', note: 'Yellow leaves by the gate', observedAt: '2026-10-07', createdAt: new Date(2026, 9, 9) }],
  tasks: [{ id: 'shared-id', plotId: 'plot', title: 'Inspect drainage', dueDate: '2026-10-10', createdAt: new Date(2026, 9, 1) },
    { id: 'completed', plotId: 'plot', title: 'Check leaves', dueDate: '2026-10-06', completedAt: new Date(2026, 9, 12), createdAt: new Date(2026, 9, 1) }]
};

test('mixed timeline uses observation dates and task due dates, retaining completed and undated records', () => {
  const entries = buildActivity(data);
  assert.deepEqual(entries.map(entry => [entry.type, entry.date]), [
    ['scan', '2026-10-08'], ['task', '2026-10-10'], ['observation', '2026-10-07'], ['task', '2026-10-06'], ['scan', '']
  ]);
  assert.equal(new Set(entries.map(entry => entry.key)).size, 5);
  assert.equal(groupActivity(entries).at(-1).date, '');
});

test('inclusive date bounds and combined filters apply to every record type', () => {
  assert.deepEqual(buildActivity(data, { from: '2026-10-07', to: '2026-10-08' }).map(entry => entry.type), ['scan', 'observation']);
  assert.equal(buildActivity(data, { farmId: 'farm', plotId: 'plot', type: 'task', status: 'upcoming' })[0].record.title, 'Inspect drainage');
  assert.equal(buildActivity(data, { type: 'task', status: 'done' })[0].date, '2026-10-06');
  assert.equal(buildActivity(data, { from: '2026-10-10', to: '2026-10-01' }).length, 0);
});

test('search matches notes, task titles, category, and archived farm context', () => {
  assert.equal(buildActivity(data, { search: '  YELLOW leaves ' })[0].type, 'observation');
  assert.equal(buildActivity(data, { search: 'drainage' })[0].type, 'task');
  assert.equal(buildActivity(data, { search: 'pathological' })[0].type, 'scan');
  assert.equal(buildActivity(data, { search: 'North Farm' }).length, 4);
  assert.equal(buildActivity(data, { search: 'does not exist' }).length, 0);
});

test('calendar dates do not shift with UTC conversion and invalid dates remain unknown', () => {
  assert.equal(localDateKey('2026-10-08'), '2026-10-08');
  assert.equal(localDateKey(new Date(2026, 9, 8, 0, 1)), '2026-10-08');
  assert.equal(localDateKey({ toMillis: () => new Date(2026, 9, 8, 23, 59).getTime() }), '2026-10-08');
  assert.equal(localDateKey('2026-02-31'), '');
  assert.equal(localDateKey('invalid'), '');
  assert.equal(localDateKey(null), '');
});

test('same-day mixed records share one date group with stable distinct keys', () => {
  const entries = buildActivity({ ...data, tasks: [...data.tasks, { id: 'same-day', dueDate: '2026-10-08' }] });
  assert.equal(groupActivity(entries).find(group => group.date === '2026-10-08').entries.length, 2);
});

test('all seven supported labels map; no detection and unknowns are never healthy', () => {
  assert.equal(supportedConditions.length, 7);
  for (const condition of supportedConditions) {
    assert.equal(classifyCondition(condition.label.replaceAll(' ', '_')).type, condition.type);
  }
  assert.equal(classifyCondition('Fruit Fasciation Disorder').type, 'physiological');
  assert.equal(classifyCondition('Mealybug_Wilt_Disease').type, 'pathological');
  assert.equal(classifyCondition('No Disease').type, 'healthy');
  for (const label of ['No Detection', '', undefined, 'Unknown condition']) assert.equal(classifyCondition(label).type, 'unclassified');
});


test('today precedes nearest future dates, then past dates, across month boundaries', () => {
  const dated = { ...data, scans: [], observations: [], tasks: ['2026-11-02', '2026-10-28', '2026-11-01', '2026-10-31', '2026-10-30'].map(dueDate => ({ id: dueDate, dueDate })) };
  assert.deepEqual(buildActivity(dated, {}, '2026-10-31').map(entry => entry.date), ['2026-10-31', '2026-11-01', '2026-11-02', '2026-10-30', '2026-10-28']);
});

test('date shortcuts include today and cross month boundaries without UTC shifts', () => {
  assert.deepEqual(dateRange('today', '2026-11-02'), { from: '2026-11-02', to: '2026-11-02' });
  assert.deepEqual(dateRange('7', '2026-11-02'), { from: '2026-10-27', to: '2026-11-02' });
  assert.deepEqual(dateRange('30', '2026-11-02'), { from: '2026-10-04', to: '2026-11-02' });
  assert.deepEqual(dateRange('all', '2026-11-02', '2026-01-01', '2026-01-02'), { from: '', to: '' });
  assert.equal(buildActivity(data, { datePreset: 'today' }, '2026-10-08').length, 1);
});

test('scan and observation statuses filter their own category; All records ignores status', () => {
  assert.equal(buildActivity(data, { type: 'scan', status: 'risk' }).length, 1);
  assert.equal(buildActivity(data, { type: 'scan', status: 'healthy' }).length, 0);
  assert.equal(buildActivity(data, { type: 'observation', status: 'concerning' }).length, 1);
  assert.equal(buildActivity(data, { type: 'all', status: 'risk' }).length, 5);
  assert.equal(changeActivityFilter({ ...defaultActivityFilters, type: 'scan', status: 'risk' }, 'type', 'task').status, 'all');
});

test('farm changes retain compatible plots and reset incompatible selections', () => {
  const selected = { ...defaultActivityFilters, farmId: 'farm', plotId: 'plot' };
  assert.equal(changeActivityFilter(selected, 'farmId', '', data.plots).plotId, 'plot');
  assert.equal(changeActivityFilter(selected, 'farmId', 'farm', data.plots).plotId, 'plot');
  assert.equal(changeActivityFilter(selected, 'farmId', 'other', data.plots).plotId, '');
});

test('completion and reopening update task state without moving its due-date group', () => {
  const original = { id: 'care', dueDate: '2026-10-08' };
  for (const completedAt of [null, new Date(2026, 9, 9), null]) {
    const task = { ...original, completedAt };
    const entries = buildActivity({ ...data, scans: [], observations: [], tasks: [task] }, {}, '2026-10-08');
    assert.equal(entries[0].date, '2026-10-08');
    assert.equal(entries[0].status, completedAt ? 'done' : 'today');
  }
});

test('local day changes recompute task urgency and Today shortcuts', () => {
  const task = { dueDate: '2026-10-08' };
  assert.equal(taskStatus(task, '2026-10-07'), 'upcoming');
  assert.equal(taskStatus(task, '2026-10-08'), 'today');
  assert.equal(taskStatus(task, '2026-10-09'), 'overdue');
  const now = new Date(2026, 9, 31, 23, 59);
  assert.equal(localDateKey(new Date(nextLocalMidnight(now))), '2026-11-01');
  assert.equal(buildActivity(data, { datePreset: 'today' }, '2026-10-09').length, 0);
});

test('archived context remains visible and pagination loads 50 then the remainder', () => {
  assert.equal(buildActivity(data).find(entry => entry.record.id === 'completed').archived, true);
  const entries = Array.from({ length: 123 }, (_, id) => ({ id }));
  assert.equal(activityPage(entries).entries.length, 50);
  assert.equal(activityPage(entries).remaining, 73);
  assert.equal(activityPage(entries, 100).entries.length, 100);
  assert.equal(activityPage(entries, 150).entries.length, 123);
  assert.equal(activityPage(entries, 150).remaining, 0);
});
