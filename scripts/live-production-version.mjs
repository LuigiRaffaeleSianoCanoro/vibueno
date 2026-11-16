import { versionResponseOk } from './smoke-vibueno-lib.mjs';
import { smokeWithBackoff } from './smoke-retry.mjs';

/**
 * Read the SHA production actually serves from GET /api/version (bounded retry).
 *
 * @param {string} productionUrl
 * @param {typeof fetch} [fetchFn]
 * @param {number} [maxMs]
 * @returns {Promise<string | null>} 40-char lowercase SHA or null
 */
export async function readLiveProductionSha(productionUrl, fetchFn = fetch, maxMs) {
  const base = productionUrl.replace(/\/$/, '');
  /** @type {string | null} */
  let lastSha = null;
  const retry = await smokeWithBackoff({
    maxMs,
    runSmoke: async () => {
      try {
        const res = await fetchFn(`${base}/api/version`);
        const body = await res.json();
        if (versionResponseOk(res.status, body)) {
          lastSha = String(body.sha).trim().toLowerCase();
          return 0;
        }
      } catch {
        /* retry */
      }
      return 1;
    },
  });
  return retry.ok && lastSha ? lastSha : null;
}