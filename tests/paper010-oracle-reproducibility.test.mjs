import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  discoverPython,
  PAPER010_ORACLE_PATH,
  pythonCandidates,
  runPaper010Oracle,
} from '../scripts/run-paper010-oracle.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx',
);
const PUBLICATION_TRANSFORM_PATH = path.join(
  PROJECT_ROOT,
  'tests/fixtures/real/source/paper010/pone.0173946.s004.xlsx',
);
const PUBLICATION_RESULT_PATH = path.join(
  PROJECT_ROOT,
  'tests/fixtures/real/source/paper010/pone.0173946.s005.xlsx',
);
const EXPECTED_SOURCE_SHA256 =
  'd24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57';
const EXPECTED_PUBLICATION_TRANSFORM_SHA256 =
  '0bed9425e3b8a6195a540d0461f3fca5451d0039db5ccee7c1b7bfcaebaaabdd';
const EXPECTED_PUBLICATION_RESULT_SHA256 =
  'f74bc21563263ef43669c41937d842065683e615a4b8d30a6df422caadf89463';
const EXPECTED_FIXTURE_SHA256 =
  'a913d8111af91a4fa8a2fc3d1c8dd02ec0e216795dad9bfd77cff4912e76b27d';

function sha256(pathname) {
  return createHash('sha256').update(readFileSync(pathname)).digest('hex');
}

function projectPath(root, portablePath) {
  return path.resolve(root, ...portablePath.split('/'));
}

function parseLastJsonLine(text) {
  const lines = String(text)
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  assert.ok(lines.length > 0, 'Expected at least one JSON output line.');
  return JSON.parse(lines.at(-1));
}

function runOracle(runtime, arguments_) {
  return runPaper010Oracle(arguments_, {
    runtime,
    stdio: 'pipe',
  });
}

function assertOracleSuccess(result) {
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  return parseLastJsonLine(result.stdout);
}

function assertOracleFailure(result, expectedCode) {
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, result.stdout);
  const failure = parseLastJsonLine(result.stderr);
  assert.equal(failure.status, 'FAIL');
  assert.equal(failure.code, expectedCode);
  return failure;
}

function temporaryProject(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'ae-paper010-oracle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const sourcePath = projectPath(
    root,
    'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx',
  );
  const implementationPath = projectPath(
    root,
    'tests/fixtures/real/oracle/paper010_decimal_oracle.py',
  );
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  mkdirSync(path.dirname(implementationPath), { recursive: true });
  copyFileSync(SOURCE_PATH, sourcePath);
  const publicationTransformPath = projectPath(
    root,
    'tests/fixtures/real/source/paper010/pone.0173946.s004.xlsx',
  );
  const publicationResultPath = projectPath(
    root,
    'tests/fixtures/real/source/paper010/pone.0173946.s005.xlsx',
  );
  copyFileSync(PUBLICATION_TRANSFORM_PATH, publicationTransformPath);
  copyFileSync(PUBLICATION_RESULT_PATH, publicationResultPath);
  copyFileSync(PAPER010_ORACLE_PATH, implementationPath);

  return {
    root,
    sourcePath,
    publicationTransformPath,
    publicationResultPath,
    implementationPath,
    fixturePath: projectPath(
      root,
      'tests/fixtures/real/paper010_rh_t_alpha_beta.csv',
    ),
    referencePath: projectPath(
      root,
      'tests/fixtures/real/paper010_rh_reference.json',
    ),
    manifestPath: projectPath(
      root,
      'tests/fixtures/real/manifest.json',
    ),
  };
}

function emitCanonicalFixture(t, runtime) {
  const fixture = temporaryProject(t);
  const emission = runOracle(runtime, [
    '--project-root',
    fixture.root,
    '--emit-csv',
    fixture.fixturePath,
    '--emit-json',
    fixture.referencePath,
  ]);
  const summary = assertOracleSuccess(emission);
  assert.equal(summary.status, 'EMITTED');
  assert.equal(summary.sourceSha256, EXPECTED_SOURCE_SHA256);
  assert.equal(
    summary.publicationTransformSha256,
    EXPECTED_PUBLICATION_TRANSFORM_SHA256,
  );
  assert.equal(
    summary.publicationResultSha256,
    EXPECTED_PUBLICATION_RESULT_SHA256,
  );
  assert.equal(summary.derivedFixtureSha256, EXPECTED_FIXTURE_SHA256);

  const manifest = {
    schema: 'activation-energy-studio/fixture-manifest/v2',
    scientificBaseline: 'paper010-rh-four-method-decimal-oracle-v1',
    lockedAt: '2026-07-27',
    comparisonTolerances: {
      alphaAbs: '5e-13',
      derivativeAbsPerMinute: '1e-12',
      transformedXYAbs: '1e-12',
      slopeAbsK: '1e-3',
      interceptAbs: '1e-6',
      rSquaredAbs: '1e-12',
      energyAbsKJPerMol: '5e-6',
      energyCiEndpointAbsKJPerMol: '5e-6',
      meanEnergyAbsKJPerMol: '5e-6',
      justification:
        'Locked binary64-versus-Decimal comparison bounds; never inferred from an application result.',
    },
    files: [
      {
        path: 'source/paper010/pone.0173946.s002.xlsx',
        role: 'immutable_official_raw_source',
        sha256: sha256(fixture.sourcePath),
      },
      {
        path: 'source/paper010/pone.0173946.s004.xlsx',
        role: 'official_publication_transform_source',
        sha256: sha256(fixture.publicationTransformPath),
      },
      {
        path: 'source/paper010/pone.0173946.s005.xlsx',
        role: 'official_publication_result_source',
        sha256: sha256(fixture.publicationResultPath),
      },
      {
        path: 'paper010_rh_t_alpha_beta.csv',
        role: 'deterministic_derived_fixture',
        sha256: sha256(fixture.fixturePath),
      },
      {
        path: 'paper010_rh_reference.json',
        role: 'independent_expected_output',
        sha256: sha256(fixture.referencePath),
      },
      {
        path: 'oracle/paper010_decimal_oracle.py',
        role: 'independent_reference_implementation',
        sha256: sha256(fixture.implementationPath),
      },
    ],
    rebaselinePolicy:
      'Any hash change requires a scientific release note, documented reason, and independent recalculation.',
  };
  writeFileSync(
    fixture.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return fixture;
}

function fileState(pathname) {
  const stat = statSync(pathname);
  return {
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(pathname),
  };
}

const runtime = discoverPython();

test('discovers an isolated stdlib-capable Python runtime', () => {
  assert.match(runtime.version, /^\d+\.\d+\.\d+$/u);
  const [major, minor] = runtime.version.split('.').map(Number);
  assert.ok(major > 3 || (major === 3 && minor >= 9));
  assert.ok(
    pythonCandidates().some(
      (candidate) => candidate.source === runtime.source,
    ),
  );
});

test('independently reproduces the Paper 010 CSV and Decimal reference deterministically', (t) => {
  const fixture = emitCanonicalFixture(t, runtime);
  const secondCsv = path.join(fixture.root, 'second.csv');
  const secondJson = path.join(fixture.root, 'second.json');
  assertOracleSuccess(
    runOracle(runtime, [
      '--project-root',
      fixture.root,
      '--emit-csv',
      secondCsv,
      '--emit-json',
      secondJson,
    ]),
  );

  assert.deepEqual(
    readFileSync(secondCsv),
    readFileSync(fixture.fixturePath),
  );
  assert.deepEqual(
    readFileSync(secondJson),
    readFileSync(fixture.referencePath),
  );
  assert.equal(sha256(secondCsv), EXPECTED_FIXTURE_SHA256);

  const reference = JSON.parse(readFileSync(secondJson, 'utf8'));
  assert.equal(
    reference.schema,
    'activation-energy-studio/real-validation-reference/v2',
  );
  assert.equal(reference.oracle.decimalPrecision, 50);
  assert.equal(reference.oracle.dependencies, 'standard-library-only');
  assert.equal(reference.oracle.importsApplicationSource, false);
  assert.equal(reference.observationsByAlpha.length, 16);
  assert.deepEqual(
    Object.keys(reference.methods).sort(),
    ['FRIEDMAN', 'FWO', 'KAS', 'STARINK'],
  );
  for (const method of Object.values(reference.methods)) {
    assert.equal(method.records.length, 16);
  }
  assert.equal(reference.methods.FWO.formulaId, 'fwo_doyle_ln_1.052_v1');
  assert.equal(reference.methods.KAS.formulaId, 'kas_ln_beta_over_t2_v1');
  assert.equal(
    reference.methods.STARINK.formulaId,
    'starink_ln_beta_over_t1.92_1.0008_v1',
  );
  assert.equal(
    reference.methods.FRIEDMAN.formulaId,
    'friedman_ln_dalpha_dt_v1',
  );
  assert.equal(
    reference.methods.KAS.meanActivationEnergyKJPerMol,
    '131.02157933677370493193128193918642638527979439951',
  );
  assert.equal(
    reference.methods.FWO.meanActivationEnergyKJPerMol,
    '133.84594547091069571399809414916459063802701182673',
  );
  assert.equal(
    reference.methods.STARINK.meanActivationEnergyKJPerMol,
    '131.30790722294032654905982260533155006386568673183',
  );
  assert.equal(
    reference.methods.FRIEDMAN.meanActivationEnergyKJPerMol,
    '131.43934314881343643627474128605274818176695556899',
  );
  assert.equal(
    reference.methods.FRIEDMAN.derivativeEstimatorId,
    'piecewise_linear_official_minus_dtg_v1',
  );
  assert.equal(
    reference.methods.FRIEDMAN.applicationDerivativeSource,
    'provided',
  );
  assert.ok(
    reference.observationsByAlpha.every(({ rates }) =>
      rates.every(({ dAlphaDtPerMinute }) =>
        Number(dAlphaDtPerMinute) > 0)),
  );
  assert.equal(
    reference.publicationComparison.status,
    'not_reproduced_from_raw_without_undocumented_preprocessing',
  );
  const friedmanDiagnostic =
    reference.publicationComparison.friedmanDiagnostic;
  assert.equal(
    friedmanDiagnostic.status,
    'PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD',
  );
  assert.equal(friedmanDiagnostic.diagnosticOnly, true);
  assert.equal(
    friedmanDiagnostic.acceptedAsEquationCorrectFriedman,
    false,
  );
  assert.equal(
    friedmanDiagnostic.equationCorrectMeanKJPerMol,
    '131.43934314881343643627474128605274818176695556899',
  );
  assert.equal(
    friedmanDiagnostic.nonstandardExactS2RawSignalMeanKJPerMol,
    '357.70836633931464731215037779883137188812989606998',
  );
  assert.equal(
    friedmanDiagnostic.nonstandardStoredS4MeanKJPerMol,
    '348.7795578516906305821906343298994217074754107576',
  );
  assert.equal(
    friedmanDiagnostic.publishedS5MeanKJPerMol,
    '358.465038750000000375',
  );
  assert.ok(
    Number(
      friedmanDiagnostic.correlationWithPublishedS5
        .nonstandardExactS2RawSignal,
    ) > 0.995,
  );
  assert.ok(
    Number(
      friedmanDiagnostic.s4LabeledOrdinateRmse
        .versusS2RawMinusDtgPercentPerMinute,
    ) < 0.05,
  );
  assert.ok(
    Number(
      friedmanDiagnostic.s4LabeledOrdinateRmse
        .versusLnS2RawMinusDtg,
    ) > 2,
  );
  assert.ok(
    Number(
      friedmanDiagnostic.s4LabeledOrdinateRmse
        .versusLnS2FractionPerMinute,
    ) > 6,
  );
  assert.equal(friedmanDiagnostic.records.length, 16);
});

test('--check is read-only and verifies the canonical v2 chain exactly', (t) => {
  const fixture = emitCanonicalFixture(t, runtime);
  const lockedPaths = [
    fixture.sourcePath,
    fixture.publicationTransformPath,
    fixture.publicationResultPath,
    fixture.fixturePath,
    fixture.referencePath,
    fixture.manifestPath,
    fixture.implementationPath,
  ];
  const before = Object.fromEntries(
    lockedPaths.map((pathname) => [pathname, fileState(pathname)]),
  );

  const summary = assertOracleSuccess(
    runOracle(runtime, [
      '--project-root',
      fixture.root,
      '--check',
    ]),
  );
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.mode, 'canonical_v2_exact');
  assert.equal(summary.rows, 48);
  assert.deepEqual(
    summary.methods,
    ['KAS', 'FWO', 'STARINK', 'FRIEDMAN'],
  );
  assert.equal(
    summary.friedmanDerivativeSource,
    'official_s2_minus_dtg_piecewise_linear',
  );
  assert.equal(
    summary.publicationDiagnosticStatus,
    'PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD',
  );

  const after = Object.fromEntries(
    lockedPaths.map((pathname) => [pathname, fileState(pathname)]),
  );
  assert.deepEqual(after, before);
});

test('fails closed on source, fixture, reference, implementation, and tolerance tampering', async (t) => {
  await t.test('official XLSX source byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.sourcePath, Buffer.from([0]));
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_SOURCE_HASH_MISMATCH',
    );
  });

  await t.test('official S4 publication-transform byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.publicationTransformPath, Buffer.from([0]));
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_PUBLICATION_TRANSFORM_HASH_MISMATCH',
    );
  });

  await t.test('official S5 publication-result byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.publicationResultPath, Buffer.from([0]));
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_PUBLICATION_RESULT_HASH_MISMATCH',
    );
  });

  await t.test('derived CSV byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.fixturePath, '\n', 'utf8');
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_DERIVED_FIXTURE_MISMATCH',
    );
  });

  await t.test('expected-output JSON byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.referencePath, '\n', 'utf8');
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_REFERENCE_MISMATCH',
    );
  });

  await t.test('relocked four-method scientific-content drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    const reference = JSON.parse(
      readFileSync(fixture.referencePath, 'utf8'),
    );
    reference.methods.STARINK.formulaId = 'tampered-formula';
    reference.methods.STARINK.records[0].activationEnergyKJPerMol = '999';
    reference.observationsByAlpha[0].rates[0].dAlphaDtPerMinute = '1';
    reference.publicationComparison.friedmanDiagnostic
      .acceptedAsEquationCorrectFriedman = true;
    writeFileSync(
      fixture.referencePath,
      `${JSON.stringify(reference, null, 2)}\n`,
      'utf8',
    );
    const manifest = JSON.parse(
      readFileSync(fixture.manifestPath, 'utf8'),
    );
    manifest.files.find(
      ({ role }) => role === 'independent_expected_output',
    ).sha256 = sha256(fixture.referencePath);
    writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_REFERENCE_MISMATCH',
    );
  });

  await t.test('independent implementation byte drift', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    appendFileSync(fixture.implementationPath, '\n# drift\n', 'utf8');
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_IMPLEMENTATION_HASH_MISMATCH',
    );
  });

  await t.test('v2 manifest tolerance removal', () => {
    const fixture = emitCanonicalFixture(t, runtime);
    const manifest = JSON.parse(
      readFileSync(fixture.manifestPath, 'utf8'),
    );
    delete manifest.comparisonTolerances;
    writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    assertOracleFailure(
      runOracle(runtime, [
        '--project-root',
        fixture.root,
        '--check',
      ]),
      'ORACLE_MANIFEST_INVALID',
    );
  });

  for (const [key, driftedValue] of [
    ['energyAbsKJPerMol', '5'],
    ['derivativeAbsPerMinute', '1'],
  ]) {
    await t.test(`v2 manifest ${key} policy drift`, () => {
      const fixture = emitCanonicalFixture(t, runtime);
      const manifest = JSON.parse(
        readFileSync(fixture.manifestPath, 'utf8'),
      );
      manifest.comparisonTolerances[key] = driftedValue;
      writeFileSync(
        fixture.manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      );
      assertOracleFailure(
        runOracle(runtime, [
          '--project-root',
          fixture.root,
          '--check',
        ]),
        'ORACLE_MANIFEST_INVALID',
      );
    });
  }
});

test('refuses implicit writes and check-plus-emit conflicts', (t) => {
  const fixture = temporaryProject(t);
  assertOracleFailure(
    runOracle(runtime, ['--project-root', fixture.root]),
    'ORACLE_ACTION_REQUIRED',
  );
  assertOracleFailure(
    runOracle(runtime, [
      '--project-root',
      fixture.root,
      '--check',
      '--emit-json',
      fixture.referencePath,
    ]),
    'ORACLE_ACTION_CONFLICT',
  );
});
