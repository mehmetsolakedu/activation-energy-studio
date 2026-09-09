#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const DEFAULT_V032_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  'evidence/platform/v0.3.2/retained/local-macos-diagnostic',
);

function parseArguments(argv) {
  if (argv.length === 0) return DEFAULT_V032_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY;
  if (
    argv.length !== 2 ||
    argv[0] !== '--output' ||
    !argv[1] ||
    argv[1].startsWith('--')
  ) {
    throw new Error(
      'Usage: node scripts/verify-local-macos-diagnostic-v032.mjs [--output <diagnostic-directory>]',
    );
  }
  return path.resolve(argv[1]);
}

export async function main(argv = process.argv.slice(2)) {
  process.env.AES_PLATFORM_VALIDATION_VERSION = '0.3.2';
  const { verifyLocalMacOSDiagnosticBundle } = await import(
    './run-hosted-platform-validation-core-v032.mjs'
  );
  const result = await verifyLocalMacOSDiagnosticBundle(parseArguments(argv));
  process.stdout.write(
    `TECHNICAL_OK ${result.claimStatus} files=${result.fileCount} manifest=${result.manifestSha256}\n`,
  );
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error?.code ?? 'UNCLASSIFIED_ERROR'} ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
