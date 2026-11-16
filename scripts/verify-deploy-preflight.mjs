#!/usr/bin/env node
/**
 * GitHub Actions deploy preflight: main-only ref, deploy SHA == main HEAD, required CI green.
 */
import { appendFileSync } from 'node:fs';

export const REQUIRED_CI_JOBS = [
  'install',
  'lint',
  'typecheck',
  'unit-tests',
  'build',
  'route-manifest',
  'no-agent-os-leak',
];

/**
 * @param {object} input
 * @param {string} input.eventName
 * @param {string} input.githubRef
 * @param {string} input.deploySha
 * @param {string} input.mainHeadSha
 * @param {Array<{ name: string; status: string; conclusion: string | null }>} input.checkRuns
 * @param {string[]} [input.requiredJobs]
 */
export function evaluateDeployPreflight({
  eventName,
  githubRef,
  deploySha,
  mainHeadSha,
  checkRuns,
  requiredJobs = REQUIRED_CI_JOBS,
}) {
  const deploy = deploySha.trim().toLowerCase();
  const mainHead = mainHeadSha.trim().toLowerCase();

  if (eventName === 'workflow_dispatch' && githubRef !== 'refs/heads/main') {
    return {
      allow: false,
      hardFail: true,
      reason: `workflow_dispatch production deploy is only allowed on refs/heads/main (got ${githubRef}).`,
    };
  }

  if (mainHead && deploy !== mainHead) {
    return {
      allow: false,
      hardFail: false,
      reason: `Deploy skipped: commit ${deploy} is not current origin/main HEAD (${mainHead}).`,
    };
  }

  const byName = new Map(checkRuns.map((r) => [r.name, r]));
  const missing = [];
  for (const name of requiredJobs) {
    const run = byName.get(name);
    if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    const suffix = eventName === 'workflow_dispatch' ? ' Run CI on main first.' : '';
    return {
      allow: false,
      hardFail: eventName === 'workflow_dispatch',
      reason: `Deploy blocked: required CI not green for ${deploy}: ${missing.join(', ')}.${suffix}`,
    };
  }

  return { allow: true, hardFail: false, reason: 'ok' };
}

/**
 * @param {object} opts
 * @param {typeof fetch} opts.fetchFn
 * @param {string} opts.token
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.ref
 */
export async function fetchCheckRuns({ fetchFn, token, owner, repo, ref }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`;
  const res = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub check-runs failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  return /** @type {Array<{ name: string; status: string; conclusion: string | null }>} */ (
    body.check_runs ?? []
  );
}

function writeGithubOutput(name, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, `${name}=${value}\n`);
}

async function main() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const githubRef = process.env.GITHUB_REF || '';
  const deploySha = (process.env.DEPLOY_SHA || '').trim();
  const mainHeadSha = (process.env.MAIN_HEAD_SHA || '').trim();
  const token = process.env.GITHUB_TOKEN || '';
  const repository = process.env.GITHUB_REPOSITORY || '';
  const [owner, repo] = repository.split('/');

  let checkRuns = [];
  if (token && owner && repo && deploySha) {
    checkRuns = await fetchCheckRuns({
      fetchFn: fetch,
      token,
      owner,
      repo,
      ref: deploySha,
    });
  }

  const verdict = evaluateDeployPreflight({
    eventName,
    githubRef,
    deploySha,
    mainHeadSha,
    checkRuns,
  });

  if (!verdict.allow) {
    if (verdict.hardFail) {
      console.error(`::error::${verdict.reason}`);
      process.exit(1);
    }
    console.log(`::notice::${verdict.reason}`);
    writeGithubOutput('skip_preflight', 'true');
    process.exit(0);
  }

  writeGithubOutput('skip_preflight', 'false');
}

const invokedAsScript = process.argv[1]?.includes('verify-deploy-preflight');
if (invokedAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}