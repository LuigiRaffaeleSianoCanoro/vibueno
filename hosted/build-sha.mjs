const FULL_SHA_RE = /^[0-9a-f]{40}$/;

/**
 * @param {string} repoRoot
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string }>} exec
 */
export async function assertGitClean(repoRoot, exec) {
  if (process.env.VIBUENO_ALLOW_DIRTY_BUILD === '1') return;
  try {
    const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: repoRoot });
    if (stdout.trim()) {
      throw new Error(`Dirty working tree; commit or stash before build:\n${stdout.trim()}`);
    }
  } catch (err) {
    if (err?.code === 'ENOENT' || /not a git repository/i.test(String(err?.message))) {
      return;
    }
    throw err;
  }
}

/**
 * @param {string} repoRoot
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string }>} exec
 */
export async function resolveBuildSha(repoRoot, exec) {
  const fromEnv = process.env.GITHUB_SHA || process.env.SOURCE_COMMIT;
  if (fromEnv) {
    const sha = String(fromEnv).trim().toLowerCase().slice(0, 40);
    if (!FULL_SHA_RE.test(sha)) {
      throw new Error(`Invalid GITHUB_SHA/SOURCE_COMMIT (need 40 hex chars): ${JSON.stringify(sha)}`);
    }
    await assertGitClean(repoRoot, exec);
    return { sha, ok: true, dirty: false };
  }

  await assertGitClean(repoRoot, exec);

  try {
    const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    const sha = stdout.trim().toLowerCase();
    if (!FULL_SHA_RE.test(sha)) {
      throw new Error(`git HEAD is not a full 40-char sha: ${JSON.stringify(sha)}`);
    }
    return { sha, ok: true, dirty: false };
  } catch (err) {
    throw new Error(
      `Build requires GITHUB_SHA, SOURCE_COMMIT, or a clean git checkout with HEAD: ${err?.message || err}`,
    );
  }
}

export { FULL_SHA_RE };