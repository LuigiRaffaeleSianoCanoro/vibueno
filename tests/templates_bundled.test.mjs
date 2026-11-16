import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { allTemplateNames, ROUTE_MARKERS } from '../hosted/routes.mjs';
import { isolatedBuild, removeIsolatedBuild } from './helpers/isolated-build.mjs';

const SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

test('build:pages embeds every registered route template', async (t) => {
  const { root, bundled } = await isolatedBuild(SHA);
  t.after(() => removeIsolatedBuild(root));

  for (const name of allTemplateNames()) {
    const tpl = bundled.BUNDLED_TEMPLATES?.[name];
    assert.ok(typeof tpl === 'string' && tpl.length > 200, `missing bundled template: ${name}`);
    const marker = ROUTE_MARKERS[name];
    assert.ok(marker, `missing marker for route ${name}`);
    assert.match(tpl, new RegExp(`data-testid=["']${marker}["']`));
  }
  assert.equal(bundled.BUILD_SHA, SHA);
  assert.equal(bundled.BUILD_VERSION_OK, true);

  const workerText = await readFile(join(root, 'public/_worker.js'), 'utf8');
  for (const marker of Object.values(ROUTE_MARKERS)) {
    assert.ok(
      workerText.includes(`data-testid="${marker}"`) || workerText.includes(`data-testid='${marker}'`),
    );
  }
});

test('every manifest route has a public HTML source file', async () => {
  const { ROUTE_TEMPLATES } = await import(new URL('../hosted/routes.mjs', import.meta.url).href);
  for (const { file } of Object.values(ROUTE_TEMPLATES)) {
    await access(new URL(`../hosted/public/${file}`, import.meta.url));
  }
});

test('every manifest route has ROUTE_MARKERS', () => {
  for (const name of allTemplateNames()) {
    assert.ok(ROUTE_MARKERS[name], `ROUTE_MARKERS missing for ${name}`);
  }
});