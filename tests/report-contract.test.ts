import Ajv from 'ajv';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy, type ThermalRun } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import {
  ingestThermalFiles,
  type BatchIngestionResult,
  type BetaTpRow,
  type IngestionOptions,
} from '../src/io';
import {
  APPARENT_EA_CLAIM_BOUNDARY,
  REPORT_VOLATILE_FIELDS,
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  hashFile,
  serializeProjectReport,
} from '../src/report';
import projectReportSchema from '../src/report/project-report.schema.json';
import syntheticCsv from '../examples/synthetic_kas_150.csv?raw';
import {
  VERIFIED_BETA_TP_ROW_EVIDENCE,
  VERIFIED_CURVE_PEAK_EVIDENCE,
} from './helpers/peak-evidence';

const numericCsvFields = [
  'alpha',
  'activationEnergyKJPerMol',
  'confidence95LowerKJPerMol',
  'confidence95UpperKJPerMol',
  'n',
  'rawObservationCount',
  'residualDegreesOfFreedom',
  'r2',
  'slope',
  'slopeStandardError',
] as const;

async function makeReport() {
  const file = new File([syntheticCsv], 'synthetic_kas_150.csv', { type: 'text/csv' });
  const ingestion = await ingestThermalFiles([file]);
  expect(ingestion.status).toBe('ready');
  const adapted = buildThermalRuns(
    ingestion,
    undefined,
    'full synthetic alpha range',
  );
  expect(adapted.diagnostics).toEqual([]);

  const peakRows: BetaTpRow[] = adapted.runs.map((run) => {
    const peakPoint = run.points[4];
    const source = ingestion.records.find(
      (record) =>
        record.runId === run.id && Math.abs(record.temperatureK - peakPoint.temperature) < 1e-8,
    );
    if (!source) throw new Error(`Missing source row for ${run.id} peak fixture.`);
    return {
      runId: run.id,
      heatingRateKPerMin: run.heatingRate,
      peakTemperatureK: peakPoint.temperature,
      sample: run.sampleId,
      atmosphere: run.atmosphere,
      ...VERIFIED_BETA_TP_ROW_EVIDENCE,
      provenance: source.provenance,
    };
  });
  const ingestionWithPeaks: BatchIngestionResult = {
    ...ingestion,
    tables: { ...ingestion.tables, betaTp: peakRows },
  };
  const runsWithPeaks: ThermalRun[] = adapted.runs.map((run, index) => ({
    ...run,
    peakTemperature: peakRows[index].peakTemperatureK,
    ...VERIFIED_CURVE_PEAK_EVIDENCE,
  }));
  const alphaGrid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const analysis = analyzeActivationEnergy(runsWithPeaks, {
    alphaValues: alphaGrid,
    methods: ['FWO', 'KAS'],
    includeKissinger: true,
    minR2Warning: 0.98,
  });
  expect(analysis.status).not.toBe('refused');

  return createProjectReport(
    analysis,
    {
      projectName: 'Report contract fixture',
      sample: 'synthetic-kas',
      process: 'thermal decomposition',
      stage: 'full synthetic alpha range',
      atmosphere: 'N2',
      sourceFiles: [
        await hashFile(file),
      ],
    },
    {
      ingestion: ingestionWithPeaks,
      analysisConfiguration: {
        alphaGrid,
        methods: ['FWO', 'KAS'],
        includeKissinger: true,
        minR2Warning: 0.98,
      },
    },
  );
}

async function makePreambleTxtStageReport() {
  const stageCsv = syntheticCsv
    .trimEnd()
    .split(/\r\n|\n|\r/)
    .map((line, index) => `${line},${index === 0 ? 'Stage' : 'main decomposition'}`)
    .join('\n');
  const file = new File(
    [['Instrument export metadata', stageCsv].join('\n')],
    'instrument-stage.txt',
    { type: 'text/plain' },
  );
  const options: IngestionOptions = {
    headerRow: 1,
    delimiter: ',',
    tableKind: 't-alpha-beta',
  };
  const ingestion = await ingestThermalFiles([file], [options]);
  expect(ingestion.status).toBe('ready');
  const adapted = buildThermalRuns(ingestion);
  expect(adapted.diagnostics).toEqual([]);
  const alphaGrid = [0.1, 0.5, 0.9];
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: alphaGrid,
    methods: ['FWO', 'KAS'],
    includeKissinger: false,
  });
  expect(analysis.status).not.toBe('refused');
  const report = createProjectReport(
    analysis,
    {
      projectName: 'Preamble TXT stage fixture',
      sample: 'synthetic-kas',
      process: 'thermal decomposition',
      stage: 'main decomposition',
      atmosphere: 'N2',
      sourceFiles: [await hashFile(file)],
    },
    {
      ingestion,
      ingestionOptions: [options],
      analysisConfiguration: {
        alphaGrid,
        methods: ['FWO', 'KAS'],
        includeKissinger: false,
        minR2Warning: 0.98,
      },
    },
  );
  return { ingestion, report };
}

function withoutVolatileFields<T extends { generatedAt: string }>(value: T): Omit<T, 'generatedAt'> {
  const copy = structuredClone(value);
  delete (copy as Partial<T>).generatedAt;
  return copy;
}

describe('authoritative report contract', () => {
  it('pins schema v6 to scientific disposition, stage identity, and exact boundary-anchor provenance', () => {
    expect(projectReportSchema.$id).toBe(
      'https://activation-energy-studio.local/schema/project-report-v7.json',
    );
    expect(projectReportSchema.properties.schemaVersion.const).toBe(
      'activation-energy-studio/project-report/v7',
    );
    expect(projectReportSchema.$defs.result.required).toEqual(
      expect.arrayContaining(['status', 'disposition']),
    );
    expect(projectReportSchema.$defs.scientificDisposition.enum).toEqual([
      'REPORTABLE',
      'REPORTABLE_WITH_CAUTION',
      'CALCULATED_UNRELIABLE',
      'CALCULATION_REJECTED',
    ]);
    expect(
      projectReportSchema.$defs.scientificBoundary.properties.contextLabels.required,
    ).toContain('stage');
    expect(projectReportSchema.$defs.massNormalization.required).toEqual(
      expect.arrayContaining(['stageWindowCelsius', 'initialAnchor', 'finalAnchor']),
    );
    expect(projectReportSchema.$defs.stageBoundaryAnchor.required).toEqual([
      'temperatureCelsius',
      'method',
      'sourceRows',
    ]);
    expect(projectReportSchema.$defs.stageBoundaryAnchor.properties.method.enum).toEqual([
      'source-row',
      'linear-interpolation',
    ]);
    expect(projectReportSchema.$defs.stageBoundaryAnchor.properties.sourceRows).toMatchObject({
      minItems: 1,
      maxItems: 2,
    });
    expect(projectReportSchema.$defs.inputTable.required).toEqual(
      expect.arrayContaining(['textEncoding', 'headerRow']),
    );
    expect(
      projectReportSchema.$defs.inputTable.properties.mappings.items.properties.role.enum,
    ).toContain('stage');
  });

  it('validates a full fixture against the checked-in JSON Schema', async () => {
    const report = await makeReport();
    const validate = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(
      projectReportSchema,
    );
    const valid = validate(JSON.parse(serializeProjectReport(report)));
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull();
    expect(valid).toBe(true);
    expect(report.reproducibility.inputTables[0].mappings.length).toBeGreaterThan(0);
    expect(report.reproducibility.temperatureAtAlphaMatrix).toHaveLength(9);
    const fwoFormula = report.reproducibility.formulas.find((formula) => formula.method === 'FWO');
    expect(fwoFormula).toMatchObject({
      logBase: 'natural',
      approximationConstants: { doyleIntercept: -5.331, slopeCoefficient: 1.052 },
      modelEquation: 'ln(beta) = C_alpha - 5.331 - 1.052E/(RT)',
    });
  });

  it('retains TXT decoding/header provenance and validates a mapped stage role', async () => {
    const { ingestion, report } = await makePreambleTxtStageReport();
    const validate = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(
      projectReportSchema,
    );

    expect(ingestion.files[0].source).toMatchObject({
      fileType: 'txt',
      textEncoding: 'utf-8',
      headerRow: 1,
    });
    expect(report.reproducibility.inputTables[0]).toMatchObject({
      fileName: 'instrument-stage.txt',
      fileType: 'txt',
      textEncoding: 'utf-8',
      headerRow: 1,
    });
    expect(report.reproducibility.inputTables[0].mappings).toContainEqual(
      expect.objectContaining({
        role: 'stage',
        sourceHeader: 'Stage',
      }),
    );
    expect(validate(JSON.parse(serializeProjectReport(report)))).toBe(true);
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull();
  });

  it('uses one unrounded numeric result table for JSON and tidy CSV', async () => {
    const report = await makeReport();
    const parsed = Papa.parse<Record<string, string>>(createResultsCsv(report), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(report.results.length);

    parsed.data.forEach((csvRow, index) => {
      const jsonRow = report.results[index];
      expect(csvRow.resultId).toBe(jsonRow.resultId);
      expect(csvRow.resultType).toBe(jsonRow.resultType);
      expect(csvRow.formulaId).toBe(jsonRow.formulaId);
      expect(csvRow.quantity).toBe('apparent activation energy');
      expect(csvRow.status).toBe(jsonRow.status);
      expect(csvRow.disposition).toBe(jsonRow.disposition);
      for (const field of numericCsvFields) {
        const expected = jsonRow[field];
        expect(csvRow[field] === '' ? null : Number(csvRow[field]), field).toBe(expected);
      }
      const resultTrace = report.traceability.resultLinks.find(
        ({ resultId }) => resultId === jsonRow.resultId,
      );
      expect(JSON.parse(csvRow.sourceFilesJson)).toEqual(report.context.sourceFiles);
      expect(JSON.parse(csvRow.inputTablesJson)).toEqual(report.reproducibility.inputTables);
      expect(JSON.parse(csvRow.preprocessingJson)).toEqual(report.reproducibility.preprocessing);
      expect(JSON.parse(csvRow.includedObservationIdsJson)).toEqual(
        resultTrace?.includedObservationIds ?? [],
      );
      expect(JSON.parse(csvRow.regressionInputGroupIdsJson)).toEqual(
        resultTrace?.regressionInputGroupIds ?? [],
      );
      expect(JSON.parse(csvRow.exclusionsJson)).toEqual(resultTrace?.exclusions ?? []);
      expect(JSON.parse(csvRow.observationTraceJson)).toEqual(
        report.traceability.observationLinks.filter(({ observationId }) =>
          resultTrace?.includedObservationIds.includes(observationId)),
      );
      expect(JSON.parse(csvRow.traceabilityGapsJson)).toEqual(report.traceability.gaps);
    });

    const peak = report.results.find((result) => result.resultType === 'peak');
    expect(peak).toMatchObject({ method: 'KISSINGER', alpha: null });
  });

  it('is deterministic across independent runs after removing the explicit volatile allowlist', async () => {
    const first = await makeReport();
    const second = await makeReport();
    expect(REPORT_VOLATILE_FIELDS).toEqual(['generatedAt']);
    expect(first.reproducibility.volatileFields).toEqual(REPORT_VOLATILE_FIELDS);
    expect(withoutVolatileFields(first)).toEqual(withoutVolatileFields(second));
    expect(createResultsCsv(first)).toBe(createResultsCsv(second));
  });

  it('carries the apparent-Ea claim boundary and full context labels in JSON and CSV', async () => {
    const report = await makeReport();
    const json = serializeProjectReport(report);
    const csv = createResultsCsv(report);
    for (const output of [json, csv]) {
      expect(output).toContain('apparent activation energ');
      expect(output).toContain('not universal material constants');
      expect(output).toContain('do not prove a single-step mechanism');
      expect(output).toContain('synthetic-kas');
      expect(output).toContain('thermal decomposition');
      expect(output).toContain('full synthetic alpha range');
      expect(output).toContain('N2');
    }
    expect(report.scientificBoundary.statement).toBe(APPARENT_EA_CLAIM_BOUNDARY);
  });

  it('traverses every result to formula, included observations, and physical source rows', async () => {
    const report = await makeReport();
    const resultById = new Map(report.results.map((result) => [result.resultId, result]));
    const observationById = new Map(
      report.traceability.observationLinks.map((observation) => [
        observation.observationId,
        observation,
      ]),
    );

    expect(report.traceability.gaps).toEqual([]);
    expect(report.traceability.resultLinks).toHaveLength(report.results.length);
    for (const link of report.traceability.resultLinks) {
      const result = resultById.get(link.resultId);
      expect(result).toBeDefined();
      expect(link.formulaId).toBe(result?.formulaId);
      expect(link.includedObservationIds.length).toBe(result?.rawObservationCount);
      expect(link.regressionInputGroupIds.length).toBe(result?.n);
      for (const observationId of link.includedObservationIds) {
        const observation = observationById.get(observationId);
        expect(observation?.resultId).toBe(link.resultId);
        expect(observation?.decision).toBe('included');
        expect(observation?.sourceResolution).not.toBe('unresolved');
        if (link.resultType === 'peak') {
          expect(observation?.peakEvidence).toEqual(VERIFIED_BETA_TP_ROW_EVIDENCE);
        } else {
          expect(observation?.peakEvidence).toBeNull();
        }
        expect(observation?.sourceRows.length).toBeGreaterThan(0);
        for (const source of observation?.sourceRows ?? []) {
          expect(source.fileName).toBe('synthetic_kas_150.csv');
          expect(source.sourceRow).toBeGreaterThanOrEqual(2);
          expect(source.columnMappings.length).toBeGreaterThan(0);
          expect(
            source.columnMappings
              .filter((mapping) =>
                ['temperature', 'alpha', 'heatingRate'].includes(mapping.role),
              )
              .every((mapping) => mapping.sourceUnit !== null),
          ).toBe(true);
        }
      }
      expect(link.exclusions).toEqual([]);
    }
  });

  it('embeds the AC-REP-03 text contract and distinct scientific plots in the PDF', async () => {
    const report = await makeReport();
    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const unescapedPdfLiterals = binary.replace(/\\([()\\])/g, '$1');
    for (const marker of [
      'Isoconversional results',
      'Eligibility',
      'Eligibility decision:',
      'Method eligibility / retained results:',
      'retained isoconversional results=',
      'retained peak results=',
      'Apparent Ea(alpha) curve',
      'Regression diagnostic',
      'Residuals (y - fitted)',
      'Regression-only uncertainty',
      'Kissinger peak analysis (separate result)',
      'resultType=peak | alpha=null',
      'Scientific disposition:',
      'Input units and preprocessing',
      'Canonical units:',
      'Scientific boundary:',
      'not universal material constants',
      'do not prove a single-step mechanism',
    ]) {
      expect(unescapedPdfLiterals, marker).toContain(marker);
    }
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(25_000);
  });
});
