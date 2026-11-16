/**
 * Bounded backoff retries for post-deploy smoke (propagation delay).
 */

const DEFAULT_MAX_MS = 120_000;
const INITIAL_DELAY_MS = 3_000;
const MAX_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} opts
 * @param {() => Promise<number>} opts.runSmoke Exit code (0 = pass).
 * @param {number} [opts.maxMs]
 */
export async function smokeWithBackoff({ runSmoke, maxMs = DEFAULT_MAX_MS }) {
  const started = Date.now();
  let delay = INITIAL_DELAY_MS;
  let lastCode = 1;
  let attempts = 0;

  while (Date.now() - started < maxMs) {
    attempts += 1;
    lastCode = await runSmoke();
    if (lastCode === 0) {
      return { ok: true, attempts, lastExitCode: 0 };
    }
    if (Date.now() - started + delay >= maxMs) break;
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.5), MAX_DELAY_MS);
  }

  return { ok: false, attempts, lastExitCode: lastCode };
}