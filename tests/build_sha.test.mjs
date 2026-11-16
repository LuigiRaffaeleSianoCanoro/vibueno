import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { versionPayloadFromMeta } from '../hosted/version.mjs';

const exec = promisify(execFile);
const hosted = fileURLToPath(new URL('../hosted/', import.meta.url));
const SHA = 'abc123def4567890abcdef1234567890abcdef12';

test('build fails on invalid GITHUB_SHA', async () => {
  const out = join(tmpdir(), `vibueno-badsha-${Date.now()}`);
  try {
    await assert.rejects(
      () =>
        exec('node', ['build-pages.mjs'], {
          cwd: hosted,
          env: {
            ...process.env,
            GITHUB_SHA: 'not-a-sha<script>',
            VIBUENO_OUTPUT_ROOT: out,
            VIBUENO_ALLOW_DIRTY_BUILD: '1',
          },
        }),
      /Invalid GITHUB_SHA/,
    );
  } finally {
    await rm(out, { recursive: true, force: true }).catch(() => {});
  }
});

test('build fails on dirty working tree', async () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const readme = join(repoRoot, 'README.md');
  const orig = await readFile(readme, 'utf8');
  await writeFile(readme, `${orig}\n`);
  const out = join(tmpdir(), `vibueno-dirty-${Date.now()}`);
  try {
    await assert.rejects(
      () =>
        exec('node', ['build-pages.mjs'], {
          cwd: hosted,
          env: {
            ...process.env,
            GITHUB_SHA: SHA,
            VIBUENO_OUTPUT_ROOT: out,
          },
        }),
      /Dirty working tree/,
    );
  } finally {
    await writeFile(readme, orig);
    await rm(out, { recursive: true, force: true }).catch(() => {});
  }
});

test('versionPayloadFromMeta rejects unknown sha or invalid build', () => {
  assert.deepEqual(versionPayloadFromMeta('unknown', true), {
    ok: false,
    sha: 'unknown',
    error: 'invalid_build',
  });
  assert.deepEqual(versionPayloadFromMeta(SHA, false), {
    ok: false,
    sha: SHA,
    error: 'invalid_build',
  });
  assert.deepEqual(versionPayloadFromMeta(SHA, true), { ok: true, sha: SHA });
});