#!/usr/bin/env node
/**
 * Fails if any route in routes.mjs lacks its public HTML file or marker in the template.
 */
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_TEMPLATES, ROUTE_MARKERS } from '../hosted/routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../hosted/public');

let failed = 0;

for (const [name, { file }] of Object.entries(ROUTE_TEMPLATES)) {
  const path = resolve(publicDir, file);
  try {
    await access(path);
  } catch {
    console.error(`FAIL missing template file for route "${name}": ${file}`);
    failed += 1;
    continue;
  }
  const html = await readFile(path, 'utf8');
  const marker = ROUTE_MARKERS[name];
  if (marker && !html.includes(`data-testid="${marker}"`) && !html.includes(`data-testid='${marker}'`)) {
    console.error(`FAIL route "${name}" missing data-testid="${marker}" in ${file}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`OK ${Object.keys(ROUTE_TEMPLATES).length} route(s) in manifest`);