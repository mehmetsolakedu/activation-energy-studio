import { describe, expect, it } from 'vitest';

import {
  DEVICE_PROFILE_REGISTRY,
  suggestDeviceProfile,
} from '../src/io/deviceProfiles';
import type { IngestionResult } from '../src/io';

function result(
  source: IngestionResult['source'],
  overrides: Partial<IngestionResult> = {},
): IngestionResult {
  return {
    status: 'needs_mapping',
    source,
    headers: [],
    preview: [],
    mappings: [],
    candidates: [],
    mappingNeeds: [],
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
    ...overrides,
  };
}

describe('device-profile suggestions', () => {
  it('keeps every registered profile advisory and confirmation-gated', () => {
    expect(DEVICE_PROFILE_REGISTRY.map(({ id }) => id)).toEqual([
      'metadata-rich-thermal-txt',
      'generic-xlsx',
      'guided-fallback',
    ]);
    expect(DEVICE_PROFILE_REGISTRY.every(
      ({ requiresConfirmation }) => requiresConfirmation,
    )).toBe(true);
    expect(new Set(DEVICE_PROFILE_REGISTRY.map(({ id }) => id).values()).size)
      .toBe(3);
  });

  it('recognizes a UTF-16 tab-delimited metadata-rich thermal TXT without applying it', () => {
    const suggestion = suggestDeviceProfile(result({
      fileName: 'NR-CELS 30 10Cmin.txt',
      fileType: 'txt',
      delimiter: '\t',
      decimalSeparator: ',',
      textEncoding: 'utf-16le',
    }, {
      preview: [
        ['NR-CELS 30 10Cmin'],
        ['Creation Date : 12.08.2025'],
        ['Initial Mass : 10,499 mg'],
        ['Molar Mass : N/A'],
      ],
      mappingNeeds: [{ kind: 'header_row', message: 'Select header row.' }],
    }));

    expect(suggestion.profileId).toBe('metadata-rich-thermal-txt');
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.85);
    expect(suggestion.requiresConfirmation).toBe(true);
    expect(suggestion.suggestedOptions).toMatchObject({
      headerRow: 16,
      delimiter: '\t',
      decimalSeparator: ',',
      tableKind: 'curve',
      columnMapping: {
        time: { column: 0, unit: 's' },
        temperature: { column: 1, unit: 'C' },
        massPercent: { column: 2, unit: '%' },
      },
    });
    expect(suggestion.suggestedOptions.columnMapping?.dAlphaDt).toBeUndefined();
    expect(suggestion.reasons.some((reason) =>
      reason.includes('metadata markers'))).toBe(true);
  });

  it('routes workbooks to a generic XLSX confirmation flow', () => {
    const suggestion = suggestDeviceProfile(result({
      fileName: 'instrument-export.xlsx',
      fileType: 'xlsx',
      availableSheets: ['TG', 'DTG', 'Peaks'],
    }, {
      mappingNeeds: [{
        kind: 'sheet',
        message: 'Select a worksheet.',
        allowedValues: ['TG', 'DTG', 'Peaks'],
      }],
    }));

    expect(suggestion).toMatchObject({
      profileId: 'generic-xlsx',
      confidence: 0.9,
      requiresConfirmation: true,
      suggestedOptions: {
        headerRow: 0,
        decimalSeparator: 'auto',
        tableKind: 'auto',
      },
    });
    expect(suggestion.suggestedOptions.sheet).toBeUndefined();
    expect(suggestion.reasons.some((reason) =>
      reason.includes('3 worksheets'))).toBe(true);
  });

  it('fails safely to guided mapping for an unrecognized source', () => {
    const suggestion = suggestDeviceProfile(result({
      fileName: 'unknown.csv',
      fileType: 'csv',
      delimiter: ',',
      textEncoding: 'utf-8',
    }, {
      headers: ['x', 'y', 'z'],
      preview: [[1, 2, 3]],
    }));

    expect(suggestion).toMatchObject({
      profileId: 'guided-fallback',
      confidence: 0.35,
      requiresConfirmation: true,
    });
    expect(suggestion.suggestedOptions.columnMapping).toBeUndefined();
    expect(suggestion.suggestedOptions.defaults).toBeUndefined();
  });

  it('returns a fresh options object so a UI cannot mutate the registry', () => {
    const input = result({
      fileName: 'unknown.csv',
      fileType: 'csv',
      delimiter: ',',
      textEncoding: 'utf-8',
    });
    const first = suggestDeviceProfile(input);
    const second = suggestDeviceProfile(input);

    expect(first.suggestedOptions).not.toBe(second.suggestedOptions);
    first.suggestedOptions.previewRows = 99;
    expect(second.suggestedOptions.previewRows).toBe(12);
    expect(
      DEVICE_PROFILE_REGISTRY.find(({ id }) => id === 'guided-fallback')
        ?.suggestedOptions.previewRows,
    ).toBe(12);
  });
});
