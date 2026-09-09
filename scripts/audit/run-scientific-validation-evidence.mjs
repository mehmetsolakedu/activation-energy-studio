#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidateRoot = resolve(scriptDirectory, '..', '..');
const auditRoot = resolve(candidateRoot, '..');
const oracleSource = resolve(auditRoot, 'oracle', 'activation_energy_oracle.py');
const oracleExpected = resolve(auditRoot, 'oracle', 'expected_outputs.json');
const regeneratedOracle = resolve(
  auditRoot,
  'work',
  'scientific-validation',
  'expected_outputs.regenerated.json',
);
const validationLog = resolve(auditRoot, 'logs', 'scientific-validation-tests.log');
const mutationHarnessLog = resolve(auditRoot, 'logs', 'scientific-mutation-harness.log');
const artifactPath = resolve(auditRoot, 'artifacts', 'SCIENTIFIC_VALIDATION_EVIDENCE.json');
const scientificTest = 'tests/audit-scientific-validation-v040.test.ts';
const mutationTest = 'tests/audit-mutation-killers-v040.test.ts';
const mutationHarness = 'scripts/audit/run-scientific-mutation-matrix.mjs';
const vitestEntrypoint = resolve(candidateRoot, 'node_modules', 'vitest', 'vitest.mjs');
const defaultBundledPython =
  '/Users/mehmetprom4/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(executable, args, cwd = candidateRoot) {
  return spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    timeout: 60_000,
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function compactTestCounts(output) {
  const tests = output.match(/Tests\s+(\d+) passed/)?.[1];
  const files = output.match(/Test Files\s+(\d+) passed/)?.[1];
  return {
    passedFiles: files === undefined ? null : Number(files),
    passedTests: tests === undefined ? null : Number(tests),
  };
}

async function fileIdentity(path) {
  const value = await readFile(path);
  return {
    path: relative(auditRoot, path),
    bytes: value.length,
    sha256: sha256(value),
  };
}

async function main() {
  await mkdir(dirname(regeneratedOracle), { recursive: true });
  await mkdir(dirname(validationLog), { recursive: true });
  await mkdir(dirname(artifactPath), { recursive: true });

  const python = process.env.AES_AUDIT_PYTHON ?? defaultBundledPython;
  const oracleRun = run(python, [oracleSource, '--output', regeneratedOracle], auditRoot);
  const expectedBytes = await readFile(oracleExpected);
  const regeneratedBytes = oracleRun.status === 0
    ? await readFile(regeneratedOracle)
    : Buffer.alloc(0);
  const oracleReproducedExactly =
    oracleRun.status === 0 && expectedBytes.equals(regeneratedBytes);

  const tests = run(process.execPath, [
    vitestEntrypoint,
    'run',
    scientificTest,
    mutationTest,
    '--reporter=dot',
  ]);
  const testOutput = combinedOutput(tests);
  await writeFile(validationLog, testOutput, 'utf8');

  const mutations = run(process.execPath, [resolve(candidateRoot, mutationHarness)]);
  await writeFile(mutationHarnessLog, combinedOutput(mutations), 'utf8');
  const mutationMatrixPath = resolve(
    auditRoot,
    'artifacts',
    'SCIENTIFIC_MUTATION_MATRIX.json',
  );
  const mutationMatrix = JSON.parse(await readFile(mutationMatrixPath, 'utf8'));
  const mutationPass =
    mutations.status === 0
    && mutationMatrix.baseline.passed === true
    && mutationMatrix.summary.killed === mutationMatrix.summary.total
    && mutationMatrix.summary.survived === 0
    && mutationMatrix.summary.infrastructureErrors === 0;

  const testCounts = compactTestCounts(testOutput);
  const testsPassed =
    tests.status === 0
    && testCounts.passedFiles === 2
    && testCounts.passedTests === 24;
  const status = oracleReproducedExactly && testsPassed && mutationPass
    ? 'PASS'
    : 'FAIL';
  const payload = {
    schemaVersion: 1,
    status,
    scope: 'scientific/numerical candidate validation; no historical or live mutation',
    oracle: {
      executable: python,
      exitCode: oracleRun.status,
      reproducedExpectedOutputExactly: oracleReproducedExactly,
      source: await fileIdentity(oracleSource),
      expected: await fileIdentity(oracleExpected),
      regenerated: await fileIdentity(regeneratedOracle),
    },
    deterministicTests: {
      exitCode: tests.status,
      ...testCounts,
      requiredPassedFiles: 2,
      requiredPassedTests: 24,
      log: relative(auditRoot, validationLog),
      files: [
        await fileIdentity(resolve(candidateRoot, scientificTest)),
        await fileIdentity(resolve(candidateRoot, mutationTest)),
      ],
    },
    mutationTesting: {
      exitCode: mutations.status,
      baselinePassed: mutationMatrix.baseline.passed,
      ...mutationMatrix.summary,
      log: relative(auditRoot, mutationHarnessLog),
      matrix: await fileIdentity(mutationMatrixPath),
      harness: await fileIdentity(resolve(candidateRoot, mutationHarness)),
    },
    toleranceContract: 'INDEPENDENT_ORACLE_SPEC.md#comparison-tolerances',
    interpretation:
      'PASS establishes agreement for the declared fixtures and mutants only; it does not replace real-data, browser, export, manuscript, or release gates.',
  };
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `scientificValidation=${status} oracleExact=${oracleReproducedExactly} `
    + `tests=${testCounts.passedTests ?? 0}/24 `
    + `mutants=${mutationMatrix.summary.killed}/${mutationMatrix.summary.total}\n`
    + `artifact=${relative(candidateRoot, artifactPath)}\n`,
  );
  if (status !== 'PASS') process.exitCode = 1;
}

await main();
