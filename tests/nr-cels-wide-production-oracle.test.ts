import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import {
  ingestThermalFiles,
  type IngestionOptions,
  type WideSeriesDefinition,
} from '../src/io';

const FIXTURE_ROOT = resolve('tests/fixtures/real/nr-cels');
const CURVE_ROOT = resolve(FIXTURE_ROOT, 'source/curves');
const ALPHA_GRID = Array.from(
  { length: 91 },
  (_, index) => (index + 5) / 100,
);
const RATES = [2, 4, 6, 8, 10, 20] as const;
const SAMPLES = [30, 45, 55] as const;
const ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL = 2e-9;
const REGRESSION_SLOPE_ABSOLUTE_TOLERANCE_K = 2e-7;
const REGRESSION_INTERCEPT_ABSOLUTE_TOLERANCE = 2e-10;
const REGRESSION_R_SQUARED_ABSOLUTE_TOLERANCE = 2e-12;
const PUBLICATION_RMSE_UPPER_BOUND_KJ_PER_MOL = {
  30: 4,
  45: 10,
  55: 10,
} as const;

interface CurveAudit {
  sample: number;
  rate: number;
  file: string;
  tgIndex: number;
  dtgIndex: number;
  minimumTGPercent: string;
  maximumTGPercent: string;
}

interface OracleRecord {
  alpha: string;
  activationEnergyKJPerMol: string;
  publishedActivationEnergyKJPerMol: string;
  regression: {
    n: number;
    slope: string;
    intercept: string;
    rSquared: string;
  };
}

interface OracleReference {
  classification: string;
  recipe: {
    publicationValuesAreHardRawPipelineOracle: boolean;
  };
  source: {
    curveAudits: CurveAudit[];
  };
  samples: Record<string, {
    methods: {
      DEPOSITED_DTG: {
        records: OracleRecord[];
        summary: {
          alphaCount: number;
          meanActivationEnergyKJPerMol: string;
          rmseVsPublishedKJPerMol: string;
        };
      };
    };
  }>;
}

const reference = JSON.parse(
  readFileSync(resolve(FIXTURE_ROOT, 'oracle/expected-output.json'), 'utf8'),
) as OracleReference;

function fileBuffer(path: string): ArrayBuffer {
  const source = readFileSync(path);
  const buffer = new ArrayBuffer(source.byteLength);
  new Uint8Array(buffer).set(source);
  return buffer;
}

function inputFor(audit: CurveAudit): {
  file: File;
  options: IngestionOptions;
} {
  const path = resolve(CURVE_ROOT, audit.file);
  const bytes = fileBuffer(path);
  const text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  const rows = text.split(/\r\n|\n|\r/u);
  const headerRow = rows.findIndex((row) => row.startsWith('Time(s)\t'));
  if (headerRow < 0) {
    throw new Error(`Instrument header not found: ${path}`);
  }
  const definition: WideSeriesDefinition = {
    seriesId: `nr-cels-${audit.sample}-${audit.rate}`,
    runId: `nr-cels-${audit.sample}-${audit.rate}`,
    temperature: { columnIndex: 1, unit: 'C' },
    signal: {
      kind: 'massPercent',
      columnIndex: audit.tgIndex,
      unit: '%',
      alphaReference: {
        initialValue: 100,
        finalValue: Number(audit.minimumTGPercent),
      },
    },
    derivative: {
      semantic: 'massChangeRate',
      valueColumnIndex: audit.dtgIndex,
      unit: '%/min',
    },
    heatingRate: { value: audit.rate, unit: 'K/min' },
    context: {
      sample: `NR-CELS ${audit.sample} phr`,
      atmosphere: 'Ar 6N',
      stage: 'alpha 0.05-0.95 using 100-to-minimum-TG anchors',
    },
  };
  return {
    file: new File([bytes], basename(path), { type: 'text/plain' }),
    options: {
      layout: 'wide-series',
      headerRow,
      delimiter: '\t',
      decimalSeparator: ',',
      wideSeries: [definition],
      wideAlphaGrid: ALPHA_GRID,
      wideScopeConfirmed: true,
    },
  };
}

async function analyzeSample(sample: (typeof SAMPLES)[number]) {
  const audits = reference.source.curveAudits
    .filter((audit) => audit.sample === sample)
    .sort((left, right) => left.rate - right.rate);
  const inputs = audits.map(inputFor);
  const ingestion = await ingestThermalFiles(
    inputs.map(({ file }) => file),
    inputs.map(({ options }) => options),
  );
  const adapted = buildThermalRuns(ingestion);
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: ALPHA_GRID,
    methods: ['FRIEDMAN'],
    includeKissinger: false,
  });
  return { audits, ingestion, adapted, analysis };
}

describe('NR-CELS wide-series production comparison with the independent dTG oracle', () => {
  it.each(SAMPLES)(
    'matches all 91 deposited-dTG Friedman values for NR-CELS %i',
    async (sample) => {
      const { audits, ingestion, adapted, analysis } = await analyzeSample(sample);

      expect(ingestion.status).toBe('ready');
      expect(ingestion.files).toHaveLength(6);
      expect(ingestion.files.every(
        (file) => file.source.textEncoding === 'utf-16le',
      )).toBe(true);
      expect(
        ingestion.diagnostics.filter(({ severity }) => severity === 'error'),
      ).toEqual([]);
      expect(ingestion.records).toHaveLength(6 * ALPHA_GRID.length);
      expect(ingestion.wideSeriesAudit).toHaveLength(6);
      expect(ingestion.wideSeriesAudit?.every(
        (audit) =>
          audit.scopeConfirmed
          && audit.projectedPointCount === ALPHA_GRID.length
          && audit.series[0]?.signal.kind === 'massPercent'
          && audit.series[0]?.derivative?.semantic === 'massChangeRate',
      )).toBe(true);

      const expectedExcursionFiles = audits
        .filter((audit) => Number(audit.maximumTGPercent) > 100)
        .map(({ file }) => file)
        .sort();
      const actualExcursionFiles = ingestion.diagnostics
        .filter(
          ({ code }) => code === 'WIDE_MASS_REFERENCE_EXCURSION_OUTSIDE_BRANCH',
        )
        .map(({ sourceFile }) => sourceFile)
        .filter((file): file is string => file !== undefined)
        .sort();
      expect(actualExcursionFiles).toEqual(expectedExcursionFiles);

      expect(adapted.diagnostics).toEqual([]);
      expect(adapted.runs).toHaveLength(RATES.length);
      expect(analysis.refusals).toEqual([]);
      expect(analysis.preparedRuns).toHaveLength(RATES.length);
      expect(analysis.preparedRuns.every(
        ({ derivativeSource }) => derivativeSource === 'provided',
      )).toBe(true);
      expect(analysis.warnings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'NUMERICAL_DERIVATIVE' }),
        ]),
      );

      const friedman = analysis.methods.find(
        ({ method }) => method === 'FRIEDMAN',
      );
      expect(friedman?.status).toBe('success');
      expect(friedman?.estimates).toHaveLength(ALPHA_GRID.length);
      const expectedRecords =
        reference.samples[String(sample)]!.methods.DEPOSITED_DTG.records;
      const expectedSummary =
        reference.samples[String(sample)]!.methods.DEPOSITED_DTG.summary;
      expect(expectedRecords).toHaveLength(ALPHA_GRID.length);
      friedman!.estimates.forEach((estimate, index) => {
        const expected = expectedRecords[index]!;
        expect(estimate.alpha).toBeCloseTo(Number(expected.alpha), 14);
        expect(
          Math.abs(
            estimate.activationEnergyKJPerMol
            - Number(expected.activationEnergyKJPerMol),
          ),
        ).toBeLessThanOrEqual(ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL);
        expect(estimate.regression.n).toBe(expected.regression.n);
        expect(estimate.regression.rawObservationCount).toBe(6);
        expect(estimate.regression.residualDegreesOfFreedom).toBe(4);
        expect(estimate.regression.inputAggregation).toBe('none');
        expect(
          Math.abs(
            estimate.regression.slope - Number(expected.regression.slope),
          ),
        ).toBeLessThanOrEqual(REGRESSION_SLOPE_ABSOLUTE_TOLERANCE_K);
        expect(
          Math.abs(
            estimate.regression.intercept
            - Number(expected.regression.intercept),
          ),
        ).toBeLessThanOrEqual(REGRESSION_INTERCEPT_ABSOLUTE_TOLERANCE);
        expect(
          Math.abs(
            estimate.regression.r2 - Number(expected.regression.rSquared),
          ),
        ).toBeLessThanOrEqual(REGRESSION_R_SQUARED_ABSOLUTE_TOLERANCE);
      });

      expect(reference.classification).toBe('diagnostic-reconstruction');
      expect(
        reference.recipe.publicationValuesAreHardRawPipelineOracle,
      ).toBe(false);
      expect(expectedSummary.alphaCount).toBe(91);
      const productionMean = friedman!.estimates.reduce(
        (sum, estimate) => sum + estimate.activationEnergyKJPerMol,
        0,
      ) / friedman!.estimates.length;
      expect(
        Math.abs(
          productionMean - Number(expectedSummary.meanActivationEnergyKJPerMol),
        ),
      ).toBeLessThanOrEqual(ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL);
      const productionRmseVsDeposited = Math.sqrt(
        friedman!.estimates.reduce((sum, estimate, index) => {
          const deposited = Number(
            expectedRecords[index]!.publishedActivationEnergyKJPerMol,
          );
          return sum + (estimate.activationEnergyKJPerMol - deposited) ** 2;
        }, 0) / friedman!.estimates.length,
      );
      expect(
        Math.abs(
          productionRmseVsDeposited
          - Number(expectedSummary.rmseVsPublishedKJPerMol),
        ),
      ).toBeLessThanOrEqual(ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL);
      expect(productionRmseVsDeposited).toBeLessThanOrEqual(
        PUBLICATION_RMSE_UPPER_BOUND_KJ_PER_MOL[sample],
      );
    },
  );
});
