import { describe, expect, it } from 'vitest';

import {
  detectColumnMappings,
  ingestThermalFile,
  ingestThermalFiles,
  normalizeThermalTable,
} from '../src/io';
import ambiguousCsv from './fixtures/bare_ambiguous.csv?raw';
import filenameRateCsv from './fixtures/filename_rate_curve.csv?raw';
import multirateCsv from './fixtures/multirate_semicolon.csv?raw';
import peakTsv from './fixtures/peak_table.tsv?raw';

describe('browser-side delimited ingestion', () => {
  it('detects semicolon CSV with comma decimals and emits canonical T-alpha-beta rows', async () => {
    const result = await ingestThermalFile(
      new File([multirateCsv], 'multirate.csv', { type: 'text/csv' }),
    );

    expect(result.status).toBe('ready');
    expect(result.source.delimiter).toBe(';');
    expect(result.source.decimalSeparator).toBe(',');
    expect(result.records).toHaveLength(4);
    expect(result.records[0]).toMatchObject({
      temperatureK: 373.15,
      alpha: 0.1,
      heatingRateKPerMin: 5,
      runId: 'run-5',
      sample: 'cellulose',
      atmosphere: 'N2',
    });
    expect(result.tables.tAlphaBeta).toHaveLength(4);
    expect(result.tables.betaTp).toHaveLength(0);
    expect(result.records[0].provenance).toMatchObject({
      fileName: 'multirate.csv',
      sourceRow: 2,
    });
  });

  it('turns an explicit Tp/beta TSV into a beta-Tp table', async () => {
    const result = await ingestThermalFile(
      new File([peakTsv], 'peaks.tsv', { type: 'text/tab-separated-values' }),
    );

    expect(result.status).toBe('ready');
    expect(result.tables.betaTp).toHaveLength(3);
    expect(result.tables.betaTp[0]).toMatchObject({
      peakTemperatureK: 621.2,
      heatingRateKPerMin: 5,
      runId: 'run-5',
    });
    expect(result.tables.tAlphaBeta).toHaveLength(0);
  });

  it('refuses bare scientific units until the user maps them', async () => {
    const file = new File([ambiguousCsv], 'ambiguous.csv', { type: 'text/csv' });
    const unresolved = await ingestThermalFile(file);

    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.records).toEqual([]);
    expect(unresolved.mappingNeeds.filter((need) => need.kind === 'unit').map((need) => need.role))
      .toEqual(expect.arrayContaining(['temperature', 'alpha', 'heatingRate']));

    const resolved = await ingestThermalFile(file, {
      columnMapping: {
        temperature: { column: 0, unit: 'K' },
        alpha: { column: 1, unit: 'fraction' },
        heatingRate: { column: 2, unit: 'K/min' },
      },
    });
    expect(resolved.status).toBe('ready');
    expect(resolved.tables.tAlphaBeta).toHaveLength(2);
  });

  it('uses only an unambiguous filename heating-rate token and records the inference', async () => {
    const result = await ingestThermalFile(
      new File([filenameRateCsv], 'cellulose_10Kmin.csv', { type: 'text/csv' }),
    );
    expect(result.status).toBe('ready');
    expect(result.records.every((record) => record.heatingRateKPerMin === 10)).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'heating_rate_inferred_from_filename',
      }),
    );
    expect(result.records[0].provenance.inferences?.[0]).toMatchObject({
      field: 'heatingRateKPerMin',
      source: 'filename',
      normalizedValue: 10,
      normalizedUnit: 'K/min',
    });

    const unresolved = await ingestThermalFile(
      new File([filenameRateCsv], 'cellulose.csv', { type: 'text/csv' }),
    );
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'column', role: 'heatingRate' }),
    );
  });

  it('keeps aggregate batch output empty if any file is unresolved', async () => {
    const result = await ingestThermalFiles([
      new File([multirateCsv], 'ready.csv'),
      new File([ambiguousCsv], 'unresolved.csv'),
    ]);
    expect(result.status).toBe('needs_mapping');
    expect(result.records).toEqual([]);
    expect(result.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
  });

  it('applies per-file mapping options by stable batch index', async () => {
    const files = [
      new File([ambiguousCsv], 'kelvin.csv'),
      new File([ambiguousCsv], 'celsius.csv'),
    ];
    const result = await ingestThermalFiles(files, [
      {
        columnMapping: {
          temperature: { column: 0, unit: 'K' },
          alpha: { column: 1, unit: 'fraction' },
          heatingRate: { column: 2, unit: 'K/min' },
        },
      },
      {
        columnMapping: {
          temperature: { column: 0, unit: 'C' },
          alpha: { column: 1, unit: '%' },
          heatingRate: { column: 2, unit: 'C/s' },
        },
      },
    ]);

    expect(result.status).toBe('ready');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].records[0]).toMatchObject({
      temperatureK: 400,
      alpha: 0.1,
      heatingRateKPerMin: 5,
    });
    expect(result.files[1].records[0]).toMatchObject({
      temperatureK: 673.15,
      alpha: 0.001,
      heatingRateKPerMin: 300,
    });
    expect(result.records).toHaveLength(4);
  });

  it('keeps the batch fail-closed when a per-file option is missing', async () => {
    const result = await ingestThermalFiles(
      [
        new File([ambiguousCsv], 'mapped.csv'),
        new File([ambiguousCsv], 'still-unresolved.csv'),
      ],
      [
        {
          columnMapping: {
            temperature: { column: 0, unit: 'K' },
            alpha: { column: 1, unit: 'fraction' },
            heatingRate: { column: 2, unit: 'K/min' },
          },
        },
      ],
    );

    expect(result.status).toBe('needs_mapping');
    expect(result.files.map((file) => file.status)).toEqual(['ready', 'needs_mapping']);
    expect(result.records).toEqual([]);
    expect(result.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
  });
});

describe('mapping and numeric diagnostics', () => {
  it('does not choose between duplicate temperature candidates', () => {
    const detected = detectColumnMappings([
      'Sample temperature [K]',
      'Furnace temperature [K]',
      'Alpha [0-1]',
      'beta [K/min]',
    ]);
    expect(detected.needs).toContainEqual(
      expect.objectContaining({
        kind: 'column',
        role: 'temperature',
        candidateColumns: [0, 1],
      }),
    );
  });

  it('refuses mixed decimal conventions instead of partially parsing rows', () => {
    const result = normalizeThermalTable(
      [
        ['Temperature [K]', 'Alpha [0-1]', 'beta [K/min]'],
        ['400,5', '0,1', '5'],
        ['425.5', '0.2', '5'],
      ],
      { fileName: 'mixed.csv', fileType: 'table' },
    );
    expect(result.status).toBe('needs_mapping');
    expect(result.records).toEqual([]);
    expect(result.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'decimal_separator' }),
    );
  });
});
