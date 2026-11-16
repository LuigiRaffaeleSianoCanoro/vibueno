import { FULL_SHA_RE } from './build-sha.mjs';

/**
 * @param {string} sha
 * @param {boolean} versionOk
 */
export function versionPayloadFromMeta(sha, versionOk) {
  const normalized = String(sha || '');
  const valid = versionOk === true && FULL_SHA_RE.test(normalized);
  if (!valid) {
    return { ok: false, sha: normalized || 'unknown', error: 'invalid_build' };
  }
  return { ok: true, sha: normalized };
}