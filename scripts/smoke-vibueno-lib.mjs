/** @typedef {{ name: string; ok: boolean; [key: string]: unknown }} SmokeResult */

/**
 * @param {string} served
 * @param {string} expected
 */
export function shaMatches(served, expected) {
  if (!served || !expected) return false;
  const a = served.toLowerCase();
  const b = expected.toLowerCase();
  return a === b || a.startsWith(b.slice(0, 7)) || b.startsWith(a.slice(0, 7));
}