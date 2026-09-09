import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import type {
  BatchIngestionResult,
  BetaTpRow,
  NormalizedThermalRecord,
  ProvenanceColumnMapping,
  WideSeriesIngestionAudit,
} from '../src/io';
import {
  createPdfReport,
  createProjectReport,
} from '../src/report';
import projectReportSchema from '../src/report/project-report.schema.json';
import { makeSchemaV6QaReport } from './helpers/report-fixture';

const columnMappings: ProvenanceColumnMapping[] = [
  {
    role: 'temperature',
    sourceColumnIndex: 0,
    sourceHeader: 'TG temperature',
    sourceUnit: 'C',
    confidence: 'manual',
  },
  {
    role: 'massPercent',
    sourceColumnIndex: 1,
    sourceHeader: 'TG mass',
    sourceUnit: '%',
    confidence: 'manual',
  },
  {
    role: 'dAlphaDt',
    sourceColumnIndex: 3,
    sourceHeader: 'Signed dm/dt',
    sourceUnit: '%/min',
    confidence: 'manual',
  },
];

async function makeWideReport() {
  const base = await makeSchemaV6QaReport();
  const records: NormalizedThermalRecord[] = [];
  const betaTp: BetaTpRow[] = [];
  const points: WideSeriesIngestionAudit['points'] = [];
  const series: WideSeriesIngestionAudit['series'] = [];
  const branches: WideSeriesIngestionAudit['branches'] = [];

  base.analysis.preparedRuns.forEach((run, runIndex) => {
    const primaryBase = runIndex * 100 + 2;
    const derivativeBase = runIndex * 100 + 502;
    series.push({
      seriesId: `series-${run.id}`,
      runId: run.id,
      temperature: { columnIndex: runIndex * 4, unit: 'C' },
      signal: {
        kind: 'massPercent',
        columnIndex: runIndex * 4 + 1,
        unit: '%',
        alphaReference: { initialValue: 100, finalValue: 0 },
      },
      derivative: {
        semantic: 'massChangeRate',
        valueColumnIndex: runIndex * 4 + 3,
        unit: '%/min',
        temperatureColumn: { columnIndex: runIndex * 4 + 2, unit: 'C' },
      },
      heatingRate: { value: run.heatingRateKPerMinute, unit: 'K/min' },
      context: {
        sample: run.sampleId ?? 'synthetic-kas',
        atmosphere: run.atmosphere ?? 'N2',
        stage: run.stage ?? base.context.stage ?? 'synthetic stage',
      },
    });
    run.points.forEach((point, pointIndex) => {
      const sourceRows = [primaryBase + pointIndex, primaryBase + pointIndex + 1];
      const derivativeSourceRows = [
        derivativeBase + pointIndex,
        derivativeBase + pointIndex + 1,
      ];
      records.push({
        temperatureK: point.temperatureK,
        temperatureKind: 'sample',
        alpha: point.alpha,
        dAlphaDtPerMinute: point.dAlphaDtPerMinute,
        heatingRateKPerMin: run.heatingRateKPerMinute,
        runId: run.id,
        sample: run.sampleId,
        atmosphere: run.atmosphere,
        stage: run.stage,
        provenance: {
          fileName: 'wide-source.xlsx',
          sheetName: 'Fig.2.',
          // Deliberately shared within a run: the candidate key must retain
          // distinct projected alpha/temperature points.
          sourceRow: primaryBase,
          sourceRows,
          derivativeSourceRows,
          columnMappings,
        },
      });
      points.push({
        seriesId: `series-${run.id}`,
        runId: run.id,
        alpha: point.alpha,
        sourceRows,
        derivativeSourceRows,
      });
    });
    branches.push({
      seriesId: `series-${run.id}`,
      runId: run.id,
      sourceObservationCount: run.points.length + 20,
      selectedObservationCount: run.points.length,
      startSourceRow: primaryBase,
      endSourceRow: primaryBase + run.points.length,
      targetAlphaRange: [
        run.points[0]?.alpha ?? 0,
        run.points.at(-1)?.alpha ?? 1,
      ],
      selectedAlphaRange: [
        run.points[0]?.alpha ?? 0,
        run.points.at(-1)?.alpha ?? 1,
      ],
    });
    if (run.peakTemperatureK !== undefined) {
      betaTp.push({
        runId: run.id,
        heatingRateKPerMin: run.heatingRateKPerMinute,
        peakTemperatureK: run.peakTemperatureK,
        sample: run.sampleId,
        atmosphere: run.atmosphere,
        stage: run.stage,
        provenance: {
          fileName: 'wide-source.xlsx',
          sheetName: 'Fig.2.',
          sourceRow: primaryBase + 90,
          columnMappings,
        },
      });
    }
  });

  const alphaGrid = [...base.reproducibility.alphaGrid];
  const wideAudit: WideSeriesIngestionAudit = {
    layout: 'wide-series',
    source: {
      fileName: 'wide-source.xlsx',
      fileType: 'xlsx',
      sheetName: 'Fig.2.',
    },
    headerRow: 2,
    headerSourceRow: 3,
    headers: [
      'TG temperature',
      'TG mass',
      'DTG temperature',
      'Signed dm/dt',
      'Excluded note',
    ],
    decimalSeparator: '.',
    alphaGrid,
    series,
    rawObservationCount: base.analysis.preparedRuns.reduce(
      (sum, run) => sum + run.points.length + 20,
      0,
    ),
    projectedPointCount: records.length,
    branches,
    excludedPopulatedColumns: [
      {
        columnIndex: 4,
        sourceHeader: 'Excluded note',
        populatedRowCount: 7,
        firstSourceRow: 4,
        lastSourceRow: 10,
      },
    ],
    scopeConfirmed: true,
    points,
  };
  const ingestion: BatchIngestionResult = {
    status: 'ready',
    files: [],
    diagnostics: [],
    records,
    tables: { tAlphaBeta: [], betaTp },
    wideSeriesAudit: [wideAudit],
  };
  const report = createProjectReport(
    base.analysis,
    {
      ...base.context,
      sourceFiles: [{
        name: 'wide-source.xlsx',
        sizeBytes: 1,
        sha256: 'd'.repeat(64),
      }],
    },
    {
      ingestion,
      analysisConfiguration: {
        alphaGrid,
        methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
        includeKissinger: true,
        minR2Warning: 0.98,
      },
    },
  );
  return report;
}

describe('schema v6 wide-series audit and source-row traceability', () => {
  it('uses an explicit empty wide-file array for long-table reports', async () => {
    const report = await makeSchemaV6QaReport();
    expect(report.reproducibility.preprocessing.wideSeriesFiles).toEqual([]);
  });

  it('serializes the complete wide mapping contract and validates it strictly', async () => {
    const report = await makeWideReport();
    const validate = new Ajv({ allErrors: true, strict: false }).compile(projectReportSchema);
    expect(validate(report), JSON.stringify(validate.errors, null, 2)).toBe(true);

    const wide = report.reproducibility.preprocessing.wideSeriesFiles[0];
    expect(wide).toMatchObject({
      source: {
        fileName: 'wide-source.xlsx',
        fileType: 'xlsx',
        sheetName: 'Fig.2.',
      },
      headerRow: 2,
      headerSourceRow: 3,
      alphaGrid: report.reproducibility.alphaGrid,
      scopeConfirmed: true,
      projectedPointCount: report.analysis.preparedRuns.reduce(
        (sum, run) => sum + run.points.length,
        0,
      ),
      excludedPopulatedColumns: [
        expect.objectContaining({ sourceHeader: 'Excluded note', populatedRowCount: 7 }),
      ],
    });
    expect(wide?.series[0]).toMatchObject({
      heatingRate: {
        unit: 'K/min',
        canonicalKPerMinute: report.analysis.preparedRuns[0]?.heatingRateKPerMinute,
      },
      context: {
        sample: 'synthetic-kas',
        atmosphere: 'N2',
      },
      signal: {
        kind: 'massPercent',
        unit: '%',
        alphaReference: {
          initialValue: 100,
          finalValue: 0,
          source: 'manual',
        },
      },
      derivative: {
        semantic: 'massChangeRate',
        semanticSource: 'manual',
        canonicalOutput: 'dAlphaDtPerMinute',
        canonicalConversionFormula:
          'dAlphaDtPerMinute = -sourceValue * 0.01 / ((100 - 0) * 0.01)',
      },
    });
    expect(wide?.points.every((point) => point.sourceRows.length === 2)).toBe(true);
    expect(wide?.points.every((point) => point.derivativeSourceRows.length === 2)).toBe(true);
  });

  it('retains every projected candidate and separates Friedman derivative rows', async () => {
    const report = await makeWideReport();
    expect(report.traceability.gaps).toEqual([]);
    expect(
      report.traceability.observationLinks.every(
        (observation) => observation.sourceResolution !== 'unresolved',
      ),
    ).toBe(true);

    const nonFriedman = report.traceability.observationLinks.find(
      (observation) => observation.resultId.startsWith('FWO:'),
    );
    expect(nonFriedman?.sourceResolution).toBe('interpolated');
    expect(nonFriedman?.sourceRows.map((row) => row.contribution)).toEqual([
      'interpolation-lower',
      'interpolation-upper',
    ]);

    const friedman = report.traceability.observationLinks.find(
      (observation) => observation.resultId.startsWith('FRIEDMAN:'),
    );
    expect(friedman?.sourceResolution).toBe('interpolated');
    expect(friedman?.sourceRows.map((row) => row.contribution)).toEqual([
      'interpolation-lower',
      'interpolation-upper',
      'derivative-interpolation-lower',
      'derivative-interpolation-upper',
    ]);
  });

  it('renders a short human-readable wide-series summary in the PDF', async () => {
    const pdf = createPdfReport(await makeWideReport());
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const text = binary.replace(/\\([()\\])/g, '$1');
    expect(text).toContain('Wide-series audit:');
    expect(text).toContain('manual heating rate=');
    expect(text).toContain('canonical');
  });
});
