/**
 * Registered Worker routes and HTML templates under public/.
 * CI fails if a route lacks a bundled page after build:pages.
 */
export const ROUTE_TEMPLATES = {
  shell: { file: 'shell.html', paths: ['/', '/shell', '/shell.html'] },
};

/** Smoke markers (data-testid) per logical route */
export const ROUTE_MARKERS = {
  shell: 'vibueno-shell',
};

export function allTemplateNames() {
  return Object.keys(ROUTE_TEMPLATES);
}

export function templateNameForPath(pathname) {
  for (const [name, { paths }] of Object.entries(ROUTE_TEMPLATES)) {
    if (paths.includes(pathname)) return name;
  }
  return null;
}