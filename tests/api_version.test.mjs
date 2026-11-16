import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const hosted = fileURLToPath(new URL('../hosted/', import.meta.url));

const ORIGIN = 'https://preview.vibueno.example';

test('GET /api/version returns build sha JSON', async () => {
  await exec('npm', ['run', 'build:pages'], {
    cwd: hosted,
    env: { ...process.env, GITHUB_SHA: 'abc123def4567890abcdef1234567890abcdef12' },
  });
  const worker = await import(new URL('../hosted/worker.js', import.meta.url).href);
  const res = await worker.default.fetch(new Request(`${ORIGIN}/api/version`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.sha, /^[0-9a-f]{7,40}$/);
  assert.equal(body.sha, 'abc123def4567890abcdef1234567890abcdef12');
});