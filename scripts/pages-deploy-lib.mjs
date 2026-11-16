/**
 * Cloudflare Pages production deploy orchestration: live /api/version rollback target,
 * smoke after deploy, rollback on smoke failure.
 */
import { readLiveProductionSha } from './live-production-version.mjs';

export const PAGES_PROJECT = 'vibueno';

export class DeployError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'DeployError';
  }
}

/**
 * @param {string} accountId
 */
export function pagesApiOrigin(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${PAGES_PROJECT}`;
}

/**
 * @param {unknown} deployment
 * @returns {string | null}
 */
export function commitShaFromDeployment(deployment) {
  const trigger = /** @type {{ deployment_trigger?: { metadata?: Record<string, unknown> } }} */ (
    deployment ?? {}
  ).deployment_trigger;
  const meta = trigger?.metadata;
  const raw = meta?.commit_hash ?? meta?.commitHash ?? meta?.commit_sha ?? '';
  const sha = String(raw).trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/**
 * Pick the newest production deployment whose metadata commit matches `liveSha`.
 *
 * @param {Array<unknown>} deployments
 * @param {string} liveSha
 * @returns {{ id: string; commitSha: string } | null}
 */
export function pickNewestDeploymentWithSha(deployments, liveSha) {
  const target = liveSha.toLowerCase();
  /** @type {Array<{ id: string; created: string }>} */
  const matches = [];
  for (const entry of deployments) {
    if (!entry || typeof entry !== 'object') continue;
    const env = /** @type {{ environment?: string; id?: string; created_on?: string }} */ (entry);
    if (env.environment && env.environment !== 'production') continue;
    const sha = commitShaFromDeployment(entry);
    if (sha !== target || !env.id) continue;
    matches.push({ id: String(env.id), created: String(env.created_on ?? '') });
  }
  matches.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
  const best = matches[0];
  return best ? { id: best.id, commitSha: target } : null;
}

/**
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {typeof fetch} [opts.fetchFn]
 */
export async function listProductionDeployments({ accountId, apiToken, fetchFn = fetch }) {
  const headers = { Authorization: `Bearer ${apiToken}` };
  /** @type {Array<unknown>} */
  const all = [];
  let page = 1;
  for (;;) {
    const url = `${pagesApiOrigin(accountId)}/deployments?env=production&per_page=25&page=${page}`;
    const res = await fetchFn(url, { headers });
    const body = await res.json();
    if (!res.ok || body.success === false) {
      throw new DeployError(
        `Failed to list production deployments: HTTP ${res.status} ${JSON.stringify(body.errors ?? body)}`,
      );
    }
    const chunk = /** @type {Array<unknown>} */ (body.result ?? []);
    all.push(...chunk);
    if (chunk.length < 25) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

/**
 * Resolve rollback target from live production /api/version SHA (not Cloudflare canonical metadata).
 *
 * @param {object} opts
 * @param {string} opts.productionUrl
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {typeof fetch} [opts.fetchFn]
 * @param {boolean} [opts.allowFirstDeploy]
 * @param {typeof readLiveProductionSha} [opts.readLiveProductionShaFn]
 * @returns {Promise<{ id: string | null; commitSha: string | null }>}
 */
export async function resolveRollbackTargetFromLiveVersion({
  productionUrl,
  accountId,
  apiToken,
  fetchFn = fetch,
  allowFirstDeploy = false,
  readLiveProductionShaFn = readLiveProductionSha,
}) {
  const liveSha = await readLiveProductionShaFn(productionUrl, fetchFn);

  if (!liveSha) {
    if (allowFirstDeploy) {
      return { id: null, commitSha: null };
    }
    throw new DeployError(
      'Cannot read live production SHA from GET /api/version before deploy. Aborting (no guess from Pages metadata).',
    );
  }

  const deployments = await listProductionDeployments({ accountId, apiToken, fetchFn });
  const match = pickNewestDeploymentWithSha(deployments, liveSha);
  if (!match) {
    throw new DeployError(
      `No production deployment record matches live SHA ${liveSha}. Aborting before deploy.`,
    );
  }

  return { id: match.id, commitSha: liveSha };
}

/**
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {string} opts.deploymentId
 * @param {typeof fetch} [opts.fetchFn]
 */
export async function rollbackDeployment({ accountId, apiToken, deploymentId, fetchFn = fetch }) {
  const url = `${pagesApiOrigin(accountId)}/deployments/${deploymentId}/rollback`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    throw new DeployError(
      `Pages rollback failed for deployment ${deploymentId}: HTTP ${res.status} ${JSON.stringify(body.errors ?? body)}`,
    );
  }
  return body.result;
}

/**
 * @typedef {{ ok: boolean; exitCode: number }} SmokeRunResult
 * @typedef {(ctx: {
 *   phase: 'post-deploy' | 'post-rollback';
 *   base: string;
 *   sha: string;
 *   rollbackSha: string | null;
 * }) => Promise<SmokeRunResult>} RunSmokeFn
 * @typedef {() => Promise<{ deploymentId?: string }>} RunDeployFn
 */

/**
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {string} opts.productionUrl
 * @param {string} opts.deploySha
 * @param {typeof fetch} [opts.fetchFn]
 * @param {RunDeployFn} opts.runDeploy
 * @param {RunSmokeFn} opts.runSmoke
 * @param {boolean} [opts.allowFirstDeploy]
 * @param {typeof readLiveProductionSha} [opts.readLiveProductionShaFn]
 */
export async function deployWithSmokeAndRollback({
  accountId,
  apiToken,
  productionUrl,
  deploySha,
  fetchFn = fetch,
  runDeploy,
  runSmoke,
  allowFirstDeploy = false,
  readLiveProductionShaFn,
}) {
  const base = productionUrl.replace(/\/$/, '');
  const liveBefore = await resolveRollbackTargetFromLiveVersion({
    productionUrl,
    accountId,
    apiToken,
    fetchFn,
    allowFirstDeploy,
    readLiveProductionShaFn,
  });
  const previousDeploymentId = liveBefore.id;
  const previousCommitSha = liveBefore.commitSha;

  if (!previousDeploymentId && !allowFirstDeploy) {
    throw new DeployError(
      'No live production deployment to roll back to. Set allowFirstDeploy for the initial production upload.',
    );
  }

  let deployError = null;
  try {
    await runDeploy();
  } catch (err) {
    deployError = err instanceof Error ? err : new DeployError(String(err));
  }

  const postDeploySmoke = await runSmoke({
    phase: 'post-deploy',
    base,
    sha: deploySha,
    rollbackSha: previousCommitSha,
  });
  if (postDeploySmoke.ok) {
    return {
      ok: true,
      previousDeploymentId,
      previousCommitSha,
      rolledBack: false,
      deployHadError: Boolean(deployError),
    };
  }

  if (!previousDeploymentId) {
    return {
      ok: false,
      previousDeploymentId: null,
      previousCommitSha: null,
      rolledBack: false,
      deployHadError: Boolean(deployError),
      error: new DeployError('Post-deploy smoke failed and there is no previous deployment to roll back to.'),
    };
  }

  try {
    await rollbackDeployment({
      accountId,
      apiToken,
      deploymentId: previousDeploymentId,
      fetchFn,
    });
  } catch (err) {
    return {
      ok: false,
      previousDeploymentId,
      previousCommitSha,
      rolledBack: false,
      deployHadError: Boolean(deployError),
      error:
        err instanceof Error
          ? new DeployError(`Post-deploy smoke failed and rollback API failed: ${err.message}`)
          : err,
    };
  }

  if (!previousCommitSha) {
    return {
      ok: false,
      previousDeploymentId,
      previousCommitSha: null,
      rolledBack: true,
      deployHadError: Boolean(deployError),
      error: new DeployError(
        'Post-rollback smoke requires previous live SHA but none was recorded. Production state is ambiguous.',
      ),
    };
  }

  const postRollbackSmoke = await runSmoke({
    phase: 'post-rollback',
    base,
    sha: deploySha,
    rollbackSha: previousCommitSha,
  });
  if (!postRollbackSmoke.ok) {
    return {
      ok: false,
      previousDeploymentId,
      previousCommitSha,
      rolledBack: true,
      deployHadError: Boolean(deployError),
      error: new DeployError(
        'Rolled back to previous deployment but post-rollback smoke failed: /api/version did not match the pre-deploy live SHA.',
      ),
    };
  }

  return {
    ok: false,
    previousDeploymentId,
    previousCommitSha,
    rolledBack: true,
    deployHadError: Boolean(deployError),
    error: new DeployError('Production deploy rejected: post-deploy smoke failed; rolled back to previous deployment.'),
  };
}