#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_OS_LEAK_PATTERNS, SCAN_SKIP_DIRS } from './agent-os-leak-patterns.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_SKIP_FILES = new Set([
  'scripts/agent-os-leak-patterns.mjs',
  'tests/agent_os_leak.test.mjs',
]);

/** @type {Set<string>} */
const textExtensions = new Set([
  '.md', '.mjs', '.js', '.json', '.html', '.yml', '.yaml', '.toml', '.mdc', '.webmanifest',
]);

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SCAN_SKIP_DIRS.has(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, files);
    } else if (textExtensions.has(ent.name.slice(ent.name.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

let failed = 0;

const files = await walk(repoRoot);
for (const file of files) {
  const rel = relative(repoRoot, file);
  if (SCAN_SKIP_FILES.has(rel.replace(/\\/g, '/'))) continue;
  const text = await readFile(file, 'utf8');
  for (const { id, pattern } of AGENT_OS_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      console.error(`FAIL agent-os leak (${id}) in ${rel}`);
      failed += 1;
    }
  }
}

if (failed) process.exit(1);
console.log(`OK scanned ${files.length} file(s), no agent-os identifiers`);