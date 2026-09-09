#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';
import readXlsxFile from 'read-excel-file/node';

import {
  assertGoogleChromeProduct,
  discoverGoogleChromeExecutable,
} from './run-hosted-platform-validation.mjs';
import { assertOfflineHar } from './platform-hosted-ci.mjs';
import {
  canonicalScientificJson,
  scientificReportHash,
} from './compare-scientific-reports.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const PAPER010_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
export const PAPER010_STATUS =
  'LOCAL_TECHNICAL_REAL_DATA_REPRODUCTION_NOT_INDEPENDENT_REVIEW';
export const PAPER010_MANIFEST_SCHEMA =
  'activation-energy-studio/paper010-raw-to-report-evidence/v1';
export const PAPER010_MANIFEST_NAME = 'PAPER010_RAW_TO_REPORT_MANIFEST.json';
export const PAPER010_METHODS = Object.freeze([
  'FWO',
  'KAS',
  'STARINK',
  'FRIEDMAN',
]);
export const PAPER010_ALPHA_GRID = Object.freeze(
  Array.from({ length: 16 }, (_, index) =>
    Number(((index + 1) * 0.05).toFixed(2))),
);
export const PAPER010_PROJECT_NAME = 'Paper010 raw-to-report';
export const PAPER010_PROCESS = 'multi-rate thermal decomposition';
export const PAPER010_STAGE =
  'RH conversion branch, alpha 0.05-0.80';
export const PAPER010_RELEASE_RELATIVE =
  'release/Activation-Energy-Studio-v0.2.0.html';
export const PAPER010_RAW_SOURCE_RELATIVE =
  'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx';
export const PAPER010_FIXTURE_RELATIVE =
  'tests/fixtures/real/paper010_rh_t_alpha_beta.csv';
export const PAPER010_REFERENCE_RELATIVE =
  'tests/fixtures/real/paper010_rh_reference.json';
export const PAPER010_FIXTURE_MANIFEST_RELATIVE =
  'tests/fixtures/real/manifest.json';
export const PAPER010_SHA256SUMS_RELATIVE = 'release/SHA256SUMS.txt';
export const PAPER010_REPORT_FILENAMES = Object.freeze({
  json: 'paper010-raw-to-report.json',
  csv: 'paper010-raw-to-report-results.csv',
  pdf: 'paper010-raw-to-report-report.pdf',
  screenshot: 'paper010-final-state.png',
  network: 'paper010-network-capture.json',
  har: 'paper010-offline.har',
});
export const PAPER010_IMPLEMENTATION_SOURCES = Object.freeze([
  Object.freeze({
    role: 'paper010_runner',
    path: 'scripts/run-paper010-raw-to-report-v0.3.1.mjs',
  }),
  Object.freeze({
    role: 'paper010_focused_tests',
    path: 'tests/paper010-raw-to-report.test.mjs',
  }),
  Object.freeze({
    role: 'paper010_protocol',
    path: 'evidence/validation/PAPER010_RAW_TO_REPORT_PROTOCOL.md',
  }),
  Object.freeze({
    role: 'chrome_identity_helper',
    path: 'scripts/run-hosted-platform-validation.mjs',
  }),
  Object.freeze({
    role: 'offline_har_contract',
    path: 'scripts/platform-hosted-ci.mjs',
  }),
  Object.freeze({
    role: 'canonical_scientific_comparator',
    path: 'scripts/compare-scientific-reports.mjs',
  }),
]);

const DEFAULT_TIMEOUT_MS = 60_000;
const EXPECTED_SAMPLE = 'Rhubarb (RH)';
const EXPECTED_ATMOSPHERE = 'Simulated air (N2:O2=4:1)';
const EXPECTED_REPORT_SCHEMA =
  'activation-energy-studio/project-report/v4';
const PAPER010_SHEET = 'Fig.2.';
const PAPER010_HEADER_ROW = 2;
const PAPER010_POINT_AUDIT_SHA256 =
  'a9d927aa416168a95125e12f11b607e94e9cd38fee63b671fa5e368305c2ac5d';
const PAPER010_HEADERS = Object.freeze(
  Array.from({ length: 36 }, (_, columnIndex) => (
    columnIndex < 18
      ? (columnIndex % 2 === 0 ? 'temperature' : 'weight')
      : (columnIndex % 2 === 0 ? 'temperature' : 'DTG')
  )),
);
const PAPER010_SOURCE_ROWS_BY_RATE = Object.freeze({
  5: Object.freeze([
    [119, 120], [155, 156], [171, 172], [188, 189],
    [217, 218], [238, 239], [252, 253], [263, 264],
    [276, 277], [292, 293], [312, 313], [335, 336],
    [356, 357], [374, 375], [394, 395], [424, 425],
  ]),
  10: Object.freeze([
    [137, 138], [169, 170], [184, 185], [201, 202],
    [230, 231], [250, 251], [263, 264], [275, 276],
    [289, 290], [309, 310], [335, 336], [361, 362],
    [385, 386], [408, 409], [443, 444], [466, 467],
  ]),
  20: Object.freeze([
    [131, 132], [170, 171], [188, 189], [203, 204],
    [227, 228], [252, 253], [268, 269], [281, 282],
    [295, 296], [316, 317], [346, 347], [378, 379],
    [406, 407], [439, 440], [471, 472], [494, 495],
  ]),
});
export const PAPER010_WIDE_SERIES = Object.freeze(
  [5, 10, 20].map((heatingRate, index) => Object.freeze({
    seriesId: `paper010-rh-${heatingRate}`,
    runId: `paper010-rh-${heatingRate}`,
    temperature: Object.freeze({ columnIndex: index * 2, unit: 'C' }),
    signal: Object.freeze({
      kind: 'massPercent',
      columnIndex: index * 2 + 1,
      unit: '%',
      alphaReference: Object.freeze({ initialValue: 100, finalValue: 0 }),
    }),
    derivative: Object.freeze({
      semantic: 'massLossRate',
      valueColumnIndex: 7 + index * 2,
      unit: '%/min',
      temperatureColumn: Object.freeze({
        columnIndex: 6 + index * 2,
        unit: 'C',
      }),
    }),
    heatingRate: Object.freeze({ value: heatingRate, unit: 'K/min' }),
    context: Object.freeze({
      sample: EXPECTED_SAMPLE,
      atmosphere: EXPECTED_ATMOSPHERE,
      stage: PAPER010_STAGE,
    }),
  })),
);
const PAPER010_BRANCHES = Object.freeze([
  Object.freeze({
    seriesId: 'paper010-rh-5',
    runId: 'paper010-rh-5',
    sourceObservationCount: 574,
    selectedObservationCount: 307,
    startSourceRow: 119,
    endSourceRow: 425,
    targetAlphaRange: Object.freeze([0.05, 0.8]),
    selectedAlphaRange: Object.freeze([0.04956599999999994, 0.8005072]),
  }),
  Object.freeze({
    seriesId: 'paper010-rh-10',
    runId: 'paper010-rh-10',
    sourceObservationCount: 574,
    selectedObservationCount: 331,
    startSourceRow: 137,
    endSourceRow: 467,
    targetAlphaRange: Object.freeze([0.05, 0.8]),
    selectedAlphaRange: Object.freeze([0.049566700000000026, 0.8015269]),
  }),
  Object.freeze({
    seriesId: 'paper010-rh-20',
    runId: 'paper010-rh-20',
    sourceObservationCount: 568,
    selectedObservationCount: 365,
    startSourceRow: 131,
    endSourceRow: 495,
    targetAlphaRange: Object.freeze([0.05, 0.8]),
    selectedAlphaRange: Object.freeze([0.04973309999999998, 0.8017098]),
  }),
]);
const PAPER010_RAW_PROJECTION_TOLERANCE_OVERRIDES = Object.freeze({
  transformedXYAbs: '5e-10',
  rSquaredAbs: '6e-11',
});
const PAPER010_RAW_PROJECTION_TOLERANCE_JUSTIFICATION =
  'Direct raw-XLSX projection bounds: independent raw-to-rounded-fixture tests lock temperature at <=6e-10 C and dAlpha/dt at <=1e-12 min^-1; transformed regression quantities use a conservative 5e-10 absolute bound and R2 uses 6e-11. All other Decimal-oracle tolerances remain unchanged.';
const PAPER010_EXCLUDED_COLUMNS = Object.freeze([
  [12, 575, 578], [13, 575, 578],
  [14, 574, 577], [15, 574, 577],
  [16, 567, 570], [17, 567, 570],
  [18, 575, 578], [19, 575, 578],
  [20, 574, 577], [21, 574, 577],
  [22, 567, 570], [23, 567, 570],
  [24, 574, 577], [25, 574, 577],
  [26, 570, 573], [27, 570, 573],
  [28, 567, 570], [29, 567, 570],
  [30, 574, 577], [31, 574, 577],
  [32, 570, 573], [33, 570, 573],
  [34, 567, 570], [35, 567, 570],
].map(([columnIndex, populatedRowCount, lastSourceRow]) => Object.freeze({
  columnIndex,
  sourceHeader: PAPER010_HEADERS[columnIndex],
  populatedRowCount,
  firstSourceRow: 4,
  lastSourceRow,
})));
const CSV_HEADERS = Object.freeze([
  'schemaVersion',
  'applicationVersion',
  'resultId',
  'quantity',
  'claimBoundary',
  'confidenceBoundary',
  'sample',
  'process',
  'stage',
  'atmosphere',
  'method',
  'resultType',
  'formulaId',
  'alpha',
  'activationEnergyKJPerMol',
  'confidence95LowerKJPerMol',
  'confidence95UpperKJPerMol',
  'n',
  'rawObservationCount',
  'residualDegreesOfFreedom',
  'regressionInputAggregation',
  'r2',
  'slope',
  'slopeStandardError',
  'status',
]);

export class Paper010RawToReportError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'Paper010RawToReportError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Paper010RawToReportError(code, message, details);
}

function portablePath(value) {
  return value.split(path.sep).join('/');
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertPlainObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be a JSON object.`);
  }
  return value;
}

function assertExactArray(actual, expected, code, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(code, `${label} does not match the locked value.`, {
      expected,
      actual,
    });
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertExactStructure(actual, expected, code, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    fail(code, `${label} does not match the locked structure.`, {
      expected,
      actual,
    });
  }
}

function assertPaper010Branches(actual) {
  if (!Array.isArray(actual) || actual.length !== PAPER010_BRANCHES.length) {
    fail(
      'REPORT_WIDE_SERIES_BRANCH_INVALID',
      'Paper010 selected source branches does not match the locked structure.',
      { expected: PAPER010_BRANCHES, actual },
    );
  }
  actual.forEach((branch, index) => {
    const expected = PAPER010_BRANCHES[index];
    const {
      selectedAlphaRange: actualSelectedAlphaRange,
      ...actualExact
    } = assertPlainObject(
      branch,
      'REPORT_WIDE_SERIES_BRANCH_INVALID',
      `Paper010 branch ${index + 1}`,
    );
    const {
      selectedAlphaRange: expectedSelectedAlphaRange,
      ...expectedExact
    } = expected;
    assertExactStructure(
      actualExact,
      expectedExact,
      'REPORT_WIDE_SERIES_BRANCH_INVALID',
      `Paper010 branch ${index + 1} exact fields`,
    );
    if (
      !Array.isArray(actualSelectedAlphaRange)
      || actualSelectedAlphaRange.length !== expectedSelectedAlphaRange.length
      || actualSelectedAlphaRange.some((value, rangeIndex) => (
        !Number.isFinite(value)
        || Math.abs(value - expectedSelectedAlphaRange[rangeIndex]) > 1e-12
      ))
    ) {
      fail(
        'REPORT_WIDE_SERIES_BRANCH_INVALID',
        `Paper010 branch ${index + 1} selected alpha range exceeds the 1e-12 cross-runtime tolerance.`,
        {
          expected: expectedSelectedAlphaRange,
          actual: actualSelectedAlphaRange,
        },
      );
    }
  });
}

function paper010RawProjectionTolerances(manifest) {
  return {
    ...manifest.comparisonTolerances,
    ...PAPER010_RAW_PROJECTION_TOLERANCE_OVERRIDES,
    justification: PAPER010_RAW_PROJECTION_TOLERANCE_JUSTIFICATION,
  };
}

function expectedPaper010PointAudit() {
  return PAPER010_WIDE_SERIES.flatMap(({ seriesId, runId, heatingRate }) => (
    PAPER010_ALPHA_GRID.map((alpha, alphaIndex) => {
      const sourceRows = PAPER010_SOURCE_ROWS_BY_RATE[heatingRate.value][alphaIndex];
      return {
        seriesId,
        runId,
        alpha,
        sourceRows: [...sourceRows],
        derivativeSourceRows: [...sourceRows],
      };
    })
  ));
}

function finiteNumber(value, code, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    fail(code, `${label} must be finite; received ${String(value)}.`);
  }
  return number;
}

class DifferenceTracker {
  constructor() {
    this.maximums = new Map();
    this.comparisons = 0;
  }

  within(actualValue, expectedValue, toleranceValue, label) {
    const actual = finiteNumber(
      actualValue,
      'ORACLE_ACTUAL_NONFINITE',
      `${label} actual`,
    );
    const expected = finiteNumber(
      expectedValue,
      'ORACLE_EXPECTED_NONFINITE',
      `${label} expected`,
    );
    const tolerance = finiteNumber(
      toleranceValue,
      'ORACLE_TOLERANCE_NONFINITE',
      `${label} tolerance`,
    );
    const difference = Math.abs(actual - expected);
    this.comparisons += 1;
    const current = this.maximums.get(label.split('[')[0]) ?? 0;
    this.maximums.set(label.split('[')[0], Math.max(current, difference));
    if (difference > tolerance) {
      fail(
        'ORACLE_COMPARISON_FAILED',
        `${label} differs by ${difference}, exceeding ${tolerance}.`,
        { actual, expected, difference, tolerance },
      );
    }
  }

  arrayWithin(actual, expected, tolerance, label) {
    if (
      !Array.isArray(actual) ||
      !Array.isArray(expected) ||
      actual.length !== expected.length
    ) {
      fail('ORACLE_ARRAY_SHAPE_FAILED', `${label} shape differs.`, {
        actualLength: actual?.length,
        expectedLength: expected?.length,
      });
    }
    actual.forEach((value, index) =>
      this.within(value, expected[index], tolerance, `${label}[${index}]`));
  }

  summary() {
    return {
      comparisons: this.comparisons,
      maximumAbsoluteDifferences: Object.fromEntries(
        [...this.maximums.entries()].sort(([left], [right]) =>
          left.localeCompare(right)),
      ),
    };
  }
}

export function paper010Usage() {
  return [
    'Usage:',
    '  node scripts/run-paper010-raw-to-report-v0.3.1.mjs',
    '    --output <new-or-empty-output-directory>',
    '    [--browser-executable <absolute-system-Google-Chrome-path>]',
    '',
    '  node scripts/run-paper010-raw-to-report-v0.3.1.mjs',
    '    --check <existing-evidence-directory>',
    '',
    'Runs two direct local macOS Google Chrome passes against the already-built,',
    'SHA-locked offline release. It never builds or mutates the release.',
  ].join('\n');
}

export function parsePaper010Arguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return null;
  if (argv[0] === '--check') {
    if (argv.length !== 2 || !argv[1] || argv[1].startsWith('--')) {
      fail(
        'ARGUMENT_INVALID',
        '--check requires exactly one existing evidence directory.',
      );
    }
    return Object.freeze({
      mode: 'check',
      bundleDirectory: path.resolve(argv[1]),
    });
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!['--output', '--browser-executable'].includes(token)) {
      fail('ARGUMENT_INVALID', `Unknown argument: ${token}.`);
    }
    if (values.has(token)) {
      fail('ARGUMENT_INVALID', `${token} was provided more than once.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      fail('ARGUMENT_INVALID', `${token} requires a value.`);
    }
    values.set(token, value);
    index += 1;
  }
  if (!values.has('--output')) {
    fail('ARGUMENT_REQUIRED', '--output is required.');
  }
  return Object.freeze({
    mode: 'capture',
    outputDirectory: path.resolve(values.get('--output')),
    browserExecutable: values.has('--browser-executable')
      ? path.resolve(values.get('--browser-executable'))
      : null,
  });
}

function ensureDirectLocalMacOS(environment = process.env) {
  if (process.platform !== 'darwin') {
    fail(
      'DIRECT_MACOS_REQUIRED',
      `This evidence lane is restricted to direct local macOS; observed ${process.platform}.`,
    );
  }
  if (environment.GITHUB_ACTIONS === 'true' || environment.CI === 'true') {
    fail(
      'LOCAL_INTERACTIVE_HOST_REQUIRED',
      'Hosted/CI execution is outside this direct local macOS evidence lane.',
    );
  }
}

function ensureNewOrEmptyDirectory(outputDirectory) {
  if (existsSync(outputDirectory)) {
    const entries = readdirSync(outputDirectory);
    if (entries.length > 0) {
      fail(
        'OUTPUT_DIRECTORY_NOT_EMPTY',
        `Output directory must be new or empty: ${outputDirectory}.`,
      );
    }
  } else {
    mkdirSync(outputDirectory, { recursive: true });
  }
}

function fixtureManifestPath(projectRoot, relativePath) {
  return path.resolve(
    projectRoot,
    'tests/fixtures/real',
    relativePath,
  );
}

export function loadAndVerifyPaper010Locks(
  projectRoot = PAPER010_PROJECT_ROOT,
) {
  const manifestPath = path.resolve(
    projectRoot,
    PAPER010_FIXTURE_MANIFEST_RELATIVE,
  );
  const referencePath = path.resolve(
    projectRoot,
    PAPER010_REFERENCE_RELATIVE,
  );
  const fixturePath = path.resolve(projectRoot, PAPER010_FIXTURE_RELATIVE);
  const releasePath = path.resolve(projectRoot, PAPER010_RELEASE_RELATIVE);
  const sumsPath = path.resolve(projectRoot, PAPER010_SHA256SUMS_RELATIVE);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const reference = JSON.parse(readFileSync(referencePath, 'utf8'));

  if (manifest.schema !== 'activation-energy-studio/fixture-manifest/v2') {
    fail('FIXTURE_MANIFEST_SCHEMA_INVALID', 'Unexpected fixture manifest schema.');
  }
  if (
    reference.schema !==
    'activation-energy-studio/real-validation-reference/v2'
  ) {
    fail('REFERENCE_SCHEMA_INVALID', 'Unexpected Paper010 reference schema.');
  }

  const lockedSources = manifest.files.map((entry) => {
    const absolutePath = fixtureManifestPath(projectRoot, entry.path);
    if (!existsSync(absolutePath)) {
      fail('LOCKED_INPUT_MISSING', `Locked input is missing: ${entry.path}.`);
    }
    const observedSha256 = sha256File(absolutePath);
    if (observedSha256 !== entry.sha256) {
      fail(
        'LOCKED_INPUT_HASH_MISMATCH',
        `${entry.path} differs from the fixture manifest.`,
        { expected: entry.sha256, observed: observedSha256 },
      );
    }
    return {
      role: entry.role,
      path: portablePath(path.relative(projectRoot, absolutePath)),
      bytes: statSync(absolutePath).size,
      sha256: observedSha256,
    };
  });

  const fixtureDescriptor = lockedSources.find(
    ({ role }) => role === 'deterministic_derived_fixture',
  );
  const rawSourceDescriptor = lockedSources.find(
    ({ role }) => role === 'immutable_official_raw_source',
  );
  const referenceDescriptor = lockedSources.find(
    ({ role }) => role === 'independent_expected_output',
  );
  const oracleDescriptor = lockedSources.find(
    ({ role }) => role === 'independent_reference_implementation',
  );
  if (
    !fixtureDescriptor ||
    !rawSourceDescriptor ||
    !referenceDescriptor ||
    !oracleDescriptor
  ) {
    fail(
      'FIXTURE_ROLE_MISSING',
      'Paper010 fixture manifest does not contain every required evidence role.',
    );
  }
  if (rawSourceDescriptor.path !== PAPER010_RAW_SOURCE_RELATIVE) {
    fail(
      'RAW_SOURCE_PATH_INVALID',
      'The immutable Paper010 source role does not resolve to the official S2 workbook.',
      rawSourceDescriptor,
    );
  }
  if (
    reference.derivedFixtureSha256 !== fixtureDescriptor.sha256 ||
    reference.sourceSha256 !== rawSourceDescriptor.sha256 ||
    reference.oracle?.implementationSha256 !== oracleDescriptor.sha256
  ) {
    fail(
      'REFERENCE_LOCK_CROSSCHECK_FAILED',
      'The Decimal reference does not cross-bind the locked fixture/source/oracle.',
    );
  }
  assertExactArray(
    reference.alphaValues.map(Number),
    PAPER010_ALPHA_GRID,
    'REFERENCE_ALPHA_GRID_INVALID',
    'Paper010 reference alpha grid',
  );

  const releaseName = path.basename(releasePath);
  const checksumLine = readFileSync(sumsPath, 'utf8')
    .split(/\r?\n/u)
    .find((line) =>
      new RegExp(
        `^[a-f0-9]{64}\\s+\\*?${releaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'u',
      ).test(line.trim()));
  if (!checksumLine) {
    fail(
      'RELEASE_CHECKSUM_MISSING',
      `${releaseName} has no SHA256SUMS.txt entry.`,
    );
  }
  const expectedReleaseSha256 = checksumLine.trim().split(/\s+/u)[0];
  const observedReleaseSha256 = sha256File(releasePath);
  if (observedReleaseSha256 !== expectedReleaseSha256) {
    fail(
      'RELEASE_HASH_MISMATCH',
      'The offline HTML does not match release/SHA256SUMS.txt.',
      {
        expected: expectedReleaseSha256,
        observed: observedReleaseSha256,
      },
    );
  }

  return Object.freeze({
    projectRoot,
    releasePath,
    rawSourcePath: path.resolve(projectRoot, rawSourceDescriptor.path),
    fixturePath,
    referencePath,
    manifestPath,
    sumsPath,
    manifest,
    reference,
    lockedSources: Object.freeze(lockedSources),
    release: Object.freeze({
      path: portablePath(path.relative(projectRoot, releasePath)),
      bytes: statSync(releasePath).size,
      sha256: observedReleaseSha256,
      checksumFile: PAPER010_SHA256SUMS_RELATIVE,
    }),
    fixture: fixtureDescriptor,
    rawSource: rawSourceDescriptor,
    referenceDescriptor,
    oracle: oracleDescriptor,
  });
}

function methodMap(report) {
  return new Map(
    (report.analysis?.methods ?? []).map((method) => [method.method, method]),
  );
}

function resultMap(report) {
  return new Map(
    (report.results ?? []).map((row) => [
      `${row.method}:${Number(row.alpha).toFixed(2)}`,
      row,
    ]),
  );
}

function expectedReportWideSeries() {
  return PAPER010_WIDE_SERIES.map((definition) => ({
    seriesId: definition.seriesId,
    runId: definition.runId,
    temperature: { ...definition.temperature },
    signal: {
      kind: definition.signal.kind,
      columnIndex: definition.signal.columnIndex,
      unit: definition.signal.unit,
      alphaReference: {
        ...definition.signal.alphaReference,
        source: 'manual',
      },
    },
    derivative: {
      semantic: definition.derivative.semantic,
      semanticSource: 'manual',
      valueColumnIndex: definition.derivative.valueColumnIndex,
      unit: definition.derivative.unit,
      temperatureColumn: { ...definition.derivative.temperatureColumn },
      canonicalOutput: 'dAlphaDtPerMinute',
      canonicalConversionFormula:
        'dAlphaDtPerMinute = sourceValue * 0.01 / ((100 - 0) * 0.01)',
    },
    heatingRate: {
      ...definition.heatingRate,
      canonicalKPerMinute: definition.heatingRate.value,
      source: 'manual',
    },
    context: {
      ...definition.context,
      source: 'manual',
    },
  }));
}

function expectedTraceMappings(definition) {
  return [
    {
      role: 'temperature',
      sourceColumnIndex: definition.temperature.columnIndex,
      sourceHeader: PAPER010_HEADERS[definition.temperature.columnIndex],
      sourceUnit: definition.temperature.unit,
      confidence: 'manual',
    },
    {
      role: 'massPercent',
      sourceColumnIndex: definition.signal.columnIndex,
      sourceHeader: PAPER010_HEADERS[definition.signal.columnIndex],
      sourceUnit: definition.signal.unit,
      confidence: 'manual',
    },
    {
      role: 'temperature',
      sourceColumnIndex:
        definition.derivative.temperatureColumn.columnIndex,
      sourceHeader:
        PAPER010_HEADERS[
          definition.derivative.temperatureColumn.columnIndex
        ],
      sourceUnit: definition.derivative.temperatureColumn.unit,
      confidence: 'manual',
    },
    {
      role: 'dAlphaDt',
      sourceColumnIndex: definition.derivative.valueColumnIndex,
      sourceHeader:
        PAPER010_HEADERS[definition.derivative.valueColumnIndex],
      sourceUnit: definition.derivative.unit,
      confidence: 'manual',
    },
  ];
}

function expectedReportInputMappings() {
  const mappings = PAPER010_WIDE_SERIES.flatMap(expectedTraceMappings);
  return mappings
    .filter((mapping, index) => mappings.findIndex((candidate) => (
      candidate.role === mapping.role
      && candidate.sourceColumnIndex === mapping.sourceColumnIndex
      && candidate.sourceUnit === mapping.sourceUnit
    )) === index)
    .map((mapping) => ({
      ...mapping,
      canonicalUnit: mapping.role === 'temperature'
        ? 'K'
        : mapping.role === 'massPercent'
          ? '%'
          : 'min^-1',
      conversion: mapping.role === 'temperature'
        ? 'C -> K'
        : mapping.role === 'massPercent'
          ? '% -> % (identity)'
          : '%/min -> min^-1',
    }));
}

function verifyPaper010Traceability(report, wideAudit, rawSource) {
  const observationLinks = report.traceability?.observationLinks;
  if (
    !Array.isArray(observationLinks)
    || observationLinks.length !== 192
    || !Array.isArray(report.traceability?.gaps)
    || report.traceability.gaps.length !== 0
  ) {
    fail(
      'TRACEABILITY_COUNT_INVALID',
      'Paper010 report must retain 192 resolved observations and no traceability gaps.',
      {
        observationLinks: observationLinks?.length,
        gaps: report.traceability?.gaps,
      },
    );
  }
  const resultsById = new Map(
    report.results.map((result) => [result.resultId, result]),
  );
  const pointsByKey = new Map(
    wideAudit.points.map((point) => [
      `${point.runId}:${Number(point.alpha).toFixed(2)}`,
      point,
    ]),
  );
  const definitionsByRun = new Map(
    PAPER010_WIDE_SERIES.map((definition) => [
      definition.runId,
      definition,
    ]),
  );
  const rawFileName = path.basename(rawSource.path);

  for (const observation of observationLinks) {
    const result = resultsById.get(observation.resultId);
    const definition = definitionsByRun.get(observation.runId);
    const point = result
      ? pointsByKey.get(
          `${observation.runId}:${Number(result.alpha).toFixed(2)}`,
        )
      : undefined;
    if (!result || !definition || !point) {
      fail(
        'TRACEABILITY_WIDE_POINT_UNRESOLVED',
        'A report observation cannot be joined to its locked wide-series point.',
        observation,
      );
    }
    const expectedRows = point.sourceRows.map((sourceRow, index) => ({
      sourceRow,
      contribution:
        index === 0 ? 'interpolation-lower' : 'interpolation-upper',
    }));
    if (result.method === 'FRIEDMAN') {
      expectedRows.push(
        ...point.derivativeSourceRows.map((sourceRow, index) => ({
          sourceRow,
          contribution:
            index === 0
              ? 'derivative-interpolation-lower'
              : 'derivative-interpolation-upper',
        })),
      );
    }
    if (
      observation.sourceResolution !== 'interpolated'
      || !Array.isArray(observation.sourceRows)
      || observation.sourceRows.length !== expectedRows.length
    ) {
      fail(
        'TRACEABILITY_SOURCE_ROWS_INVALID',
        'A Paper010 observation lost its interpolated source-row contributors.',
        observation,
      );
    }
    observation.sourceRows.forEach((source, index) => {
      const expected = expectedRows[index];
      if (
        source.fileName !== rawFileName
        || source.sheetName !== PAPER010_SHEET
        || source.sourceRow !== expected.sourceRow
        || source.contribution !== expected.contribution
      ) {
        fail(
          'TRACEABILITY_SOURCE_ROWS_INVALID',
          'A Paper010 observation source row differs from the locked raw-XLSX projection.',
          { expected, actual: source },
        );
      }
      assertExactStructure(
        source.columnMappings,
        expectedTraceMappings(definition),
        'TRACEABILITY_COLUMN_MAPPING_INVALID',
        `${observation.observationId} source-column mapping`,
      );
    });
  }
}

function verifyPaper010WideSeriesAudit(report, rawSource) {
  const wideFiles =
    report.reproducibility?.preprocessing?.wideSeriesFiles;
  if (!Array.isArray(wideFiles) || wideFiles.length !== 1) {
    fail(
      'REPORT_WIDE_SERIES_AUDIT_MISSING',
      'Paper010 report must contain exactly one raw-XLSX wide-series audit.',
      wideFiles,
    );
  }
  const [wide] = wideFiles;
  const expectedSource = {
    fileName: path.basename(rawSource.path),
    fileType: 'xlsx',
    sheetName: PAPER010_SHEET,
  };
  assertExactStructure(
    wide.source,
    expectedSource,
    'REPORT_WIDE_SERIES_SOURCE_INVALID',
    'Wide-series source identity',
  );
  if (
    wide.layout !== 'wide-series'
    || wide.headerRow !== PAPER010_HEADER_ROW
    || wide.headerSourceRow !== PAPER010_HEADER_ROW + 1
    || wide.decimalSeparator !== '.'
    || wide.rawObservationCount !== 1716
    || wide.projectedPointCount !== 48
    || wide.scopeConfirmed !== true
  ) {
    fail(
      'REPORT_WIDE_SERIES_AUDIT_INVALID',
      'Paper010 wide-series header/count/scope contract differs.',
      wide,
    );
  }
  assertExactArray(
    wide.headers,
    PAPER010_HEADERS,
    'REPORT_WIDE_SERIES_HEADERS_INVALID',
    'Paper010 visible-row-3 headers',
  );
  assertExactArray(
    wide.alphaGrid,
    PAPER010_ALPHA_GRID,
    'REPORT_WIDE_SERIES_ALPHA_GRID_INVALID',
    'Paper010 wide-series alpha grid',
  );
  assertExactStructure(
    wide.series,
    expectedReportWideSeries(),
    'REPORT_WIDE_SERIES_DEFINITION_INVALID',
    'Paper010 manual wide-series definitions',
  );
  assertPaper010Branches(wide.branches);
  assertExactStructure(
    wide.excludedPopulatedColumns,
    PAPER010_EXCLUDED_COLUMNS,
    'REPORT_WIDE_SERIES_SCOPE_INVALID',
    'Paper010 excluded populated columns',
  );
  const expectedPoints = expectedPaper010PointAudit();
  assertExactStructure(
    wide.points,
    expectedPoints,
    'REPORT_WIDE_SERIES_SOURCE_ROWS_INVALID',
    'Paper010 projected source rows',
  );
  const pointAuditSha256 = sha256Bytes(
    Buffer.from(JSON.stringify(wide.points.map((point) => [
      point.seriesId,
      point.runId,
      point.alpha,
      point.sourceRows,
      point.derivativeSourceRows,
    ]))),
  );
  if (pointAuditSha256 !== PAPER010_POINT_AUDIT_SHA256) {
    fail(
      'REPORT_WIDE_SERIES_SOURCE_ROWS_INVALID',
      'Paper010 point-level source-row audit hash differs.',
      { expected: PAPER010_POINT_AUDIT_SHA256, actual: pointAuditSha256 },
    );
  }
  verifyPaper010Traceability(report, wide, rawSource);
  return Object.freeze({
    status: 'PASS',
    source: expectedSource,
    headerSourceRow: PAPER010_HEADER_ROW + 1,
    rawObservationCount: 1716,
    projectedPointCount: 48,
    branchCount: PAPER010_BRANCHES.length,
    excludedPopulatedColumnCount: PAPER010_EXCLUDED_COLUMNS.length,
    pointAuditSha256,
  });
}

export function verifyPaper010Report(
  reportInput,
  { reference, manifest, rawSource },
) {
  const report = assertPlainObject(
    reportInput,
    'REPORT_INVALID',
    'Paper010 report',
  );
  if (report.schemaVersion !== EXPECTED_REPORT_SCHEMA) {
    fail('REPORT_SCHEMA_INVALID', 'Unexpected exported report schema.');
  }
  if (
    report.application?.name !== 'Activation Energy Studio' ||
    report.application?.calculationLocation !== 'local-browser'
  ) {
    fail(
      'REPORT_APPLICATION_INVALID',
      'Report does not identify the local-browser application.',
    );
  }
  if (
    report.context?.projectName !== PAPER010_PROJECT_NAME ||
    report.context?.process !== PAPER010_PROCESS ||
    report.context?.stage !== PAPER010_STAGE ||
    report.context?.sample !== EXPECTED_SAMPLE ||
    report.context?.atmosphere !== EXPECTED_ATMOSPHERE
  ) {
    fail(
      'REPORT_CONTEXT_INVALID',
      'Paper010 scientific context differs from the locked run contract.',
      report.context,
    );
  }
  const [sourceFile] = report.context?.sourceFiles ?? [];
  if (
    report.context.sourceFiles.length !== 1 ||
    sourceFile.name !== path.basename(rawSource.path) ||
    sourceFile.sha256 !== rawSource.sha256 ||
    sourceFile.sizeBytes !== rawSource.bytes
  ) {
    fail(
      'REPORT_SOURCE_TRACE_INVALID',
      'Exported report does not bind the exact official raw Paper010 S2 workbook.',
      sourceFile,
    );
  }
  if (
    !Array.isArray(report.results) ||
    report.results.length !== 64 ||
    report.results.some(
      (row) =>
        row.resultType !== 'isoconversional' ||
        row.method === 'KISSINGER' ||
        row.alpha === null,
    )
  ) {
    fail(
      'REPORT_RESULT_COUNT_INVALID',
      'The release must export exactly 64 isoconversional rows and no Kissinger row.',
      { count: report.results?.length },
    );
  }
  const wideSeriesVerification = verifyPaper010WideSeriesAudit(
    report,
    rawSource,
  );

  const boundary = report.scientificBoundary;
  if (
    boundary?.quantity !== 'apparent activation energy' ||
    !String(boundary?.statement ?? '').includes(
      'apparent activation energies',
    ) ||
    !String(boundary?.statement ?? '').includes(
      'not universal material constants',
    )
  ) {
    fail(
      'REPORT_CLAIM_BOUNDARY_MISSING',
      'The apparent-Ea scientific claim boundary is absent.',
    );
  }
  assertExactArray(
    boundary?.contextLabels?.methods,
    PAPER010_METHODS,
    'REPORT_METHOD_CONTEXT_INVALID',
    'Scientific-boundary method list',
  );

  const reproducibility = report.reproducibility;
  assertExactArray(
    reproducibility?.configuration?.alphaGrid,
    PAPER010_ALPHA_GRID,
    'RELEASE_ALPHA_GRID_CONTROL_MISSING_OR_INEFFECTIVE',
    'Configured alpha grid',
  );
  assertExactArray(
    reproducibility?.alphaGrid,
    PAPER010_ALPHA_GRID,
    'REPORT_ALPHA_GRID_INVALID',
    'Executed alpha grid',
  );
  assertExactArray(
    reproducibility?.configuration?.selectedMethods,
    PAPER010_METHODS,
    'REPORT_METHOD_CONFIGURATION_INVALID',
    'Configured methods',
  );
  assertExactArray(
    reproducibility?.commonAlphaRange,
    [0.05, 0.8],
    'REPORT_COMMON_ALPHA_RANGE_INVALID',
    'Common alpha range',
  );
  if (reproducibility?.configuration?.includeKissinger !== false) {
    fail(
      'KISSINGER_CONFIGURATION_UNSAFE',
      'Paper010 raw wide-series analysis must not request Kissinger.',
    );
  }
  const derivativeSources =
    reproducibility?.preprocessing?.derivativeSources ?? [];
  if (
    derivativeSources.length !== 3 ||
    derivativeSources.some(({ source }) => source !== 'provided')
  ) {
    fail(
      'FRIEDMAN_DERIVATIVE_SOURCE_INVALID',
      'All three Paper010 runs must use the supplied official-source derivative.',
      derivativeSources,
    );
  }
  assertExactStructure(
    reproducibility?.inputTables,
    [{
      fileName: path.basename(rawSource.path),
      fileType: 'xlsx',
      sheetName: PAPER010_SHEET,
      delimiter: null,
      decimalSeparator: '.',
      textEncoding: null,
      headerRow: PAPER010_HEADER_ROW,
      tableKind: 'curve',
      mappings: expectedReportInputMappings(),
    }],
    'FRIEDMAN_DERIVATIVE_MAPPING_INVALID',
    'Official raw-XLSX input-table mappings',
  );

  if (
    report.analysis?.status === 'refused' ||
    report.analysis?.kissinger != null
  ) {
    fail(
      'ANALYSIS_OR_KISSINGER_INVALID',
      'Paper010 four-method analysis was refused or emitted Kissinger.',
    );
  }
  const methods = methodMap(report);
  if (
    methods.size !== PAPER010_METHODS.length ||
    PAPER010_METHODS.some((method) => !methods.has(method))
  ) {
    fail('REPORT_METHOD_SET_INVALID', 'Report method set is not exactly four methods.');
  }
  const tolerances = paper010RawProjectionTolerances(manifest);
  const tracker = new DifferenceTracker();
  const rows = resultMap(report);
  for (const methodName of PAPER010_METHODS) {
    const actualMethod = methods.get(methodName);
    const expectedMethod = reference.methods[methodName];
    if (
      actualMethod.resultType !== 'isoconversional' ||
      actualMethod.status === 'refused' ||
      actualMethod.formulaId !== expectedMethod.formulaId ||
      actualMethod.estimates?.length !== 16
    ) {
      fail(
        'METHOD_OUTPUT_INVALID',
        `${methodName} does not contain 16 accepted locked-formula estimates.`,
      );
    }
    const actualMean =
      actualMethod.estimates.reduce(
        (sum, estimate) => sum + estimate.activationEnergyKJPerMol,
        0,
      ) / actualMethod.estimates.length;
    tracker.within(
      actualMean,
      expectedMethod.meanActivationEnergyKJPerMol,
      tolerances.meanEnergyAbsKJPerMol,
      `${methodName}.meanEnergy`,
    );

    for (const expectedRecord of expectedMethod.records) {
      const alpha = Number(expectedRecord.alpha);
      const actual = actualMethod.estimates.find(
        (estimate) => estimate.alpha === alpha,
      );
      const row = rows.get(`${methodName}:${alpha.toFixed(2)}`);
      if (!actual || !row) {
        fail(
          'METHOD_ALPHA_MISSING',
          `${methodName} alpha=${alpha.toFixed(2)} is absent.`,
        );
      }
      if (
        row.quantity !== 'apparent activation energy' ||
        row.claimBoundary !== boundary.statement ||
        row.formulaId !== expectedMethod.formulaId ||
        row.n !== 3 ||
        row.rawObservationCount !== 3 ||
        row.residualDegreesOfFreedom !== 1 ||
        row.status === 'refused'
      ) {
        fail(
          'RESULT_ROW_CONTRACT_INVALID',
          `${methodName} alpha=${alpha.toFixed(2)} violates the report-row contract.`,
          row,
        );
      }

      tracker.within(
        actual.alpha,
        expectedRecord.alpha,
        tolerances.alphaAbs,
        `${methodName}.alpha`,
      );
      tracker.within(
        actual.activationEnergyKJPerMol,
        expectedRecord.activationEnergyKJPerMol,
        tolerances.energyAbsKJPerMol,
        `${methodName}.activationEnergy`,
      );
      tracker.within(
        row.activationEnergyKJPerMol,
        expectedRecord.activationEnergyKJPerMol,
        tolerances.energyAbsKJPerMol,
        `${methodName}.rowActivationEnergy`,
      );
      tracker.arrayWithin(
        [
          row.confidence95LowerKJPerMol,
          row.confidence95UpperKJPerMol,
        ],
        expectedRecord.energyConfidence95KJPerMol,
        tolerances.energyCiEndpointAbsKJPerMol,
        `${methodName}.energyConfidence95`,
      );

      const regression = actual.regression;
      const expectedRegression = expectedRecord.regression;
      if (
        regression.n !== expectedRegression.n ||
        regression.rawObservationCount !== 3 ||
        regression.residualDegreesOfFreedom !==
          expectedRegression.residualDegreesOfFreedom
      ) {
        fail(
          'REGRESSION_COUNTS_INVALID',
          `${methodName} alpha=${alpha.toFixed(2)} regression counts differ.`,
        );
      }
      tracker.arrayWithin(
        regression.x,
        expectedRegression.x,
        tolerances.transformedXYAbs,
        `${methodName}.x`,
      );
      tracker.arrayWithin(
        regression.y,
        expectedRegression.y,
        tolerances.transformedXYAbs,
        `${methodName}.y`,
      );
      tracker.arrayWithin(
        regression.fitted,
        expectedRegression.fitted,
        tolerances.transformedXYAbs,
        `${methodName}.fitted`,
      );
      tracker.arrayWithin(
        regression.residuals,
        expectedRegression.residuals,
        tolerances.transformedXYAbs,
        `${methodName}.residuals`,
      );
      tracker.within(
        regression.slope,
        expectedRegression.slope,
        tolerances.slopeAbsK,
        `${methodName}.slope`,
      );
      tracker.within(
        regression.intercept,
        expectedRegression.intercept,
        tolerances.interceptAbs,
        `${methodName}.intercept`,
      );
      tracker.within(
        regression.sse,
        expectedRegression.sse,
        tolerances.transformedXYAbs,
        `${methodName}.sse`,
      );
      tracker.within(
        regression.r2,
        expectedRegression.rSquared,
        tolerances.rSquaredAbs,
        `${methodName}.rSquared`,
      );
      tracker.within(
        regression.residualStandardError,
        expectedRegression.residualStandardError,
        tolerances.transformedXYAbs,
        `${methodName}.residualStandardError`,
      );
      tracker.within(
        regression.slopeStandardError,
        expectedRegression.slopeStandardError,
        tolerances.slopeAbsK,
        `${methodName}.slopeStandardError`,
      );
      tracker.arrayWithin(
        regression.slopeConfidence95,
        expectedRegression.slopeConfidence95,
        tolerances.slopeAbsK,
        `${methodName}.slopeConfidence95`,
      );
    }
  }

  if (
    report.traceability?.resultLinks?.length !== 64 ||
    report.traceability?.observationLinks?.length !== 192
  ) {
    fail(
      'TRACEABILITY_COUNT_INVALID',
      'Paper010 report must trace 64 results to 192 source observations.',
      {
        resultLinks: report.traceability?.resultLinks?.length,
        observationLinks: report.traceability?.observationLinks?.length,
      },
    );
  }
  if (
    reference.publicationComparison?.status !==
      'not_reproduced_from_raw_without_undocumented_preprocessing' ||
    reference.publicationComparison?.valuesAreContextNotOracle !== true
  ) {
    fail(
      'PUBLICATION_DISCREPANCY_LOCK_INVALID',
      'Paper010 publication discrepancy boundary was altered.',
    );
  }

  return Object.freeze({
    status: 'PASS',
    resultCount: 64,
    methodCounts: Object.fromEntries(
      PAPER010_METHODS.map((method) => [
        method,
        report.results.filter((row) => row.method === method).length,
      ]),
    ),
    alphaGrid: [...PAPER010_ALPHA_GRID],
    oracleComparison: tracker.summary(),
    publicationComparison: {
      status: reference.publicationComparison.status,
      valuesAreContextNotOracle:
        reference.publicationComparison.valuesAreContextNotOracle,
    },
    scientificReportSha256: scientificReportHash(report),
    wideSeries: wideSeriesVerification,
  });
}

export function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) fail('CSV_INVALID', 'CSV ends inside a quoted cell.');
  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/u, ''));
    rows.push(row);
  }
  return rows.filter(
    (candidate) =>
      candidate.length > 1 ||
      (candidate.length === 1 && candidate[0] !== ''),
  );
}

export function verifyPaper010Csv(csvText, report) {
  const rows = parseCsvRecords(csvText);
  assertExactArray(
    rows[0],
    CSV_HEADERS,
    'CSV_HEADER_INVALID',
    'Paper010 CSV header',
  );
  if (rows.length !== 65) {
    fail(
      'CSV_RESULT_COUNT_INVALID',
      `Paper010 CSV must have one header plus 64 result rows; observed ${rows.length}.`,
    );
  }
  const csvObjects = rows.slice(1).map((values) =>
    Object.fromEntries(CSV_HEADERS.map((header, index) => [
      header,
      values[index] ?? '',
    ])));
  const byId = new Map(csvObjects.map((row) => [row.resultId, row]));
  for (const result of report.results) {
    const csvRow = byId.get(result.resultId);
    if (!csvRow) {
      fail('CSV_RESULT_MISSING', `CSV lacks ${result.resultId}.`);
    }
    for (const header of CSV_HEADERS) {
      const expected =
        header === 'schemaVersion'
          ? report.schemaVersion
          : header === 'applicationVersion'
            ? report.application.version
            : result[header];
      const expectedText = expected === null ? '' : String(expected);
      if (csvRow[header] !== expectedText) {
        fail(
          'CSV_JSON_MISMATCH',
          `${result.resultId}.${header} differs between CSV and JSON.`,
          { expected: expectedText, actual: csvRow[header] },
        );
      }
    }
  }
  if (
    csvObjects.some(
      (row) =>
        row.method === 'KISSINGER' ||
        row.resultType !== 'isoconversional',
    )
  ) {
    fail('CSV_KISSINGER_UNSAFE', 'CSV contains a Kissinger/peak result.');
  }
  return Object.freeze({ status: 'PASS', rows: 64, headers: CSV_HEADERS.length });
}

export function verifyPdfBytes(bytes) {
  const text = bytes.toString('latin1');
  if (!text.startsWith('%PDF-') || !/%%EOF\s*$/u.test(text)) {
    fail('PDF_INVALID', 'Exported PDF lacks a valid header or EOF marker.');
  }
  const pageCount = (text.match(/\/Type\s*\/Page\b/gu) ?? []).length;
  if (pageCount < 1 || pageCount > 100) {
    fail('PDF_PAGE_COUNT_INVALID', `Unexpected PDF page count: ${pageCount}.`);
  }
  return Object.freeze({ status: 'PASS', pageCount, bytes: bytes.length });
}

export function verifyPngBytes(bytes) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    fail('PNG_INVALID', 'Final-state screenshot is not a PNG.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 800 || height < 600) {
    fail('PNG_DIMENSIONS_INVALID', `Screenshot is only ${width}x${height}.`);
  }
  return Object.freeze({ status: 'PASS', width, height, bytes: bytes.length });
}

export async function deriveKissingerNegativeEvidence({
  projectRoot = PAPER010_PROJECT_ROOT,
  sourceSha256,
} = {}) {
  const sourcePath = path.resolve(
    projectRoot,
    PAPER010_RAW_SOURCE_RELATIVE,
  );
  const observedSourceSha256 = sha256File(sourcePath);
  if (sourceSha256 && sourceSha256 !== observedSourceSha256) {
    fail(
      'KISSINGER_SOURCE_HASH_MISMATCH',
      'Kissinger negative evidence source is not the locked raw workbook.',
    );
  }
  const sheets = await readXlsxFile(sourcePath);
  const sheet = sheets.find(({ sheet: name }) => name === 'Fig.2.');
  if (!sheet) {
    fail('KISSINGER_SOURCE_SHEET_MISSING', 'Paper010 Fig.2. sheet is absent.');
  }
  const heatingRates = [5, 10, 20];
  const globalMaxima = heatingRates.map((heatingRateKPerMinute, index) => {
    const temperatureColumn = 6 + index * 2;
    const signalColumn = temperatureColumn + 1;
    const points = sheet.data
      .slice(3)
      .map((row) => ({
        temperatureCelsius: Number(row[temperatureColumn]),
        minusDtgPercentPerMinute: Number(row[signalColumn]),
      }))
      .filter(
        ({ temperatureCelsius, minusDtgPercentPerMinute }) =>
          Number.isFinite(temperatureCelsius) &&
          temperatureCelsius > 0 &&
          Number.isFinite(minusDtgPercentPerMinute),
      );
    if (points.length === 0) {
      fail(
        'KISSINGER_SOURCE_EMPTY',
        `No DTG points exist for ${heatingRateKPerMinute} K/min.`,
      );
    }
    const maximum = points.reduce((left, right) =>
      right.minusDtgPercentPerMinute >
      left.minusDtgPercentPerMinute
        ? right
        : left);
    return {
      heatingRateKPerMinute,
      temperatureCelsius: maximum.temperatureCelsius,
      minusDtgPercentPerMinute: maximum.minusDtgPercentPerMinute,
      observedPoints: points.length,
    };
  });
  const temperatures = globalMaxima.map(
    ({ temperatureCelsius }) => temperatureCelsius,
  );
  const increasesWithHeatingRate = temperatures.every(
    (temperature, index) =>
      index === 0 || temperature > temperatures[index - 1],
  );
  const evidence = {
    schema:
      'activation-energy-studio/paper010-kissinger-negative-evidence/v1',
    status: 'REFUSED_NO_SAME_STAGE_PEAK_SERIES',
    source: {
      path: portablePath(path.relative(projectRoot, sourcePath)),
      sheet: 'Fig.2.',
      sha256: observedSourceSha256,
    },
    globalMaxima,
    finding: 'GLOBAL_MAXIMA_SWITCH_PHYSICAL_STAGE',
    sameStagePeakSeriesEstablished: false,
    globalPeakTemperatureIncreasesWithHeatingRate:
      increasesWithHeatingRate,
    automaticKissingerResultEmitted: false,
    disposition:
      'REFUSE_AUTOMATIC_KISSINGER_UNTIL_STAGE_BOUNDED_PEAK_WINDOWS_ARE_SCIENTIFICALLY_JUSTIFIED',
    claimBoundary:
      'Global DTG maxima are negative safety evidence only. They are not accepted beta-Tp inputs and no Kissinger activation energy is calculated.',
  };
  return verifyKissingerNegativeEvidence(evidence);
}

export function verifyKissingerNegativeEvidence(evidence) {
  if (
    evidence?.status !== 'REFUSED_NO_SAME_STAGE_PEAK_SERIES' ||
    evidence?.finding !== 'GLOBAL_MAXIMA_SWITCH_PHYSICAL_STAGE' ||
    evidence?.sameStagePeakSeriesEstablished !== false ||
    evidence?.automaticKissingerResultEmitted !== false ||
    evidence?.globalPeakTemperatureIncreasesWithHeatingRate !== false ||
    Object.hasOwn(evidence ?? {}, 'activationEnergyKJPerMol')
  ) {
    fail(
      'KISSINGER_NEGATIVE_EVIDENCE_INVALID',
      'Paper010 Kissinger evidence must fail closed without an Ea value.',
      evidence,
    );
  }
  const expected = [
    [5, 481.538, 2.51699],
    [10, 295.414, 4.21304],
    [20, 218.626, 8.20831],
  ];
  if (
    !Array.isArray(evidence.globalMaxima) ||
    evidence.globalMaxima.length !== expected.length
  ) {
    fail('KISSINGER_GLOBAL_MAXIMA_INVALID', 'Global-maxima evidence is incomplete.');
  }
  expected.forEach(([rate, temperature, signal], index) => {
    const actual = evidence.globalMaxima[index];
    if (
      actual?.heatingRateKPerMinute !== rate ||
      actual?.temperatureCelsius !== temperature ||
      actual?.minusDtgPercentPerMinute !== signal
    ) {
      fail(
        'KISSINGER_GLOBAL_MAXIMA_INVALID',
        `Unexpected global maximum at ${rate} K/min.`,
        actual,
      );
    }
  });
  return Object.freeze(evidence);
}

function requestKind(url) {
  const protocol = new URL(url).protocol;
  if (protocol === 'file:') return 'file';
  if (protocol === 'data:' || protocol === 'blob:') return 'local';
  if (
    protocol === 'http:' ||
    protocol === 'https:' ||
    protocol === 'ws:' ||
    protocol === 'wss:'
  ) {
    return 'external';
  }
  return 'unsupported';
}

export function requestRecordsToHar(records, title = PAPER010_PROJECT_NAME) {
  const entries = records.map((record) => ({
    startedDateTime: record.startedAt,
    time: Math.max(0, (record.endedAtMs ?? record.startedAtMs) - record.startedAtMs),
    request: {
      method: record.method,
      url: record.url,
      httpVersion: '',
      cookies: [],
      headers: [],
      queryString: [],
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: record.status ?? 0,
      statusText: record.statusText ?? '',
      httpVersion: '',
      cookies: [],
      headers: [],
      content: { size: record.encodedDataLength ?? 0, mimeType: record.mimeType ?? '' },
      redirectURL: '',
      headersSize: -1,
      bodySize: record.encodedDataLength ?? -1,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: -1,
      receive: -1,
      ssl: -1,
    },
    _paper010: {
      kind: record.kind,
      finished: record.finished === true,
      failed: record.failed ?? null,
    },
  }));
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'Activation Energy Studio Paper010 local Chrome harness',
        version: '1',
      },
      pages: [
        {
          startedDateTime:
            records[0]?.startedAt ?? new Date(0).toISOString(),
          id: 'paper010-local-file',
          title,
          pageTimings: {},
        },
      ],
      entries,
    },
  };
}

function createNetworkCapture(page) {
  const records = [];
  const byRequest = new Map();
  const externalAttempts = [];
  const unsupportedAttempts = [];

  page.on('request', (request) => {
    const startedAtMs = Date.now();
    const url = request.url();
    const kind = requestKind(url);
    const record = {
      sequence: records.length + 1,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      endedAtMs: null,
      method: request.method(),
      url,
      resourceType: request.resourceType(),
      kind,
      status: null,
      statusText: null,
      mimeType: null,
      encodedDataLength: null,
      finished: false,
      failed: null,
    };
    records.push(record);
    byRequest.set(request, record);
    if (kind === 'external') externalAttempts.push(url);
    if (kind === 'unsupported') unsupportedAttempts.push(url);
    if (kind === 'external' || kind === 'unsupported') {
      void request.abort('blockedbyclient');
    } else {
      void request.continue();
    }
  });
  page.on('response', async (response) => {
    const record = byRequest.get(response.request());
    if (!record) return;
    record.status = response.status();
    record.statusText = response.statusText();
    record.mimeType = response.headers()['content-type'] ?? '';
  });
  page.on('requestfinished', async (request) => {
    const record = byRequest.get(request);
    if (!record) return;
    record.endedAtMs = Date.now();
    record.finished = true;
    try {
      const response = await request.response();
      const timing = await response?.timing();
      if (timing && Number.isFinite(timing.receiveHeadersEnd)) {
        record.receiveHeadersEnd = timing.receiveHeadersEnd;
      }
    } catch {
      // The retained request/response lifecycle is sufficient for this local lane.
    }
  });
  page.on('requestfailed', (request) => {
    const record = byRequest.get(request);
    if (!record) return;
    record.endedAtMs = Date.now();
    record.failed = request.failure()?.errorText ?? 'unknown';
  });
  return {
    records,
    externalAttempts,
    unsupportedAttempts,
    assertOffline() {
      if (
        externalAttempts.length > 0 ||
        unsupportedAttempts.length > 0
      ) {
        fail(
          'NETWORK_ATTEMPT_BLOCKED',
          'The offline release attempted a non-local request.',
          { externalAttempts, unsupportedAttempts },
        );
      }
      const har = requestRecordsToHar(records);
      const inspection = assertOfflineHar(har);
      return { har, inspection };
    },
  };
}

function createDownloadTracker(browserSession) {
  const records = new Map();
  browserSession.on('Browser.downloadWillBegin', (event) => {
    records.set(event.guid, {
      guid: event.guid,
      suggestedFilename: event.suggestedFilename,
      url: event.url,
      willBeginAt: new Date().toISOString(),
      state: 'will-begin',
      receivedBytes: 0,
      totalBytes: 0,
    });
  });
  browserSession.on('Browser.downloadProgress', (event) => {
    const record = records.get(event.guid);
    if (!record) return;
    record.state = event.state;
    record.receivedBytes = event.receivedBytes;
    record.totalBytes = event.totalBytes;
    record.progressAt = new Date().toISOString();
  });
  return records;
}

async function waitForEnabled(page, selector, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return element instanceof HTMLButtonElement && !element.disabled;
    },
    { timeout: timeoutMs },
    selector,
  );
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: DEFAULT_TIMEOUT_MS });
  await page.$eval(
    selector,
    (element, nextValue) => {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error(`Expected an input for ${selector}.`);
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) throw new Error('Native input setter is unavailable.');
      setter.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );
}

async function setSelectValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: DEFAULT_TIMEOUT_MS });
  await page.$eval(
    selector,
    (element, nextValue) => {
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error('Expected a select element.');
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      )?.set;
      if (!setter) throw new Error('Native select setter is unavailable.');
      setter.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    String(value),
  );
}

async function setCheckboxValue(page, selector, checked) {
  await page.waitForSelector(selector, { timeout: DEFAULT_TIMEOUT_MS });
  await page.$eval(
    selector,
    (element, nextChecked) => {
      if (!(element instanceof HTMLInputElement) || element.type !== 'checkbox') {
        throw new Error('Expected a checkbox input.');
      }
      if (element.checked !== nextChecked) element.click();
    },
    checked,
  );
}

async function applyMappingAndWaitFor(page, selector) {
  await waitForEnabled(page, '[data-testid="apply-mapping"]');
  await page.click('[data-testid="apply-mapping"]');
  await page.waitForSelector(selector, {
    visible: true,
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

async function waitForDownload({
  page,
  selector,
  expectedPath,
  records,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (existsSync(expectedPath)) {
    fail('DOWNLOAD_COLLISION', `Refusing to overwrite ${expectedPath}.`);
  }
  const baseline = new Set(records.keys());
  await waitForEnabled(page, selector, timeoutMs);
  await page.click(selector);
  const deadline = Date.now() + timeoutMs;
  let protocolRecord = null;
  while (Date.now() < deadline) {
    const candidates = [...records.values()].filter(
      (record) =>
        !baseline.has(record.guid) &&
        record.suggestedFilename === path.basename(expectedPath),
    );
    if (candidates.length > 1) {
      fail(
        'DOWNLOAD_PROTOCOL_AMBIGUOUS',
        `Multiple downloads claimed ${path.basename(expectedPath)}.`,
      );
    }
    [protocolRecord] = candidates;
    if (protocolRecord?.state === 'canceled') {
      fail('DOWNLOAD_CANCELED', `${path.basename(expectedPath)} was canceled.`);
    }
    if (protocolRecord?.state === 'completed' && existsSync(expectedPath)) {
      const size = statSync(expectedPath).size;
      if (
        size > 0 &&
        size === protocolRecord.totalBytes &&
        size === protocolRecord.receivedBytes
      ) {
        return Object.freeze({
          ...protocolRecord,
          retainedBytes: size,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail(
    'DOWNLOAD_TIMEOUT',
    `Timed out waiting for ${path.basename(expectedPath)}.`,
    protocolRecord,
  );
}

function descriptor(root, filePath, role) {
  const bytes = readFileSync(filePath);
  return {
    role,
    path: portablePath(path.relative(root, filePath)),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function projectSourceDescriptor(projectRoot, definition) {
  const filePath = path.resolve(projectRoot, definition.path);
  const relative = portablePath(path.relative(projectRoot, filePath));
  if (
    relative !== definition.path ||
    !existsSync(filePath) ||
    !lstatSync(filePath).isFile()
  ) {
    fail(
      'IMPLEMENTATION_SOURCE_INVALID',
      `Implementation source is missing or escapes the project: ${definition.path}.`,
    );
  }
  const bytes = readFileSync(filePath);
  return {
    role: definition.role,
    path: definition.path,
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

async function runBrowserPass({
  passId,
  passDirectory,
  browserExecutable,
  locks,
}) {
  mkdirSync(passDirectory, { recursive: true });
  const paths = Object.fromEntries(
    Object.entries(PAPER010_REPORT_FILENAMES).map(([key, filename]) => [
      key,
      path.resolve(passDirectory, filename),
    ]),
  );
  let browser;
  let browserSession;
  let page;
  let network;
  let browserIdentity;
  const startedAt = new Date().toISOString();
  try {
    browser = await puppeteer.launch({
      executablePath: browserExecutable,
      headless: true,
      waitForInitialPage: false,
      defaultViewport: {
        width: 1440,
        height: 1200,
        deviceScaleFactor: 1,
      },
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=OptimizationHints,MediaRouter',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-startup-window',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    });
    const version = await browser.version();
    browserIdentity = assertGoogleChromeProduct(version);
    browserSession = await browser.target().createCDPSession();
    await browserSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: passDirectory,
      eventsEnabled: true,
    });
    const downloads = createDownloadTracker(browserSession);

    page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    network = createNetworkCapture(page);
    await page.goto(pathToFileURL(locks.releasePath).href, {
      waitUntil: ['domcontentloaded', 'load'],
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.setOfflineMode(true);
    await page.waitForFunction(() => navigator.onLine === false, {
      timeout: DEFAULT_TIMEOUT_MS,
    });

    for (const [selector, value] of [
      ['[data-testid="alpha-start"]', '0.05'],
      ['[data-testid="alpha-end"]', '0.80'],
      ['[data-testid="alpha-step"]', '0.05'],
    ]) {
      await setInputValue(page, selector, value);
    }
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="alpha-grid-summary"]')
          ?.textContent?.includes('16 α points') === true,
      { timeout: DEFAULT_TIMEOUT_MS },
    );

    const fileInput = await page.$('[data-testid="thermal-file-input"]');
    if (!fileInput) {
      fail('UI_CONTRACT_MISSING', 'Thermal-file input is absent.');
    }
    await fileInput.uploadFile(locks.rawSourcePath);
    await fileInput.dispose();

    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="sheet-select"]') !== null
        || document.querySelector('[data-testid="header-row-step"]') !== null,
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    const requiresSheetSelection = await page.$(
      '[data-testid="sheet-select"]',
    );
    if (requiresSheetSelection) {
      await requiresSheetSelection.dispose();
      await setSelectValue(page, '[data-testid="sheet-select"]', PAPER010_SHEET);
      await applyMappingAndWaitFor(page, '[data-testid="header-row-step"]');
    } else {
      await page.waitForSelector('[data-testid="header-row-step"]', {
        visible: true,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    }
    await setInputValue(page, '[data-testid="header-row-input"]', '3');
    await applyMappingAndWaitFor(page, '[data-testid="table-layout"]');
    await setSelectValue(
      page,
      '[data-testid="table-layout"]',
      'wide-series',
    );
    await page.waitForSelector('[data-testid="wide-series-mapper"]', {
      visible: true,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    for (let index = 0; index < PAPER010_WIDE_SERIES.length; index += 1) {
      await page.click('[data-testid="wide-add-series"]');
      await page.waitForSelector(`[data-testid="wide-series-${index}"]`, {
        visible: true,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    }
    for (let index = 0; index < PAPER010_WIDE_SERIES.length; index += 1) {
      const definition = PAPER010_WIDE_SERIES[index];
      await setInputValue(
        page,
        `[data-testid="wide-series-id-${index}"]`,
        definition.seriesId,
      );
      await setInputValue(
        page,
        `[data-testid="wide-run-id-${index}"]`,
        definition.runId,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-temperature-column-${index}"]`,
        definition.temperature.columnIndex,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-temperature-unit-${index}"]`,
        definition.temperature.unit,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-signal-kind-${index}"]`,
        definition.signal.kind,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-signal-column-${index}"]`,
        definition.signal.columnIndex,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-signal-unit-${index}"]`,
        definition.signal.unit,
      );
      await setInputValue(
        page,
        `[data-testid="wide-alpha-initial-${index}"]`,
        String(definition.signal.alphaReference.initialValue),
      );
      await setInputValue(
        page,
        `[data-testid="wide-alpha-final-${index}"]`,
        String(definition.signal.alphaReference.finalValue),
      );
      await setInputValue(
        page,
        `[data-testid="wide-heating-rate-${index}"]`,
        String(definition.heatingRate.value),
      );
      await setSelectValue(
        page,
        `[data-testid="wide-heating-rate-unit-${index}"]`,
        definition.heatingRate.unit,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-derivative-semantic-${index}"]`,
        definition.derivative.semantic,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-derivative-value-column-${index}"]`,
        definition.derivative.valueColumnIndex,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-derivative-unit-${index}"]`,
        definition.derivative.unit,
      );
      await setCheckboxValue(
        page,
        `[data-testid="wide-derivative-temperature-enabled-${index}"]`,
        true,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-derivative-temperature-column-${index}"]`,
        definition.derivative.temperatureColumn.columnIndex,
      );
      await setSelectValue(
        page,
        `[data-testid="wide-derivative-temperature-unit-${index}"]`,
        definition.derivative.temperatureColumn.unit,
      );
    }
    await setInputValue(
      page,
      '[data-testid="wide-common-sample"]',
      EXPECTED_SAMPLE,
    );
    await setInputValue(
      page,
      '[data-testid="wide-common-atmosphere"]',
      EXPECTED_ATMOSPHERE,
    );
    await setInputValue(
      page,
      '[data-testid="wide-common-stage"]',
      PAPER010_STAGE,
    );
    await setCheckboxValue(
      page,
      '[data-testid="wide-scope-confirmed"]',
      true,
    );
    await waitForEnabled(page, '[data-testid="apply-mapping"]');
    const wideMappingState = await page.evaluate(() => {
      const value = (testId) =>
        document.querySelector(`[data-testid="${testId}"]`)?.value ?? null;
      const scope = document.querySelector(
        '[data-testid="wide-scope-confirmed"]',
      );
      const scopeText = scope?.closest('.wide-scope-confirmation')
        ?.textContent ?? '';
      const normalizedScopeText = scopeText.replace(/\s+/gu, ' ').trim();
      return {
        sheet: 'Fig.2.',
        headerSourceRow: Number(value('header-row-input')),
        layout: value('table-layout'),
        seriesCount: document.querySelectorAll(
          'fieldset[data-testid^="wide-series-"]',
        ).length,
        scopeConfirmed:
          scope instanceof HTMLInputElement && scope.checked,
        scopeProfileText: normalizedScopeText,
        fullTableScopeProfileVisible:
          normalizedScopeText.includes(
            'Populated columns found in the full source table but not selected',
          ),
        firstExcludedColumnVisible:
          normalizedScopeText.includes(
            '13. temperature (575 rows; source rows 4–578)',
          ),
        lastExcludedColumnVisible:
          normalizedScopeText.includes(
            '36. DTG (567 rows; source rows 4–570)',
          ),
      };
    });
    await page.click('[data-testid="apply-mapping"]');
    await waitForEnabled(page, '[data-testid="run-analysis"]');

    await setInputValue(
      page,
      '[data-testid="project-name"]',
      PAPER010_PROJECT_NAME,
    );
    await setInputValue(
      page,
      '[data-testid="process-name"]',
      PAPER010_PROCESS,
    );
    await setInputValue(
      page,
      '[data-testid="stage-label"]',
      PAPER010_STAGE,
    );
    await waitForEnabled(page, '[data-testid="run-analysis"]');
    await page.click('[data-testid="run-analysis"]');
    await page.waitForSelector('[data-testid="numeric-results"]', {
      visible: true,
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="numeric-results"] tbody tr[data-method][data-result-type="isoconversional"]',
        ).length === 64,
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    const visibleState = await page.evaluate((methods) => {
      const rows = [
        ...document.querySelectorAll(
          '[data-testid="numeric-results"] tbody tr[data-method]',
        ),
      ];
      const isoconversional = rows.filter(
        (row) => row.getAttribute('data-result-type') === 'isoconversional',
      );
      return {
        protocol: window.location.protocol,
        navigatorOnLine: navigator.onLine,
        refused:
          document.querySelector('[data-testid="analysis-refused-state"]') !==
          null,
        totalRows: rows.length,
        isoconversionalRows: isoconversional.length,
        peakRows: rows.filter(
          (row) => row.getAttribute('data-result-type') === 'peak',
        ).length,
        methodCounts: Object.fromEntries(
          methods.map((method) => [
            method,
            isoconversional.filter(
              (row) => row.getAttribute('data-method') === method,
            ).length,
          ]),
        ),
        alphasByMethod: Object.fromEntries(
          methods.map((method) => [
            method,
            isoconversional
              .filter((row) => row.getAttribute('data-method') === method)
              .map((row) =>
                Number(
                  row.querySelector('[data-field="alpha"]')?.textContent,
                )),
          ]),
        ),
        alphaGridSummary:
          document.querySelector('[data-testid="alpha-grid-summary"]')
            ?.textContent?.trim() ?? '',
      };
    }, PAPER010_METHODS);
    visibleState.wideMapping = {
      ...wideMappingState,
      uploadedFileName: path.basename(locks.rawSourcePath),
    };
    if (
      visibleState.protocol !== 'file:' ||
      visibleState.navigatorOnLine !== false ||
      visibleState.refused ||
      visibleState.totalRows !== 64 ||
      visibleState.isoconversionalRows !== 64 ||
      visibleState.peakRows !== 0 ||
      visibleState.wideMapping?.uploadedFileName !==
        path.basename(locks.rawSourcePath) ||
      visibleState.wideMapping?.sheet !== PAPER010_SHEET ||
      visibleState.wideMapping?.headerSourceRow !==
        PAPER010_HEADER_ROW + 1 ||
      visibleState.wideMapping?.layout !== 'wide-series' ||
      visibleState.wideMapping?.seriesCount !== 3 ||
      visibleState.wideMapping?.scopeConfirmed !== true ||
      visibleState.wideMapping?.fullTableScopeProfileVisible !== true ||
      visibleState.wideMapping?.firstExcludedColumnVisible !== true ||
      visibleState.wideMapping?.lastExcludedColumnVisible !== true ||
      PAPER010_METHODS.some(
        (method) =>
          visibleState.methodCounts[method] !== 16 ||
          visibleState.alphasByMethod[method].some(
            (alpha, index) => alpha !== PAPER010_ALPHA_GRID[index],
          ),
      )
    ) {
      fail(
        'VISIBLE_RESULT_CONTRACT_FAILED',
        'Visible release state is not the locked 64-row Paper010 result.',
        visibleState,
      );
    }

    const downloadEvidence = {};
    for (const [key, selector] of [
      ['json', '[data-testid="export-json"]'],
      ['csv', '[data-testid="export-csv"]'],
      ['pdf', '[data-testid="export-pdf"]'],
    ]) {
      downloadEvidence[key] = await waitForDownload({
        page,
        selector,
        expectedPath: paths[key],
        records: downloads,
      });
    }

    const report = JSON.parse(readFileSync(paths.json, 'utf8'));
    const reportVerification = verifyPaper010Report(report, locks);
    const csvVerification = verifyPaper010Csv(
      readFileSync(paths.csv, 'utf8'),
      report,
    );
    const pdfVerification = verifyPdfBytes(readFileSync(paths.pdf));
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await page.waitForFunction(
      () => window.scrollX === 0 && window.scrollY === 0,
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: paths.screenshot,
      type: 'png',
      fullPage: true,
    });
    const screenshotVerification = verifyPngBytes(
      readFileSync(paths.screenshot),
    );

    const { har, inspection } = network.assertOffline();
    writeJson(paths.network, {
      schema:
        'activation-energy-studio/paper010-local-network-capture/v1',
      status: PAPER010_STATUS,
      passId,
      externalAttempts: network.externalAttempts,
      unsupportedAttempts: network.unsupportedAttempts,
      records: network.records,
    });
    writeJson(paths.har, har);

    return Object.freeze({
      passId,
      startedAt,
      endedAt: new Date().toISOString(),
      browser: {
        name: 'Google Chrome (headless)',
        executable: browserExecutable,
        ...browserIdentity,
      },
      runtime: {
        executionPath: 'direct-local-macos-google-chrome',
        platform: process.platform,
        architecture: process.arch,
        documentProtocol: visibleState.protocol,
        navigatorOnLine: visibleState.navigatorOnLine,
        parallelsUsed: false,
        virtualizationOrCrossPlatformClaim: false,
      },
      visibleState,
      downloads: downloadEvidence,
      verification: {
        report: reportVerification,
        csv: csvVerification,
        pdf: pdfVerification,
        screenshot: screenshotVerification,
        network: inspection,
      },
      scientificReportSha256: reportVerification.scientificReportSha256,
      canonicalScientificJson: canonicalScientificJson(report),
      csvSha256: sha256File(paths.csv),
      artifacts: [
        descriptor(passDirectory, paths.json, 'report_json'),
        descriptor(passDirectory, paths.csv, 'report_csv'),
        descriptor(passDirectory, paths.pdf, 'report_pdf'),
        descriptor(
          passDirectory,
          paths.screenshot,
          'final_state_screenshot',
        ),
        descriptor(passDirectory, paths.network, 'raw_network_capture'),
        descriptor(passDirectory, paths.har, 'offline_har'),
      ],
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Any partial files remain non-evidence because no manifest is written.
      }
    }
  }
}

function listBundleFiles(rootDirectory, relativeDirectory = '') {
  const absoluteDirectory = path.resolve(rootDirectory, relativeDirectory);
  const files = [];
  for (const entry of readdirSync(absoluteDirectory, {
    withFileTypes: true,
  })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(
        'BUNDLE_SYMLINK_FORBIDDEN',
        `Evidence bundles may not contain symlinks: ${relativePath}.`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...listBundleFiles(rootDirectory, relativePath));
    } else if (entry.isFile()) {
      files.push(portablePath(relativePath));
    } else {
      fail(
        'BUNDLE_FILE_TYPE_INVALID',
        `Unsupported evidence entry: ${relativePath}.`,
      );
    }
  }
  return files.sort();
}

function safeBundleFile(bundleDirectory, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.trim() === '' ||
    path.isAbsolute(relativePath) ||
    relativePath !== portablePath(relativePath)
  ) {
    fail(
      'BUNDLE_PATH_INVALID',
      `Invalid evidence-relative path: ${String(relativePath)}.`,
    );
  }
  const absolutePath = path.resolve(bundleDirectory, relativePath);
  const observedRelative = portablePath(
    path.relative(bundleDirectory, absolutePath),
  );
  if (
    observedRelative !== relativePath ||
    observedRelative.startsWith('../') ||
    observedRelative === '..'
  ) {
    fail(
      'BUNDLE_PATH_ESCAPE',
      `Evidence path escapes its bundle: ${relativePath}.`,
    );
  }
  if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
    fail(
      'BUNDLE_ARTIFACT_MISSING',
      `Required evidence file is missing: ${relativePath}.`,
    );
  }
  return absolutePath;
}

function verifyDescriptor(bundleDirectory, input, expectedRole, expectedPath) {
  const value = assertPlainObject(
    input,
    'BUNDLE_DESCRIPTOR_INVALID',
    `${expectedRole} descriptor`,
  );
  if (value.role !== expectedRole || value.path !== expectedPath) {
    fail(
      'BUNDLE_DESCRIPTOR_INVALID',
      `${expectedRole} descriptor role/path differs.`,
      value,
    );
  }
  const filePath = safeBundleFile(bundleDirectory, value.path);
  const bytes = readFileSync(filePath);
  const observedSha256 = sha256Bytes(bytes);
  if (
    value.bytes !== bytes.length ||
    value.sha256 !== observedSha256
  ) {
    fail(
      'BUNDLE_ARTIFACT_HASH_MISMATCH',
      `${value.path} does not match its retained descriptor.`,
      {
        expectedBytes: value.bytes,
        observedBytes: bytes.length,
        expectedSha256: value.sha256,
        observedSha256,
      },
    );
  }
  return Object.freeze({ filePath, bytes, descriptor: value });
}

function assertMatchingSourceDescriptors(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    fail(
      'BUNDLE_SOURCE_LOCK_SET_INVALID',
      `${label} descriptor count differs.`,
    );
  }
  expected.forEach((descriptor, index) => {
    const observed = actual[index];
    for (const field of ['role', 'path', 'bytes', 'sha256']) {
      if (observed?.[field] !== descriptor[field]) {
        fail(
          'BUNDLE_SOURCE_LOCK_MISMATCH',
          `${label}[${index}].${field} differs from the current lock.`,
          { expected: descriptor[field], actual: observed?.[field] },
        );
      }
    }
  });
}

export function verifyPaper010RawToReportBundle(
  bundleDirectoryInput,
  { projectRoot = PAPER010_PROJECT_ROOT } = {},
) {
  const bundleDirectory = path.resolve(bundleDirectoryInput);
  if (
    !existsSync(bundleDirectory) ||
    !lstatSync(bundleDirectory).isDirectory()
  ) {
    fail(
      'BUNDLE_DIRECTORY_INVALID',
      `Evidence directory does not exist: ${bundleDirectory}.`,
    );
  }
  const manifestPath = safeBundleFile(
    bundleDirectory,
    PAPER010_MANIFEST_NAME,
  );
  const manifest = assertPlainObject(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    'BUNDLE_MANIFEST_INVALID',
    'Paper010 evidence manifest',
  );
  if (
    manifest.schema !== PAPER010_MANIFEST_SCHEMA ||
    manifest.status !== PAPER010_STATUS
  ) {
    fail(
      'BUNDLE_MANIFEST_IDENTITY_INVALID',
      'Paper010 evidence manifest schema/status differs.',
    );
  }

  const locks = loadAndVerifyPaper010Locks(projectRoot);
  for (const field of ['path', 'bytes', 'sha256', 'checksumFile']) {
    if (manifest.release?.[field] !== locks.release[field]) {
      fail(
        'BUNDLE_RELEASE_LOCK_MISMATCH',
        `Retained release.${field} differs from the current locked release.`,
      );
    }
  }
  assertMatchingSourceDescriptors(
    manifest.lockedInputs,
    locks.lockedSources,
    'lockedInputs',
  );
  const expectedImplementation = PAPER010_IMPLEMENTATION_SOURCES.map(
    (definition) => projectSourceDescriptor(projectRoot, definition),
  );
  assertMatchingSourceDescriptors(
    manifest.implementationSources,
    expectedImplementation,
    'implementationSources',
  );

  if (
    manifest.execution?.requiredPasses !== 2 ||
    manifest.execution?.completedPasses !== 2 ||
    manifest.execution?.directLocalMacOS !== true ||
    manifest.execution?.parallelsUsed !== false ||
    manifest.execution?.windowsOrUbuntuEvidenceClaimed !== false
  ) {
    fail(
      'BUNDLE_EXECUTION_BOUNDARY_INVALID',
      'The direct-macOS/no-Parallels execution boundary differs.',
    );
  }
  assertGoogleChromeProduct(manifest.execution?.browser?.product);
  assertExactArray(
    manifest.scientificContract?.alphaGrid,
    PAPER010_ALPHA_GRID,
    'BUNDLE_ALPHA_GRID_INVALID',
    'Manifest alpha grid',
  );
  assertExactArray(
    manifest.scientificContract?.methods,
    PAPER010_METHODS,
    'BUNDLE_METHOD_SET_INVALID',
    'Manifest method set',
  );
  if (
    manifest.scientificContract?.expectedResultCount !== 64 ||
    manifest.scientificContract?.resultType !== 'isoconversional' ||
    manifest.scientificContract
      ?.suppliedDerivativeRequiredForFriedman !== true ||
    manifest.scientificContract?.publicationComparison?.status !==
      'not_reproduced_from_raw_without_undocumented_preprocessing' ||
    manifest.scientificContract?.publicationComparison
      ?.valuesAreContextNotOracle !== true
  ) {
    fail(
      'BUNDLE_SCIENTIFIC_CONTRACT_INVALID',
      'Manifest scientific contract differs from the Paper010 lock.',
    );
  }
  assertExactStructure(
    manifest.scientificContract?.rawWideSeriesInput,
    {
      source: locks.rawSource,
      sheet: PAPER010_SHEET,
      headerSourceRow: PAPER010_HEADER_ROW + 1,
      rawObservationCount: 1716,
      projectedPointCount: 48,
      derivativeSemantic: 'massLossRate',
      derivativeUnit: '%/min',
      scopeConfirmed: true,
    },
    'BUNDLE_SCIENTIFIC_CONTRACT_INVALID',
    'Manifest raw wide-series input contract',
  );
  assertExactStructure(
    manifest.scientificContract?.comparisonTolerances,
    paper010RawProjectionTolerances(locks.manifest),
    'BUNDLE_SCIENTIFIC_CONTRACT_INVALID',
    'Manifest direct raw-XLSX comparison tolerances',
  );
  const boundary = manifest.claimBoundary;
  if (
    boundary?.technicalCheckOnly !== true ||
    boundary?.realDataReproduction !== true ||
    boundary?.independentScientificReviewComplete !== false ||
    boundary?.platformGateClosed !== false ||
    boundary?.windows11Tested !== false ||
    boundary?.ubuntuTested !== false ||
    boundary?.usabilityGateClosed !== false ||
    boundary?.externalScientificGatesClosed !== false
  ) {
    fail(
      'BUNDLE_CLAIM_BOUNDARY_INVALID',
      'The bounded technical-evidence claim was widened.',
      boundary,
    );
  }

  const expectedFiles = new Set([
    PAPER010_MANIFEST_NAME,
    'paper010-kissinger-negative-evidence.json',
  ]);
  const expectedArtifacts = Object.freeze({
    report_json: PAPER010_REPORT_FILENAMES.json,
    report_csv: PAPER010_REPORT_FILENAMES.csv,
    report_pdf: PAPER010_REPORT_FILENAMES.pdf,
    final_state_screenshot: PAPER010_REPORT_FILENAMES.screenshot,
    raw_network_capture: PAPER010_REPORT_FILENAMES.network,
    offline_har: PAPER010_REPORT_FILENAMES.har,
  });
  const passes = manifest.passes;
  if (
    !Array.isArray(passes) ||
    passes.length !== 2 ||
    passes[0]?.passId !== 'pass-1' ||
    passes[1]?.passId !== 'pass-2'
  ) {
    fail(
      'BUNDLE_PASS_SET_INVALID',
      'Evidence bundle must contain ordered pass-1 and pass-2 records.',
    );
  }

  const verifiedPasses = [];
  for (const pass of passes) {
    if (
      pass.runtime?.executionPath !==
        'direct-local-macos-google-chrome' ||
      pass.runtime?.platform !== 'darwin' ||
      pass.runtime?.documentProtocol !== 'file:' ||
      pass.runtime?.navigatorOnLine !== false ||
      pass.runtime?.parallelsUsed !== false ||
      pass.runtime?.virtualizationOrCrossPlatformClaim !== false
    ) {
      fail(
        'BUNDLE_PASS_RUNTIME_INVALID',
        `${pass.passId} runtime boundary differs.`,
      );
    }
    assertGoogleChromeProduct(pass.browser?.product);
    if (
      pass.visibleState?.refused !== false ||
      pass.visibleState?.totalRows !== 64 ||
      pass.visibleState?.isoconversionalRows !== 64 ||
      pass.visibleState?.peakRows !== 0 ||
      pass.visibleState?.wideMapping?.uploadedFileName !==
        path.basename(locks.rawSource.path) ||
      pass.visibleState?.wideMapping?.sheet !== PAPER010_SHEET ||
      pass.visibleState?.wideMapping?.headerSourceRow !==
        PAPER010_HEADER_ROW + 1 ||
      pass.visibleState?.wideMapping?.layout !== 'wide-series' ||
      pass.visibleState?.wideMapping?.seriesCount !== 3 ||
      pass.visibleState?.wideMapping?.scopeConfirmed !== true ||
      pass.visibleState?.wideMapping?.fullTableScopeProfileVisible !== true ||
      pass.visibleState?.wideMapping?.firstExcludedColumnVisible !== true ||
      pass.visibleState?.wideMapping?.lastExcludedColumnVisible !== true ||
      PAPER010_METHODS.some(
        (method) =>
          pass.visibleState?.methodCounts?.[method] !== 16,
      )
    ) {
      fail(
        'BUNDLE_VISIBLE_STATE_INVALID',
        `${pass.passId} does not retain the 64-row visible state.`,
      );
    }
    for (const method of PAPER010_METHODS) {
      assertExactArray(
        pass.visibleState.alphasByMethod?.[method],
        PAPER010_ALPHA_GRID,
        'BUNDLE_VISIBLE_ALPHA_GRID_INVALID',
        `${pass.passId} ${method} visible alpha grid`,
      );
    }

    if (
      !Array.isArray(pass.artifacts) ||
      pass.artifacts.length !==
        Object.keys(expectedArtifacts).length
    ) {
      fail(
        'BUNDLE_ARTIFACT_SET_INVALID',
        `${pass.passId} artifact descriptor count differs.`,
      );
    }
    const retained = {};
    for (const [role, filename] of Object.entries(expectedArtifacts)) {
      const relativePath = `${pass.passId}/${filename}`;
      expectedFiles.add(relativePath);
      const matching = pass.artifacts.filter(
        (artifact) => artifact.role === role,
      );
      if (matching.length !== 1) {
        fail(
          'BUNDLE_ARTIFACT_SET_INVALID',
          `${pass.passId} must retain exactly one ${role}.`,
        );
      }
      retained[role] = verifyDescriptor(
        bundleDirectory,
        matching[0],
        role,
        relativePath,
      );
    }

    const report = JSON.parse(
      retained.report_json.bytes.toString('utf8'),
    );
    const reportVerification = verifyPaper010Report(report, locks);
    const csvText = retained.report_csv.bytes.toString('utf8');
    const csvVerification = verifyPaper010Csv(csvText, report);
    const pdfVerification = verifyPdfBytes(retained.report_pdf.bytes);
    const screenshotVerification = verifyPngBytes(
      retained.final_state_screenshot.bytes,
    );
    const har = JSON.parse(retained.offline_har.bytes.toString('utf8'));
    const networkVerification = assertOfflineHar(har);
    const network = JSON.parse(
      retained.raw_network_capture.bytes.toString('utf8'),
    );
    if (
      network.schema !==
        'activation-energy-studio/paper010-local-network-capture/v1' ||
      network.status !== PAPER010_STATUS ||
      network.passId !== pass.passId ||
      !Array.isArray(network.externalAttempts) ||
      network.externalAttempts.length !== 0 ||
      !Array.isArray(network.unsupportedAttempts) ||
      network.unsupportedAttempts.length !== 0 ||
      !Array.isArray(network.records) ||
      network.records.length < 1 ||
      network.records.some(
        (record) =>
          record.kind === 'external' ||
          record.kind === 'unsupported',
      )
    ) {
      fail(
        'BUNDLE_NETWORK_CAPTURE_INVALID',
        `${pass.passId} raw network capture is not file-only.`,
      );
    }
    if (
      networkVerification.externalRequests.length !== 0 ||
      networkVerification.unsupportedRequests.length !== 0
    ) {
      fail(
        'BUNDLE_HAR_OFFLINE_INVALID',
        `${pass.passId} HAR contains non-local traffic.`,
      );
    }
    for (const [kind, artifactRole] of [
      ['json', 'report_json'],
      ['csv', 'report_csv'],
      ['pdf', 'report_pdf'],
    ]) {
      const download = pass.downloads?.[kind];
      if (
        download?.state !== 'completed' ||
        download?.retainedBytes !== retained[artifactRole].bytes.length ||
        download?.receivedBytes !== retained[artifactRole].bytes.length ||
        download?.totalBytes !== retained[artifactRole].bytes.length
      ) {
        fail(
          'BUNDLE_DOWNLOAD_EVIDENCE_INVALID',
          `${pass.passId} ${kind} download evidence differs from the file.`,
        );
      }
    }
    if (
      pass.scientificReportSha256 !==
        reportVerification.scientificReportSha256 ||
      pass.csvSha256 !== sha256Bytes(retained.report_csv.bytes) ||
      pass.verification?.report?.status !== 'PASS' ||
      pass.verification?.csv?.status !== 'PASS' ||
      pass.verification?.pdf?.status !== 'PASS' ||
      pass.verification?.screenshot?.status !== 'PASS'
    ) {
      fail(
        'BUNDLE_PASS_VERIFICATION_INVALID',
        `${pass.passId} retained verification summary differs.`,
      );
    }
    verifiedPasses.push({
      passId: pass.passId,
      canonicalScientificJson: canonicalScientificJson(report),
      scientificReportSha256:
        reportVerification.scientificReportSha256,
      csvBytes: retained.report_csv.bytes,
      csvSha256: sha256Bytes(retained.report_csv.bytes),
      reportVerification,
      csvVerification,
      pdfVerification,
      screenshotVerification,
      networkVerification,
    });
  }

  const negativeDescriptor = verifyDescriptor(
    bundleDirectory,
    manifest.kissinger?.negativeEvidence,
    'kissinger_negative_evidence',
    'paper010-kissinger-negative-evidence.json',
  );
  const negativeEvidence = verifyKissingerNegativeEvidence(
    JSON.parse(negativeDescriptor.bytes.toString('utf8')),
  );
  if (
    manifest.kissinger?.status !== negativeEvidence.status ||
    manifest.kissinger?.resultEmitted !== false
  ) {
    fail(
      'BUNDLE_KISSINGER_BOUNDARY_INVALID',
      'Kissinger manifest boundary differs from its negative evidence.',
    );
  }

  const actualFiles = listBundleFiles(bundleDirectory);
  assertExactArray(
    actualFiles,
    [...expectedFiles].sort(),
    'BUNDLE_FILE_SET_INVALID',
    'Exact bundle file set',
  );
  const [first, second] = verifiedPasses;
  if (
    first.canonicalScientificJson !== second.canonicalScientificJson ||
    !first.csvBytes.equals(second.csvBytes) ||
    first.scientificReportSha256 !==
      manifest.determinism?.scientificReportSha256 ||
    first.csvSha256 !== manifest.determinism?.csvSha256 ||
    manifest.determinism?.status !== 'PASS' ||
    manifest.determinism?.exactCanonicalJsonEqual !== true ||
    manifest.determinism?.exactCsvEqual !== true
  ) {
    fail(
      'BUNDLE_DETERMINISM_INVALID',
      'Two-pass canonical JSON/CSV determinism did not reproduce.',
    );
  }

  return Object.freeze({
    status: 'PASS',
    evidenceStatus: PAPER010_STATUS,
    bundleDirectory,
    releaseSha256: locks.release.sha256,
    verifiedPasses: verifiedPasses.length,
    resultCountPerPass: 64,
    verifiedArtifactFiles: actualFiles.length - 1,
    scientificReportSha256: first.scientificReportSha256,
    csvSha256: first.csvSha256,
    externalRequests: 0,
    unsupportedRequests: 0,
    kissingerStatus: negativeEvidence.status,
    claimBoundary: { ...boundary },
  });
}

export async function runPaper010RawToReport({
  outputDirectory,
  browserExecutable: requestedBrowserExecutable = null,
  projectRoot = PAPER010_PROJECT_ROOT,
}) {
  ensureDirectLocalMacOS();
  ensureNewOrEmptyDirectory(outputDirectory);
  const locks = loadAndVerifyPaper010Locks(projectRoot);
  const browserExecutable = await discoverGoogleChromeExecutable(
    requestedBrowserExecutable,
  );
  const negativeEvidence = await deriveKissingerNegativeEvidence({
    projectRoot,
    sourceSha256: locks.rawSource.sha256,
  });
  const negativeEvidencePath = path.resolve(
    outputDirectory,
    'paper010-kissinger-negative-evidence.json',
  );
  writeJson(negativeEvidencePath, negativeEvidence);

  const passes = [];
  for (const passNumber of [1, 2]) {
    const passId = `pass-${passNumber}`;
    passes.push(
      await runBrowserPass({
        passId,
        passDirectory: path.resolve(outputDirectory, passId),
        browserExecutable,
        locks,
      }),
    );
  }
  if (
    passes[0].scientificReportSha256 !==
      passes[1].scientificReportSha256 ||
    passes[0].canonicalScientificJson !== passes[1].canonicalScientificJson ||
    passes[0].csvSha256 !== passes[1].csvSha256
  ) {
    fail(
      'DETERMINISM_FAILED',
      'The two Chrome passes differ after excluding only generatedAt.',
      {
        pass1ScientificReportSha256:
          passes[0].scientificReportSha256,
        pass2ScientificReportSha256:
          passes[1].scientificReportSha256,
        pass1CsvSha256: passes[0].csvSha256,
        pass2CsvSha256: passes[1].csvSha256,
      },
    );
  }

  const manifestPath = path.resolve(
    outputDirectory,
    PAPER010_MANIFEST_NAME,
  );
  const manifest = {
    schema: PAPER010_MANIFEST_SCHEMA,
    status: PAPER010_STATUS,
    generatedAt: new Date().toISOString(),
    scope:
      'Locked offline release, official raw Paper010 S2 XLSX wide-series UI mapping, two direct local macOS Google Chrome raw-to-report passes.',
    release: locks.release,
    lockedInputs: locks.lockedSources,
    implementationSources: PAPER010_IMPLEMENTATION_SOURCES.map((definition) =>
      projectSourceDescriptor(projectRoot, definition)),
    execution: {
      requiredPasses: 2,
      completedPasses: 2,
      browser: passes[0].browser,
      directLocalMacOS: true,
      parallelsUsed: false,
      windowsOrUbuntuEvidenceClaimed: false,
    },
    scientificContract: {
      sample: EXPECTED_SAMPLE,
      atmosphere: EXPECTED_ATMOSPHERE,
      alphaGrid: [...PAPER010_ALPHA_GRID],
      methods: [...PAPER010_METHODS],
      expectedResultCount: 64,
      resultType: 'isoconversional',
      suppliedDerivativeRequiredForFriedman: true,
      rawWideSeriesInput: {
        source: locks.rawSource,
        sheet: PAPER010_SHEET,
        headerSourceRow: PAPER010_HEADER_ROW + 1,
        rawObservationCount: 1716,
        projectedPointCount: 48,
        derivativeSemantic: 'massLossRate',
        derivativeUnit: '%/min',
        scopeConfirmed: true,
      },
      independentOracle: locks.oracle,
      comparisonTolerances: paper010RawProjectionTolerances(locks.manifest),
      publicationComparison: {
        status:
          locks.reference.publicationComparison.status,
        valuesAreContextNotOracle:
          locks.reference.publicationComparison.valuesAreContextNotOracle,
      },
    },
    determinism: {
      status: 'PASS',
      volatileFieldsExcluded: ['generatedAt'],
      scientificReportSha256: passes[0].scientificReportSha256,
      csvSha256: passes[0].csvSha256,
      exactCanonicalJsonEqual: true,
      exactCsvEqual: true,
    },
    kissinger: {
      status: negativeEvidence.status,
      resultEmitted: false,
      negativeEvidence: descriptor(
        outputDirectory,
        negativeEvidencePath,
        'kissinger_negative_evidence',
      ),
    },
    passes: passes.map((pass) => ({
      passId: pass.passId,
      startedAt: pass.startedAt,
      endedAt: pass.endedAt,
      browser: pass.browser,
      runtime: pass.runtime,
      visibleState: pass.visibleState,
      downloads: pass.downloads,
      verification: pass.verification,
      scientificReportSha256: pass.scientificReportSha256,
      csvSha256: pass.csvSha256,
      artifacts: pass.artifacts.map((artifact) => ({
        ...artifact,
        path: portablePath(path.join(pass.passId, artifact.path)),
      })),
    })),
    claimBoundary: {
      technicalCheckOnly: true,
      realDataReproduction: true,
      independentScientificReviewComplete: false,
      platformGateClosed: false,
      windows11Tested: false,
      ubuntuTested: false,
      usabilityGateClosed: false,
      externalScientificGatesClosed: false,
      nextRequiredAction:
        'Independent scientific reviewer adjudication remains required. Separate directly observed Windows 11, Ubuntu, and usability gates remain open.',
    },
  };
  writeJson(manifestPath, manifest);
  return Object.freeze({ manifestPath, manifest });
}

async function main(argv) {
  const options = parsePaper010Arguments(argv);
  if (!options) {
    process.stdout.write(`${paper010Usage()}\n`);
    return;
  }
  if (options.mode === 'check') {
    const verification = verifyPaper010RawToReportBundle(
      options.bundleDirectory,
    );
    process.stdout.write(
      `PASS ${verification.evidenceStatus}\n${verification.bundleDirectory}\n`,
    );
    return;
  }
  const result = await runPaper010RawToReport(options);
  process.stdout.write(
    `${PAPER010_STATUS}\n${result.manifestPath}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error?.code ?? 'UNCLASSIFIED_ERROR';
    process.stderr.write(
      `${code}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (error?.details !== undefined) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
    process.exitCode = 1;
  });
}
