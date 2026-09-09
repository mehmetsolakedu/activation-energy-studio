import type { IngestionOptions, IngestionResult, RawCell } from './types';

export type DeviceProfileId =
  | 'metadata-rich-thermal-txt'
  | 'generic-xlsx'
  | 'guided-fallback';

export interface DeviceProfileDefinition {
  readonly id: DeviceProfileId;
  readonly name: string;
  readonly description: string;
  readonly requiresConfirmation: true;
  readonly suggestedOptions: IngestionOptions;
  readonly confirmationChecklist: readonly string[];
}

export interface DeviceProfileSuggestion {
  readonly profileId: DeviceProfileId;
  readonly name: string;
  /** 0..1 matcher confidence. It never constitutes user confirmation. */
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly requiresConfirmation: true;
  readonly suggestedOptions: IngestionOptions;
}

const METADATA_RICH_THERMAL_TXT: DeviceProfileDefinition = {
  id: 'metadata-rich-thermal-txt',
  name: 'Metadata-rich thermal-analysis TXT',
  description:
    'Starting suggestion for NETZSCH-like thermal-analysis exports with UTF-16 text, tab-separated columns, decimal commas, and measurement metadata rows.',
  requiresConfirmation: true,
  suggestedOptions: {
    headerRow: 16,
    delimiter: '\t',
    decimalSeparator: ',',
    tableKind: 'curve',
    layout: 'long',
    columnMapping: {
      time: { column: 0, unit: 's' },
      temperature: { column: 1, unit: 'C', temperatureKind: 'sample' },
      massPercent: { column: 2, unit: '%' },
    },
    previewRows: 12,
  },
  confirmationChecklist: [
    'Confirm the actual column-header row in the preview.',
    'Confirm the semantics and units of temperature, TG/mass, and time columns.',
    'Enter heating rate, sample, atmosphere, and physical reaction stage.',
    'Do not treat a generic DTG column as direct dAlpha/dt; explicitly map mass references, sign, and unit.',
  ],
};

const GENERIC_XLSX: DeviceProfileDefinition = {
  id: 'generic-xlsx',
  name: 'Generic XLSX workbook',
  description:
    'Guided workbook starting point for sheet, header row, long/wide layout, column roles, and units.',
  requiresConfirmation: true,
  suggestedOptions: {
    headerRow: 0,
    decimalSeparator: 'auto',
    tableKind: 'auto',
    layout: 'long',
    previewRows: 12,
  },
  confirmationChecklist: [
    'Select the intended worksheet when more than one sheet is present.',
    'Confirm the header row and long-table or side-by-side wide-series layout.',
    'Confirm every numeric-column unit and peak/sample temperature meaning.',
    'Explicitly confirm that unselected populated columns are out of scope.',
  ],
};

const GUIDED_FALLBACK: DeviceProfileDefinition = {
  id: 'guided-fallback',
  name: 'Guided generic mapping',
  description:
    'Uses the existing mapping wizard without assuming scientific meaning when the source format cannot be recognized safely.',
  requiresConfirmation: true,
  suggestedOptions: {
    decimalSeparator: 'auto',
    tableKind: 'auto',
    previewRows: 12,
  },
  confirmationChecklist: [
    'Confirm delimiter, decimal separator, and header row.',
    'Explicitly assign column roles, units, and physical stage.',
    'Inspect the previewed curve and selected conversion range before analysis.',
  ],
};

export const DEVICE_PROFILE_REGISTRY: readonly DeviceProfileDefinition[] =
  Object.freeze([
    METADATA_RICH_THERMAL_TXT,
    GENERIC_XLSX,
    GUIDED_FALLBACK,
  ]);

function displayCell(cell: RawCell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

function searchableResultText(result: IngestionResult): string {
  return [
    result.source.fileName,
    result.source.sheetName ?? '',
    ...result.headers,
    ...result.preview.flatMap((row) => row.map(displayCell)),
  ]
    .join('\n')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
}

function suggestion(
  profile: DeviceProfileDefinition,
  confidence: number,
  reasons: readonly string[],
): DeviceProfileSuggestion {
  return {
    profileId: profile.id,
    name: profile.name,
    confidence,
    reasons,
    requiresConfirmation: true,
    suggestedOptions: structuredClone(profile.suggestedOptions),
  };
}

/**
 * Suggests a starting profile after the safe first-pass parser has inspected
 * the file. A suggestion never applies options and never bypasses the mapping
 * confirmation surface.
 */
export function suggestDeviceProfile(
  result: IngestionResult,
): DeviceProfileSuggestion {
  const text = searchableResultText(result);
  const isText = result.source.fileType === 'txt';
  const utf16 =
    result.source.textEncoding === 'utf-16le'
    || result.source.textEncoding === 'utf-16be';
  const tabSeparated = result.source.delimiter === '\t';
  const metadataMarkers = [
    'nr-cels',
    'creation date',
    'initial mass',
    'molar mass',
    'sample temperature',
    'heatflow',
  ].filter((marker) => text.includes(marker));

  if (
    isText
    && (
      metadataMarkers.length >= 2
      || (utf16 && tabSeparated && metadataMarkers.length >= 1)
    )
  ) {
    const reasons: string[] = ['The source is a thermal-analysis TXT export.'];
    if (utf16) {
      reasons.push(`Encoding was detected as ${result.source.textEncoding}.`);
    }
    if (tabSeparated) {
      reasons.push('The structural delimiter was detected as a tab.');
    }
    reasons.push(`Measurement metadata markers were found: ${metadataMarkers.join(', ')}.`);
    return suggestion(
      METADATA_RICH_THERMAL_TXT,
      Math.min(0.98, 0.68 + metadataMarkers.length * 0.05 + (utf16 ? 0.05 : 0)),
      reasons,
    );
  }

  if (result.source.fileType === 'xlsx') {
    const reasons: string[] = [
      'The source is an XLSX workbook and requires sheet and schema confirmation.',
    ];
    if ((result.source.availableSheets?.length ?? 0) > 1) {
      reasons.push(`${result.source.availableSheets?.length} worksheets were found.`);
    }
    return suggestion(GENERIC_XLSX, 0.9, reasons);
  }

  return suggestion(GUIDED_FALLBACK, 0.35, [
    'The source did not safely match a registered device profile; scientific meanings must be confirmed by the user.',
  ]);
}
