/**
 * Cloudflare Pages production deploy orchestration: record previous deployment,
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
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.apiToken
 * @param {typeof fetch} [opts.fetchFn]
 */
export async function getProductionDeploymentId({ accountId, apiToken, fetchFn = fetch }) {
  const url = `${pagesApiOrigin(accountId)}/deployments?env=production&per_page=1`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    throw new DeployError(
      `Failed to list production deployments: HTTP ${res.status} ${JSON.stringify(body.errors ?? body)}`,
    );
  }
  const list = /** @type {Array<{ id: string; environment?: string }>} */ (body.result ?? []);
  const prod = list.find((d) => d.environment === 'production') ?? list[0];
  return prod?.id ?? null;
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
 * @typedef {(ctx: { phase: 'post-deploy' | 'post-rollback'; base: string; sha: string }) => Promise<SmokeRunResult>} RunSmokeFn
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
  const previousDeploymentId = await getProductionDeploymentId({ accountId, apiToken, fetchFn });

  if (!previousDeploymentId && !allowFirstDeploy) {
    throw new DeployError(
      'No previous production deployment to roll back to. Set allowFirstDeploy for the initial production upload.',
    );
  }

  await runDeploy();

  const postDeploySmoke = await runSmoke({ phase: 'post-deploy', base, sha: deploySha });
  if (postDeploySmoke.ok) {
    return { ok: true, previousDeploymentId, rolledBack: false };
  }

  if (!previousDeploymentId) {
    return {
      ok: false,
      previousDeploymentId: null,
      rolledBack: false,
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
      rolledBack: false,
      error:
        err instanceof Error
          ? new DeployError(`Post-deploy smoke failed and rollback API failed: ${err.message}`)
          : err,
    };
  }

  const postRollbackSmoke = await runSmoke({ phase: 'post-rollback', base, sha: deploySha });
  if (!postRollbackSmoke.ok) {
    return {
      ok: false,
      previousDeploymentId,
      rolledBack: true,
      error: new DeployError(
        'Rolled back to previous deployment but post-rollback smoke still failed (production may be unhealthy).',
      ),
    };
  }

  return {
    ok: false,
    previousDeploymentId,
    rolledBack: true,
    error: new DeployError('Production deploy rejected: post-deploy smoke failed; rolled back to previous deployment.'),
  };
}