import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGES_PROJECT,
  getProductionDeploymentId,
  rollbackDeployment,
  deployWithSmokeAndRollback,
  DeployError,
} from '../scripts/pages-deploy-lib.mjs';

const ACCOUNT = '972c81007a876887bb25628c5fc12166';
const PREV_ID = 'aaaa-bbbb-cccc-dddd';
const NEW_ID = 'eeee-ffff-1111-2222';

/**
 * @param {unknown} body
 * @param {boolean} [ok]
 * @param {number} [status]
 * @returns {Response}
 */
function cfJson(body, ok = true, status = 200) {
  return /** @type {Response} */ (
    /** @type {unknown} */ ({
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return { success: ok, result: body, errors: ok ? [] : [{ message: 'api error' }] };
      },
      async text() {
        return JSON.stringify({ success: ok, result: body });
      },
    })
  );
}

test('getProductionDeploymentId returns latest production deployment', async () => {
  const urls = [];
  const fetchFn = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    return cfJson([{ id: PREV_ID, environment: 'production', created_on: '2026-01-01' }]);
  };
  const id = await getProductionDeploymentId({
    accountId: ACCOUNT,
    apiToken: 'test-token',
    fetchFn,
  });
  assert.equal(id, PREV_ID);
  assert.match(urls[0], new RegExp(`/pages/projects/${PAGES_PROJECT}/deployments`));
});

test('getProductionDeploymentId returns null when no production deployments', async () => {
  const fetchFn = async () => cfJson([]);
  const id = await getProductionDeploymentId({
    accountId: ACCOUNT,
    apiToken: 'x',
    fetchFn,
  });
  assert.equal(id, null);
});

test('deployWithSmokeAndRollback succeeds when smoke passes (no rollback)', async () => {
  const calls = { rollback: 0, deploy: 0, smoke: 0 };
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) {
      calls.rollback += 1;
    }
    if (url.includes('/deployments') && init?.method !== 'POST') {
      return cfJson([{ id: PREV_ID, environment: 'production' }]);
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: 'abc123def4567890abcdef1234567890abcdef12',
    fetchFn,
    runDeploy: async () => {
      calls.deploy += 1;
      return { deploymentId: NEW_ID };
    },
    runSmoke: async () => {
      calls.smoke += 1;
      return { ok: true, exitCode: 0 };
    },
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.deploy, 1);
  assert.equal(calls.smoke, 1);
  assert.equal(calls.rollback, 0);
  assert.equal(result.previousDeploymentId, PREV_ID);
});

test('deployWithSmokeAndRollback rolls back when post-deploy smoke fails', async () => {
  const rollbackUrls = [];
  let smokePass = 0;
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) {
      rollbackUrls.push(url);
      return cfJson({ id: 'rollback-deploy-id' });
    }
    if (url.includes('/deployments') && (!init?.method || init.method === 'GET')) {
      return cfJson([{ id: PREV_ID, environment: 'production' }]);
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: 'abc123def4567890abcdef1234567890abcdef12',
    fetchFn,
    runDeploy: async () => ({ deploymentId: NEW_ID }),
    runSmoke: async ({ phase }) => {
      if (phase === 'post-deploy') return { ok: false, exitCode: 1 };
      smokePass += 1;
      return { ok: true, exitCode: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(rollbackUrls.length, 1);
  assert.match(rollbackUrls[0], new RegExp(`/deployments/${PREV_ID}/rollback`));
  assert.equal(smokePass, 1);
  assert.match(String(result.error), /smoke/i);
});

test('deployWithSmokeAndRollback rejects first deploy when no previous deployment', async () => {
  const fetchFn = async () => cfJson([]);
  await assert.rejects(
    () =>
      deployWithSmokeAndRollback({
        accountId: ACCOUNT,
        apiToken: 'tok',
        productionUrl: 'https://vibueno.pages.dev',
        deploySha: 'abc123def4567890abcdef1234567890abcdef12',
        fetchFn,
        runDeploy: async () => ({ deploymentId: NEW_ID }),
        runSmoke: async () => ({ ok: true, exitCode: 0 }),
        allowFirstDeploy: false,
      }),
    (err) => {
      assert.ok(err instanceof DeployError);
      assert.match(err.message, /no previous production deployment/i);
      return true;
    },
  );
});

test('allowFirstDeploy permits deploy with no previous deployment', async () => {
  const fetchFn = async () => cfJson([]);
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: 'abc123def4567890abcdef1234567890abcdef12',
    fetchFn,
    runDeploy: async () => ({ deploymentId: NEW_ID }),
    runSmoke: async () => ({ ok: true, exitCode: 0 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.previousDeploymentId, null);
});

test('deployWithSmokeAndRollback fails loudly when rollback API fails', async () => {
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) {
      return cfJson(null, false, 500);
    }
    return cfJson([{ id: PREV_ID, environment: 'production' }]);
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: 'abc123def4567890abcdef1234567890abcdef12',
    fetchFn,
    runDeploy: async () => ({ deploymentId: NEW_ID }),
    runSmoke: async ({ phase }) =>
      phase === 'post-deploy' ? { ok: false, exitCode: 1 } : { ok: true, exitCode: 0 },
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /rollback/i);
});

test('rollbackDeployment posts to Pages rollback endpoint', async () => {
  /** @type {{ url: string; method: string } | null} */
  let posted = null;
  const fetchFn = async (url, init) => {
    posted = { url: String(url), method: init?.method ?? 'GET' };
    return cfJson({ id: 'rolled' });
  };
  await rollbackDeployment({
    accountId: ACCOUNT,
    apiToken: 'tok',
    deploymentId: PREV_ID,
    fetchFn,
  });
  assert.ok(posted);
  assert.equal(posted.method, 'POST');
  assert.match(posted.url, new RegExp(`/deployments/${PREV_ID}/rollback$`));
});