import assert from 'node:assert/strict';
import test from 'node:test';
import { numericConfidence } from '../src/confidence.js';

test('missing and invalid confidence remains unavailable rather than becoming zero', () => {
  for (const value of [undefined, null, '', ' ', false, true, {}, [], NaN, Infinity, -1, 101, 'unknown']) {
    assert.equal(numericConfidence(value), null);
  }
  assert.equal(numericConfidence(0), 0);
  assert.equal(numericConfidence('0'), 0);
  assert.equal(numericConfidence(82.9), 82.9);
  assert.equal(numericConfidence('45.7'), 45.7);
});
