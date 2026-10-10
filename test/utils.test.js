import test from 'node:test';
import assert from 'node:assert/strict';
import { readableError } from '../src/utils.js';

test('friendly errors explain known account, connection, and image failures', () => {
  assert.equal(readableError({ code: 'auth/invalid-credential', message: 'Firebase: technical detail' }), 'The email or password is incorrect.');
  assert.equal(readableError(new Error('Failed to fetch')), 'Check your connection and try again.');
  assert.equal(readableError(new Error('This image format cannot be opened.')), 'This image format cannot be opened.');
  assert.equal(readableError({ code: 'functions/resource-exhausted' }), 'The service is busy. Please try again in a little while.');
});

test('unexpected server messages are not exposed to the user', () => {
  assert.equal(readableError(new Error('HTTP 500: database path /private/account-id failed')), 'Something went wrong. Please try again.');
  assert.equal(readableError(undefined), 'Something went wrong. Please try again.');
});
