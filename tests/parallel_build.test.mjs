import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedBuild, removeIsolatedBuild } from './helpers/isolated-build.mjs';

test('parallel isolated builds do not race', async () => {
  const shas = [
    '1111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222',
    '3333333333333333333333333333333333333333',
    '4444444444444444444444444444444444444444',
    '5555555555555555555555555555555555555555',
  ];
  const builds = await Promise.all(shas.map((sha) => isolatedBuild(sha)));
  try {
    for (let i = 0; i < builds.length; i += 1) {
      assert.equal(builds[i].bundled.BUILD_SHA, shas[i]);
      const res = await builds[i].worker.default.fetch(
        new Request('https://x.example/api/version'),
      );
      const body = await res.json();
      assert.equal(body.sha, shas[i]);
    }
  } finally {
    await Promise.all(builds.map((b) => removeIsolatedBuild(b.root)));
  }
});