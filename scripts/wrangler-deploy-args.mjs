/**
 * Wrangler `pages deploy` arguments (after the wrangler binary on the argv).
 *
 * @param {string} deploySha 40-char git SHA
 */
export function buildWranglerPagesDeployArgs(deploySha) {
  return [
    'pages',
    'deploy',
    'public',
    '--project-name=vibueno',
    '--branch=main',
    '--commit-dirty=true',
    `--commit-hash=${deploySha}`,
  ];
}

/**
 * @param {string} deploySha
 * @param {string} [wranglerVersion]
 */
export function buildNpxWranglerDeployArgv(deploySha, wranglerVersion = '4.45.0') {
  return ['--yes', `wrangler@${wranglerVersion}`, ...buildWranglerPagesDeployArgs(deploySha)];
}