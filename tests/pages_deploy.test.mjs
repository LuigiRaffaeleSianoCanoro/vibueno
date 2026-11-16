import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGES_PROJECT,
  getLiveProductionDeployment,
  rollbackDeployment,
  deployWithSmokeAndRollback,
  DeployError,
} from '../scripts/pages-deploy-lib.mjs';

const ACCOUNT = '972c81007a876887bb25628c5fc12166';
const DEPLOY_A = 'aaaa-bbbb-cccc-dddd';
const DEPLOY_B = 'bbbb-cccc-dddd-eeee';
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_ID = 'eeee-ffff-1111-2222';
const SHA_C = 'cccccccccccccccccccccccccccccccccccccccc';

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

test('getLiveProductionDeployment uses canonical_deployment, not newest history row', async () => {
  const urls = [];
  const fetchFn = async (url, init) => {
    urls.push(String(url));
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          environment: 'production',
          latest_stage: { status: 'success' },
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    if (String(url).includes('/deployments')) {
      return cfJson([
        { id: DEPLOY_B, environment: 'production', latest_stage: { status: 'failure' } },
        { id: DEPLOY_A, environment: 'production', latest_stage: { status: 'success' } },
      ]);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const live = await getLiveProductionDeployment({
    accountId: ACCOUNT,
    apiToken: 'test-token',
    fetchFn,
  });
  assert.equal(live.id, DEPLOY_A);
  assert.equal(live.commitSha, SHA_A);
  assert.match(urls[0], new RegExp(`/pages/projects/${PAGES_PROJECT}$`));
});

test('getLiveProductionDeployment returns null when project has no canonical deployment', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({ name: PAGES_PROJECT, canonical_deployment: null });
    }
    return cfJson([]);
  };
  const live = await getLiveProductionDeployment({
    accountId: ACCOUNT,
    apiToken: 'x',
    fetchFn,
  });
  assert.equal(live.id, null);
  assert.equal(live.commitSha, null);
});

test('consecutive failed deploy rolls back to canonical A after rejected B was newest in history', async () => {
  const rollbackUrls = [];
  const fetchFn = async (url, init) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/rollback')) {
      rollbackUrls.push(u);
      return cfJson({ id: 'rolled' });
    }
    if (u.endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          environment: 'production',
          latest_stage: { status: 'success' },
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    if (u.includes('/deployments')) {
      return cfJson([{ id: DEPLOY_B, environment: 'production', latest_stage: { status: 'failure' } }]);
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    runDeploy: async () => ({ deploymentId: NEW_ID }),
    runSmoke: async ({ phase, rollbackSha }) => {
      if (phase === 'post-deploy') return { ok: false, exitCode: 1 };
      assert.equal(rollbackSha, SHA_A);
      return { ok: true, exitCode: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(rollbackUrls.length, 1);
  assert.match(rollbackUrls[0], new RegExp(`/deployments/${DEPLOY_A}/rollback`));
});

test('deployWithSmokeAndRollback succeeds when smoke passes (no rollback)', async () => {
  const calls = { rollback: 0, deploy: 0, smoke: 0 };
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) {
      calls.rollback += 1;
    }
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          environment: 'production',
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    if (url.includes('/deployments') && init?.method !== 'POST') {
      return cfJson([{ id: DEPLOY_A, environment: 'production' }]);
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
  assert.equal(result.previousDeploymentId, DEPLOY_A);
});

test('deployWithSmokeAndRollback rolls back when post-deploy smoke fails', async () => {
  const rollbackUrls = [];
  let smokePass = 0;
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) {
      rollbackUrls.push(url);
      return cfJson({ id: 'rollback-deploy-id' });
    }
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          environment: 'production',
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    if (url.includes('/deployments') && (!init?.method || init.method === 'GET')) {
      return cfJson([{ id: DEPLOY_A, environment: 'production' }]);
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
  assert.match(rollbackUrls[0], new RegExp(`/deployments/${DEPLOY_A}/rollback`));
  assert.equal(smokePass, 1);
  assert.match(String(result.error), /smoke/i);
});

test('getLiveProductionDeployment with null canonical falls back to successful production deployment', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({ canonical_deployment: null });
    }
    if (String(url).includes('/deployments')) {
      return cfJson([
        { id: 'prev', environment: 'preview' },
        {
          id: DEPLOY_A,
          environment: 'production',
          latest_stage: { status: 'success' },
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      ]);
    }
    return cfJson({});
  };
  const live = await getLiveProductionDeployment({
    accountId: ACCOUNT,
    apiToken: 'tok',
    fetchFn,
  });
  assert.equal(live.id, DEPLOY_A);
});

test('deployWithSmokeAndRollback rejects first deploy when no previous deployment', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({ canonical_deployment: null });
    }
    return cfJson([]);
  };
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
      assert.match(err.message, /no live production deployment/i);
      return true;
    },
  );
});

test('allowFirstDeploy permits deploy with no previous deployment', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({ canonical_deployment: null });
    }
    return cfJson([]);
  };
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
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: { id: DEPLOY_A, deployment_trigger: { metadata: { commit_hash: SHA_A } } },
      });
    }
    return cfJson([{ id: DEPLOY_A, environment: 'production' }]);
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
    deploymentId: DEPLOY_A,
    fetchFn,
  });
  assert.ok(posted);
  assert.equal(posted.method, 'POST');
  assert.match(posted.url, new RegExp(`/deployments/${DEPLOY_A}/rollback$`));
});

test('runDeploy throw still runs smoke and rollback when smoke fails', async () => {
  const rollbackUrls = [];
  const fetchFn = async (url, init) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/rollback')) {
      rollbackUrls.push(u);
      return cfJson({ id: 'rolled' });
    }
    if (u.endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    runDeploy: async () => {
      throw new DeployError('wrangler exited 1');
    },
    runSmoke: async ({ phase }) =>
      phase === 'post-deploy' ? { ok: false, exitCode: 1 } : { ok: true, exitCode: 0 },
  });
  assert.equal(result.rolledBack, true);
  assert.equal(rollbackUrls.length, 1);
});

test('runDeploy throw with successful smoke treats deploy as success', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    runDeploy: async () => {
      throw new DeployError('wrangler exited 1');
    },
    runSmoke: async () => ({ ok: true, exitCode: 0 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, true);
});

test('first deploy smoke failure returns error without rollback', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({ canonical_deployment: null });
    }
    return cfJson([]);
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    runDeploy: async () => ({}),
    runSmoke: async () => ({ ok: false, exitCode: 1 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, false);
  assert.equal(result.previousDeploymentId, null);
});

test('post-rollback smoke failure is reported after rollback', async () => {
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && String(url).includes('/rollback')) {
      return cfJson({ id: 'rolled' });
    }
    if (String(url).endsWith(`/pages/projects/${PAGES_PROJECT}`)) {
      return cfJson({
        canonical_deployment: {
          id: DEPLOY_A,
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      });
    }
    return cfJson({});
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    runDeploy: async () => ({}),
    runSmoke: async () => ({ ok: false, exitCode: 1 }),
  });
  assert.equal(result.rolledBack, true);
  assert.match(String(result.error), /post-rollback smoke/i);
});