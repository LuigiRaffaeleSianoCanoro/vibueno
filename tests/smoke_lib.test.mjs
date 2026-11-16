import test from 'node:test';
import assert from 'node:assert/strict';
import { shaMatches, versionResponseOk } from '../scripts/smoke-vibueno-lib.mjs';

test('shaMatches requires full 40-char or consistent 12+ prefix', () => {
  const full = 'abc123def4567890abcdef1234567890abcdef12';
  const other = 'abc123def4567890abcdef1234567890abcdef99';
  const short = 'abcdef012345';

  assert.equal(shaMatches(full, full), true);
  assert.equal(shaMatches(full, short), false);
  assert.equal(shaMatches(other, full), false);
  assert.equal(shaMatches('a', full), false);
  assert.equal(shaMatches('abc', full), false);
  assert.equal(shaMatches('deadbeef', 'cafebabe'), false);

  assert.equal(shaMatches(full.slice(0, 12), full), true);
});

test('versionResponseOk rejects unknown or ok:false', () => {
  assert.equal(versionResponseOk(200, { ok: true, sha: 'abc123def4567890abcdef1234567890abcdef12' }), true);
  assert.equal(versionResponseOk(200, { ok: true, sha: 'unknown' }), false);
  assert.equal(versionResponseOk(503, { ok: false, sha: 'unknown' }), false);
});