import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER = path.resolve(TEST_DIRECTORY, '../scripts/verify-offline-bundle.mjs');
const temporaryProjects = [];

function createProject({
  html = '<!doctype html><html><head><style>body{color:#111}</style></head><body><script type="module">console.log("local")</script></body></html>',
  source = 'export const localOnly = true;\n',
  extraDistFile = null,
} = {}) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'ae-offline-verifier-'));
  temporaryProjects.push(projectRoot);
  mkdirSync(path.join(projectRoot, 'dist'));
  mkdirSync(path.join(projectRoot, 'src'));
  writeFileSync(path.join(projectRoot, 'dist/index.html'), html);
  writeFileSync(path.join(projectRoot, 'src/main.ts'), source);
  if (extraDistFile) {
    writeFileSync(path.join(projectRoot, 'dist', extraDistFile), 'unexpected build output');
  }
  return projectRoot;
}

function runVerifier(projectRoot) {
  return spawnSync(
    process.execPath,
    [VERIFIER, '--project-root', projectRoot],
    { encoding: 'utf8' },
  );
}

test.after(() => {
  for (const projectRoot of temporaryProjects) {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});

test('accepts a one-file build with inline resources and local-only source', () => {
  const result = runVerifier(createProject());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS STATIC_OFFLINE_BUNDLE/);
});

test('rejects an external HTML resource', () => {
  const projectRoot = createProject({
    html: '<!doctype html><html><body><script src="https://cdn.example.invalid/app.js"></script></body></html>',
  });
  const result = runVerifier(projectRoot);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL BUILT_HTML_SELF_CONTAINED/);
  assert.match(result.stdout, /cdn\.example\.invalid/);
});

test('rejects a recognized first-party network API call', () => {
  const projectRoot = createProject({
    source: 'export async function load() { return fetch("/api/data"); }\n',
  });
  const result = runVerifier(projectRoot);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL FIRST_PARTY_SOURCE_NO_NETWORK_APIS/);
  assert.match(result.stdout, /network API call fetch\(\)/);
});

test('rejects any second build artifact even when index.html is inline', () => {
  const result = runVerifier(createProject({ extraDistFile: 'asset.js' }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL DIST_EXACTLY_ONE_HTML_FILE/);
  assert.match(result.stdout, /asset\.js/);
});
