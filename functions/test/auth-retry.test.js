"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("transient Firebase transport failures recover with bounded retries", async () => {
  const { retryAuthConnection } = await import("../../src/auth-retry.js");
  let attempts = 0;
  const delays = [];
  const result = await retryAuthConnection(async () => {
    if (++attempts < 3) throw { code: "auth/network-request-failed" };
    return "signed-in";
  }, async delay => delays.push(delay));
  assert.equal(result, "signed-in");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("invalid credentials are never retried and persistent network errors stop", async () => {
  const { retryAuthConnection } = await import("../../src/auth-retry.js");
  for (const [code, expected] of [["auth/invalid-credential", 1], ["auth/network-request-failed", 3]]) {
    let attempts = 0;
    await assert.rejects(retryAuthConnection(async () => { attempts++; throw Object.assign(new Error(code), { code }); }, async () => {}), error => error.code === code);
    assert.equal(attempts, expected);
  }
});
