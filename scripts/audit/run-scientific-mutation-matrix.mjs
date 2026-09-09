#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidateRoot = resolve(scriptDirectory, '..', '..');
const auditRoot = resolve(candidateRoot, '..');
const matrixWorkRoot = resolve(auditRoot, 'work', 'scientific-mutation-matrix');
const logRoot = resolve(auditRoot, 'logs', 'scientific-mutation-matrix');
const artifactPath = resolve(
  auditRoot,
  'artifacts',
  'SCIENTIFIC_MUTATION_MATRIX.json',
);
const focusedTest = 'tests/audit-mutation-killers-v040.test.ts';
const vitestEntrypoint = resolve(candidateRoot, 'node_modules', 'vitest', 'vitest.mjs');

if (!matrixWorkRoot.startsWith(`${auditRoot}/`) || !logRoot.startsWith(`${auditRoot}/`)) {
  throw new Error('Mutation paths escaped the declared audit root.');
}

const mutations = [
  {
    id: 'gas-constant-r',
    target: 'src/core/constants.ts',
    description: 'Replace the exact CODATA molar gas constant with 8.0.',
    search: 'export const GAS_CONSTANT_J_PER_MOL_K = 8.31446261815324;',
    replacement: 'export const GAS_CONSTANT_J_PER_MOL_K = 8.0;',
  },
  {
    id: 'kelvin-offset',
    target: 'src/core/preprocessing.ts',
    description: 'Replace the Celsius-to-Kelvin offset 273.15 with 270.15.',
    search: 'const converted = unit === "K" ? value : value + 273.15;',
    replacement: 'const converted = unit === "K" ? value : value + 270.15;',
  },
  {
    id: 'kj-conversion-isoconversional',
    target: 'src/core/methods.ts',
    description: 'Replace the J-to-kJ divisor 1000 with 100 in isoconversional E.',
    search:
      'return (-slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 1000;',
    replacement:
      'return (-slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 100;',
  },
  {
    id: 'slope-sign',
    target: 'src/core/methods.ts',
    description: 'Remove the required negative slope sign in apparent E.',
    search:
      'return (-slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 1000;',
    replacement:
      'return (slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 1000;',
  },
  {
    id: 'natural-log-to-log10',
    target: 'src/core/methods.ts',
    description: 'Use log10 instead of the declared natural logarithm for FWO.',
    search: 'return Math.log(heatingRateKPerMinute);',
    replacement: 'return Math.log10(heatingRateKPerMinute);',
  },
  {
    id: 'fwo-1.052-coefficient',
    target: 'src/core/constants.ts',
    description: 'Replace the FWO natural-log slope coefficient 1.052 with 1.',
    search: 'export const FWO_SLOPE_COEFFICIENT = 1.052;',
    replacement: 'export const FWO_SLOPE_COEFFICIENT = 1;',
  },
  {
    id: 'starink-1.92-exponent',
    target: 'src/core/constants.ts',
    description: 'Replace the Starink temperature exponent 1.92 with 2.',
    search: 'export const STARINK_TEMPERATURE_EXPONENT = 1.92;',
    replacement: 'export const STARINK_TEMPERATURE_EXPONENT = 2;',
  },
  {
    id: 'starink-1.0008-coefficient',
    target: 'src/core/constants.ts',
    description: 'Replace the Starink slope coefficient 1.0008 with 1.',
    search: 'export const STARINK_SLOPE_COEFFICIENT = 1.0008;',
    replacement: 'export const STARINK_SLOPE_COEFFICIENT = 1;',
  },
  {
    id: 'friedman-beta-factor',
    target: 'src/core/preprocessing.ts',
    description: 'Divide rather than multiply d(alpha)/dT by beta.',
    search:
      ').map((value) => (value === undefined ? undefined : value * heatingRateKPerMinute));',
    replacement:
      ').map((value) => (value === undefined ? undefined : value / heatingRateKPerMinute));',
  },
  {
    id: 'student-t-residual-df',
    target: 'src/core/regression.ts',
    description: 'Use n-1 instead of n-2 residual degrees of freedom.',
    search: 'const residualDegreesOfFreedom = n - 2;',
    replacement: 'const residualDegreesOfFreedom = n - 1;',
  },
  {
    id: 'replicate-first-row-weighting',
    target: 'src/core/methods.ts',
    description: 'Use only the first replicate temperature instead of its physical-scale mean.',
    search:
      'const temperatureK = arithmeticMean(\n'
      + '      contributions.map((observation) => observation.temperatureK),\n'
      + '    );',
    replacement:
      'const temperatureK = contributions[0]!.temperatureK;',
  },
  {
    id: 'kj-conversion-kissinger',
    target: 'src/core/methods.ts',
    description: 'Replace the J-to-kJ divisor 1000 with 100 in Kissinger E.',
    search:
      'const activationEnergyKJPerMol =\n'
      + '      (-regression.slope * GAS_CONSTANT_J_PER_MOL_K) / 1000;',
    replacement:
      'const activationEnergyKJPerMol =\n'
      + '      (-regression.slope * GAS_CONSTANT_J_PER_MOL_K) / 100;',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedVitestEvidence(output) {
  const failedTests = output.match(/Tests\s+\d+ failed[^\n]*/)?.[0] ?? null;
  const failedFiles = output.match(/Test Files\s+\d+ failed[^\n]*/)?.[0] ?? null;
  const passedTests = output.match(/Tests\s+\d+ passed[^\n]*/)?.[0] ?? null;
  const passedFiles = output.match(/Test Files\s+\d+ passed[^\n]*/)?.[0] ?? null;
  return { failedFiles, failedTests, passedFiles, passedTests };
}

async function copySnapshot(destination) {
  await mkdir(destination, { recursive: true });
  for (const path of ['src', 'examples']) {
    await cp(resolve(candidateRoot, path), resolve(destination, path), {
      recursive: true,
    });
  }
  await mkdir(resolve(destination, 'tests'), { recursive: true });
  await cp(
    resolve(candidateRoot, focusedTest),
    resolve(destination, focusedTest),
  );
  for (const path of ['package.json', 'tsconfig.json', 'vite.config.ts']) {
    await cp(resolve(candidateRoot, path), resolve(destination, path));
  }
  await symlink(resolve(candidateRoot, 'node_modules'), resolve(destination, 'node_modules'));
}

function runFocusedSuite(cwd) {
  return spawnSync(
    process.execPath,
    [vitestEntrypoint, 'run', focusedTest, '--reporter=dot'],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      timeout: 30_000,
    },
  );
}

async function writeRunLog(name, result) {
  const output = [
    `exitCode=${result.status ?? 'null'}`,
    `signal=${result.signal ?? 'none'}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n');
  const path = resolve(logRoot, `${name}.log`);
  await writeFile(path, output, 'utf8');
  return relative(auditRoot, path);
}

async function main() {
  await rm(matrixWorkRoot, { recursive: true, force: true });
  await mkdir(matrixWorkRoot, { recursive: true });
  await mkdir(logRoot, { recursive: true });
  await mkdir(dirname(artifactPath), { recursive: true });

  const pristineRoot = resolve(matrixWorkRoot, 'pristine');
  await copySnapshot(pristineRoot);
  const focusedTestBytes = await readFile(resolve(pristineRoot, focusedTest));
  const baseline = runFocusedSuite(pristineRoot);
  const baselineLog = await writeRunLog('baseline', baseline);
  const baselineOutput = `${baseline.stdout ?? ''}\n${baseline.stderr ?? ''}`;
  const baselinePassed = baseline.status === 0;

  const results = [];
  if (baselinePassed) {
    for (const mutation of mutations) {
      const mutantRoot = resolve(matrixWorkRoot, mutation.id);
      await cp(pristineRoot, mutantRoot, {
        recursive: true,
        filter: (source) => !source.endsWith('/node_modules'),
      });
      await symlink(resolve(candidateRoot, 'node_modules'), resolve(mutantRoot, 'node_modules'));

      const targetPath = resolve(mutantRoot, mutation.target);
      const original = await readFile(targetPath, 'utf8');
      const replacementCount = original.split(mutation.search).length - 1;
      if (replacementCount !== 1) {
        results.push({
          id: mutation.id,
          target: mutation.target,
          description: mutation.description,
          outcome: 'INFRASTRUCTURE_ERROR',
          replacementCount,
          reason: 'Mutation search text did not occur exactly once.',
        });
        continue;
      }
      const mutated = original.replace(mutation.search, mutation.replacement);
      await writeFile(targetPath, mutated, 'utf8');

      const run = runFocusedSuite(mutantRoot);
      const log = await writeRunLog(mutation.id, run);
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      const evidence = normalizedVitestEvidence(output);
      const assertionFailureObserved =
        /AssertionError|Failed Tests|Test Files\s+1 failed/.test(output);
      const outcome = run.status !== 0 && assertionFailureObserved
        ? 'KILLED'
        : run.status === 0
          ? 'SURVIVED'
          : 'INFRASTRUCTURE_ERROR';
      results.push({
        id: mutation.id,
        target: mutation.target,
        description: mutation.description,
        outcome,
        replacementCount,
        exitCode: run.status,
        assertionFailureObserved,
        mutationSha256: sha256(mutated),
        log,
        evidence,
      });
    }
  }

  const killed = results.filter(({ outcome }) => outcome === 'KILLED').length;
  const survived = results.filter(({ outcome }) => outcome === 'SURVIVED').length;
  const infrastructureErrors = results.filter(
    ({ outcome }) => outcome === 'INFRASTRUCTURE_ERROR',
  ).length;
  const payload = {
    schemaVersion: 1,
    harness: 'exact-source-replacement-in-disposable-snapshot/v1',
    scope: 'candidate_worktree only; historical releases and live site excluded',
    contract:
      'A mutant is KILLED only when the unmodified focused suite passes and the exact, syntactically valid source replacement makes at least one focused assertion fail.',
    focusedTest,
    focusedTestSha256: sha256(focusedTestBytes),
    baseline: {
      passed: baselinePassed,
      exitCode: baseline.status,
      log: baselineLog,
      evidence: normalizedVitestEvidence(baselineOutput),
    },
    summary: {
      total: mutations.length,
      executed: results.length,
      killed,
      survived,
      infrastructureErrors,
      mutationScore: mutations.length === 0 ? null : killed / mutations.length,
    },
    mutations: results,
  };
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `baseline=${baselinePassed ? 'PASS' : 'FAIL'} `
    + `mutants=${mutations.length} killed=${killed} `
    + `survived=${survived} infrastructureErrors=${infrastructureErrors}\n`
    + `artifact=${relative(candidateRoot, artifactPath)}\n`,
  );
  if (!baselinePassed || killed !== mutations.length || survived > 0 || infrastructureErrors > 0) {
    process.exitCode = 1;
  }
}

await main();
