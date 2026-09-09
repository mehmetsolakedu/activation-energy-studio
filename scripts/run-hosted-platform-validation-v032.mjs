#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export async function main() {
  process.env.AES_PLATFORM_VALIDATION_VERSION = '0.3.2';
  const harness = await import('./run-hosted-platform-validation-core-v032.mjs');
  await harness.main();
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error?.code ?? 'UNCLASSIFIED_ERROR'} ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
