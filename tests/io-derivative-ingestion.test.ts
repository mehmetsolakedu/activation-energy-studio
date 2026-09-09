import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFile, ingestThermalFiles } from '../src/io';
import { createProjectReport } from '../src/report';
import projectReportSchema from '../src/report/project-report.schema.json';
import { createMinimalXlsxFile, type OoxmlCell } from './helpers/minimal-ooxml';

const BETAS = [5, 10, 20, 40] as const;
const ALPHAS = [0.4, 0.5, 0.6] as const;

function derivativePerMinute(beta: number, alpha: number): number {
  return 0.002 * beta * (1 + alpha);
}

function thermalRows(
  derivativeHeader: string,
  sourceDerivative: (perMinute: number) => number,
): OoxmlCell[][] {
  return [
    [
      'Temperature [K]',
      'Alpha [fraction]',
      'Heating rate [K/min]',
      'Run',
      derivativeHeader,
    ],
    ...BETAS.flatMap((beta) =>
      ALPHAS.map((alpha) => [
        500 + alpha * 100 + Math.log(beta) * 20,
        alpha,
        beta,
        `run-${beta}`,
        sourceDerivative(derivativePerMinute(beta, alpha)),
      ]),
    ),
  ];
}

function csvFromRows(rows: readonly (readonly OoxmlCell[])[]): string {
  return `${rows.map((row) => row.join(',')).join('\n')}\n`;
}

describe('direct dAlpha/dt CSV/XLSX ingestion', () => {
  it('normalizes an explicit CSV dAlpha/dt column and makes Friedman prefer the provided derivative', async () => {
    const rows = thermalRows('dα/dt [s⁻¹]', (perMinute) => perMinute / 60);
    const file = new File([csvFromRows(rows)], 'provided-derivative.csv', {
      type: 'text/csv',
    });
    const ingestion = await ingestThermalFiles([file]);

    expect(ingestion.status, JSON.stringify(ingestion.files[0]?.mappingNeeds)).toBe('ready');
    expect(ingestion.files[0]?.mappings).toContainEqual(expect.objectContaining({
      role: 'dAlphaDt',
      header: 'dα/dt [s⁻¹]',
      unit: 's^-1',
      confidence: 'exact',
    }));
    expect(ingestion.records[0]?.dAlphaDtPerMinute).toBeCloseTo(
      derivativePerMinute(BETAS[0], ALPHAS[0]),
      14,
    );
    expect(ingestion.records[0]?.provenance.columnMappings).toContainEqual(
      expect.objectContaining({
        role: 'dAlphaDt',
        sourceHeader: 'dα/dt [s⁻¹]',
        sourceUnit: 's^-1',
      }),
    );

    const adapted = buildThermalRuns(ingestion, undefined, 'provided-derivative stage');
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(BETAS.length);
    expect(adapted.runs[0]?.points[0]?.dAlphaDtPerMinute).toBeCloseTo(
      derivativePerMinute(BETAS[0], ALPHAS[0]),
      14,
    );

    const analysis = analyzeActivationEnergy(adapted.runs, {
      methods: ['FRIEDMAN'],
      alphaValues: [0.5],
      includeKissinger: false,
    });
    expect(analysis.status).not.toBe('refused');
    expect(analysis.preparedRuns.map(({ derivativeSource }) => derivativeSource))
      .toEqual(BETAS.map(() => 'provided'));
    expect(analysis.methods[0]?.estimates).toHaveLength(1);
    expect(analysis.warnings.map(({ code }) => code)).not.toContain('NUMERICAL_DERIVATIVE');
  });

  it('preserves a percent-per-minute derivative through a real two-sheet OOXML workbook and report audit', async () => {
    const rows = thermalRows('Conversion rate [%/min]', (perMinute) => perMinute * 100);
    const workbook = createMinimalXlsxFile([
      { name: 'Notes', rows: [['This sheet is intentionally not thermal data.']] },
      { name: 'Curves', rows },
    ], 'provided-derivative.xlsx');

    const unresolved = await ingestThermalFile(workbook);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.mappingNeeds).toContainEqual(expect.objectContaining({ kind: 'sheet' }));
    expect(unresolved.records).toEqual([]);

    const ingestion = await ingestThermalFiles([workbook], { sheet: 'Curves' });
    expect(ingestion.status, JSON.stringify(ingestion.files[0]?.mappingNeeds)).toBe('ready');
    expect(ingestion.files[0]?.source.sheetName).toBe('Curves');
    expect(ingestion.files[0]?.mappings).toContainEqual(expect.objectContaining({
      role: 'dAlphaDt',
      header: 'Conversion rate [%/min]',
      unit: '%/min',
      confidence: 'exact',
    }));
    expect(ingestion.records[0]?.dAlphaDtPerMinute).toBeCloseTo(
      derivativePerMinute(BETAS[0], ALPHAS[0]),
      14,
    );
    expect(ingestion.records[0]?.provenance).toEqual(expect.objectContaining({
      fileName: 'provided-derivative.xlsx',
      sheetName: 'Curves',
      sourceRow: 2,
    }));

    const adapted = buildThermalRuns(ingestion, undefined, 'provided-derivative stage');
    const analysis = analyzeActivationEnergy(adapted.runs, {
      methods: ['FRIEDMAN'],
      alphaValues: [0.5],
      includeKissinger: false,
    });
    expect(analysis.status).not.toBe('refused');
    expect(analysis.preparedRuns.every(({ derivativeSource }) => derivativeSource === 'provided'))
      .toBe(true);

    const report = createProjectReport(analysis, {
      projectName: 'Provided derivative provenance',
      sourceFiles: [{
        name: 'provided-derivative.xlsx',
        sizeBytes: workbook.size,
        sha256: 'a'.repeat(64),
      }],
    }, {
      ingestion,
      ingestionOptions: { sheet: 'Curves' },
      analysisConfiguration: {
        methods: ['FRIEDMAN'],
        includeKissinger: false,
      },
    });
    expect(report.reproducibility.inputTables[0]?.mappings).toContainEqual(
      expect.objectContaining({
        role: 'dAlphaDt',
        sourceUnit: '%/min',
        canonicalUnit: 'min^-1',
        conversion: '%/min -> min^-1',
      }),
    );
    expect(report.reproducibility.preprocessing.derivativeSources)
      .toEqual(BETAS.map((beta) => ({ runId: `run-${beta}`, source: 'provided' })));
    expect(
      report.traceability.observationLinks.every(({ sourceRows }) =>
        sourceRows.every(({ columnMappings }) =>
          columnMappings.some(({ role }) => role === 'dAlphaDt'))),
    ).toBe(true);
    const validate = new Ajv({ strict: false }).compile(projectReportSchema);
    expect(validate(report), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('does not silently reinterpret a generic DTG mass-rate column as dAlpha/dt', async () => {
    const rows = thermalRows('DTG [%/min]', (perMinute) => perMinute * 100);
    const file = new File([csvFromRows(rows)], 'generic-dtg.csv', { type: 'text/csv' });

    const automatic = await ingestThermalFile(file);
    expect(automatic.status).toBe('ready');
    expect(automatic.mappings.some(({ role }) => role === 'dAlphaDt')).toBe(false);
    expect(automatic.records.every(({ dAlphaDtPerMinute }) => dAlphaDtPerMinute === undefined))
      .toBe(true);

    const unitUnresolved = await ingestThermalFile(file, {
      columnMapping: { dAlphaDt: 4 },
    });
    expect(unitUnresolved.status).toBe('needs_mapping');
    expect(unitUnresolved.records).toEqual([]);
    expect(unitUnresolved.mappingNeeds).toContainEqual(expect.objectContaining({
      kind: 'unit',
      role: 'dAlphaDt',
    }));

    const explicitlyMapped = await ingestThermalFile(file, {
      columnMapping: {
        dAlphaDt: { column: 4, unit: '%/min' },
      },
    });
    expect(explicitlyMapped.status).toBe('ready');
    expect(explicitlyMapped.mappings).toContainEqual(expect.objectContaining({
      role: 'dAlphaDt',
      unit: '%/min',
      confidence: 'manual',
    }));
    expect(explicitlyMapped.records[0]?.dAlphaDtPerMinute).toBeCloseTo(
      derivativePerMinute(BETAS[0], ALPHAS[0]),
      14,
    );
  });

  it.each(['mg/min', 'K/min'])(
    'fails closed when an explicit dAlpha/dt header carries incompatible unit %s',
    async (invalidUnit) => {
      const rows = thermalRows(`dα/dt [${invalidUnit}]`, (perMinute) => perMinute);
      const result = await ingestThermalFile(
        new File([csvFromRows(rows)], 'invalid-derivative-unit.csv', { type: 'text/csv' }),
      );

      expect(result.status).toBe('needs_mapping');
      expect(result.records).toEqual([]);
      expect(result.mappingNeeds).toContainEqual(expect.objectContaining({
        kind: 'unit',
        role: 'dAlphaDt',
        allowedValues: ['min^-1', 's^-1', '%/min', '%/s'],
      }));
    },
  );

  it('preserves nonpositive supplied values for the existing alpha-specific Friedman refusal', async () => {
    const rows = thermalRows('dα/dt [min^-1]', (perMinute) => perMinute);
    for (const row of rows.slice(1)) {
      const alpha = Number(row[1]);
      const beta = Number(row[2]);
      if (alpha === 0.5 && beta >= 20) row[4] = beta === 20 ? 0 : -0.01;
    }
    const ingestion = await ingestThermalFiles([
      new File([csvFromRows(rows)], 'nonpositive-provided-derivative.csv', {
        type: 'text/csv',
      }),
    ]);

    expect(ingestion.status).toBe('ready');
    expect(ingestion.records.filter(({ alpha }) => alpha === 0.5).map(
      ({ dAlphaDtPerMinute }) => dAlphaDtPerMinute,
    )).toEqual([
      derivativePerMinute(5, 0.5),
      derivativePerMinute(10, 0.5),
      0,
      -0.01,
    ]);

    const analysis = analyzeActivationEnergy(
      buildThermalRuns(ingestion, undefined, 'provided-derivative stage').runs,
      {
      methods: ['FRIEDMAN'],
      alphaValues: [0.5],
      includeKissinger: false,
      },
    );
    expect(analysis.preparedRuns.every(({ derivativeSource }) => derivativeSource === 'provided'))
      .toBe(true);
    expect(analysis.methods[0]?.status).toBe('refused');
    expect(analysis.methods[0]?.warnings).toContainEqual(expect.objectContaining({
      code: 'FRIEDMAN_NON_POSITIVE_RATE',
      alpha: 0.5,
      runIds: ['run-20', 'run-40'],
    }));
    expect(analysis.methods[0]?.refusals).toContainEqual(expect.objectContaining({
      code: 'FRIEDMAN_DERIVATIVE_UNAVAILABLE',
      alpha: 0.5,
    }));
  });
});
