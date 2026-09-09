import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const PAPER010_ORACLE_PATH = path.resolve(
  SCRIPT_DIRECTORY,
  '../tests/fixtures/real/oracle/paper010_decimal_oracle.py',
);

const VERSION_PROBE = [
  '-c',
  [
    'import json, sys',
    'from decimal import Decimal',
    'ok = sys.version_info >= (3, 9) and hasattr(Decimal(2), "ln")',
    'print(json.dumps({"version": list(sys.version_info[:3]), "ok": ok}))',
    'raise SystemExit(0 if ok else 2)',
  ].join('; '),
];

function candidateKey(candidate) {
  return JSON.stringify([candidate.command, candidate.prefixArgs]);
}

export function pythonCandidates(environment = process.env) {
  const candidates = [];
  if (typeof environment.PYTHON === 'string' && environment.PYTHON.trim()) {
    candidates.push({
      command: environment.PYTHON.trim(),
      prefixArgs: [],
      source: 'PYTHON',
    });
  }
  candidates.push(
    { command: 'python3', prefixArgs: [], source: 'python3' },
    { command: 'python', prefixArgs: [], source: 'python' },
    { command: 'py', prefixArgs: ['-3'], source: 'py -3' },
  );
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function discoverPython({
  environment = process.env,
  spawn = spawnSync,
} = {}) {
  const attempts = [];
  for (const candidate of pythonCandidates(environment)) {
    const result = spawn(
      candidate.command,
      [...candidate.prefixArgs, '-I', '-S', ...VERSION_PROBE],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    attempts.push({
      source: candidate.source,
      command: candidate.command,
      status: result.status,
      errorCode: result.error?.code ?? null,
    });
    if (result.status !== 0 || result.error) continue;
    try {
      const probe = JSON.parse(result.stdout.trim());
      if (
        probe.ok === true
        && Array.isArray(probe.version)
        && probe.version.length === 3
      ) {
        return {
          ...candidate,
          version: probe.version.join('.'),
          attempts,
        };
      }
    } catch {
      // A candidate with unexpected stdout is not a valid oracle runtime.
    }
  }
  const error = new Error(
    'PAPER010_ORACLE_PYTHON_UNAVAILABLE: Python >=3.9 with Decimal.ln() is required for validation.',
  );
  error.code = 'PAPER010_ORACLE_PYTHON_UNAVAILABLE';
  error.attempts = attempts;
  throw error;
}

export function runPaper010Oracle(
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
      PAPER010_ORACLE_PATH,
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
      `PAPER010_ORACLE_LAUNCH_FAILED: ${result.error.message}`,
    );
    error.code = 'PAPER010_ORACLE_LAUNCH_FAILED';
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
    const result = runPaper010Oracle(process.argv.slice(2));
    if (result.signal) {
      process.stderr.write(
        `${JSON.stringify({
          status: 'FAIL',
          code: 'PAPER010_ORACLE_TERMINATED',
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
        code: error?.code ?? 'PAPER010_ORACLE_RUNNER_ERROR',
        message: error instanceof Error ? error.message : String(error),
        attempts: error?.attempts ?? undefined,
      })}\n`,
    );
    process.exitCode = 3;
  }
}
