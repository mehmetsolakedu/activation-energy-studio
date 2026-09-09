#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SUITES = Object.freeze({
  platform: Object.freeze([
    'tests/platform-evidence-record.test.mjs',
  ]),
  hosted: Object.freeze([
    'tests/hosted-platform-validation.test.mjs',
    'tests/hosted-platform-v032-contract.test.mjs',
  ]),
});

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !Object.hasOwn(SUITES, argv[0])) {
    process.stderr.write(
      'Usage: node scripts/run-platform-tests-v032.mjs platform|hosted\n',
    );
    return 1;
  }
  const result = spawnSync(
    process.execPath,
    ['--test', ...SUITES[argv[0]]],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        AES_PLATFORM_VALIDATION_VERSION: '0.3.2',
      },
      stdio: 'inherit',
    },
  );
  if (result.error) {
    process.stderr.write(`FAIL V032_TEST_RUNNER ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = main();
}
