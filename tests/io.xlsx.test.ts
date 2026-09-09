import { beforeEach, describe, expect, it, vi } from 'vitest';

const readXlsxFileMock = vi.hoisted(() => vi.fn());

vi.mock('read-excel-file/browser', () => ({ default: readXlsxFileMock }));

import { ingestThermalFile } from '../src/io';

describe('XLSX ingestion', () => {
  beforeEach(() => readXlsxFileMock.mockReset());

  it('requires an explicit sheet when a workbook has several sheets', async () => {
    readXlsxFileMock.mockResolvedValue([
      {
        sheet: 'Curves',
        data: [
          ['Temperature [K]', 'Mass [%]', 'beta [K/min]'],
          [400, 100, 5],
        ],
      },
      {
        sheet: 'Peaks',
        data: [
          [
            'Tp [K]',
            'beta [K/min]',
            'Peak resolved',
            'Peak quality',
            'Peak source signal',
            'Analyst confirmed',
          ],
          [621, 5, true, 'clear-interior', 'external-beta-tp-table', true],
        ],
      },
    ]);
    const file = new File(['mock workbook'], 'data.xlsx');

    const unresolved = await ingestThermalFile(file);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.records).toEqual([]);
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'sheet', allowedValues: ['Curves', 'Peaks'] }),
    );

    const selected = await ingestThermalFile(file, { sheet: 'Peaks' });
    expect(selected.status).toBe('ready');
    expect(selected.source.sheetName).toBe('Peaks');
    expect(selected.tables.betaTp).toHaveLength(1);
    expect(selected.records[0].provenance).toMatchObject({
      fileName: 'data.xlsx',
      sheetName: 'Peaks',
      sourceRow: 2,
    });
  });

  it('reports a missing selected worksheet as an error', async () => {
    readXlsxFileMock.mockResolvedValue([{ sheet: 'Data', data: [['Temperature [K]']] }]);
    const result = await ingestThermalFile(new File(['mock'], 'data.xlsx'), {
      sheet: 'Missing',
    });
    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'xlsx_sheet_not_found' }),
    );
  });

  it('turns a blank leading row into a recoverable header-row choice', async () => {
    readXlsxFileMock.mockResolvedValue([{
      sheet: 'Fig.2.',
      data: [
        [],
        ['A/RH'],
        ['Temperature', 'TG'],
        [100, 99],
        [110, 98],
      ],
    }]);
    const file = new File(['mock'], 'wide-source.xlsx');

    const unresolved = await ingestThermalFile(file);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'header_row' }),
    );
    expect(unresolved.preview).toHaveLength(5);

    const selected = await ingestThermalFile(file, {
      headerRow: 2,
      tableKind: 'curve',
      columnMapping: {
        temperature: { column: 0, unit: 'C', temperatureKind: 'sample' },
        massPercent: { column: 1, unit: '%' },
      },
      defaults: {
        heatingRate: { value: 5, unit: 'K/min' },
        runId: 'run-5',
      },
    });
    expect(selected.status).toBe('ready');
    expect(selected.records).toHaveLength(2);
    expect(selected.records[0]?.provenance.sourceRow).toBe(4);
  });
});
