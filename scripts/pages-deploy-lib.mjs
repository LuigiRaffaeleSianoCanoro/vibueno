/**
 * Cloudflare Pages production deploy orchestration: record live production deployment,
 * smoke after deploy, rollback on smoke failure.
 */

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
 * @param {unknown} deployment
 */
function deploymentIsProductionCandidate(deployment) {
  if (!deployment || typeof deployment !== 'object') return false;
  const env = /** @type {{ environment?: string; latest_stage?: { status?: string } }} */ (deployment);
  if (env.environment && env.environment !== 'production') return false;
  const stage = env.latest_stage?.status;
  if (stage && stage !== 'success') return false;
  const id = /** @type {{ id?: string }} */ (deployment).id;
  return Boolean(id);
}

/**
 * @param {unknown} deployment
 * @returns {{ id: string; commitSha: string | null } | null}
 */
function recordFromDeployment(deployment) {
  if (!deploymentIsProductionCandidate(deployment)) return null;
  const id = String(/** @type {{ id: string }} */ (deployment).id);
  return { id, commitSha: commitShaFromDeployment(deployment) };
}

/**
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {typeof fetch} [opts.fetchFn]
 * @returns {Promise<{ id: string | null; commitSha: string | null }>}
 */
export async function getLiveProductionDeployment({ accountId, apiToken, fetchFn = fetch }) {
  const headers = { Authorization: `Bearer ${apiToken}` };

  const projectRes = await fetchFn(pagesApiOrigin(accountId), { headers });
  const projectBody = await projectRes.json();
  if (!projectRes.ok || projectBody.success === false) {
    throw new DeployError(
      `Failed to load Pages project: HTTP ${projectRes.status} ${JSON.stringify(projectBody.errors ?? projectBody)}`,
    );
  }

  const canonical = projectBody.result?.canonical_deployment;
  const fromCanonical = recordFromDeployment(canonical);
  if (fromCanonical) {
    return { id: fromCanonical.id, commitSha: fromCanonical.commitSha };
  }

  const listUrl = `${pagesApiOrigin(accountId)}/deployments?env=production&per_page=25`;
  const listRes = await fetchFn(listUrl, { headers });
  const listBody = await listRes.json();
  if (!listRes.ok || listBody.success === false) {
    throw new DeployError(
      `Failed to list production deployments: HTTP ${listRes.status} ${JSON.stringify(listBody.errors ?? listBody)}`,
    );
  }

  const list = /** @type {Array<unknown>} */ (listBody.result ?? []);
  for (const entry of list) {
    const rec = recordFromDeployment(entry);
    if (rec) return { id: rec.id, commitSha: rec.commitSha };
  }

  return { id: null, commitSha: null };
}

/** @deprecated Use getLiveProductionDeployment */
export async function getProductionDeploymentId(opts) {
  const live = await getLiveProductionDeployment(opts);
  return live.id;
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
}) {
  const base = productionUrl.replace(/\/$/, '');
  const liveBefore = await getLiveProductionDeployment({ accountId, apiToken, fetchFn });
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
        'Rolled back to previous deployment but post-rollback smoke still failed (production may be unhealthy).',
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