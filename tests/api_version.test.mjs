import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedBuild, removeIsolatedBuild } from './helpers/isolated-build.mjs';

const ORIGIN = 'https://preview.vibueno.example';
const SHA = 'abc123def4567890abcdef1234567890abcdef12';

test('GET /api/version returns build sha JSON', async (t) => {
  const { root, worker } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  const res = await worker.default.fetch(new Request(`${ORIGIN}/api/version`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.sha, SHA);
});

test('HEAD /api/version returns 200 without body', async (t) => {
  const { root, worker } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  const res = await worker.default.fetch(new Request(`${ORIGIN}/api/version`, { method: 'HEAD' }));
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text, '');
});