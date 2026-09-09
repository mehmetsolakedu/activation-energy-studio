import { describe, expect, it } from 'vitest';

import {
  normalizeWideSeriesTable,
  projectWideSeriesAtAlpha,
  projectWideSeriesTable,
  type IngestionSource,
  type RawTable,
  type WideSeriesDefinition,
  type WideSeriesTableOptions,
} from '../src/io';

const source: IngestionSource = {
  fileName: 'wide-source.xlsx',
  fileType: 'xlsx',
  sheetName: 'Data',
};

function alphaDefinition(
  overrides: Partial<WideSeriesDefinition> = {},
): WideSeriesDefinition {
  return {
    seriesId: 'series-1',
    runId: 'run-1',
    temperature: { columnIndex: 0, unit: 'C' },
    signal: { kind: 'alpha', columnIndex: 1, unit: 'fraction' },
    derivative: {
      semantic: 'dAlphaDt',
      valueColumnIndex: 3,
      unit: 'min^-1',
      temperatureColumn: { columnIndex: 2, unit: 'C' },
    },
    heatingRate: { value: 10, unit: 'K/min' },
    context: {
      sample: 'Test sample',
      atmosphere: 'Nitrogen',
      stage: 'Explicit stage',
    },
    ...overrides,
  };
}

function options(
  definition: WideSeriesDefinition = alphaDefinition(),
): WideSeriesTableOptions {
  return {
    headerRow: 0,
    decimalSeparator: '.',
    series: [definition],
  };
}

function diagnosticCodes(result: {
  diagnostics: readonly { code: string }[];
}): string[] {
  return result.diagnostics.map(({ code }) => code);
}

describe('explicit wide-series ingestion and branch policy', () => {
  it('preserves source rows and projects only the unique upward branch', () => {
    const table: RawTable = [
      ['TG temperature', 'alpha', 'DTG temperature', 'dAlpha/dt'],
      [100, 0, 100, 0.1],
      [110, 0.25, 110, 0.2],
      [120, 0.5, 120, 0.3],
      [130, 0.75, 130, 0.4],
      [140, 1, 140, 0.5],
    ];

    const normalized = normalizeWideSeriesTable(table, source, options());
    expect(normalized.status).toBe('ready');
    expect(normalized.dataset?.observations.map(({ sourceRow }) => sourceRow))
      .toEqual([2, 3, 4, 5, 6]);
    expect(normalized.dataset?.observations.map(({ derivativeSourceRow }) => derivativeSourceRow))
      .toEqual([2, 3, 4, 5, 6]);

    const projected = projectWideSeriesAtAlpha(
      normalized.dataset!,
      [0.25, 0.5, 0.75],
    );
    expect(projected.status).toBe('ready');
    expect(projected.projectedPoints.map(({ temperatureK }) => temperatureK))
      .toEqual([383.15, 393.15, 403.15]);
    expect(projected.projectedPoints.map(({ sourceRows }) => sourceRows))
      .toEqual([[3], [4], [5]]);
    expect(projected.branches).toEqual([
      expect.objectContaining({
        sourceObservationCount: 5,
        selectedObservationCount: 3,
        startSourceRow: 3,
        endSourceRow: 5,
      }),
    ]);
  });

  it('retains an off-branch reference excursion but refuses it inside the selected branch', () => {
    const definition: WideSeriesDefinition = {
      ...alphaDefinition(),
      signal: {
        kind: 'massPercent',
        columnIndex: 1,
        unit: '%',
        alphaReference: { initialValue: 100, finalValue: 0 },
      },
      derivative: undefined,
    };
    const safeTable: RawTable = [
      ['Temperature', 'Mass'],
      [90, 110],
      [100, 100],
      [110, 40],
      [120, 20],
    ];
    const safe = projectWideSeriesTable(
      safeTable,
      source,
      options(definition),
      [0.5, 0.7],
    );
    expect(safe.status).toBe('ready');
    expect(diagnosticCodes(safe)).toContain('WIDE_MASS_REFERENCE_EXCURSION_OUTSIDE_BRANCH');
    expect(safe.branches[0]).toMatchObject({
      selectedObservationCount: 3,
      startSourceRow: 3,
      endSourceRow: 5,
    });

    const unsafeTable: RawTable = [
      ['Temperature', 'Mass'],
      [100, 110],
      [110, 40],
    ];
    const unsafe = projectWideSeriesTable(
      unsafeTable,
      source,
      options(definition),
      [0.5],
    );
    expect(unsafe.status).toBe('error');
    expect(diagnosticCodes(unsafe)).toContain('WIDE_MASS_OUTSIDE_REFERENCE');
    expect(unsafe.projectedPoints).toEqual([]);
  });

  it.each([
    {
      label: 'multiple and downward crossings',
      alpha: [0, 0.6, 0.4, 0.7],
      expected: ['WIDE_ALPHA_MULTIPLE_CROSSINGS', 'WIDE_ALPHA_DOWNWARD_CROSSING'],
    },
    {
      label: 'a downward-only crossing',
      alpha: [0.8, 0.2],
      expected: ['WIDE_ALPHA_DOWNWARD_CROSSING'],
    },
    {
      label: 'an unreachable target',
      alpha: [0.1, 0.2],
      expected: ['WIDE_ALPHA_UNREACHABLE'],
    },
  ])('refuses $label without choosing a convenient crossing', ({ alpha, expected }) => {
    const table: RawTable = [
      ['Temperature', 'Alpha', 'Derivative temperature', 'Derivative'],
      ...alpha.map((value, index) => [
        100 + index * 10,
        value,
        100 + index * 10,
        0.1 + index * 0.01,
      ]),
    ];
    const result = projectWideSeriesTable(table, source, options(), [0.5]);
    expect(result.status).toBe('error');
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining(expected));
    expect(result.projectedPoints).toEqual([]);
    expect(result.branches).toEqual([]);
  });

  it('refuses derivative-grid mismatch instead of interpolating or reordering it', () => {
    const table: RawTable = [
      ['Temperature', 'Alpha', 'Derivative temperature', 'Derivative'],
      [100, 0.1, 100, 0.01],
      [110, 0.6, 111, 0.02],
    ];
    const result = normalizeWideSeriesTable(table, source, options());
    expect(result.status).toBe('error');
    expect(result.dataset).toBeNull();
    expect(diagnosticCodes(result)).toContain('WIDE_DERIVATIVE_GRID_MISMATCH');
  });

  it('refuses non-increasing acquisition order and never silently sorts rows', () => {
    const table: RawTable = [
      ['Temperature', 'Alpha', 'Derivative temperature', 'Derivative'],
      [110, 0.1, 110, 0.01],
      [100, 0.6, 100, 0.02],
    ];
    const result = normalizeWideSeriesTable(table, source, options());
    expect(result.status).toBe('error');
    expect(result.dataset).toBeNull();
    expect(diagnosticCodes(result)).toContain('WIDE_TEMPERATURE_NOT_INCREASING');
  });

  it('reports and excludes an incomplete populated row after the final complete observation', () => {
    const table: RawTable = [
      ['Temperature', 'Alpha', 'Derivative temperature', 'Derivative'],
      [100, 0.1, 100, 0.01],
      [110, 0.6, 110, 0.02],
      ['', '', '', ''],
      [0.001075402, '', '', ''],
    ];
    const result = normalizeWideSeriesTable(table, source, options());
    expect(result.status).toBe('ready');
    expect(result.dataset?.observations.map(({ sourceRow }) => sourceRow))
      .toEqual([2, 3]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED',
        sourceRow: 5,
      }),
    );
  });

  it('still refuses an incomplete populated row before a later complete observation', () => {
    const table: RawTable = [
      ['Temperature', 'Alpha', 'Derivative temperature', 'Derivative'],
      [100, 0.1, 100, 0.01],
      [105, '', '', ''],
      [110, 0.6, 110, 0.02],
    ];
    const result = normalizeWideSeriesTable(table, source, options());
    expect(result.status).toBe('error');
    expect(result.dataset).toBeNull();
    expect(diagnosticCodes(result)).toContain('WIDE_INCOMPLETE_SIGNAL_ROW');
  });
});
