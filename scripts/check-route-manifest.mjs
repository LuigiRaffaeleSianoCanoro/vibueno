#!/usr/bin/env node
/**
 * Fails if any route lacks source HTML, a data-testid marker, or bundled template in the artifact.
 */
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_TEMPLATES, ROUTE_MARKERS } from '../hosted/routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const publicDir = resolve(repoRoot, 'hosted/public');
const bundleModule = resolve(repoRoot, 'hosted/bundled-templates.mjs');
const workerBundle = resolve(repoRoot, 'hosted/public/_worker.js');

function hasMarker(html, marker) {
  return html.includes(`data-testid="${marker}"`) || html.includes(`data-testid='${marker}'`);
}

let failed = 0;

for (const [name, { file }] of Object.entries(ROUTE_TEMPLATES)) {
  const marker = ROUTE_MARKERS[name];
  if (!marker) {
    console.error(`FAIL route "${name}" missing ROUTE_MARKERS entry`);
    failed += 1;
    continue;
  }
  const path = resolve(publicDir, file);
  try {
    await access(path);
  } catch {
    console.error(`FAIL missing template file for route "${name}": ${file}`);
    failed += 1;
    continue;
  }
  const html = await readFile(path, 'utf8');
  if (!hasMarker(html, marker)) {
    console.error(`FAIL route "${name}" missing data-testid="${marker}" in ${file}`);
    failed += 1;
  }
}

let bundled;
try {
  const { pathToFileURL } = await import('node:url');
  bundled = await import(`${pathToFileURL(bundleModule).href}?t=${Date.now()}`);
} catch (e) {
  console.error('FAIL run build:pages before check:routes — bundled-templates.mjs missing');
  console.error(String(e?.message || e));
  process.exit(1);
}

for (const name of Object.keys(ROUTE_TEMPLATES)) {
  const marker = ROUTE_MARKERS[name];
  const tpl = bundled.BUNDLED_TEMPLATES?.[name];
  if (typeof tpl !== 'string' || tpl.length < 200) {
    console.error(`FAIL bundled template missing or too small: ${name}`);
    failed += 1;
    continue;
  }
  if (!hasMarker(tpl, marker)) {
    console.error(`FAIL bundled template for "${name}" missing data-testid="${marker}"`);
    failed += 1;
  }
}

const workerText = await readFile(workerBundle, 'utf8');
for (const marker of Object.values(ROUTE_MARKERS)) {
  if (!workerText.includes(`data-testid="${marker}"`) && !workerText.includes(`data-testid='${marker}'`)) {
    console.error(`FAIL public/_worker.js missing marker ${marker}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`OK ${Object.keys(ROUTE_TEMPLATES).length} route(s) in manifest + bundle`);