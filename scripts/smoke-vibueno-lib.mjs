/** @typedef {{ name: string; ok: boolean; [key: string]: unknown }} SmokeResult */

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const MIN_PREFIX = 12;

/**
 * @param {string} served
 * @param {string} expected
 */
export function shaMatches(served, expected) {
  if (!served || !expected) return false;
  const a = served.toLowerCase();
  const b = expected.toLowerCase();
  if (!/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  if (a.length === 40 && b.length === 40) return a === b;
  const n = Math.min(a.length, b.length);
  if (n < MIN_PREFIX) return false;
  return a.slice(0, n) === b.slice(0, n);
}

export function versionResponseOk(status, body) {
  return status === 200 && body?.ok === true && FULL_SHA_RE.test(String(body.sha || ''));
}