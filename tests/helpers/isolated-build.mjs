import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const sourceHosted = fileURLToPath(new URL('../../hosted/', import.meta.url));

/**
 * Build pages into an isolated directory (safe under parallel node --test).
 *
 * @param {string} sha 40-char hex
 */
export async function isolatedBuild(sha) {
  const root = await mkdtemp(join(tmpdir(), 'vibueno-build-'));
  const env = {
    ...process.env,
    GITHUB_SHA: sha,
    VIBUENO_OUTPUT_ROOT: root,
    VIBUENO_ALLOW_DIRTY_BUILD: '1',
  };
  await exec('node', ['build-pages.mjs'], { cwd: sourceHosted, env });
  const worker = await import(`${pathToFileURL(join(root, 'worker.js')).href}?t=${Date.now()}`);
  const bundled = await import(`${pathToFileURL(join(root, 'bundled-templates.mjs')).href}?t=${Date.now()}`);
  return { root, worker, bundled };
}

/**
 * @param {string} root
 */
export async function removeIsolatedBuild(root) {
  await rm(root, { recursive: true, force: true });
}