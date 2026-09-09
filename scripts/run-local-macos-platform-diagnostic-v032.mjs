#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
process.env.AES_PLATFORM_VALIDATION_VERSION = '0.3.2';

const { runLocalMacOSDiagnostic } = await import(
  './run-hosted-platform-validation-core-v032.mjs'
);
const { HostedPlatformValidationError } = await import(
  './platform-hosted-ci-v032.mjs'
);

function fail(code, message) {
  throw new HostedPlatformValidationError(code, message);
}

export function localMacOSDiagnosticV032Usage() {
  return [
    'Usage:',
    '  node scripts/run-local-macos-platform-diagnostic-v032.mjs',
    '    --output <new-or-empty-output-directory>',
    '    [--browser-executable <absolute-Google-Chrome-path>]',
    '',
    'This command runs the frozen v0.3.2 candidate only on a direct local macOS host.',
    'It does not emit hosted provenance, recorder input, or platform PASS evidence.',
  ].join('\n');
}

export function parseLocalMacOSDiagnosticV032Arguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return null;
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!['--output', '--browser-executable'].includes(token)) {
      fail('ARGUMENT_INVALID', `Unknown local diagnostic argument: ${token}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      fail('ARGUMENT_INVALID', `${token} requires a value.`);
    }
    if (values.has(token)) {
      fail('ARGUMENT_INVALID', `${token} was provided more than once.`);
    }
    values.set(token, value);
    index += 1;
  }
  if (!values.has('--output')) {
    fail('ARGUMENT_REQUIRED', '--output is required.');
  }
  return Object.freeze({
    outputDirectory: path.resolve(values.get('--output')),
    browserExecutable: values.has('--browser-executable')
      ? path.resolve(values.get('--browser-executable'))
      : null,
  });
}

export async function main(argumentsList = process.argv.slice(2)) {
  const options = parseLocalMacOSDiagnosticV032Arguments(argumentsList);
  if (!options) {
    process.stdout.write(`${localMacOSDiagnosticV032Usage()}\n`);
    return;
  }
  const result = await runLocalMacOSDiagnostic(options);
  process.stdout.write(
    `TECHNICAL_OK ${result.metadata.claimStatus} files=${result.manifest.fileCount}\n`,
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
