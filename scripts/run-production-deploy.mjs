#!/usr/bin/env node
/**
 * Production Pages deploy: wrangler upload, smoke with backoff, rollback on failure.
 * Used from GitHub Actions when CLOUDFLARE_* secrets are set.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deployWithSmokeAndRollback, DeployError } from './pages-deploy-lib.mjs';
import { smokeWithBackoff } from './smoke-retry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const hostedDir = resolve(repoRoot, 'hosted');
const smokeScript = resolve(repoRoot, 'scripts/smoke-vibueno.mjs');

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const deploySha = (process.env.GITHUB_SHA || process.env.DEPLOY_SHA || '').trim().toLowerCase();
const productionUrl = (process.env.VIBUENO_PRODUCTION_URL || 'https://vibueno.pages.dev').trim();
const allowFirstDeploy = process.env.VIBUENO_ALLOW_FIRST_DEPLOY === 'true';
const wranglerBin = process.env.WRANGLER_BIN || 'npx';

function runCommand(cmd, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

function runSmokeCli(base, sha) {
  const args = [smokeScript, '--base', base];
  if (sha) args.push('--sha', sha);
  return runCommand(process.execPath, args);
}

async function wranglerDeploy() {
  const wranglerVersion = process.env.WRANGLER_VERSION || '4.45.0';
  const deployArgs = [
    'pages',
    'deploy',
    'public',
    '--project-name=vibueno',
    '--branch=main',
    '--commit-dirty=true',
  ];
  const cmd = wranglerBin === 'npx' ? 'npx' : wranglerBin;
  const args =
    wranglerBin === 'npx'
      ? ['--yes', `wrangler@${wranglerVersion}`, ...deployArgs]
      : deployArgs;
  const code = await runCommand(cmd, args, {
    cwd: hostedDir,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  });
  if (code !== 0) {
    throw new DeployError(`wrangler pages deploy exited ${code}`);
  }
  return {};
}

async function main() {
  if (!accountId || !apiToken) {
    console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
    process.exit(2);
  }
  if (!/^[0-9a-f]{40}$/.test(deploySha)) {
    console.error(`Invalid or missing deploy SHA (expected 40-char git SHA): ${deploySha || '(empty)'}`);
    process.exit(2);
  }

  const result = await deployWithSmokeAndRollback({
    accountId,
    apiToken,
    productionUrl,
    deploySha,
    allowFirstDeploy,
    runDeploy: wranglerDeploy,
    runSmoke: async ({ phase, base, sha, rollbackSha }) => {
      const expectSha =
        phase === 'post-deploy' ? sha : phase === 'post-rollback' ? rollbackSha ?? '' : '';
      const retry = await smokeWithBackoff({
        runSmoke: () => runSmokeCli(base, expectSha || undefined),
      });
      return { ok: retry.ok, exitCode: retry.lastExitCode };
    },
  });

  if (result.ok) {
    console.log('Production deploy succeeded; smoke passed.');
    process.exit(0);
  }

  const message =
    result.error instanceof Error ? result.error.message : String(result.error ?? 'Deploy failed');
  console.error('DEPLOY FAILED:', message);
  if (result.rolledBack) {
    console.error('Rolled back to previous production deployment.', result.previousDeploymentId);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});