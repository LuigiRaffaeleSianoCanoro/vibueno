import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('check:no-agent-os-leak passes on clean tree', async () => {
  await exec('node', ['scripts/check-no-agent-os-leak.mjs'], { cwd: repoRoot });
});

test('check:no-agent-os-leak fails when forbidden id is present', async () => {
  const inRepo = join(repoRoot, 'hosted', `leak-probe-${Date.now()}.toml`);
  await writeFile(inRepo, 'tablero-posts ec354238-62d6-4414-ba50-0332085f7651');
  try {
    await assert.rejects(async () => {
      await exec('node', ['scripts/check-no-agent-os-leak.mjs'], { cwd: repoRoot });
    });
  } finally {
    await rm(inRepo, { force: true });
  }
});