import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns, type StageWindow } from '../src/integration';
import { ingestThermalFiles, type IngestionOptions } from '../src/io';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIRECTORY = path.resolve(TEST_DIRECTORY, './study-inputs');

function fixtureFile(fileName: string): File {
  const content = readFileSync(path.resolve(BUNDLE_DIRECTORY, fileName));
  const type = fileName.endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv';
  if (fileName !== 'C1_peaks.tsv') return new File([content], fileName, { type });
  // The retained v0.3.1 study artifact is immutable. Add candidate-only,
  // explicit peak-quality evidence in memory for this current-contract test.
  const rows = content.toString('utf8').trimEnd().split(/\r?\n/u);
  const verifiedRows = rows.map((row, index) => index === 0
    ? `${row}\tPeak resolved\tPeak quality\tPeak source signal\tAnalyst confirmed\tPeak ambiguous`
    : `${row}\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse`);
  return new File([`${verifiedRows.join('\n')}\n`], fileName, { type });
}

async function scientificCodes(
  fileNames: readonly string[],
  stageWindow?: StageWindow,
): Promise<{ codes: string[]; analysis?: ReturnType<typeof analyzeActivationEnergy> }> {
  const ingestion = await ingestThermalFiles(fileNames.map(fixtureFile));
  const adapted = buildThermalRuns(ingestion, stageWindow, 'usability fixture stage');
  const analysis = adapted.runs.length === 0
    ? undefined
    : analyzeActivationEnergy(adapted.runs, {
        methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
        includeKissinger: ingestion.tables.betaTp.length >= 3,
        minR2Warning: 0.98,
      });
  return {
    codes: [
      ...ingestion.diagnostics.map(({ code }) => code),
      ...adapted.diagnostics.map(({ code }) => code),
      ...(analysis?.refusals.map(({ code }) => code) ?? []),
      ...(analysis?.warnings.map(({ code }) => code) ?? []),
    ],
    analysis,
  };
}

describe('guided ingestion and diagnostic scenario bundle', () => {
  it('keeps the happy-path input ambiguous until the analyst confirms columns and units', async () => {
    const ingestion = await ingestThermalFiles([fixtureFile('UX01_four_run_mass_ambiguous.csv')]);

    expect(ingestion.status).toBe('needs_mapping');
    expect(ingestion.records).toEqual([]);
    expect(ingestion.files[0]?.mappingNeeds.map(({ kind }) => kind)).toContain('unit');
  });

  it('prechecks the exact guided choices through mass-to-alpha conversion and method results', async () => {
    const options: IngestionOptions = {
      tableKind: 'curve',
      columnMapping: {
        temperature: { column: 0, unit: 'C', temperatureKind: 'sample' },
        massPercent: { column: 1, unit: '%' },
        heatingRate: { column: 2, unit: 'K/min' },
        run: 3,
        sample: 4,
        atmosphere: 5,
      },
    };
    const ingestion = await ingestThermalFiles(
      [fixtureFile('UX01_four_run_mass_ambiguous.csv')],
      [options],
    );
    const adapted = buildThermalRuns(ingestion, { startCelsius: 300, endCelsius: 380 });
    const analysis = analyzeActivationEnergy(adapted.runs, {
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: false,
      minR2Warning: 0.98,
    });

    expect(ingestion.status).toBe('ready');
    expect(adapted.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(analysis.status).not.toBe('refused');
    expect(analysis.methods).toHaveLength(4);
    expect(analysis.methods.every(({ estimates }) => estimates.length > 0)).toBe(true);
  });

  it.each([
    ['R1_two_rates.csv', 'INSUFFICIENT_DISTINCT_HEATING_RATES'],
    ['R2_no_common_alpha.csv', 'NO_COMMON_ALPHA_RANGE'],
    ['R3_nonmonotonic_alpha.csv', 'NON_MONOTONIC_ALPHA'],
    ['R4_context_conflict.csv', 'INCONSISTENT_CONTEXT'],
    ['R5_nonlinear_time.csv', 'NONLINEAR_HEATING_UNSUPPORTED'],
  ])('prechecks %s against its exact refusal code', async (fileName, expectedCode) => {
    const { codes, analysis } = await scientificCodes([fileName]);

    expect(codes).toContain(expectedCode);
    expect(analysis?.methods ?? []).toEqual([]);
  });

  it.each([
    ['W1_three_rates.csv', 'LIMITED_HEATING_RATES'],
    ['W2_synthetic_kas_150.csv', 'NUMERICAL_DERIVATIVE'],
    ['W3_low_r2.csv', 'LOW_R2'],
    ['W4_multistep.csv', 'MULTISTEP_EA_VARIATION'],
  ])('prechecks %s against its exact warning code', async (fileName, expectedCode) => {
    const { codes, analysis } = await scientificCodes([fileName]);

    expect(codes).toContain(expectedCode);
    expect(analysis?.methods.some(({ estimates }) => estimates.length > 0)).toBe(true);
  });

  it('produces distinct isoconversional and peak-specific result types for the comprehension task', async () => {
    const { analysis } = await scientificCodes([
      'W2_synthetic_kas_150.csv',
      'C1_peaks.tsv',
    ]);

    expect(analysis?.methods.some(({ estimates }) => estimates.length > 0)).toBe(true);
    expect(analysis?.kissinger?.resultType).toBe('peak');
    expect(analysis?.kissinger?.alpha).toBeNull();
  });
});
