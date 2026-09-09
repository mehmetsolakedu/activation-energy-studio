import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns, type StageWindow } from '../src/integration';
import { ingestThermalFiles, type IngestionOptions } from '../src/io';
import {
  buildUsabilityFixtureBundle,
  checkUsabilityFixtureBundle,
  UX_FIXTURE_MANIFEST_PATH,
  UX_STUDY_VERSION,
} from '../scripts/generate-usability-fixtures.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const BUNDLE_DIRECTORY = path.resolve(PROJECT_ROOT, 'evidence/usability/v0.3.1/study_bundle');

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function fixtureFile(fileName: string): File {
  const content = readFileSync(path.resolve(BUNDLE_DIRECTORY, fileName));
  const type = fileName.endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv';
  return new File([content], fileName, { type });
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

describe('locked usability-study fixture bundle', () => {
  it('is deterministic, byte-current and hashes all eleven retained fixtures', () => {
    const expected = buildUsabilityFixtureBundle(PROJECT_ROOT);
    const current = checkUsabilityFixtureBundle(PROJECT_ROOT);
    const manifestBytes = readFileSync(path.resolve(PROJECT_ROOT, UX_FIXTURE_MANIFEST_PATH));
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as typeof current.manifest;

    expect(current.manifest).toStrictEqual(expected.manifest);
    expect(manifest.studyVersion).toBe(UX_STUDY_VERSION);
    expect(manifest.release.path).toBe(
      'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
    );
    expect(manifest.fixtures).toHaveLength(11);
    for (const fixture of manifest.fixtures) {
      const content = readFileSync(path.resolve(PROJECT_ROOT, fixture.path));
      expect(content.byteLength).toBe(fixture.bytes);
      expect(sha256(content)).toBe(fixture.sha256);
    }
    expect(manifest.boundary).toContain('not participant evidence');
  });

  it('routes every active usability command away from the historical v0.2 contract', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(PROJECT_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    for (const command of [
      'fixtures:usability',
      'verify:usability-fixtures',
      'capture:warning-visibility',
      'verify:warning-visibility',
      'record:usability-study',
    ]) {
      expect(packageJson.scripts[command]).toBeTypeOf('string');
      expect(packageJson.scripts[command]).not.toContain('v0.2.0');
    }
  });

  it('keeps the happy-path fixture ambiguous until the participant confirms columns and units', async () => {
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
