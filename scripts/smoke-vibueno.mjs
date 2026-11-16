#!/usr/bin/env node
/**
 * Read-only smoke against a deployed or local base URL.
 *
 *   node scripts/smoke-vibueno.mjs --base http://127.0.0.1:8788 --sha "$(git rev-parse HEAD)"
 */
import { smokeRouteEntries } from '../hosted/routes.mjs';
import { shaMatches, versionResponseOk } from './smoke-vibueno-lib.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const base = (arg('--base') || '').replace(/\/$/, '');
const expectSha = (arg('--sha') || process.env.SMOKE_EXPECT_SHA || '').trim().toLowerCase();
const jsonOut = hasFlag('--json');

if (!base) {
  console.error('Missing --base (URL without trailing slash)');
  process.exit(2);
}

const routes = smokeRouteEntries();

/** @type {import('./smoke-vibueno-lib.mjs').SmokeResult[]} */
const results = [];
let failed = 0;

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {Record<string, unknown>} [detail]
 */
function record(name, ok, detail = {}) {
  results.push({ name, ok, ...detail });
  if (!ok) failed += 1;
}

async function request(path, method = 'GET') {
  const res = await fetch(`${base}${path}`, { method, redirect: 'manual' });
  const text = method === 'HEAD' ? '' : await res.text();
  return { status: res.status, text };
}

const ver = await request('/api/version');
let versionBody = {};
try {
  versionBody = JSON.parse(ver.text);
} catch {
  /* ignore */
}
const servedSha = String(versionBody.sha || '').toLowerCase();
record('api/version', versionResponseOk(ver.status, versionBody), {
  status: ver.status,
  sha: servedSha,
  ok: versionBody.ok,
});

if (expectSha && !shaMatches(servedSha, expectSha)) {
  record('sha/merge', false, { expected: expectSha, served: servedSha });
} else if (expectSha) {
  record('sha/merge', true, { expected: expectSha, served: servedSha });
}

for (const r of routes) {
  const res = await request(r.path);
  const hasMarker = res.text.includes(`data-testid="${r.marker}"`);
  record(`route ${r.path}`, res.status === 200 && hasMarker, {
    status: res.status,
    marker: r.marker,
  });
}

for (const path of ['/', '/api/version']) {
  const head = await request(path, 'HEAD');
  record(`HEAD ${path}`, head.status === 200, { status: head.status });
}

if (jsonOut) {
  console.log(JSON.stringify({ base, expectSha, servedSha, failed, results }, null, 2));
} else {
  console.log(`base ${base}`);
  for (const r of results) {
    console.log(r.ok ? 'OK ' : 'FAIL', r.name, JSON.stringify(r));
  }
}

process.exit(failed ? 1 : 0);