#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  verifyLocalMacOSDiagnosticBundle,
} from './run-hosted-platform-validation.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const DEFAULT_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  'evidence/platform/local-macos/v0.2.0-current-release',
);

function parseArguments(argv) {
  if (argv.length === 0) {
    return DEFAULT_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY;
  }
  if (
    argv.length !== 2 ||
    argv[0] !== '--output' ||
    !argv[1] ||
    argv[1].startsWith('--')
  ) {
    throw new Error(
      'Usage: node scripts/verify-local-macos-diagnostic.mjs [--output <diagnostic-directory>]',
    );
  }
  return path.resolve(argv[1]);
}

async function main() {
  const result = await verifyLocalMacOSDiagnosticBundle(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `TECHNICAL_OK ${result.claimStatus} files=${result.fileCount} manifest=${result.manifestSha256}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error?.code ?? 'UNCLASSIFIED_ERROR'} ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
