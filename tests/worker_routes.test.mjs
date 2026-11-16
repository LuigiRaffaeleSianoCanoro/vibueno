import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatedBuild, removeIsolatedBuild } from './helpers/isolated-build.mjs';

const ORIGIN = 'https://app.vibueno.example';
const SHA = 'abc123def4567890abcdef1234567890abcdef12';

test('GET / serves vibueno shell marker', async (t) => {
  const { root, worker } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  const res = await worker.default.fetch(new Request(`${ORIGIN}/`));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /data-testid="vibueno-shell"/);
  assert.match(html, /<title>Vibueno<\/title>/i);
  assert.match(html, /#f4f1ea/i);
});

test('HEAD / returns 200', async (t) => {
  const { root, worker } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  const res = await worker.default.fetch(new Request(`${ORIGIN}/`, { method: 'HEAD' }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('static assets fall through to ASSETS binding', async (t) => {
  const { root } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  const workerMod = await import(`${pathToFileURL(join(root, 'public/_worker.js')).href}?t=${Date.now()}`);
  let assetCalls = 0;
  const env = {
    ASSETS: {
      async fetch(_req) {
        assetCalls += 1;
        return new Response('{"name":"Vibueno"}', {
          status: 200,
          headers: { 'Content-Type': 'application/manifest+json' },
        });
      },
    },
  };
  const res = await workerMod.default.fetch(
    new Request(`${ORIGIN}/manifest.webmanifest`),
    env,
    {},
  );
  assert.equal(res.status, 200);
  assert.equal(assetCalls, 1);
  const manifest = await res.text();
  assert.match(manifest, /Vibueno/);
});