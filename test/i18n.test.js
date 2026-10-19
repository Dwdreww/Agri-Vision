import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGE_KEY, readLanguage, rememberLanguage, setLanguage, translate } from '../src/i18n.js';
import { filipino } from '../src/translations/fil.js';
import { buildActivity } from '../src/activity.js';

test('English is the default, including invalid preferences and blocked storage', () => {
  assert.equal(readLanguage(), 'en');
  assert.equal(readLanguage({ getItem: () => 'fr' }), 'en');
  assert.equal(readLanguage({ getItem() { throw new Error('Blocked'); } }), 'en');
  assert.equal(readLanguage({ getItem: () => 'fil' }), 'fil');
});

test('remembering a language touches only its preference and tolerates failed writes', () => {
  const values = new Map([['farm-name', 'Santos Farm'], ['agriVisionGuestEntry', 'true']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  rememberLanguage(storage, 'fil');
  assert.equal(readLanguage(storage), 'fil');
  assert.equal(values.get('farm-name'), 'Santos Farm');
  assert.equal(values.get('agriVisionGuestEntry'), 'true');
  assert.equal(rememberLanguage({ setItem() { throw new Error('Blocked'); } }, 'fil'), 'fil');
  rememberLanguage(storage, 'invalid');
  assert.equal(values.get(LANGUAGE_KEY), 'en');
});

test('translations preserve formatting, unknown text, and interpolated record names', () => {
  assert.equal(translate('Overview'), 'Overview');
  assert.equal(translate('Overview', 'fil'), 'Buod');
  assert.equal(translate(' History ', 'fil'), ' Kasaysayan ');
  assert.equal(translate('s', 'fil'), '');
  assert.equal(translate('Santos Farm', 'fil'), 'Santos Farm');
  assert.equal(translate('constructor', 'fil'), 'constructor');
  assert.equal(translate('toString', 'fil'), 'toString');
  assert.equal(translate('View {value0}', 'fil', { value0: 'East Field {plot} $&' }), 'Tingnan ang East Field {plot} $&');
});

test('Filipino messages retain every interpolation parameter', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [english, translated] of Object.entries(filipino)) {
    assert.deepEqual(placeholders(translated), placeholders(english), english);
  }
});

test('History search matches the displayed Filipino condition while keeping stored fields intact', () => {
  const data = { farms: [{ id: 'farm', name: 'Overview' }], plots: [{ id: 'area', farmId: 'farm', name: 'East Field' }],
    scans: [{ id: 'photo', plotId: 'area', topClass: 'Not analyzed', createdAt: '2026-10-19' }], observations: [], tasks: [] };
  setLanguage('fil');
  try {
    const result = buildActivity(data, { search: 'Hindi nasuri' });
    assert.equal(result.length, 1);
    assert.equal(result[0].record.topClass, 'Not analyzed');
    assert.equal(result[0].farm.name, 'Overview');
    assert.equal(buildActivity(data, { search: 'Not analyzed' }).length, 1);
  } finally { setLanguage('en'); }
});
