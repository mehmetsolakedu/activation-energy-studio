import { beforeEach, describe, expect, it, vi } from 'vitest';

const readXlsxFileMock = vi.hoisted(() => vi.fn());

vi.mock('read-excel-file/browser', () => ({ default: readXlsxFileMock }));

import {
  ingestThermalFile,
  ingestThermalFiles,
  type IngestionOptions,
  type WideSeriesDefinition,
} from '../src/io';

const wideDefinition: WideSeriesDefinition = {
  seriesId: 'rh-10',
  runId: 'run-10',
  temperature: { columnIndex: 0, unit: 'C' },
  signal: {
    kind: 'massPercent',
    columnIndex: 1,
    unit: '%',
    alphaReference: { initialValue: 100, finalValue: 0 },
  },
  derivative: {
    semantic: 'massChangeRate',
    valueColumnIndex: 3,
    unit: '%/min',
    temperatureColumn: { columnIndex: 2, unit: 'C' },
  },
  heatingRate: { value: 10, unit: 'K/min' },
  context: {
    sample: 'Rice husk',
    atmosphere: 'Nitrogen',
    stage: 'Main devolatilization',
  },
};

const table = [
  [
    'TG temperature',
    'TG mass',
    'DTG temperature',
    'Signed dm/dt',
    'Excluded notes',
    'Late excluded',
  ],
  [100, 100, 100, -10, 'not in scope', null],
  [110, 75, 110, -20, 'not in scope', null],
  [120, 50, 120, -30, null, null],
  [130, 25, 130, -40, null, null],
  [140, 0, 140, -50, null, 'appears after preview'],
];

function readyOptions(): IngestionOptions {
  return {
    layout: 'wide-series',
    headerRow: 0,
    decimalSeparator: '.',
    wideSeries: [wideDefinition],
    wideAlphaGrid: [0.3, 0.5, 0.7],
    wideScopeConfirmed: true,
    previewRows: 2,
  };
}

describe('wide-series XLSX ingestion integration', () => {
  beforeEach(() => {
    readXlsxFileMock.mockReset();
    readXlsxFileMock.mockResolvedValue([{ sheet: 'Fig.2.', data: table }]);
  });

  it('keeps absent or invalid explicit configuration in recoverable mapping state', async () => {
    const file = new File(['mock workbook'], 'wide.xlsx');
    const beforeLayoutSelection = await ingestThermalFile(file, {
      headerRow: 0,
      previewRows: 2,
    });
    expect(beforeLayoutSelection.preview.flat()).not.toContain('appears after preview');
    expect(beforeLayoutSelection.populatedColumns).toContainEqual({
      columnIndex: 5,
      header: 'Late excluded',
      populatedRowCount: 1,
      firstSourceRow: 6,
      lastSourceRow: 6,
    });

    const missing = await ingestThermalFile(file, {
      layout: 'wide-series',
      previewRows: 2,
    });
    expect(missing.status).toBe('needs_mapping');
    expect(missing.records).toEqual([]);
    expect(missing.diagnostics).toEqual([]);
    expect(missing.preview).toHaveLength(2);
    expect(missing.preview.flat()).not.toContain('appears after preview');
    expect(missing.populatedColumns).toContainEqual({
      columnIndex: 5,
      header: 'Late excluded',
      populatedRowCount: 1,
      firstSourceRow: 6,
      lastSourceRow: 6,
    });
    expect(missing.mappingNeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'wide_series' }),
        expect.objectContaining({ kind: 'scope_confirmation' }),
      ]),
    );

    const invalidGrid = await ingestThermalFile(file, {
      ...readyOptions(),
      wideAlphaGrid: [0.5, 0.4],
    });
    expect(invalidGrid.status).toBe('needs_mapping');
    expect(invalidGrid.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'wide_series' }),
    );

    const missingScope = await ingestThermalFile(file, {
      ...readyOptions(),
      wideScopeConfirmed: false,
    });
    expect(missingScope.status).toBe('needs_mapping');
    expect(missingScope.mappingNeeds).toEqual([
      expect.objectContaining({ kind: 'scope_confirmation' }),
    ]);

    const invalidDefinition = await ingestThermalFile(file, {
      ...readyOptions(),
      wideSeries: [{
        ...wideDefinition,
        temperature: { columnIndex: 99, unit: 'C' },
      }],
    });
    expect(invalidDefinition.status).toBe('error');
    expect(invalidDefinition.populatedColumns).toContainEqual(
      expect.objectContaining({
        columnIndex: 5,
        header: 'Late excluded',
        firstSourceRow: 6,
      }),
    );
  });

  it('projects canonical records and retains primary plus derivative source-row contributors', async () => {
    const result = await ingestThermalFile(
      new File(['mock workbook'], 'wide.xlsx'),
      readyOptions(),
    );

    expect(result.status).toBe('ready');
    expect(result.source).toMatchObject({
      fileName: 'wide.xlsx',
      sheetName: 'Fig.2.',
      decimalSeparator: '.',
    });
    expect(result.records).toHaveLength(3);
    expect(result.tables.tAlphaBeta).toHaveLength(3);
    expect(result.tables.betaTp).toEqual([]);
    expect(result.populatedColumns).toContainEqual({
      columnIndex: 5,
      header: 'Late excluded',
      populatedRowCount: 1,
      firstSourceRow: 6,
      lastSourceRow: 6,
    });
    expect(result.records.map(({ temperatureK }) => temperatureK)).toEqual([
      385.15,
      393.15,
      401.15,
    ]);
    expect(result.records.map(({ dAlphaDtPerMinute }) => dAlphaDtPerMinute)).toEqual([
      0.22,
      0.3,
      0.38,
    ]);
    expect(result.records.map(({ provenance }) => provenance.sourceRows)).toEqual([
      [3, 4],
      [4],
      [4, 5],
    ]);
    expect(result.records.map(({ provenance }) => provenance.derivativeSourceRows)).toEqual([
      [3, 4],
      [4],
      [4, 5],
    ]);
    expect(result.records[0].provenance).toMatchObject({
      sourceRow: 3,
      fileName: 'wide.xlsx',
      sheetName: 'Fig.2.',
    });
    expect(result.records[0].provenance.columnMappings).toContainEqual(
      expect.objectContaining({
        role: 'dAlphaDt',
        sourceColumnIndex: 3,
        sourceUnit: '%/min',
      }),
    );
    expect(result.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'massPercent', columnIndex: 1, unit: '%' }),
        expect.objectContaining({ role: 'dAlphaDt', columnIndex: 3, unit: '%/min' }),
      ]),
    );

    expect(result.wideSeriesAudit).toMatchObject({
      layout: 'wide-series',
      source: {
        fileName: 'wide.xlsx',
        fileType: 'xlsx',
        sheetName: 'Fig.2.',
      },
      headerRow: 0,
      headerSourceRow: 1,
      alphaGrid: [0.3, 0.5, 0.7],
      rawObservationCount: 5,
      projectedPointCount: 3,
      scopeConfirmed: true,
      branches: [
        expect.objectContaining({
          sourceObservationCount: 5,
          selectedObservationCount: 3,
          startSourceRow: 3,
          endSourceRow: 5,
        }),
      ],
      excludedPopulatedColumns: [
        {
          columnIndex: 4,
          sourceHeader: 'Excluded notes',
          populatedRowCount: 2,
          firstSourceRow: 2,
          lastSourceRow: 3,
        },
        {
          columnIndex: 5,
          sourceHeader: 'Late excluded',
          populatedRowCount: 1,
          firstSourceRow: 6,
          lastSourceRow: 6,
        },
      ],
      points: [
        expect.objectContaining({
          alpha: 0.3,
          sourceRows: [3, 4],
          derivativeSourceRows: [3, 4],
        }),
        expect.objectContaining({ alpha: 0.5, sourceRows: [4] }),
        expect.objectContaining({ alpha: 0.7, sourceRows: [4, 5] }),
      ],
    });
    expect(result.wideSeriesAudit?.series[0]?.derivative).toMatchObject({
      semantic: 'massChangeRate',
      valueColumnIndex: 3,
      unit: '%/min',
    });
  });

  it('carries each successful wide audit into the batch result', async () => {
    const batch = await ingestThermalFiles(
      [new File(['mock workbook'], 'wide.xlsx')],
      readyOptions(),
    );
    expect(batch.status).toBe('ready');
    expect(batch.wideSeriesAudit).toHaveLength(1);
    expect(batch.wideSeriesAudit?.[0]?.projectedPointCount).toBe(3);
  });
});
