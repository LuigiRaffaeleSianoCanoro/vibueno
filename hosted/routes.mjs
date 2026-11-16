/**
 * Registered Worker routes and HTML templates under public/.
 * CI fails if a route lacks a bundled page after build:pages.
 */
export const ROUTE_TEMPLATES = {
  shell: {
    file: 'shell.html',
    paths: ['/', '/shell', '/shell.html'],
    marker: 'vibueno-shell',
  },
};

/** Smoke markers (data-testid) per logical route — every manifest route must have one. */
export const ROUTE_MARKERS = Object.fromEntries(
  Object.entries(ROUTE_TEMPLATES).map(([name, cfg]) => [name, cfg.marker]),
);

for (const name of Object.keys(ROUTE_TEMPLATES)) {
  if (!ROUTE_MARKERS[name]) {
    throw new Error(`ROUTE_MARKERS missing for route "${name}"`);
  }
}

export function allTemplateNames() {
  return Object.keys(ROUTE_TEMPLATES);
}

export function templateNameForPath(pathname) {
  for (const [name, { paths }] of Object.entries(ROUTE_TEMPLATES)) {
    if (paths.includes(pathname)) return name;
  }
  return null;
}

/** Primary path + marker per route for smoke / verify. */
export function smokeRouteEntries() {
  return Object.entries(ROUTE_TEMPLATES).map(([name, cfg]) => ({
    name,
    path: cfg.paths[0],
    marker: ROUTE_MARKERS[name],
  }));
}