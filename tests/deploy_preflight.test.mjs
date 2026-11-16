import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_CI_JOBS,
  evaluateDeployPreflight,
} from '../scripts/verify-deploy-preflight.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function greenRuns() {
  return REQUIRED_CI_JOBS.map((name) => ({
    name,
    status: 'completed',
    conclusion: 'success',
  }));
}

test('workflow_dispatch rejects non-main ref', () => {
  const verdict = evaluateDeployPreflight({
    eventName: 'workflow_dispatch',
    githubRef: 'refs/heads/cursor/foo',
    deploySha: SHA,
    mainHeadSha: SHA,
    checkRuns: greenRuns(),
  });
  assert.equal(verdict.allow, false);
  assert.equal(verdict.hardFail, true);
});

test('stale deploy sha behind main HEAD is skipped softly', () => {
  const verdict = evaluateDeployPreflight({
    eventName: 'workflow_run',
    githubRef: 'refs/heads/main',
    deploySha: SHA,
    mainHeadSha: OTHER,
    checkRuns: greenRuns(),
  });
  assert.equal(verdict.allow, false);
  assert.equal(verdict.hardFail, false);
});

test('workflow_dispatch requires all CI jobs green on deploy sha', () => {
  const runs = greenRuns().filter((r) => r.name !== 'unit-tests');
  const verdict = evaluateDeployPreflight({
    eventName: 'workflow_dispatch',
    githubRef: 'refs/heads/main',
    deploySha: SHA,
    mainHeadSha: SHA,
    checkRuns: runs,
  });
  assert.equal(verdict.allow, false);
  assert.equal(verdict.hardFail, true);
  assert.match(verdict.reason, /unit-tests/);
});

test('workflow_run allows deploy when sha is main HEAD and CI green', () => {
  const verdict = evaluateDeployPreflight({
    eventName: 'workflow_run',
    githubRef: 'refs/heads/main',
    deploySha: SHA,
    mainHeadSha: SHA,
    checkRuns: greenRuns(),
  });
  assert.equal(verdict.allow, true);
});