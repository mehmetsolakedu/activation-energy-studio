import { describe, expect, it } from 'vitest';

import {
  REAL_EXAMPLE_ALPHA_GRIDS,
  REAL_EXAMPLES,
  createRealExampleSession,
  type RealExampleId,
} from '../src/examples/catalog';
import { ingestThermalFiles } from '../src/io';

const EXPECTED_IDS = [
  'chilean-oak-raw',
  'paper010-supplied-dalpha-dt',
  'paper063-kissinger-beta-tp',
] as const satisfies readonly RealExampleId[];

describe('licensed real-example catalog', () => {
  it('exposes three stable, English, method-specific definitions', () => {
    expect(REAL_EXAMPLES.map(({ id }) => id)).toEqual(EXPECTED_IDS);
    expect(new Set(REAL_EXAMPLES.map(({ id }) => id)).size).toBe(3);

    for (const definition of REAL_EXAMPLES) {
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.project.length).toBeGreaterThan(0);
      expect(definition.process.length).toBeGreaterThan(0);
      expect(definition.stage.length).toBeGreaterThan(0);
      expect(definition.license.spdx).toBe('CC-BY-4.0');
      expect(definition.citation.url).toBe(`https://doi.org/${definition.citation.doi}`);
      expect(definition.boundary.length).toBeGreaterThan(80);
      expect(definition.methods.length).toBeGreaterThan(0);
    }

    const peak = REAL_EXAMPLES.find(
      ({ id }) => id === 'paper063-kissinger-beta-tp',
    );
    expect(peak).toMatchObject({
      resultType: 'peak',
      alphaStart: null,
      alphaEnd: null,
      alphaStep: null,
      methods: ['KISSINGER'],
      license: {
        separateDatasetLicense: null,
      },
    });
    expect(peak?.license.scope).toContain('no separate raw-dataset license');
  });

  it('creates fresh browser Files and independently cloned options per session', () => {
    const first = createRealExampleSession('paper010-supplied-dalpha-dt');
    const second = createRealExampleSession('paper010-supplied-dalpha-dt');

    expect(first.definition).toBe(second.definition);
    expect(first.files).not.toBe(second.files);
    expect(first.files[0]).not.toBe(second.files[0]);
    expect(first.files[0]?.name).toBe('paper010_rh_t_alpha_beta.csv');
    expect(first.options).not.toBe(second.options);
    expect(first.options[0]).not.toBe(second.options[0]);
    expect(first.options[0]?.columnMapping).not.toBe(
      second.options[0]?.columnMapping,
    );
  });

  it('ingests the four exact Chilean Oak source exports with the proven wide mappings', async () => {
    const session = createRealExampleSession('chilean-oak-raw');
    const ingestion = await ingestThermalFiles(session.files, session.options);

    expect(session.files.map(({ name }) => name)).toEqual([
      'TGA-Oak-5Kmin-1.csv',
      'TGA-Oak-10Kmin-1.csv',
      'TGA-Oak-20Kmin-1.csv',
      'TGA-Oak-40Kmin-1.csv',
    ]);
    expect(session.options).toHaveLength(4);
    expect(session.options.every(
      ({ layout, wideScopeConfirmed, wideAlphaGrid }) =>
        layout === 'wide-series'
        && wideScopeConfirmed === true
        && JSON.stringify(wideAlphaGrid)
          === JSON.stringify(REAL_EXAMPLE_ALPHA_GRIDS['chilean-oak-raw']),
    )).toBe(true);
    expect(ingestion.status, JSON.stringify(ingestion.diagnostics, null, 2))
      .toBe('ready');
    expect(ingestion.records).toHaveLength(68);
    expect(ingestion.tables.tAlphaBeta).toHaveLength(68);
    expect(ingestion.wideSeriesAudit).toHaveLength(4);
  });

  it('ingests the Paper010 supplied dAlpha/dt fixture with explicit long-table mappings', async () => {
    const session = createRealExampleSession('paper010-supplied-dalpha-dt');
    const ingestion = await ingestThermalFiles(session.files, session.options);

    expect(REAL_EXAMPLE_ALPHA_GRIDS['paper010-supplied-dalpha-dt'])
      .toEqual(Array.from(
        { length: 16 },
        (_, index) => Number(((index + 1) * 0.05).toFixed(2)),
      ));
    expect(ingestion.status, JSON.stringify(ingestion.diagnostics, null, 2))
      .toBe('ready');
    expect(ingestion.records).toHaveLength(48);
    expect(ingestion.tables.tAlphaBeta).toHaveLength(48);
    expect(ingestion.records.every(
      ({ dAlphaDtPerMinute }) => dAlphaDtPerMinute !== undefined,
    )).toBe(true);
    expect(new Set(ingestion.records.map(({ heatingRateKPerMin }) =>
      heatingRateKPerMin))).toEqual(new Set([5, 10, 20]));
  });

  it('ingests Paper063 only as a separate beta–Tp peak table', async () => {
    const session = createRealExampleSession('paper063-kissinger-beta-tp');
    const ingestion = await ingestThermalFiles(session.files, session.options);

    expect(ingestion.status, JSON.stringify(ingestion.diagnostics, null, 2))
      .toBe('ready');
    expect(ingestion.records).toHaveLength(5);
    expect(ingestion.tables.tAlphaBeta).toEqual([]);
    expect(ingestion.tables.betaTp).toHaveLength(5);
    expect(ingestion.tables.betaTp.map(({ peakTemperatureK }) =>
      peakTemperatureK)).toEqual([681, 707, 721, 731, 737]);
  });
});
