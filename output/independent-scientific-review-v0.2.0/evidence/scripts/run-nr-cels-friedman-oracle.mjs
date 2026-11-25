#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  discoverPython,
} from './run-paper010-oracle.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const NR_CELS_FRIEDMAN_ORACLE_PATH = path.resolve(
  SCRIPT_DIRECTORY,
  '../tests/fixtures/real/nr-cels/oracle/nr_cels_friedman_oracle.py',
);

export function runNrCelsFriedmanOracle(
  oracleArguments,
  {
    runtime,
    environment = process.env,
    spawn = spawnSync,
    stdio = 'inherit',
  } = {},
) {
  if (!Array.isArray(oracleArguments)) {
    throw new TypeError('oracleArguments must be an array.');
  }
  const selected = runtime ?? discoverPython({ environment, spawn });
  const result = spawn(
    selected.command,
    [
      ...selected.prefixArgs,
      '-I',
      '-S',
      NR_CELS_FRIEDMAN_ORACLE_PATH,
      ...oracleArguments,
    ],
    {
      encoding: stdio === 'pipe' ? 'utf8' : undefined,
      env: environment,
      stdio,
      windowsHide: true,
    },
  );
  if (result.error) {
    const error = new Error(
      `NR_CELS_FRIEDMAN_ORACLE_LAUNCH_FAILED: ${result.error.message}`,
    );
    error.code = 'NR_CELS_FRIEDMAN_ORACLE_LAUNCH_FAILED';
    error.cause = result.error;
    throw error;
  }
  return {
    ...result,
    runtime: {
      command: selected.command,
      prefixArgs: [...selected.prefixArgs],
      version: selected.version,
      source: selected.source,
    },
  };
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isMainModule()) {
  try {
    const result = runNrCelsFriedmanOracle(process.argv.slice(2));
    if (result.signal) {
      process.stderr.write(
        `${JSON.stringify({
          status: 'FAIL',
          code: 'NR_CELS_FRIEDMAN_ORACLE_TERMINATED',
          signal: result.signal,
        })}\n`,
      );
      process.exitCode = 3;
    } else {
      process.exitCode = result.status ?? 3;
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'FAIL',
        code: error?.code ?? 'NR_CELS_FRIEDMAN_ORACLE_RUNNER_ERROR',
        message: error instanceof Error ? error.message : String(error),
        attempts: error?.attempts ?? undefined,
      })}\n`,
    );
    process.exitCode = 3;
  }
}
