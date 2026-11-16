import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { allTemplateNames, ROUTE_MARKERS } from '../hosted/routes.mjs';

const exec = promisify(execFile);
const hosted = fileURLToPath(new URL('../hosted/', import.meta.url));

test('build:pages embeds every registered route template', async () => {
  await exec('npm', ['run', 'build:pages'], {
    cwd: hosted,
    env: { ...process.env, GITHUB_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
  });
  const mod = await import(new URL('../hosted/bundled-templates.mjs', import.meta.url).href);
  for (const name of allTemplateNames()) {
    const tpl = mod.BUNDLED_TEMPLATES?.[name];
    assert.ok(typeof tpl === 'string' && tpl.length > 200, `missing bundled template: ${name}`);
    const marker = ROUTE_MARKERS[name];
    if (marker) {
      assert.match(tpl, new RegExp(`data-testid=["']${marker}["']`));
    }
  }
  assert.match(String(mod.BUILD_SHA), /^[0-9a-f]{7,40}$/);
  const workerText = await readFile(new URL('../hosted/public/_worker.js', import.meta.url), 'utf8');
  assert.ok(
    workerText.includes('data-testid="vibueno-shell"') || workerText.includes("data-testid='vibueno-shell'"),
  );
});

test('every manifest route has a public HTML source file', async () => {
  const { ROUTE_TEMPLATES } = await import(new URL('../hosted/routes.mjs', import.meta.url).href);
  for (const { file } of Object.values(ROUTE_TEMPLATES)) {
    await access(new URL(`../hosted/public/${file}`, import.meta.url));
  }
});