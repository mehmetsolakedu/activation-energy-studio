import { detectColumnMappings } from './columns';
import type {
  AlphaDerivativeUnit,
  AlphaUnit,
  BetaTpRow,
  ColumnMapping,
  ColumnRole,
  HeatingRateUnit,
  IngestionDiagnostic,
  IngestionOptions,
  IngestionResult,
  IngestionSource,
  MappingNeed,
  MassPercentUnit,
  MassUnit,
  NormalizedThermalRecord,
  ProcessedTables,
  ProvenanceColumnMapping,
  RawCell,
  RawTable,
  TAlphaBetaRow,
  TemperatureKind,
  TemperatureUnit,
  TimeUnit,
  WideSeriesPopulatedColumnProfile,
} from './types';

const COMMA_DECIMAL = /^[+\-]?(?:\d+,\d*|,\d+)(?:[eE][+\-]?\d+)?$/;
const DOT_DECIMAL = /^[+\-]?(?:\d+\.\d*|\.\d+)(?:[eE][+\-]?\d+)?$/;
const CANONICAL_NUMBER = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?$/;

interface DecimalDetection {
  separator: '.' | ',';
  needs: MappingNeed[];
}

interface FilenameRateInference {
  value: number;
  unit: 'K/min' | 'C/min';
  rawMatch: string;
}

function displayCell(value: RawCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function isBlank(value: RawCell): boolean {
  return displayCell(value) === '';
}

function isBlankRow(row: readonly RawCell[]): boolean {
  return row.every(isBlank);
}

export function profilePopulatedColumns(
  rawTable: RawTable,
  headerRow: number,
  headers: readonly string[],
): WideSeriesPopulatedColumnProfile[] {
  const columnCount = Math.max(0, ...rawTable.map((row) => row.length));
  const populatedColumns: WideSeriesPopulatedColumnProfile[] = [];
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const populatedRows: number[] = [];
    for (let rowIndex = headerRow + 1; rowIndex < rawTable.length; rowIndex += 1) {
      if (!isBlank(rawTable[rowIndex][columnIndex])) populatedRows.push(rowIndex + 1);
    }
    if (populatedRows.length === 0) continue;
    populatedColumns.push({
      columnIndex,
      header: headers[columnIndex] ?? '',
      populatedRowCount: populatedRows.length,
      firstSourceRow: populatedRows[0],
      lastSourceRow: populatedRows[populatedRows.length - 1],
    });
  }
  return populatedColumns;
}

function inferDecimalSeparator(
  rows: readonly (readonly RawCell[])[],
  requested: IngestionOptions['decimalSeparator'],
  numericColumns: ReadonlySet<number>,
): DecimalDetection {
  if (requested === '.' || requested === ',') return { separator: requested, needs: [] };

  let commaCount = 0;
  let dotCount = 0;
  let bothCount = 0;
  for (const row of rows) {
    for (const [columnIndex, cell] of row.entries()) {
      if (!numericColumns.has(columnIndex)) continue;
      if (typeof cell !== 'string') continue;
      const value = cell.trim().replace(/[−–]/g, '-').replace(/\s/g, '');
      if (COMMA_DECIMAL.test(value)) commaCount += 1;
      if (DOT_DECIMAL.test(value)) dotCount += 1;
      if (/\d[.,]\d/.test(value) && value.includes(',') && value.includes('.')) bothCount += 1;
    }
  }

  if (bothCount > 0 || (commaCount > 0 && dotCount > 0)) {
    return {
      separator: '.',
      needs: [
        {
          kind: 'decimal_separator',
          message:
            'Numeric cells use mixed or structurally ambiguous comma/dot notation; select the decimal separator explicitly and correct inconsistent cells.',
          allowedValues: ['.', ','],
        },
      ],
    };
  }
  return { separator: commaCount > 0 ? ',' : '.', needs: [] };
}

function inferHeatingRateFromFilename(fileName: string): FilenameRateInference | undefined {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const matches: FilenameRateInference[] = [];
  const explicitUnit = /(?:^|[_\-\s])(\d+(?:[.,]\d+)?)\s*[_\-]?([kc])\s*[_\-]?min(?:ute)?s?(?=$|[_.\-\s])/gi;
  const beta = /(?:^|[_\-\s])beta\s*[_\-]?(\d+(?:[.,]\d+)?)(?=$|[_.\-\s])/gi;

  for (const match of stem.matchAll(explicitUnit)) {
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) continue;
    matches.push({
      value,
      unit: match[2].toLowerCase() === 'c' ? 'C/min' : 'K/min',
      rawMatch: match[0].replace(/^[_\-\s]+/, ''),
    });
  }
  for (const match of stem.matchAll(beta)) {
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) continue;
    matches.push({
      value,
      unit: 'K/min',
      rawMatch: match[0].replace(/^[_\-\s]+/, ''),
    });
  }

  const uniqueValues = new Set(matches.map((match) => match.value));
  if (uniqueValues.size !== 1) return undefined;
  return matches[0];
}

function parseNumberCell(value: RawCell, decimalSeparator: '.' | ','): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  let normalized = value
    .trim()
    .replace(/[−–]/g, '-')
    .replace(/[\u00a0\u202f\s]/g, '');
  if (normalized === '') return undefined;
  if (decimalSeparator === ',') {
    if (normalized.includes('.')) return undefined;
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',')) {
    return undefined;
  }
  if (!CANONICAL_NUMBER.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toTemperatureK(value: number, unit: TemperatureUnit): number {
  return unit === 'C' ? value + 273.15 : value;
}

function toSeconds(value: number, unit: TimeUnit): number {
  return unit === 'min' ? value * 60 : value;
}

function toMilligrams(value: number, unit: MassUnit): number {
  return unit === 'g' ? value * 1000 : value;
}

function toPercent(value: number, unit: MassPercentUnit): number {
  return unit === 'fraction' ? value * 100 : value;
}

function toAlpha(value: number, unit: AlphaUnit): number {
  return unit === '%' ? value / 100 : value;
}

function toAlphaDerivativePerMinute(value: number, unit: AlphaDerivativeUnit): number {
  switch (unit) {
    case 'min^-1':
      return value;
    case 's^-1':
      return value * 60;
    case '%/min':
      return value / 100;
    case '%/s':
      return (value * 60) / 100;
  }
}

function toKelvinPerMinute(value: number, unit: HeatingRateUnit): number {
  return unit === 'K/s' || unit === 'C/s' ? value * 60 : value;
}

function mappingFor(mappings: readonly ColumnMapping[], role: ColumnRole): ColumnMapping | undefined {
  return mappings.find((mapping) => mapping.role === role);
}

function textCell(row: readonly RawCell[], mapping: ColumnMapping | undefined): string | undefined {
  if (!mapping) return undefined;
  const value = displayCell(row[mapping.columnIndex]);
  return value === '' ? undefined : value;
}

function numericCell(
  row: readonly RawCell[],
  mapping: ColumnMapping,
  decimalSeparator: '.' | ',',
  source: IngestionSource,
  sourceRow: number,
  diagnostics: IngestionDiagnostic[],
  required: boolean,
): number | undefined {
  const raw = row[mapping.columnIndex];
  if (isBlank(raw)) {
    if (required) {
      diagnostics.push({
        severity: 'error',
        code: 'missing_numeric_value',
        message: `Required ${mapping.role} value is empty.`,
        sourceFile: source.fileName,
        sheetName: source.sheetName,
        row: sourceRow,
        column: mapping.columnIndex + 1,
        header: mapping.header,
        role: mapping.role,
        suggestion: 'Fill the cell or remove the incomplete source row.',
      });
    }
    return undefined;
  }
  const parsed = parseNumberCell(raw, decimalSeparator);
  if (parsed === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid_numeric_value',
      message: `Value cannot be parsed as ${mapping.role} using decimal separator "${decimalSeparator}".`,
      sourceFile: source.fileName,
      sheetName: source.sheetName,
      row: sourceRow,
      column: mapping.columnIndex + 1,
      header: mapping.header,
      role: mapping.role,
      value: displayCell(raw),
      suggestion: 'Correct the cell or choose the matching decimal separator.',
    });
  }
  return parsed;
}

function validateRecord(
  record: NormalizedThermalRecord,
  diagnostics: IngestionDiagnostic[],
): void {
  const base = {
    sourceFile: record.provenance.fileName,
    sheetName: record.provenance.sheetName,
    row: record.provenance.sourceRow,
  };
  if (record.temperatureK <= 0) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'nonphysical_temperature',
      message: 'Absolute temperature must be greater than 0 K.',
      role: 'temperature',
      value: String(record.temperatureK),
    });
  }
  if (record.timeSeconds !== undefined && record.timeSeconds < 0) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'negative_time',
      message: 'Elapsed time cannot be negative.',
      role: 'time',
      value: String(record.timeSeconds),
    });
  }
  if (record.massMg !== undefined && record.massMg < 0) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'negative_mass',
      message: 'Mass cannot be negative.',
      role: 'mass',
      value: String(record.massMg),
    });
  }
  if (
    record.massPercent !== undefined &&
    (record.massPercent < -5 || record.massPercent > 200)
  ) {
    diagnostics.push({
      ...base,
      severity: 'warning',
      code: 'mass_percent_extreme',
      message:
        'The deposited normalized-mass signal is far outside its usual baseline range; raw TGA signals may exceed 100% or become slightly negative, so the value was preserved rather than clipped.',
      role: 'massPercent',
      value: String(record.massPercent),
      suggestion:
        'Verify the instrument baseline, buoyancy correction, declared unit, and selected reaction-stage endpoints.',
    });
  }
  if (record.alpha !== undefined && (record.alpha < 0 || record.alpha > 1)) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'alpha_out_of_range',
      message: 'Conversion alpha must be between 0 and 1 after unit normalization.',
      role: 'alpha',
      value: String(record.alpha),
    });
  }
  if (record.heatingRateKPerMin !== undefined && record.heatingRateKPerMin <= 0) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'nonpositive_heating_rate',
      message: 'Heating rate must be greater than zero.',
      role: 'heatingRate',
      value: String(record.heatingRateKPerMin),
    });
  }
  if (
    record.temperatureKind === 'sample' &&
    record.alpha === undefined &&
    record.massMg === undefined &&
    record.massPercent === undefined
  ) {
    diagnostics.push({
      ...base,
      severity: 'error',
      code: 'missing_curve_signal',
      message: 'A curve row must contain alpha, mass, or normalized mass.',
      suggestion: 'Fill the mapped signal cell or remove the incomplete row.',
    });
  }
}

export function buildTAlphaBetaTable(
  records: readonly NormalizedThermalRecord[],
): TAlphaBetaRow[] {
  return records.flatMap((record) => {
    if (
      record.temperatureKind !== 'sample' ||
      record.alpha === undefined ||
      record.heatingRateKPerMin === undefined
    ) {
      return [];
    }
    return [
      {
        temperatureK: record.temperatureK,
        alpha: record.alpha,
        heatingRateKPerMin: record.heatingRateKPerMin,
        runId: record.runId,
        sample: record.sample,
        atmosphere: record.atmosphere,
        stage: record.stage,
        provenance: record.provenance,
      },
    ];
  });
}

export function buildBetaTpTable(records: readonly NormalizedThermalRecord[]): BetaTpRow[] {
  return records.flatMap((record) => {
    if (record.temperatureKind !== 'peak' || record.heatingRateKPerMin === undefined) return [];
    return [
      {
        heatingRateKPerMin: record.heatingRateKPerMin,
        peakTemperatureK: record.temperatureK,
        runId: record.runId,
        sample: record.sample,
        atmosphere: record.atmosphere,
        stage: record.stage,
        provenance: record.provenance,
      },
    ];
  });
}

function emptyTables(): ProcessedTables {
  return { tAlphaBeta: [], betaTp: [] };
}

function emptyResult(
  source: IngestionSource,
  diagnostics: IngestionDiagnostic[],
  status: IngestionResult['status'] = 'error',
): IngestionResult {
  return {
    status,
    source,
    headers: [],
    preview: [],
    mappings: [],
    candidates: [],
    mappingNeeds: [],
    diagnostics,
    records: [],
    tables: emptyTables(),
  };
}

function headerRowSelectionResult(
  rawTable: RawTable,
  source: IngestionSource,
  options: IngestionOptions,
): IngestionResult {
  const preview = rawTable
    .slice(0, options.previewRows ?? 8)
    .map((row) => Array.from(row));
  const width = Math.max(0, ...preview.map((row) => row.length));
  return {
    status: 'needs_mapping',
    source,
    headers: Array.from({ length: width }, (_, index) => `Column ${index + 1}`),
    preview,
    mappings: [],
    candidates: [],
    mappingNeeds: [{
      kind: 'header_row',
      message:
        'The first row cannot be used as a header; select the row containing the actual column headers.',
      allowedValues: rawTable
        .map((_, index) => String(index))
        .slice(0, 100),
    }],
    diagnostics: [],
    records: [],
    tables: emptyTables(),
  };
}

/**
 * Normalizes an already decoded table. This function is useful for tests,
 * integrations, and user-confirmed remapping without rereading a file.
 */
export function normalizeThermalTable(
  rawTable: RawTable,
  source: IngestionSource,
  options: IngestionOptions = {},
): IngestionResult {
  const headerRow = options.headerRow ?? 0;
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= rawTable.length) {
    return emptyResult(source, [
      {
        severity: 'error',
        code: 'invalid_header_row',
        message: `Header row ${headerRow} is outside the table.`,
        sourceFile: source.fileName,
        sheetName: source.sheetName,
        suggestion: 'Choose a zero-based header-row index that exists in the table.',
      },
    ]);
  }

  const headerCells = rawTable[headerRow] ?? [];
  const headers = headerCells.map(displayCell);
  const laterStructuredRow = rawTable
    .slice(headerRow + 1, Math.min(rawTable.length, headerRow + 101))
    .some((row) => row.filter((cell) => !isBlank(cell)).length >= 2);
  if (
    options.headerRow === undefined
    && headerCells.filter((cell) => !isBlank(cell)).length <= 1
    && laterStructuredRow
  ) {
    return headerRowSelectionResult(rawTable, source, options);
  }
  if (headers.length === 0 || headers.every((header) => header === '')) {
    if (options.headerRow === undefined) {
      return headerRowSelectionResult(rawTable, source, options);
    }
    return emptyResult(source, [
      {
        severity: 'error',
        code: 'empty_header',
        message: 'The selected header row is empty.',
        sourceFile: source.fileName,
        sheetName: source.sheetName,
      },
    ]);
  }

  const indexedDataRows = rawTable
    .map((row, rowIndex) => ({ row, rowIndex }))
    .slice(headerRow + 1)
    .filter(({ row }) => !isBlankRow(row));
  const dataRows = indexedDataRows.map(({ row }) => row);
  const preview = dataRows
    .slice(0, options.previewRows ?? 8)
    .map((row) => Array.from(row));
  const populatedColumns = profilePopulatedColumns(rawTable, headerRow, headers);
  const diagnostics: IngestionDiagnostic[] = [];

  if (dataRows.length === 0) {
    return {
      ...emptyResult(source, [
        {
          severity: 'error',
          code: 'no_data_rows',
          message: 'No non-empty data rows follow the selected header row.',
          sourceFile: source.fileName,
          sheetName: source.sheetName,
        },
      ]),
      headers,
      preview,
      populatedColumns,
    };
  }

  let effectiveOptions = options;
  let detection = detectColumnMappings(headers, effectiveOptions);
  let filenameRateInference: FilenameRateInference | undefined;
  const hasMappedRate = detection.mappings.some((mapping) => mapping.role === 'heatingRate');
  if (
    !hasMappedRate &&
    options.defaults?.heatingRate === undefined &&
    options.columnMapping?.heatingRate === undefined
  ) {
    filenameRateInference = inferHeatingRateFromFilename(source.fileName);
    if (filenameRateInference) {
      effectiveOptions = {
        ...options,
        defaults: {
          ...options.defaults,
          heatingRate: {
            value: filenameRateInference.value,
            unit: filenameRateInference.unit,
          },
        },
      };
      detection = detectColumnMappings(headers, effectiveOptions);
      diagnostics.push({
        severity: 'warning',
        code: 'heating_rate_inferred_from_filename',
        message: `Heating rate ${filenameRateInference.value} ${filenameRateInference.unit} was inferred from the unambiguous filename token "${filenameRateInference.rawMatch}".`,
        sourceFile: source.fileName,
        sheetName: source.sheetName,
        role: 'heatingRate',
        value: filenameRateInference.rawMatch,
        suggestion: 'Confirm or override this value before scientific analysis.',
      });
    }
  }
  const numericColumns = new Set(
    detection.mappings
      .filter((mapping) =>
        ['temperature', 'time', 'mass', 'massPercent', 'alpha', 'dAlphaDt', 'heatingRate'].includes(
          mapping.role,
        ),
      )
      .map((mapping) => mapping.columnIndex),
  );
  const decimal = inferDecimalSeparator(
    dataRows,
    options.decimalSeparator ?? 'auto',
    numericColumns,
  );
  const mappingNeeds = [...detection.needs, ...decimal.needs];
  const normalizedSource: IngestionSource = {
    ...source,
    headerRow,
    decimalSeparator: decimal.needs.length === 0 ? decimal.separator : undefined,
  };

  indexedDataRows.forEach(({ row, rowIndex }) => {
    const actualRow = rowIndex + 1;
    if (row.length < headers.length) {
      diagnostics.push({
        severity: 'warning',
        code: 'short_row',
        message: `Row has ${row.length} cells while the header has ${headers.length}.`,
        sourceFile: source.fileName,
        sheetName: source.sheetName,
        row: actualRow,
        suggestion: 'Check for omitted trailing cells or delimiter problems.',
      });
    }
    if (row.length > headers.length && row.slice(headers.length).some((cell) => !isBlank(cell))) {
      diagnostics.push({
        severity: 'error',
        code: 'wide_row',
        message: `Row has non-empty cells beyond the ${headers.length} declared columns.`,
        sourceFile: source.fileName,
        sheetName: source.sheetName,
        row: actualRow,
        suggestion: 'Check quoting and delimiter selection.',
      });
    }
  });

  if (mappingNeeds.length > 0 || diagnostics.some((item) => item.severity === 'error')) {
    return {
      status: diagnostics.some((item) => item.severity === 'error') ? 'error' : 'needs_mapping',
      source: normalizedSource,
      headers,
      preview,
      mappings: detection.mappings,
      candidates: detection.candidates,
      mappingNeeds,
      diagnostics,
      records: [],
      tables: emptyTables(),
      populatedColumns,
    };
  }

  const temperatureMapping = mappingFor(detection.mappings, 'temperature')!;
  const timeMapping = mappingFor(detection.mappings, 'time');
  const massMapping = mappingFor(detection.mappings, 'mass');
  const massPercentMapping = mappingFor(detection.mappings, 'massPercent');
  const alphaMapping = mappingFor(detection.mappings, 'alpha');
  const dAlphaDtMapping = mappingFor(detection.mappings, 'dAlphaDt');
  const heatingRateMapping = mappingFor(detection.mappings, 'heatingRate');
  const runMapping = mappingFor(detection.mappings, 'run');
  const sampleMapping = mappingFor(detection.mappings, 'sample');
  const atmosphereMapping = mappingFor(detection.mappings, 'atmosphere');
  const stageMapping = mappingFor(detection.mappings, 'stage');
  const tableKind = effectiveOptions.tableKind ?? 'auto';
  const temperatureKind: TemperatureKind =
    tableKind === 'beta-tp'
      ? 'peak'
      : tableKind === 'curve' || tableKind === 't-alpha-beta'
        ? 'sample'
        : (temperatureMapping.temperatureKind ?? 'sample');
  const defaultRate = effectiveOptions.defaults?.heatingRate;
  const normalizedDefaultRate = defaultRate
    ? toKelvinPerMinute(defaultRate.value, defaultRate.unit)
    : undefined;
  const provenanceColumnMappings: ProvenanceColumnMapping[] = detection.mappings.map(
    (mapping) => ({
      role: mapping.role,
      sourceColumnIndex: mapping.columnIndex,
      sourceHeader: mapping.header,
      sourceUnit: mapping.unit ?? null,
      confidence: mapping.confidence,
    }),
  );

  const records: NormalizedThermalRecord[] = [];
  indexedDataRows.forEach(({ row, rowIndex }) => {
    const sourceRow = rowIndex + 1;
    const temperature = numericCell(
      row,
      temperatureMapping,
      decimal.separator,
      normalizedSource,
      sourceRow,
      diagnostics,
      true,
    );
    const time = timeMapping
      ? numericCell(row, timeMapping, decimal.separator, normalizedSource, sourceRow, diagnostics, false)
      : undefined;
    const mass = massMapping
      ? numericCell(row, massMapping, decimal.separator, normalizedSource, sourceRow, diagnostics, false)
      : undefined;
    const massPercent = massPercentMapping
      ? numericCell(
          row,
          massPercentMapping,
          decimal.separator,
          normalizedSource,
          sourceRow,
          diagnostics,
          false,
        )
      : undefined;
    const alpha = alphaMapping
      ? numericCell(row, alphaMapping, decimal.separator, normalizedSource, sourceRow, diagnostics, false)
      : undefined;
    const dAlphaDt = dAlphaDtMapping
      ? numericCell(
          row,
          dAlphaDtMapping,
          decimal.separator,
          normalizedSource,
          sourceRow,
          diagnostics,
          false,
        )
      : undefined;
    const heatingRate = heatingRateMapping
      ? numericCell(
          row,
          heatingRateMapping,
          decimal.separator,
          normalizedSource,
          sourceRow,
          diagnostics,
          true,
        )
      : normalizedDefaultRate;

    if (temperature === undefined || heatingRate === undefined) return;

    const runId =
      textCell(row, runMapping) ?? effectiveOptions.defaults?.runId ?? source.sheetName ?? source.fileName;
    const record: NormalizedThermalRecord = {
      temperatureK: toTemperatureK(temperature, temperatureMapping.unit as TemperatureUnit),
      temperatureKind,
      timeSeconds:
        time === undefined ? undefined : toSeconds(time, timeMapping!.unit as TimeUnit),
      massMg:
        mass === undefined ? undefined : toMilligrams(mass, massMapping!.unit as MassUnit),
      massPercent:
        massPercent === undefined
          ? undefined
          : toPercent(massPercent, massPercentMapping!.unit as MassPercentUnit),
      alpha:
        alpha === undefined ? undefined : toAlpha(alpha, alphaMapping!.unit as AlphaUnit),
      dAlphaDtPerMinute:
        dAlphaDt === undefined
          ? undefined
          : toAlphaDerivativePerMinute(
              dAlphaDt,
              dAlphaDtMapping!.unit as AlphaDerivativeUnit,
            ),
      heatingRateKPerMin: heatingRateMapping
        ? toKelvinPerMinute(heatingRate, heatingRateMapping.unit as HeatingRateUnit)
        : heatingRate,
      runId,
      sample: textCell(row, sampleMapping) ?? effectiveOptions.defaults?.sample,
      atmosphere: textCell(row, atmosphereMapping) ?? effectiveOptions.defaults?.atmosphere,
      stage: textCell(row, stageMapping) ?? effectiveOptions.defaults?.stage,
      provenance: {
        ...(source.sourceFileId ? { sourceFileId: source.sourceFileId } : {}),
        fileName: source.fileName,
        sheetName: source.sheetName,
        sourceRow,
        columnMappings: provenanceColumnMappings,
        inferences: filenameRateInference
          ? [
              {
                field: 'heatingRateKPerMin',
                source: 'filename',
                rawMatch: filenameRateInference.rawMatch,
                normalizedValue: normalizedDefaultRate!,
                normalizedUnit: 'K/min',
              },
            ]
          : undefined,
      },
    };
    validateRecord(record, diagnostics);
    records.push(record);
  });

  if (diagnostics.some((item) => item.severity === 'error')) {
    return {
      status: 'error',
      source: normalizedSource,
      headers,
      preview,
      mappings: detection.mappings,
      candidates: detection.candidates,
      mappingNeeds,
      diagnostics,
      records: [],
      tables: emptyTables(),
      populatedColumns,
    };
  }

  return {
    status: 'ready',
    source: normalizedSource,
    headers,
    preview,
    mappings: detection.mappings,
    candidates: detection.candidates,
    mappingNeeds,
    diagnostics,
    records,
    tables: {
      tAlphaBeta: buildTAlphaBetaTable(records),
      betaTp: buildBetaTpTable(records),
    },
    populatedColumns,
  };
}
