import test from 'node:test';
import assert from 'node:assert/strict';
import { readLiveProductionSha } from '../scripts/live-production-version.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/**
 * @param {{ ok: boolean; sha: string }} body
 * @returns {Response}
 */
function versionResponse(body) {
  return /** @type {Response} */ (
    /** @type {unknown} */ ({
      status: 200,
      async json() {
        return body;
      },
    })
  );
}

test('readLiveProductionSha returns SHA from /api/version', async () => {
  /** @type {typeof fetch} */
  const fetchFn = async (url) => {
    assert.match(String(url), /\/api\/version$/);
    return versionResponse({ ok: true, sha: SHA_A });
  };
  const sha = await readLiveProductionSha('https://vibueno.pages.dev', fetchFn, 500);
  assert.equal(sha, SHA_A);
});

test('readLiveProductionSha returns null when version invalid', async () => {
  /** @type {typeof fetch} */
  const fetchFn = async () => versionResponse({ ok: false, sha: 'unknown' });
  const sha = await readLiveProductionSha('https://vibueno.pages.dev', fetchFn, 50);
  assert.equal(sha, null);
});