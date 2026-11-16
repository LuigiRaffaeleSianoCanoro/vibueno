import test from 'node:test';
import assert from 'node:assert/strict';
import { shaMatches } from '../scripts/smoke-vibueno-lib.mjs';

test('shaMatches accepts full or short prefix', () => {
  const full = 'abc123def4567890abcdef1234567890abcdef12';
  assert.equal(shaMatches(full, full), true);
  assert.equal(shaMatches(full, full.slice(0, 7)), true);
  assert.equal(shaMatches('deadbeef', 'cafebabe'), false);
});