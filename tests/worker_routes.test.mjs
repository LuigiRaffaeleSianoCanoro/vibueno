import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const hosted = fileURLToPath(new URL('../hosted/', import.meta.url));
const ORIGIN = 'https://app.vibueno.example';

test('GET / serves vibueno shell marker', async () => {
  await exec('npm', ['run', 'build:pages'], { cwd: hosted });
  const worker = await import(new URL('../hosted/worker.js', import.meta.url).href);
  const res = await worker.default.fetch(new Request(`${ORIGIN}/`));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /data-testid="vibueno-shell"/);
  assert.match(html, /<title>Vibueno<\/title>/i);
});