import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGES_PROJECT,
  pickNewestDeploymentWithSha,
  resolveRollbackTargetFromLiveVersion,
  rollbackDeployment,
  deployWithSmokeAndRollback,
  DeployError,
} from '../scripts/pages-deploy-lib.mjs';
import { buildNpxWranglerDeployArgv } from '../scripts/wrangler-deploy-args.mjs';

const ACCOUNT = '972c81007a876887bb25628c5fc12166';
const DEPLOY_A = 'aaaa-bbbb-cccc-dddd';
const DEPLOY_B = 'bbbb-cccc-dddd-eeee';
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
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

/** Realistic V1: Cloudflare metadata says B; live alias serves A */
const METADATA_SAYS_B_HISTORY = [
  {
    id: DEPLOY_B,
    environment: 'production',
    latest_stage: { status: 'success' },
    created_on: '2026-01-03T00:00:00Z',
    deployment_trigger: { metadata: { commit_hash: SHA_B } },
  },
  {
    id: DEPLOY_A,
    environment: 'production',
    latest_stage: { status: 'success' },
    created_on: '2026-01-01T00:00:00Z',
    deployment_trigger: { metadata: { commit_hash: SHA_A } },
  },
];

function deploymentListFetch(deployments) {
  return async (url, init) => {
    if (String(url).includes('/deployments') && init?.method !== 'POST') {
      return cfJson(deployments);
    }
    if (init?.method === 'POST' && String(url).includes('/rollback')) {
      return cfJson({ id: 'rolled' });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

const readShaA = async () => SHA_A;

test('pickNewestDeploymentWithSha chooses newest record for the same commit SHA', () => {
  const picked = pickNewestDeploymentWithSha(
    [
      {
        id: 'old',
        environment: 'production',
        created_on: '2026-01-01',
        deployment_trigger: { metadata: { commit_hash: SHA_A } },
      },
      {
        id: 'new',
        environment: 'production',
        created_on: '2026-01-05',
        deployment_trigger: { metadata: { commit_hash: SHA_A } },
      },
    ],
    SHA_A,
  );
  assert.equal(picked?.id, 'new');
});

test('resolveRollbackTargetFromLiveVersion maps live SHA A while history newest is B', async () => {
  const target = await resolveRollbackTargetFromLiveVersion({
    productionUrl: 'https://vibueno.pages.dev',
    accountId: ACCOUNT,
    apiToken: 'tok',
    fetchFn: deploymentListFetch(METADATA_SAYS_B_HISTORY),
    readLiveProductionShaFn: readShaA,
  });
  assert.equal(target.id, DEPLOY_A);
  assert.equal(target.commitSha, SHA_A);
});

test('consecutive failed deploy rolls back to A when metadata canonical would be B', async () => {
  const rollbackUrls = [];
  const fetchFn = async (url, init) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/rollback')) {
      rollbackUrls.push(u);
      return cfJson({ id: 'rolled' });
    }
    if (u.includes('/deployments')) {
      return cfJson(METADATA_SAYS_B_HISTORY);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    readLiveProductionShaFn: readShaA,
    runDeploy: async () => ({ deploymentId: NEW_ID }),
    runSmoke: async ({ phase, rollbackSha }) => {
      if (phase === 'post-deploy') return { ok: false, exitCode: 1 };
      assert.equal(rollbackSha, SHA_A);
      return { ok: true, exitCode: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.match(rollbackUrls[0], new RegExp(`/deployments/${DEPLOY_A}/rollback`));
});

test('abort before deploy when live SHA is unreadable', async () => {
  await assert.rejects(
    () =>
      resolveRollbackTargetFromLiveVersion({
        productionUrl: 'https://vibueno.pages.dev',
        accountId: ACCOUNT,
        apiToken: 'tok',
        fetchFn: deploymentListFetch([]),
        readLiveProductionShaFn: async () => null,
        allowFirstDeploy: false,
      }),
  (err) => {
    assert.ok(err instanceof DeployError);
    assert.match(err.message, /cannot read live production sha/i);
    return true;
  },
  );
});

test('abort before deploy when live SHA has no matching deployment', async () => {
  await assert.rejects(
    () =>
      resolveRollbackTargetFromLiveVersion({
        productionUrl: 'https://vibueno.pages.dev',
        accountId: ACCOUNT,
        apiToken: 'tok',
        fetchFn: deploymentListFetch([
          {
            id: DEPLOY_B,
            environment: 'production',
            deployment_trigger: { metadata: { commit_hash: SHA_B } },
          },
        ]),
        readLiveProductionShaFn: readShaA,
      }),
    (err) => {
      assert.ok(err instanceof DeployError);
      assert.match(err.message, /no production deployment record matches live sha/i);
      return true;
    },
  );
});

test('post-rollback smoke failure reports SHA mismatch loudly', async () => {
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn: deploymentListFetch([
      {
        id: DEPLOY_A,
        environment: 'production',
        deployment_trigger: { metadata: { commit_hash: SHA_A } },
      },
    ]),
    readLiveProductionShaFn: readShaA,
    runDeploy: async () => ({}),
    runSmoke: async ({ phase, rollbackSha }) => {
      if (phase === 'post-deploy') return { ok: false, exitCode: 1 };
      assert.equal(rollbackSha, SHA_A);
      return { ok: false, exitCode: 1 };
    },
  });
  assert.equal(result.rolledBack, true);
  assert.match(String(result.error), /post-rollback smoke failed/i);
  assert.match(String(result.error), /pre-deploy live sha/i);
});

test('wrangler deploy argv includes --commit-hash', () => {
  const argv = buildNpxWranglerDeployArgv(SHA_C, '4.45.0');
  assert.deepEqual(
    argv,
    [
      '--yes',
      'wrangler@4.45.0',
      'pages',
      'deploy',
      'public',
      '--project-name=vibueno',
      '--branch=main',
      '--commit-dirty=true',
      `--commit-hash=${SHA_C}`,
    ],
  );
});

test('deployWithSmokeAndRollback succeeds when smoke passes (no rollback)', async () => {
  const calls = { rollback: 0, deploy: 0 };
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && url.includes('/rollback')) calls.rollback += 1;
    if (url.includes('/deployments')) {
      return cfJson([
        {
          id: DEPLOY_A,
          environment: 'production',
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      ]);
    }
    throw new Error(url);
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    readLiveProductionShaFn: readShaA,
    runDeploy: async () => {
      calls.deploy += 1;
      return {};
    },
    runSmoke: async () => ({ ok: true, exitCode: 0 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.rollback, 0);
  assert.equal(result.previousDeploymentId, DEPLOY_A);
});

test('deploy does not run when rollback target cannot be resolved', async () => {
  let deployed = false;
  await assert.rejects(
    () =>
      deployWithSmokeAndRollback({
        accountId: ACCOUNT,
        apiToken: 'tok',
        productionUrl: 'https://vibueno.pages.dev',
        deploySha: SHA_C,
        fetchFn: deploymentListFetch([]),
        readLiveProductionShaFn: async () => null,
        allowFirstDeploy: false,
        runDeploy: async () => {
          deployed = true;
          return {};
        },
        runSmoke: async () => ({ ok: true, exitCode: 0 }),
      }),
    (err) => err instanceof DeployError,
  );
  assert.equal(deployed, false);
});

test('allowFirstDeploy permits deploy when live SHA unreadable and no history', async () => {
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn: deploymentListFetch([]),
    readLiveProductionShaFn: async () => null,
    runDeploy: async () => ({}),
    runSmoke: async () => ({ ok: true, exitCode: 0 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.previousDeploymentId, null);
});

test('first deploy smoke failure returns error without rollback', async () => {
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn: deploymentListFetch([]),
    readLiveProductionShaFn: async () => null,
    runDeploy: async () => ({}),
    runSmoke: async () => ({ ok: false, exitCode: 1 }),
    allowFirstDeploy: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, false);
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
  assert.match(posted.url, new RegExp(`/pages/projects/${PAGES_PROJECT}/deployments/${DEPLOY_A}/rollback$`));
});

test('runDeploy throw still runs smoke and rollback when smoke fails', async () => {
  const rollbackUrls = [];
  const fetchFn = async (url, init) => {
    if (init?.method === 'POST' && String(url).includes('/rollback')) {
      rollbackUrls.push(String(url));
      return cfJson({ id: 'rolled' });
    }
    if (String(url).includes('/deployments')) {
      return cfJson([
        {
          id: DEPLOY_A,
          environment: 'production',
          deployment_trigger: { metadata: { commit_hash: SHA_A } },
        },
      ]);
    }
    throw new Error(url);
  };
  const result = await deployWithSmokeAndRollback({
    accountId: ACCOUNT,
    apiToken: 'tok',
    productionUrl: 'https://vibueno.pages.dev',
    deploySha: SHA_C,
    fetchFn,
    readLiveProductionShaFn: readShaA,
    runDeploy: async () => {
      throw new DeployError('wrangler exited 1');
    },
    runSmoke: async ({ phase }) =>
      phase === 'post-deploy' ? { ok: false, exitCode: 1 } : { ok: true, exitCode: 0 },
  });
  assert.equal(result.rolledBack, true);
  assert.equal(rollbackUrls.length, 1);
});

test('pickNewestDeploymentWithSha ignores preview environment rows', () => {
  const picked = pickNewestDeploymentWithSha(
    [
      { id: 'pv', environment: 'preview', deployment_trigger: { metadata: { commit_hash: SHA_A } } },
      {
        id: DEPLOY_A,
        environment: 'production',
        deployment_trigger: { metadata: { commit_hash: SHA_A } },
      },
    ],
    SHA_A,
  );
  assert.equal(picked?.id, DEPLOY_A);
});