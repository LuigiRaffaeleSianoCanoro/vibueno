import test from 'node:test';
import assert from 'node:assert/strict';
import { smokeWithBackoff } from '../scripts/smoke-retry.mjs';

test('smokeWithBackoff retries until success within budget', async () => {
  let n = 0;
  const result = await smokeWithBackoff({
    maxMs: 30_000,
    runSmoke: async () => {
      n += 1;
      return n < 3 ? 1 : 0;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
});

test('smokeWithBackoff returns failure when smoke never passes', async () => {
  const result = await smokeWithBackoff({
    maxMs: 50,
    runSmoke: async () => 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.lastExitCode, 1);
});