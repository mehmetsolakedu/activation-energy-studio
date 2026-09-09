#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export async function main(argumentsList = process.argv.slice(2)) {
  process.env.AES_PLATFORM_VALIDATION_VERSION = '0.3.2';
  const recorder = await import('./record-platform-human-review.mjs');
  return recorder.main(argumentsList);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = await main();
}
