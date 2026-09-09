import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PAPER010_ALPHA_GRID,
  PAPER010_FIXTURE_RELATIVE,
  PAPER010_METHODS,
  PAPER010_PROCESS,
  PAPER010_PROJECT_NAME,
  PAPER010_PROJECT_ROOT,
  PAPER010_RAW_SOURCE_RELATIVE,
  PAPER010_STAGE,
  PAPER010_WIDE_SERIES,
  Paper010RawToReportError,
  deriveKissingerNegativeEvidence,
  loadAndVerifyPaper010Locks,
  parseCsvRecords,
  parsePaper010Arguments,
  requestRecordsToHar,
  verifyKissingerNegativeEvidence,
  verifyPaper010Csv,
  verifyPaper010RawToReportBundle,
  verifyPaper010Report,
} from '../scripts/run-paper010-raw-to-report.mjs';
import { assertOfflineHar } from '../scripts/platform-hosted-ci.mjs';

const CLAIM_BOUNDARY =
  'Reported values are apparent activation energies conditional on the sample, process/stage, atmosphere, method, alpha range, input data, and preprocessing choices. They are not universal material constants and do not prove a single-step mechanism.';
const CONFIDENCE_BOUNDARY =
  'Regression-only uncertainty: the 95% confidence interval covers post-aggregation regression scatter only; it does not include within-heating-rate replicate variability, calibration uncertainty, anchor uncertainty, baseline uncertainty, or derivative-method uncertainty.';
const CSV_HEADERS = [
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
];

const locks = loadAndVerifyPaper010Locks();
const RAW_SOURCE_NAME = path.basename(PAPER010_RAW_SOURCE_RELATIVE);
const PAPER010_HEADERS = Array.from({ length: 36 }, (_, columnIndex) => (
  columnIndex < 18
    ? (columnIndex % 2 === 0 ? 'temperature' : 'weight')
    : (columnIndex % 2 === 0 ? 'temperature' : 'DTG')
));
const SOURCE_ROWS_BY_RATE = {
  5: [
    [119, 120], [155, 156], [171, 172], [188, 189],
    [217, 218], [238, 239], [252, 253], [263, 264],
    [276, 277], [292, 293], [312, 313], [335, 336],
    [356, 357], [374, 375], [394, 395], [424, 425],
  ],
  10: [
    [137, 138], [169, 170], [184, 185], [201, 202],
    [230, 231], [250, 251], [263, 264], [275, 276],
    [289, 290], [309, 310], [335, 336], [361, 362],
    [385, 386], [408, 409], [443, 444], [466, 467],
  ],
  20: [
    [131, 132], [170, 171], [188, 189], [203, 204],
    [227, 228], [252, 253], [268, 269], [281, 282],
    [295, 296], [316, 317], [346, 347], [378, 379],
    [406, 407], [439, 440], [471, 472], [494, 495],
  ],
};

function reportWideSeries() {
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
    context: { ...definition.context, source: 'manual' },
  }));
}

function widePointAudit() {
  return PAPER010_WIDE_SERIES.flatMap((definition) => (
    PAPER010_ALPHA_GRID.map((alpha, alphaIndex) => ({
      seriesId: definition.seriesId,
      runId: definition.runId,
      alpha,
      sourceRows: [...SOURCE_ROWS_BY_RATE[definition.heatingRate.value][alphaIndex]],
      derivativeSourceRows: [
        ...SOURCE_ROWS_BY_RATE[definition.heatingRate.value][alphaIndex],
      ],
    }))
  ));
}

function wideFileAudit() {
  return {
    layout: 'wide-series',
    source: {
      fileName: RAW_SOURCE_NAME,
      fileType: 'xlsx',
      sheetName: 'Fig.2.',
    },
    headerRow: 2,
    headerSourceRow: 3,
    headers: [...PAPER010_HEADERS],
    decimalSeparator: '.',
    alphaGrid: [...PAPER010_ALPHA_GRID],
    series: reportWideSeries(),
    rawObservationCount: 1716,
    projectedPointCount: 48,
    branches: [
      {
        seriesId: 'paper010-rh-5',
        runId: 'paper010-rh-5',
        sourceObservationCount: 574,
        selectedObservationCount: 307,
        startSourceRow: 119,
        endSourceRow: 425,
        targetAlphaRange: [0.05, 0.8],
        selectedAlphaRange: [0.04956599999999994, 0.8005072],
      },
      {
        seriesId: 'paper010-rh-10',
        runId: 'paper010-rh-10',
        sourceObservationCount: 574,
        selectedObservationCount: 331,
        startSourceRow: 137,
        endSourceRow: 467,
        targetAlphaRange: [0.05, 0.8],
        selectedAlphaRange: [0.049566700000000026, 0.8015269],
      },
      {
        seriesId: 'paper010-rh-20',
        runId: 'paper010-rh-20',
        sourceObservationCount: 568,
        selectedObservationCount: 365,
        startSourceRow: 131,
        endSourceRow: 495,
        targetAlphaRange: [0.05, 0.8],
        selectedAlphaRange: [0.04973309999999998, 0.8017098],
      },
    ],
    excludedPopulatedColumns: [
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
    ].map(([columnIndex, populatedRowCount, lastSourceRow]) => ({
      columnIndex,
      sourceHeader: PAPER010_HEADERS[columnIndex],
      populatedRowCount,
      firstSourceRow: 4,
      lastSourceRow,
    })),
    scopeConfirmed: true,
    points: widePointAudit(),
  };
}

function traceMappings(definition) {
  return [
    ['temperature', definition.temperature.columnIndex, definition.temperature.unit],
    ['massPercent', definition.signal.columnIndex, definition.signal.unit],
    [
      'temperature',
      definition.derivative.temperatureColumn.columnIndex,
      definition.derivative.temperatureColumn.unit,
    ],
    ['dAlphaDt', definition.derivative.valueColumnIndex, definition.derivative.unit],
  ].map(([role, sourceColumnIndex, sourceUnit]) => ({
    role,
    sourceColumnIndex,
    sourceHeader: PAPER010_HEADERS[sourceColumnIndex],
    sourceUnit,
    confidence: 'manual',
  }));
}

function reportInputMappings() {
  const mappings = PAPER010_WIDE_SERIES.flatMap(traceMappings);
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

function numberArray(values) {
  return values.map(Number);
}

function makeReport() {
  const methods = PAPER010_METHODS.map((methodName) => {
    const expectedMethod = locks.reference.methods[methodName];
    return {
      method: methodName,
      resultType: 'isoconversional',
      formulaId: expectedMethod.formulaId,
      status: 'success',
      estimates: expectedMethod.records.map((record) => ({
        alpha: Number(record.alpha),
        activationEnergyKJPerMol: Number(
          record.activationEnergyKJPerMol,
        ),
        regression: {
          n: record.regression.n,
          rawObservationCount: 3,
          residualDegreesOfFreedom:
            record.regression.residualDegreesOfFreedom,
          inputAggregation: 'none',
          inputGroups: [],
          x: numberArray(record.regression.x),
          y: numberArray(record.regression.y),
          slope: Number(record.regression.slope),
          intercept: Number(record.regression.intercept),
          fitted: numberArray(record.regression.fitted),
          residuals: numberArray(record.regression.residuals),
          sse: Number(record.regression.sse),
          r2: Number(record.regression.rSquared),
          residualStandardError: Number(
            record.regression.residualStandardError,
          ),
          slopeStandardError: Number(
            record.regression.slopeStandardError,
          ),
          slopeConfidence95: numberArray(
            record.regression.slopeConfidence95,
          ),
        },
        observations: [],
      })),
      refusals: [],
      warnings: [],
    };
  });
  const results = methods.flatMap((method) =>
    method.estimates.map((estimate, index) => {
      const expected =
        locks.reference.methods[method.method].records[index];
      return {
        quantity: 'apparent activation energy',
        claimBoundary: CLAIM_BOUNDARY,
        confidenceBoundary: CONFIDENCE_BOUNDARY,
        sample: 'Rhubarb (RH)',
        process: PAPER010_PROCESS,
        stage: PAPER010_STAGE,
        atmosphere: 'Simulated air (N2:O2=4:1)',
        resultId: `${method.method}:alpha:${estimate.alpha.toFixed(15)}`,
        method: method.method,
        resultType: 'isoconversional',
        formulaId: method.formulaId,
        alpha: estimate.alpha,
        activationEnergyKJPerMol: estimate.activationEnergyKJPerMol,
        confidence95LowerKJPerMol: Number(
          expected.energyConfidence95KJPerMol[0],
        ),
        confidence95UpperKJPerMol: Number(
          expected.energyConfidence95KJPerMol[1],
        ),
        n: 3,
        rawObservationCount: 3,
        residualDegreesOfFreedom: 1,
        regressionInputAggregation: 'none',
        r2: estimate.regression.r2,
        slope: estimate.regression.slope,
        slopeStandardError: estimate.regression.slopeStandardError,
        status: 'success',
      };
    }));
  const pointsByKey = new Map(
    widePointAudit().map((point) => [
      `${point.runId}:${Number(point.alpha).toFixed(2)}`,
      point,
    ]),
  );
  const observationLinks = results.flatMap((result) => (
    PAPER010_WIDE_SERIES.map((definition) => {
      const point = pointsByKey.get(
        `${definition.runId}:${Number(result.alpha).toFixed(2)}`,
      );
      assert.ok(point);
      const sourceRows = point.sourceRows.map((sourceRow, index) => ({
        fileName: RAW_SOURCE_NAME,
        sheetName: 'Fig.2.',
        sourceRow,
        contribution: index === 0
          ? 'interpolation-lower'
          : 'interpolation-upper',
        columnMappings: traceMappings(definition),
      }));
      if (result.method === 'FRIEDMAN') {
        sourceRows.push(
          ...point.derivativeSourceRows.map((sourceRow, index) => ({
            fileName: RAW_SOURCE_NAME,
            sheetName: 'Fig.2.',
            sourceRow,
            contribution: index === 0
              ? 'derivative-interpolation-lower'
              : 'derivative-interpolation-upper',
            columnMappings: traceMappings(definition),
          })),
        );
      }
      return {
        observationId: `${result.resultId}:${definition.runId}`,
        resultId: result.resultId,
        runId: definition.runId,
        sourceResolution: 'interpolated',
        sourceRows,
      };
    })
  ));
  return {
    schemaVersion: 'activation-energy-studio/project-report/v4',
    application: {
      name: 'Activation Energy Studio',
      version: '0.2.0',
      calculationLocation: 'local-browser',
    },
    generatedAt: '2026-07-28T00:00:00.000Z',
    context: {
      projectName: PAPER010_PROJECT_NAME,
      process: PAPER010_PROCESS,
      sample: 'Rhubarb (RH)',
      atmosphere: 'Simulated air (N2:O2=4:1)',
      stage: PAPER010_STAGE,
      sourceFiles: [
        {
          name: RAW_SOURCE_NAME,
          sizeBytes: locks.rawSource.bytes,
          sha256: locks.rawSource.sha256,
        },
      ],
    },
    scientificBoundary: {
      quantity: 'apparent activation energy',
      statement: CLAIM_BOUNDARY,
      regressionConfidenceInterval: CONFIDENCE_BOUNDARY,
      contextLabels: {
        sample: 'Rhubarb (RH)',
        process: PAPER010_PROCESS,
        stage: PAPER010_STAGE,
        atmosphere: 'Simulated air (N2:O2=4:1)',
        methods: [...PAPER010_METHODS],
      },
    },
    reproducibility: {
      coreMathVersion: 'activation-energy-core/v2',
      formulaSetVersion: 'activation-energy-formulas/v1',
      volatileFields: ['generatedAt'],
      canonicalUnits: {
        temperature: 'K',
        heatingRate: 'K/min',
        time: 'min',
        alpha: 'fraction',
        activationEnergy: 'kJ/mol',
        derivative: '1/min',
      },
      configuration: {
        alphaGrid: [...PAPER010_ALPHA_GRID],
        selectedMethods: [...PAPER010_METHODS],
        includeKissinger: false,
        minR2Warning: 0.98,
        stageWindowCelsius: null,
      },
      inputTables: [
        {
          fileName: RAW_SOURCE_NAME,
          fileType: 'xlsx',
          sheetName: 'Fig.2.',
          delimiter: null,
          decimalSeparator: '.',
          textEncoding: null,
          headerRow: 2,
          tableKind: 'curve',
          mappings: reportInputMappings(),
        },
      ],
      preprocessing: {
        derivativeSources: [5, 10, 20].map((rate) => ({
          runId: `paper010-rh-${rate}`,
          source: 'provided',
        })),
        wideSeriesFiles: [wideFileAudit()],
      },
      alphaGrid: [...PAPER010_ALPHA_GRID],
      commonAlphaRange: [0.05, 0.8],
    },
    analysis: {
      status: 'success',
      preparedRuns: [5, 10, 20].map((rate) => ({
        runId: `paper010-rh-${rate}`,
        derivativeSource: 'provided',
      })),
      methods,
      refusals: [],
      warnings: [],
    },
    results,
    traceability: {
      resultLinks: results.map(({ resultId }) => ({ resultId })),
      observationLinks,
      gaps: [],
    },
  };
}

function csvCell(value) {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/u.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function reportCsv(report) {
  const lines = [CSV_HEADERS.join(',')];
  for (const result of report.results) {
    const row = {
      schemaVersion: report.schemaVersion,
      applicationVersion: report.application.version,
      ...result,
    };
    lines.push(CSV_HEADERS.map((header) => csvCell(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

test('CLI accepts only the scoped output and browser arguments', () => {
  const parsed = parsePaper010Arguments([
    '--output',
    'evidence/validation/paper010-test',
    '--browser-executable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]);
  assert.equal(
    parsed.outputDirectory,
    path.resolve('evidence/validation/paper010-test'),
  );
  assert.equal(parsed.mode, 'capture');
  assert.deepEqual(
    parsePaper010Arguments([
      '--check',
      'evidence/validation/paper010-test',
    ]),
    {
      mode: 'check',
      bundleDirectory: path.resolve(
        'evidence/validation/paper010-test',
      ),
    },
  );
  assert.throws(
    () => parsePaper010Arguments([]),
    (error) =>
      error instanceof Paper010RawToReportError &&
      error.code === 'ARGUMENT_REQUIRED',
  );
  assert.throws(
    () =>
      parsePaper010Arguments([
        '--output',
        'x',
        '--build-release',
        'yes',
      ]),
    (error) =>
      error instanceof Paper010RawToReportError &&
      error.code === 'ARGUMENT_INVALID',
  );
});

test('locked release and Paper010 fixture/source/reference/oracle chain verify', () => {
  assert.equal(
    locks.release.sha256,
    'ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7',
  );
  assert.equal(locks.release.bytes, 1_261_018);
  assert.equal(locks.lockedSources.length, 6);
  assert.equal(locks.rawSource.path, PAPER010_RAW_SOURCE_RELATIVE);
  assert.equal(path.basename(locks.rawSourcePath), RAW_SOURCE_NAME);
  assert.equal(locks.rawSource.bytes, 184_544);
  assert.equal(
    locks.rawSource.sha256,
    'd24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57',
  );
  assert.deepEqual(
    locks.reference.alphaValues.map(Number),
    PAPER010_ALPHA_GRID,
  );
  assert.equal(
    locks.reference.publicationComparison.status,
    'not_reproduced_from_raw_without_undocumented_preprocessing',
  );
});

test('64-result synthetic report matches every locked Decimal intermediate', () => {
  const report = makeReport();
  const verified = verifyPaper010Report(report, locks);
  assert.equal(verified.status, 'PASS');
  assert.equal(verified.resultCount, 64);
  assert.deepEqual(verified.methodCounts, {
    FWO: 16,
    KAS: 16,
    STARINK: 16,
    FRIEDMAN: 16,
  });
  assert.ok(verified.oracleComparison.comparisons > 1_000);
  assert.deepEqual(verified.wideSeries, {
    status: 'PASS',
    source: {
      fileName: RAW_SOURCE_NAME,
      fileType: 'xlsx',
      sheetName: 'Fig.2.',
    },
    headerSourceRow: 3,
    rawObservationCount: 1716,
    projectedPointCount: 48,
    branchCount: 3,
    excludedPopulatedColumnCount: 24,
    pointAuditSha256:
      'a9d927aa416168a95125e12f11b607e94e9cd38fee63b671fa5e368305c2ac5d',
  });
});

test('report verifier fails closed for 32 rows, tampering, and Kissinger', async (t) => {
  await t.test('32-row default-grid regression is rejected', () => {
    const report = makeReport();
    report.results = report.results.filter(({ alpha }) => alpha <= 0.4);
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_RESULT_COUNT_INVALID',
    );
  });
  await t.test('numeric tampering exceeds the preregistered tolerance', () => {
    const report = makeReport();
    report.analysis.methods[0].estimates[0].activationEnergyKJPerMol += 0.01;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'ORACLE_COMPARISON_FAILED',
    );
  });
  await t.test('a peak row is rejected', () => {
    const report = makeReport();
    report.results[0].method = 'KISSINGER';
    report.results[0].resultType = 'peak';
    report.results[0].alpha = null;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_RESULT_COUNT_INVALID',
    );
  });
  await t.test('source substitution is rejected', () => {
    const report = makeReport();
    report.context.sourceFiles[0].sha256 = '0'.repeat(64);
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_SOURCE_TRACE_INVALID',
    );
  });
  await t.test('missing wide-series audit is rejected', () => {
    const report = makeReport();
    delete report.reproducibility.preprocessing.wideSeriesFiles;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_WIDE_SERIES_AUDIT_MISSING',
    );
  });
  await t.test('branch alpha-range comparison tolerates only cross-runtime last-bit noise', () => {
    const withinTolerance = makeReport();
    withinTolerance.reproducibility.preprocessing
      .wideSeriesFiles[0].branches[0].selectedAlphaRange[0] += 5e-17;
    assert.doesNotThrow(() => verifyPaper010Report(withinTolerance, locks));

    const beyondTolerance = makeReport();
    beyondTolerance.reproducibility.preprocessing
      .wideSeriesFiles[0].branches[0].selectedAlphaRange[0] += 1e-8;
    assert.throws(
      () => verifyPaper010Report(beyondTolerance, locks),
      (error) =>
        error instanceof Paper010RawToReportError
        && error.code === 'REPORT_WIDE_SERIES_BRANCH_INVALID',
    );
  });
  await t.test('raw-observation count tamper is rejected', () => {
    const report = makeReport();
    report.reproducibility.preprocessing.wideSeriesFiles[0]
      .rawObservationCount -= 1;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_WIDE_SERIES_AUDIT_INVALID',
    );
  });
  await t.test('derivative semantic/formula tamper is rejected', () => {
    const report = makeReport();
    report.reproducibility.preprocessing.wideSeriesFiles[0]
      .series[0].derivative.semantic = 'dAlphaDt';
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_WIDE_SERIES_DEFINITION_INVALID',
    );
  });
  await t.test('excluded populated-column tamper is rejected', () => {
    const report = makeReport();
    report.reproducibility.preprocessing.wideSeriesFiles[0]
      .excludedPopulatedColumns[0].populatedRowCount -= 1;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_WIDE_SERIES_SCOPE_INVALID',
    );
  });
  await t.test('projected point source-row tamper is rejected', () => {
    const report = makeReport();
    report.reproducibility.preprocessing.wideSeriesFiles[0]
      .points[0].sourceRows[0] -= 1;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'REPORT_WIDE_SERIES_SOURCE_ROWS_INVALID',
    );
  });
  await t.test('trace source-row tamper is rejected', () => {
    const report = makeReport();
    report.traceability.observationLinks[0].sourceRows[0].sourceRow -= 1;
    assert.throws(
      () => verifyPaper010Report(report, locks),
      (error) =>
        error instanceof Paper010RawToReportError &&
        error.code === 'TRACEABILITY_SOURCE_ROWS_INVALID',
    );
  });
});

test('CSV is a strict 64-row projection of the JSON result table', () => {
  const report = makeReport();
  const csv = reportCsv(report);
  assert.equal(parseCsvRecords(csv).length, 65);
  assert.deepEqual(verifyPaper010Csv(csv, report), {
    status: 'PASS',
    rows: 64,
    headers: 25,
  });
  const tampered = csv.replace(
    String(report.results[0].activationEnergyKJPerMol),
    '999',
  );
  assert.throws(
    () => verifyPaper010Csv(tampered, report),
    (error) =>
      error instanceof Paper010RawToReportError &&
      error.code === 'CSV_JSON_MISMATCH',
  );
});

test('raw workbook produces only fail-closed Kissinger negative evidence', async () => {
  const evidence = await deriveKissingerNegativeEvidence({
    projectRoot: PAPER010_PROJECT_ROOT,
    sourceSha256: locks.rawSource.sha256,
  });
  assert.equal(evidence.status, 'REFUSED_NO_SAME_STAGE_PEAK_SERIES');
  assert.deepEqual(
    evidence.globalMaxima.map(
      ({ heatingRateKPerMinute, temperatureCelsius }) => [
        heatingRateKPerMinute,
        temperatureCelsius,
      ],
    ),
    [
      [5, 481.538],
      [10, 295.414],
      [20, 218.626],
    ],
  );
  assert.equal(
    Object.hasOwn(evidence, 'activationEnergyKJPerMol'),
    false,
  );

  const unsafe = structuredClone(evidence);
  unsafe.sameStagePeakSeriesEstablished = true;
  assert.throws(
    () => verifyKissingerNegativeEvidence(unsafe),
    (error) =>
      error instanceof Paper010RawToReportError &&
      error.code === 'KISSINGER_NEGATIVE_EVIDENCE_INVALID',
  );
});

test('HAR conversion accepts file-only traffic and exposes external traffic', () => {
  const localRecord = {
    startedAt: '2026-07-28T00:00:00.000Z',
    startedAtMs: 0,
    endedAtMs: 10,
    method: 'GET',
    url: 'file:///release/Activation-Energy-Studio-v0.2.0.html',
    kind: 'file',
    status: 200,
    statusText: 'OK',
    finished: true,
  };
  const localHar = requestRecordsToHar([localRecord]);
  assert.deepEqual(assertOfflineHar(localHar), {
    totalRequests: 1,
    fileRequests: [localRecord.url],
    localRequests: [],
    externalRequests: [],
    unsupportedRequests: [],
  });
  const externalHar = requestRecordsToHar([
    localRecord,
    {
      ...localRecord,
      url: 'https://example.invalid/telemetry',
      kind: 'external',
    },
  ]);
  assert.throws(() => assertOfflineHar(externalHar));
});

test('runner source does not build or mutate shared release/package artifacts', () => {
  const source = readFileSync(
    path.resolve(
      PAPER010_PROJECT_ROOT,
      'scripts/run-paper010-raw-to-report.mjs',
    ),
    'utf8',
  );
  assert.doesNotMatch(source, /execFile|spawn|npm run build|vite build/u);
  assert.doesNotMatch(
    source,
    /writeFileSync\([^)]*(?:package\.json|SHA256SUMS|release\/Activation)/u,
  );
  assert.match(
    source,
    /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\)/u,
  );
  assert.match(
    source,
    /window\.scrollX === 0 && window\.scrollY === 0/u,
  );
  assert.match(source, /fileInput\.uploadFile\(locks\.rawSourcePath\)/u);
  assert.doesNotMatch(source, /fileInput\.uploadFile\(locks\.fixturePath\)/u);
  assert.match(source, /data-testid="wide-scope-confirmed"/u);
  assert.match(source, /semantic: 'massLossRate'/u);
});

const RETAINED_BUNDLE = path.resolve(
  PAPER010_PROJECT_ROOT,
  'evidence/validation/paper010-raw-to-report-v0.2.0-local',
);

test('retained two-pass bundle self-verifies without writing', () => {
  const before = readFileSync(
    path.join(RETAINED_BUNDLE, 'PAPER010_RAW_TO_REPORT_MANIFEST.json'),
  );
  const verified = verifyPaper010RawToReportBundle(RETAINED_BUNDLE);
  const after = readFileSync(
    path.join(RETAINED_BUNDLE, 'PAPER010_RAW_TO_REPORT_MANIFEST.json'),
  );
  assert.equal(verified.status, 'PASS');
  assert.equal(verified.verifiedPasses, 2);
  assert.equal(verified.resultCountPerPass, 64);
  assert.equal(verified.externalRequests, 0);
  assert.equal(verified.kissingerStatus, 'REFUSED_NO_SAME_STAGE_PEAK_SERIES');
  assert.deepEqual(after, before);
});

test('bundle verifier rejects byte tamper plus missing and extra artifacts', async (t) => {
  function temporaryBundle() {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'paper010-bundle-test-'),
    );
    const bundle = path.join(temporaryRoot, 'bundle');
    cpSync(RETAINED_BUNDLE, bundle, { recursive: true });
    return { temporaryRoot, bundle };
  }

  await t.test('byte tamper', () => {
    const { temporaryRoot, bundle } = temporaryBundle();
    try {
      appendFileSync(
        path.join(
          bundle,
          'pass-1/paper010-raw-to-report-results.csv',
        ),
        '#tamper\n',
      );
      assert.throws(
        () => verifyPaper010RawToReportBundle(bundle),
        (error) =>
          error instanceof Paper010RawToReportError &&
          error.code === 'BUNDLE_ARTIFACT_HASH_MISMATCH',
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  await t.test('missing artifact', () => {
    const { temporaryRoot, bundle } = temporaryBundle();
    try {
      unlinkSync(
        path.join(
          bundle,
          'pass-2/paper010-raw-to-report-report.pdf',
        ),
      );
      assert.throws(
        () => verifyPaper010RawToReportBundle(bundle),
        (error) =>
          error instanceof Paper010RawToReportError &&
          error.code === 'BUNDLE_ARTIFACT_MISSING',
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  await t.test('extra artifact', () => {
    const { temporaryRoot, bundle } = temporaryBundle();
    try {
      writeFileSync(path.join(bundle, 'unmanifested.txt'), 'not evidence\n');
      assert.throws(
        () => verifyPaper010RawToReportBundle(bundle),
        (error) =>
          error instanceof Paper010RawToReportError &&
          error.code === 'BUNDLE_FILE_SET_INVALID',
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
