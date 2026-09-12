import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';

import {
  buildTAlphaBetaTable,
  normalizeThermalTable,
  profilePopulatedColumns,
} from './normalize';
import { projectWideSeriesTable } from './wide';
import { hashSourceFile } from '../sourceFileIdentity';
import {
  diagnosticFromGuardError,
  fileSizeLimitForExtension,
  INGESTION_LIMITS,
  IngestionGuardError,
  inspectXlsxSecurity,
} from './fileSecurity';
import type {
  BatchIngestionOptions,
  BatchIngestionResult,
  ColumnMapping,
  ColumnRole,
  ColumnUnit,
  IngestionDiagnostic,
  IngestionOptions,
  IngestionResult,
  IngestionSource,
  IngestionStatus,
  NormalizedThermalRecord,
  ProvenanceColumnMapping,
  RawCell,
  RawTable,
  WideSeriesDefinition,
  WideSeriesDiagnostic,
  WideSeriesExcludedColumnAudit,
  WideSeriesIngestionAudit,
  WideSeriesPopulatedColumnProfile,
} from './types';

interface DelimitedParseResult {
  table: RawCell[][];
  delimiter?: string;
  textEncoding?: IngestionSource['textEncoding'];
  diagnostics: IngestionDiagnostic[];
}

function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase());
  return match?.[1] ?? '';
}

function emptyResult(
  source: IngestionSource,
  status: IngestionStatus,
  diagnostics: IngestionDiagnostic[],
  mappingNeeds: IngestionResult['mappingNeeds'] = [],
): IngestionResult {
  return {
    status,
    source,
    headers: [],
    preview: [],
    mappings: [],
    candidates: [],
    mappingNeeds,
    diagnostics,
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

function displayCell(value: RawCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function isBlankCell(value: RawCell): boolean {
  return displayCell(value) === '';
}

function isBlankRow(row: readonly RawCell[]): boolean {
  return row.every(isBlankCell);
}

function wideHeaderSelectionResult(
  rawTable: RawTable,
  source: IngestionSource,
  options: IngestionOptions,
): IngestionResult {
  const preview = rawTable
    .slice(0, options.previewRows ?? 8)
    .map((row) => Array.from(row));
  const width = Math.max(0, ...rawTable.map((row) => row.length));
  return {
    ...emptyResult(source, 'needs_mapping', [], [
      {
        kind: 'header_row',
        message:
          'The first row cannot be used as a header; select the row containing the actual column headers.',
        allowedValues: rawTable
          .map((_, index) => String(index))
          .slice(0, 100),
      },
    ]),
    headers: Array.from({ length: width }, (_, index) => `Column ${index + 1}`),
    preview,
  };
}

function isValidWideAlphaGrid(alphaGrid: readonly number[] | undefined): alphaGrid is readonly number[] {
  return Boolean(
    alphaGrid
    && alphaGrid.length > 0
    && alphaGrid.every((alpha) => Number.isFinite(alpha) && alpha > 0 && alpha < 1)
    && alphaGrid.every((alpha, index) => index === 0 || alpha > alphaGrid[index - 1]),
  );
}

function sourceColumns(definition: WideSeriesDefinition): number[] {
  return [
    definition.temperature.columnIndex,
    definition.signal.columnIndex,
    ...(definition.derivative
      ? [
          ...(definition.derivative.temperatureColumn
            ? [definition.derivative.temperatureColumn.columnIndex]
            : []),
          definition.derivative.valueColumnIndex,
        ]
      : []),
  ];
}

function sourceMappingsForDefinition(
  definition: WideSeriesDefinition,
  headers: readonly string[],
): ColumnMapping[] {
  const mapping = (
    role: ColumnRole,
    columnIndex: number,
    unit: ColumnUnit,
  ): ColumnMapping => ({
    role,
    columnIndex,
    header: headers[columnIndex] ?? '',
    unit,
    ...(role === 'temperature' ? { temperatureKind: 'sample' as const } : {}),
    confidence: 'manual',
  });
  const mappings = [
    mapping('temperature', definition.temperature.columnIndex, definition.temperature.unit),
    mapping(definition.signal.kind, definition.signal.columnIndex, definition.signal.unit),
  ];
  if (definition.derivative?.temperatureColumn) {
    mappings.push(
      mapping(
        'temperature',
        definition.derivative.temperatureColumn.columnIndex,
        definition.derivative.temperatureColumn.unit,
      ),
    );
  }
  if (definition.derivative) {
    mappings.push(
      mapping(
        'dAlphaDt',
        definition.derivative.valueColumnIndex,
        definition.derivative.unit,
      ),
    );
  }
  return mappings;
}

function provenanceMappings(
  definition: WideSeriesDefinition,
  headers: readonly string[],
): ProvenanceColumnMapping[] {
  return sourceMappingsForDefinition(definition, headers).map((mapping) => ({
    role: mapping.role,
    sourceColumnIndex: mapping.columnIndex,
    sourceHeader: mapping.header,
    sourceUnit: mapping.unit ?? null,
    confidence: mapping.confidence,
  }));
}

function excludedPopulatedColumns(
  populatedColumns: readonly WideSeriesPopulatedColumnProfile[],
  definitions: readonly WideSeriesDefinition[],
): WideSeriesExcludedColumnAudit[] {
  const selected = new Set(definitions.flatMap(sourceColumns));
  return populatedColumns
    .filter(({ columnIndex }) => !selected.has(columnIndex))
    .map(({
      columnIndex,
      header,
      populatedRowCount,
      firstSourceRow,
      lastSourceRow,
    }) => ({
      columnIndex,
      sourceHeader: header,
      populatedRowCount,
      firstSourceRow,
      lastSourceRow,
    }));
}

function cloneWideSeriesDefinition(
  definition: WideSeriesDefinition,
): WideSeriesDefinition {
  return {
    ...definition,
    temperature: { ...definition.temperature },
    signal: definition.signal.kind === 'alpha'
      ? { ...definition.signal }
      : {
          ...definition.signal,
          alphaReference: { ...definition.signal.alphaReference },
        },
    ...(definition.derivative
      ? {
          derivative: {
            ...definition.derivative,
            ...(definition.derivative.temperatureColumn
              ? { temperatureColumn: { ...definition.derivative.temperatureColumn } }
              : {}),
          },
        }
      : {}),
    heatingRate: { ...definition.heatingRate },
    context: { ...definition.context },
  };
}

function ingestionDiagnosticForWide(
  diagnostic: WideSeriesDiagnostic,
  source: IngestionSource,
  headers: readonly string[],
): IngestionDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    sourceFile: source.fileName,
    sheetName: source.sheetName,
    row: diagnostic.sourceRow,
    column: diagnostic.columnIndex === undefined ? undefined : diagnostic.columnIndex + 1,
    header: diagnostic.columnIndex === undefined ? undefined : headers[diagnostic.columnIndex],
    value: diagnostic.alpha === undefined ? undefined : String(diagnostic.alpha),
    suggestion:
      diagnostic.severity === 'error'
        ? 'Review the explicit wide-series mapping and source rows; no sorting, smoothing, extrapolation, or silent row deletion was applied.'
        : undefined,
  };
}

function ingestWideSeriesTable(
  rawTable: RawTable,
  source: IngestionSource,
  options: IngestionOptions,
): IngestionResult {
  const headerRow = options.headerRow ?? 0;
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= rawTable.length) {
    return emptyResult(source, 'error', [
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

  const columnCount = Math.max(0, ...rawTable.map((row) => row.length));
  const headerCells = rawTable[headerRow] ?? [];
  const headers = Array.from(
    { length: columnCount },
    (_, columnIndex) => displayCell(headerCells[columnIndex]),
  );
  if (headers.length === 0 || headers.every((header) => header === '')) {
    if (options.headerRow === undefined) {
      return wideHeaderSelectionResult(rawTable, source, options);
    }
    return {
      ...emptyResult(source, 'error', [
        {
          severity: 'error',
          code: 'empty_header',
          message: 'The selected header row is empty.',
          sourceFile: source.fileName,
          sheetName: source.sheetName,
        },
      ]),
      headers,
    };
  }

  const preview = rawTable
    .slice(headerRow + 1)
    .filter((row) => !isBlankRow(row))
    .slice(0, options.previewRows ?? 8)
    .map((row) => Array.from(row));
  const populatedColumns = profilePopulatedColumns(rawTable, headerRow, headers);
  const mappingNeeds: IngestionResult['mappingNeeds'] = [];
  const hasWideSeries = Boolean(options.wideSeries && options.wideSeries.length > 0);
  const hasValidAlphaGrid = isValidWideAlphaGrid(options.wideAlphaGrid);
  if (!hasWideSeries || !hasValidAlphaGrid) {
    mappingNeeds.push({
      kind: 'wide_series',
      message:
        'Every side-by-side series must be mapped explicitly, and the projection alpha grid must contain finite, strictly increasing values within (0,1).',
    });
  }
  if (options.wideScopeConfirmed !== true) {
    mappingNeeds.push({
      kind: 'scope_confirmation',
      message:
        'Explicitly confirm that unmapped populated columns are outside the analysis scope.',
    });
  }
  if (mappingNeeds.length > 0) {
    return {
      ...emptyResult(source, 'needs_mapping', [], mappingNeeds),
      headers,
      preview,
      populatedColumns,
    };
  }

  const wideSeries = options.wideSeries as readonly WideSeriesDefinition[];
  const alphaGrid = options.wideAlphaGrid as readonly number[];
  const decimalSeparator = options.decimalSeparator === ',' ? ',' : '.';
  const normalizedSource: IngestionSource = {
    ...source,
    headerRow,
    decimalSeparator,
  };
  const projection = projectWideSeriesTable(
    rawTable,
    normalizedSource,
    {
      headerRow,
      decimalSeparator,
      series: wideSeries,
    },
    alphaGrid,
  );
  const diagnostics = projection.diagnostics.map((diagnostic) => (
    ingestionDiagnosticForWide(diagnostic, normalizedSource, headers)
  ));
  const allMappings = wideSeries.flatMap((definition) => (
    sourceMappingsForDefinition(definition, headers)
  ));
  const mappings = allMappings.filter((mapping, index) => (
    allMappings.findIndex((candidate) => (
      candidate.role === mapping.role
      && candidate.columnIndex === mapping.columnIndex
      && candidate.unit === mapping.unit
    )) === index
  ));

  if (projection.status === 'error' || !projection.dataset) {
    return {
      status: 'error',
      source: normalizedSource,
      headers,
      preview,
      mappings,
      candidates: [],
      mappingNeeds: [],
      diagnostics,
      records: [],
      tables: { tAlphaBeta: [], betaTp: [] },
      populatedColumns,
    };
  }

  const definitions = new Map(
    projection.dataset.series.map((definition) => [
      `${definition.seriesId}\u0000${definition.runId}`,
      definition,
    ]),
  );
  const records: NormalizedThermalRecord[] = projection.projectedPoints.map((point) => {
    const definition = definitions.get(`${point.seriesId}\u0000${point.runId}`);
    if (!definition) {
      throw new Error(`Projected wide-series point has no definition for ${point.seriesId}/${point.runId}.`);
    }
    return {
      temperatureK: point.temperatureK,
      temperatureKind: 'sample',
      alpha: point.alpha,
      ...(point.dAlphaDtPerMinute === undefined
        ? {}
        : {
            dAlphaDtPerMinute: point.dAlphaDtPerMinute,
            ...(point.dAlphaDtSource === undefined
              ? {}
              : { dAlphaDtSource: point.dAlphaDtSource }),
          }),
      heatingRateKPerMin: point.heatingRateKPerMin,
      runId: point.runId,
      sample: point.context.sample,
      atmosphere: point.context.atmosphere,
      stage: point.context.stage,
      provenance: {
        ...(normalizedSource.sourceFileId
          ? { sourceFileId: normalizedSource.sourceFileId }
          : {}),
        fileName: normalizedSource.fileName,
        sheetName: normalizedSource.sheetName,
        sourceRow: point.sourceRows[0],
        sourceRows: [...point.sourceRows],
        ...(point.derivativeSourceRows
          ? { derivativeSourceRows: [...point.derivativeSourceRows] }
          : {}),
        columnMappings: provenanceMappings(definition, headers),
      },
    };
  });
  const audit: WideSeriesIngestionAudit = {
    layout: 'wide-series',
    source: {
      ...(normalizedSource.sourceFileId
        ? { sourceFileId: normalizedSource.sourceFileId }
        : {}),
      fileName: normalizedSource.fileName,
      fileType: normalizedSource.fileType,
      ...(normalizedSource.sheetName ? { sheetName: normalizedSource.sheetName } : {}),
    },
    headerRow,
    headerSourceRow: headerRow + 1,
    headers: [...projection.dataset.headers],
    decimalSeparator,
    alphaGrid: [...alphaGrid],
    series: projection.dataset.series.map(cloneWideSeriesDefinition),
    rawObservationCount: projection.dataset.observations.length,
    projectedPointCount: projection.projectedPoints.length,
    branches: projection.branches.map((branch) => ({
      ...branch,
      targetAlphaRange: [...branch.targetAlphaRange] as [number, number],
      selectedAlphaRange: [...branch.selectedAlphaRange] as [number, number],
    })),
    excludedPopulatedColumns: excludedPopulatedColumns(
      populatedColumns,
      projection.dataset.series,
    ),
    scopeConfirmed: true,
    points: projection.projectedPoints.map((point) => ({
      seriesId: point.seriesId,
      runId: point.runId,
      alpha: point.alpha,
      sourceRows: [...point.sourceRows],
      ...(point.derivativeSourceRows
        ? { derivativeSourceRows: [...point.derivativeSourceRows] }
        : {}),
    })),
  };
  return {
    status: 'ready',
    source: normalizedSource,
    headers,
    preview,
    mappings,
    candidates: [],
    mappingNeeds: [],
    diagnostics,
    records,
    populatedColumns,
    tables: {
      tAlphaBeta: buildTAlphaBetaTable(records),
      betaTp: [],
    },
    wideSeriesAudit: audit,
  };
}

function mergeParseDiagnostics(
  result: IngestionResult,
  diagnostics: IngestionDiagnostic[],
): IngestionResult {
  if (diagnostics.length === 0) return result;
  const mergedDiagnostics = [...diagnostics, ...result.diagnostics];
  if (!mergedDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ...result, diagnostics: mergedDiagnostics };
  }
  return {
    ...result,
    status: 'error',
    diagnostics: mergedDiagnostics,
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

interface DecodedText {
  text: string;
  encoding: NonNullable<IngestionSource['textEncoding']>;
}

function utf16BytePattern(
  bytes: Uint8Array,
): 'utf-16le' | 'utf-16be' | undefined {
  const length = Math.min(bytes.length, 4096);
  if (length < 8) return undefined;
  let evenNulls = 0;
  let oddNulls = 0;
  let evenCount = 0;
  let oddCount = 0;
  for (let index = 0; index < length; index += 1) {
    if (index % 2 === 0) {
      evenCount += 1;
      if (bytes[index] === 0) evenNulls += 1;
    } else {
      oddCount += 1;
      if (bytes[index] === 0) oddNulls += 1;
    }
  }
  const evenRatio = evenCount === 0 ? 0 : evenNulls / evenCount;
  const oddRatio = oddCount === 0 ? 0 : oddNulls / oddCount;
  if (oddRatio >= 0.2 && evenRatio <= 0.05) return 'utf-16le';
  if (evenRatio >= 0.2 && oddRatio <= 0.05) return 'utf-16be';
  return undefined;
}

function decodeWith(
  bytes: Uint8Array,
  encoding: NonNullable<IngestionSource['textEncoding']>,
): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

async function decodeDelimitedText(file: File): Promise<DecodedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeWith(bytes, 'utf-8'), encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeWith(bytes, 'utf-16le'), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeWith(bytes, 'utf-16be'), encoding: 'utf-16be' };
  }

  const inferredUtf16 = utf16BytePattern(bytes);
  if (inferredUtf16) {
    return { text: decodeWith(bytes, inferredUtf16), encoding: inferredUtf16 };
  }

  try {
    return { text: decodeWith(bytes, 'utf-8'), encoding: 'utf-8' };
  } catch {
    return {
      text: decodeWith(bytes, 'windows-1252'),
      encoding: 'windows-1252',
    };
  }
}

function unquotedDelimiterCount(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectStructuralDelimiter(
  text: string,
  extension: string,
): ',' | ';' | '\t' | '|' | undefined {
  const lines = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 500);
  const candidates = [',', '\t', ';', '|'] as const;
  const preferred = extension === 'tsv' || extension === 'txt'
    ? '\t'
    : extension === 'csv'
      ? ','
      : undefined;
  let winner: (typeof candidates)[number] | undefined;
  let winningScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const counts = lines.map((line) => unquotedDelimiterCount(line, candidate));
    const structured = counts.filter((count) => count > 0);
    if (structured.length === 0) continue;
    const frequencies = new Map<number, number>();
    for (const count of structured) {
      frequencies.set(count, (frequencies.get(count) ?? 0) + 1);
    }
    const [modeCount, consistentLines] = [...frequencies]
      .sort(([countA, frequencyA], [countB, frequencyB]) =>
        frequencyB - frequencyA || countB - countA)[0];
    const headerEvidence = modeCount >= 2 && lines.some((line, index) =>
      counts[index] === modeCount
      && line
        .split(candidate)
        .filter((cell) => /[A-Za-zÀ-žΑ-ωµ°]/u.test(cell))
        .length >= 2);
    const score =
      (headerEvidence ? 1_000_000 : 0)
      + consistentLines * 1_000
      + structured.length * 10
      + modeCount
      + (candidate === preferred ? 0.1 : 0);
    if (score > winningScore) {
      winner = candidate;
      winningScore = score;
    }
  }
  return winner;
}

interface WhitespaceRow {
  fields: string[];
  error?: string;
}

function parseWhitespaceRow(line: string): WhitespaceRow {
  const fields: string[] = [];
  let index = 0;
  while (index < line.length) {
    while (index < line.length && /[\t ]/.test(line[index])) index += 1;
    if (index >= line.length) break;

    if (line[index] === '"') {
      index += 1;
      let value = '';
      let closed = false;
      while (index < line.length) {
        if (line[index] !== '"') {
          value += line[index];
          index += 1;
          continue;
        }
        if (line[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) return { fields, error: 'unterminated quoted field' };
      if (index < line.length && !/[\t ]/.test(line[index])) {
        return { fields, error: 'characters follow a quoted field without whitespace' };
      }
      fields.push(value);
      continue;
    }

    const start = index;
    while (index < line.length && !/[\t ]/.test(line[index])) {
      if (line[index] === '"') {
        return { fields, error: 'a quote occurs inside an unquoted field' };
      }
      index += 1;
    }
    fields.push(line.slice(start, index));
  }
  return { fields };
}

function looksNumericToken(value: string): boolean {
  return /^[+-]?(?:(?:\d+(?:[.,]\d*)?)|(?:[.,]\d+))(?:[eEdD][+-]?\d+)?$/.test(value);
}

function detectUnambiguousWhitespaceTable(text: string): boolean {
  const sampled = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 500)
    .map(parseWhitespaceRow);
  if (sampled.length < 2 || sampled.some(({ error }) => error)) return false;
  const columnCount = sampled[0].fields.length;
  if (
    columnCount < 2
    || sampled.some(({ fields }) => fields.length !== columnCount)
  ) return false;
  const headerEvidence = sampled[0].fields.filter((field) => /[A-Za-zÀ-žΑ-ωµ°]/u.test(field)).length >= 2;
  const numericRowEvidence = sampled
    .slice(1)
    .some(({ fields }) => fields.filter(looksNumericToken).length >= 2);
  return headerEvidence && numericRowEvidence;
}

function delimiterHasHeaderEvidence(text: string, delimiter: string): boolean {
  const firstLine = text
    .split(/\r\n|\n|\r/)
    .find((line) => line.trim() !== '');
  if (!firstLine || unquotedDelimiterCount(firstLine, delimiter) < 1) return false;
  return firstLine
    .split(delimiter)
    .filter((cell) => /[A-Za-zÀ-žΑ-ωµ°]/u.test(cell))
    .length >= 2;
}

function decodedTextLimitDiagnostic(
  text: string,
  fileName: string,
): IngestionDiagnostic | undefined {
  let rows = 1;
  let currentLineCharacters = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      rows += 1;
      currentLineCharacters = 0;
      if (rows > INGESTION_LIMITS.tableRows) {
        return {
          severity: 'error',
          code: 'delimited_row_limit_exceeded',
          message: `The text file contains more than ${INGESTION_LIMITS.tableRows} physical rows.`,
          sourceFile: fileName,
          suggestion: 'Split the source into smaller, scientifically coherent files before importing.',
        };
      }
    } else {
      currentLineCharacters += 1;
      if (currentLineCharacters > INGESTION_LIMITS.physicalLineCharacters) {
        return {
          severity: 'error',
          code: 'delimited_line_size_limit_exceeded',
          message: `A physical text row exceeds ${INGESTION_LIMITS.physicalLineCharacters} characters.`,
          sourceFile: fileName,
          suggestion: 'Remove unusually long metadata or split the table before importing.',
        };
      }
    }
  }
  return undefined;
}

function parseWhitespaceTable(
  text: string,
  fileName: string,
): DelimitedParseResult {
  const table: RawCell[][] = [];
  const lines = text.split(/\r\n|\n|\r/);
  let expectedColumns: number | undefined;
  let totalCells = 0;
  for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
    if (lines[rowIndex].trim() === '') {
      table.push([]);
      continue;
    }
    const parsed = parseWhitespaceRow(lines[rowIndex]);
    if (parsed.error) {
      return {
        table: [],
        delimiter: 'whitespace',
        diagnostics: [{
          severity: 'error',
          code: 'whitespace_structure_invalid',
          message: `Whitespace-delimited row ${rowIndex + 1} is ambiguous: ${parsed.error}.`,
          sourceFile: fileName,
          row: rowIndex + 1,
          suggestion: 'Quote headings that contain spaces or choose a character delimiter.',
        }],
      };
    }
    if (parsed.fields.length > INGESTION_LIMITS.tableColumns) {
      return {
        table: [],
        delimiter: 'whitespace',
        diagnostics: [{
          severity: 'error',
          code: 'delimited_column_limit_exceeded',
          message: `Row ${rowIndex + 1} contains ${parsed.fields.length} columns; the fixed limit is ${INGESTION_LIMITS.tableColumns}.`,
          sourceFile: fileName,
          row: rowIndex + 1,
        }],
      };
    }
    expectedColumns ??= parsed.fields.length;
    if (parsed.fields.length !== expectedColumns) {
      return {
        table: [],
        delimiter: 'whitespace',
        diagnostics: [{
          severity: 'error',
          code: 'whitespace_inconsistent_columns',
          message: `Whitespace-delimited row ${rowIndex + 1} has ${parsed.fields.length} columns; ${expectedColumns} were expected.`,
          sourceFile: fileName,
          row: rowIndex + 1,
          suggestion: 'Quote fields containing spaces and represent missing values explicitly.',
        }],
      };
    }
    const oversizedColumn = parsed.fields.findIndex(
      (field) => field.length > INGESTION_LIMITS.cellCharacters,
    );
    if (oversizedColumn >= 0) {
      return {
        table: [],
        delimiter: 'whitespace',
        diagnostics: [{
          severity: 'error',
          code: 'delimited_cell_size_limit_exceeded',
          message: `Cell ${oversizedColumn + 1} on row ${rowIndex + 1} exceeds ${INGESTION_LIMITS.cellCharacters} characters.`,
          sourceFile: fileName,
          row: rowIndex + 1,
          column: oversizedColumn + 1,
        }],
      };
    }
    totalCells += parsed.fields.length;
    if (totalCells > INGESTION_LIMITS.tableCells) {
      return {
        table: [],
        delimiter: 'whitespace',
        diagnostics: [{
          severity: 'error',
          code: 'delimited_cell_limit_exceeded',
          message: `The text table contains more than ${INGESTION_LIMITS.tableCells} cells.`,
          sourceFile: fileName,
        }],
      };
    }
    table.push(parsed.fields);
  }
  return { table, delimiter: 'whitespace', diagnostics: [] };
}

async function parseDelimitedFile(
  file: File,
  options: IngestionOptions,
): Promise<DelimitedParseResult> {
  const extension = fileExtension(file.name);
  const requestedDelimiter = options.delimiter ?? (extension === 'tsv' ? '\t' : undefined);
  let decoded: DecodedText;
  try {
    decoded = await decodeDelimitedText(file);
  } catch (error) {
    return {
      table: [],
      delimiter: requestedDelimiter,
      diagnostics: [
        {
          severity: 'error',
          code: 'text_decode_failed',
          message:
            error instanceof Error
              ? `The text file could not be decoded: ${error.message}`
              : 'The text file could not be decoded.',
          sourceFile: file.name,
          suggestion:
            'Export as UTF-8, UTF-16 LE/BE, Windows-1252, CSV, TSV, or unencrypted XLSX.',
        },
      ],
    };
  }
  const physicalLimitDiagnostic = decodedTextLimitDiagnostic(decoded.text, file.name);
  if (physicalLimitDiagnostic) {
    return {
      table: [],
      delimiter: requestedDelimiter,
      textEncoding: decoded.encoding,
      diagnostics: [physicalLimitDiagnostic],
    };
  }

  const detectedDelimiter = detectStructuralDelimiter(decoded.text, extension);
  const useWhitespace = requestedDelimiter === undefined
    && extension === 'txt'
    && detectUnambiguousWhitespaceTable(decoded.text)
    && (
      detectedDelimiter === undefined
      || !delimiterHasHeaderEvidence(decoded.text, detectedDelimiter)
    );
  if (useWhitespace) {
    const parsed = parseWhitespaceTable(decoded.text, file.name);
    if (decoded.encoding !== 'utf-8') {
      parsed.diagnostics.unshift({
        severity: 'info',
        code: 'text_encoding_detected',
        message: `Delimited text was decoded as ${decoded.encoding}.`,
        sourceFile: file.name,
      });
    }
    return { ...parsed, textEncoding: decoded.encoding };
  }

  const delimiter = requestedDelimiter ?? detectedDelimiter;
  return new Promise((resolve) => {
    const table: RawCell[][] = [];
    const diagnostics: IngestionDiagnostic[] = [];
    let totalCells = 0;
    let terminalDiagnostic: IngestionDiagnostic | undefined;
    let parsedDelimiter: string | undefined = delimiter;
    Papa.parse<string[]>(decoded.text, {
      delimiter,
      delimitersToGuess: [',', '\t', ';', '|'],
      dynamicTyping: false,
      // Physical rows are evidence. Normalizers ignore blank observations but
      // retain their positions so source-row provenance remains exact.
      skipEmptyLines: false,
      step: (parsed, parser) => {
        parsedDelimiter = parsed.meta.delimiter || parsedDelimiter;
        diagnostics.push(...parsed.errors.map((error) => ({
          severity: 'error' as const,
          code: `csv_${error.code.toLowerCase()}`,
          message: error.message,
          sourceFile: file.name,
          row: error.row === undefined ? undefined : error.row + 1,
          suggestion: error.code === 'UndetectableDelimiter'
            ? 'Choose comma, semicolon, tab, or pipe explicitly.'
            : 'Correct the delimited-text structure before importing.',
        })));
        const row = parsed.data as unknown as string[];
        const rowNumber = table.length + 1;
        if (row.length > INGESTION_LIMITS.tableColumns) {
          terminalDiagnostic = {
            severity: 'error',
            code: 'delimited_column_limit_exceeded',
            message: `Row ${rowNumber} contains ${row.length} columns; the fixed limit is ${INGESTION_LIMITS.tableColumns}.`,
            sourceFile: file.name,
            row: rowNumber,
          };
        }
        const oversizedColumn = row.findIndex(
          (field) => field.length > INGESTION_LIMITS.cellCharacters,
        );
        if (!terminalDiagnostic && oversizedColumn >= 0) {
          terminalDiagnostic = {
            severity: 'error',
            code: 'delimited_cell_size_limit_exceeded',
            message: `Cell ${oversizedColumn + 1} on row ${rowNumber} exceeds ${INGESTION_LIMITS.cellCharacters} characters.`,
            sourceFile: file.name,
            row: rowNumber,
            column: oversizedColumn + 1,
          };
        }
        totalCells += row.length;
        if (!terminalDiagnostic && totalCells > INGESTION_LIMITS.tableCells) {
          terminalDiagnostic = {
            severity: 'error',
            code: 'delimited_cell_limit_exceeded',
            message: `The text table contains more than ${INGESTION_LIMITS.tableCells} cells.`,
            sourceFile: file.name,
          };
        }
        if (terminalDiagnostic) {
          parser.abort();
          return;
        }
        table.push(row);
      },
      complete: (parsed) => {
        if (terminalDiagnostic) diagnostics.push(terminalDiagnostic);
        if (decoded.encoding !== 'utf-8') {
          diagnostics.unshift({
            severity: 'info',
            code: 'text_encoding_detected',
            message: `Delimited text was decoded as ${decoded.encoding}.`,
            sourceFile: file.name,
          });
        }
        if (table.length > 0 && table.every((row) => row.length <= 1)) {
          diagnostics.push({
            severity: 'error',
            code: 'single_column_table',
            message: 'The file decoded as a single-column table.',
            sourceFile: file.name,
            suggestion: 'Choose the correct delimiter or export a multi-column table.',
          });
        }
        resolve({
          table: terminalDiagnostic ? [] : table,
          delimiter: parsed.meta.delimiter || parsedDelimiter,
          textEncoding: decoded.encoding,
          diagnostics,
        });
      },
      error: (error: Error) => {
        resolve({
          table: [],
          delimiter,
          textEncoding: decoded.encoding,
          diagnostics: [
            {
              severity: 'error',
              code: 'csv_read_failed',
              message: error.message,
              sourceFile: file.name,
            },
          ],
        });
      },
    });
  });
}

async function ingestDelimitedFile(
  file: File,
  options: IngestionOptions,
  fileType: 'csv' | 'tsv' | 'txt',
  sourceFileId: string,
): Promise<IngestionResult> {
  const parsed = await parseDelimitedFile(file, options);
  const source: IngestionSource = {
    sourceFileId,
    fileName: file.name,
    fileType,
    delimiter: parsed.delimiter,
    textEncoding: parsed.textEncoding,
  };
  if (parsed.table.length === 0) {
    return emptyResult(source, 'error', [
      ...parsed.diagnostics,
      {
        severity: 'error',
        code: 'empty_file',
        message: 'The delimited file contains no readable rows.',
        sourceFile: file.name,
      },
    ]);
  }
  const normalized = options.layout === 'wide-series'
    ? ingestWideSeriesTable(parsed.table, source, options)
    : normalizeThermalTable(parsed.table, source, options);
  return mergeParseDiagnostics(normalized, parsed.diagnostics);
}

async function ingestWorkbook(
  file: File,
  options: IngestionOptions,
  sourceFileId: string,
): Promise<IngestionResult> {
  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  let securityInspection: Awaited<ReturnType<typeof inspectXlsxSecurity>>;
  try {
    securityInspection = await inspectXlsxSecurity(file);
    sheets = await readXlsxFile(securityInspection.arrayBuffer);
  } catch (error) {
    return emptyResult(
      { sourceFileId, fileName: file.name, fileType: 'xlsx' },
      'error',
      [
        error instanceof IngestionGuardError
          ? diagnosticFromGuardError(error, file.name)
          : {
              severity: 'error',
              code: 'xlsx_read_failed',
              message: error instanceof Error ? error.message : 'The workbook could not be decoded.',
              sourceFile: file.name,
              suggestion: 'Confirm that the file is a valid, unencrypted .xlsx workbook.',
            },
      ],
    );
  }

  const sheetNames = sheets.map(({ sheet }) => sheet);
  const securityDiagnostics = securityInspection.diagnostics;
  const sourceBase: IngestionSource = {
    sourceFileId,
    fileName: file.name,
    fileType: 'xlsx',
    availableSheets: sheetNames,
  };
  if (sheets.length === 0) {
    return emptyResult(sourceBase, 'error', [...securityDiagnostics,
      {
        severity: 'error',
        code: 'xlsx_no_sheets',
        message: 'The workbook contains no readable worksheets.',
        sourceFile: file.name,
      },
    ]);
  }

  if (sheets.length > 1 && options.sheet === undefined) {
    return emptyResult(sourceBase, 'needs_mapping', securityDiagnostics, [
      {
        kind: 'sheet',
        message: 'The workbook contains multiple worksheets; select the sheet to import.',
        allowedValues: sheetNames,
      },
    ]);
  }

  const soleSheetRequiresHiddenConfirmation = sheets.length === 1
    && options.sheet === undefined
    && securityInspection.hiddenSheetNames.has(sheets[0].sheet);
  if (soleSheetRequiresHiddenConfirmation) {
    return emptyResult(sourceBase, 'needs_mapping', securityDiagnostics, [
      {
        kind: 'sheet',
        message: 'The only worksheet is hidden; select it explicitly to confirm that it is the intended source.',
        allowedValues: sheetNames,
      },
    ]);
  }

  const selected =
    options.sheet === undefined
      ? sheets[0]
      : typeof options.sheet === 'number'
        ? sheets[options.sheet]
        : sheets.find(({ sheet }) => sheet === options.sheet);

  if (!selected) {
    return emptyResult(sourceBase, 'error', [...securityDiagnostics,
      {
        severity: 'error',
        code: 'xlsx_sheet_not_found',
        message: `Selected worksheet "${String(options.sheet)}" does not exist.`,
        sourceFile: file.name,
        suggestion: `Choose one of: ${sheetNames.join(', ')}.`,
      },
    ]);
  }

  const source = { ...sourceBase, sheetName: selected.sheet };
  if (options.layout === 'wide-series') {
    return mergeParseDiagnostics(
      ingestWideSeriesTable(selected.data as RawTable, source, options),
      securityDiagnostics,
    );
  }
  return mergeParseDiagnostics(
    normalizeThermalTable(selected.data as RawTable, source, options),
    securityDiagnostics,
  );
}

/** Decodes and normalizes one browser File without accessing the network. */
export async function ingestThermalFile(
  file: File,
  options: IngestionOptions = {},
): Promise<IngestionResult> {
  const extension = fileExtension(file.name);
  const fileSizeLimit = fileSizeLimitForExtension(extension);
  if (fileSizeLimit !== undefined && file.size > fileSizeLimit) {
    return emptyResult(
      {
        fileName: file.name,
        fileType: extension === 'xlsx' ? 'xlsx' : extension as 'csv' | 'tsv' | 'txt',
      },
      'error',
      [{
        severity: 'error',
        code: 'file_size_limit_exceeded',
        message: `The file contains ${file.size} bytes; the fixed ${extension.toUpperCase()} limit is ${fileSizeLimit} bytes.`,
        sourceFile: file.name,
        suggestion: 'Split the source into smaller, scientifically coherent files before importing.',
      }],
    );
  }
  let sourceFileId: string | undefined;
  try {
    ({ sourceFileId } = await hashSourceFile(file));
    if (extension === 'csv') return await ingestDelimitedFile(file, options, 'csv', sourceFileId);
    if (extension === 'tsv') return await ingestDelimitedFile(file, options, 'tsv', sourceFileId);
    if (extension === 'txt') return await ingestDelimitedFile(file, options, 'txt', sourceFileId);
    if (extension === 'xlsx') return await ingestWorkbook(file, options, sourceFileId);
    return emptyResult(
      {
        sourceFileId,
        fileName: file.name,
        fileType: extension === 'xlsx' ? 'xlsx' : 'table',
      },
      'error',
      [
        {
          severity: 'error',
          code: 'unsupported_file_type',
          message: `Unsupported file extension ".${extension || '(none)'}".`,
          sourceFile: file.name,
          suggestion: 'Use .csv, .tsv, .txt, or unencrypted .xlsx.',
        },
      ],
    );
  } catch (error) {
    return emptyResult(
      {
        ...(sourceFileId ? { sourceFileId } : {}),
        fileName: file.name,
        fileType: 'table',
      },
      'error',
      [
        {
          severity: 'error',
          code: 'unexpected_ingestion_failure',
          message: error instanceof Error ? error.message : 'Unexpected ingestion failure.',
          sourceFile: file.name,
        },
      ],
    );
  }
}

/**
 * Imports a bounded batch with bounded concurrency, and exposes aggregate
 * records only when every file is ready. This prevents memory amplification
 * and accidental analysis of a silent partial batch.
 */
export async function ingestThermalFiles(
  files: readonly File[],
  options: BatchIngestionOptions = {},
): Promise<BatchIngestionResult> {
  if (files.length === 0) {
    return {
      status: 'error',
      files: [],
      diagnostics: [
        {
          severity: 'error',
          code: 'no_files_selected',
          message: 'Select at least one CSV, TSV, TXT, or XLSX file.',
        },
      ],
      records: [],
      tables: { tAlphaBeta: [], betaTp: [] },
    };
  }

  if (files.length > INGESTION_LIMITS.batchFiles) {
    return {
      status: 'error',
      files: [],
      diagnostics: [{
        severity: 'error',
        code: 'batch_file_limit_exceeded',
        message: `The batch contains ${files.length} files; the fixed limit is ${INGESTION_LIMITS.batchFiles}.`,
        suggestion: 'Import a smaller, scientifically coherent batch.',
      }],
      records: [],
      tables: { tAlphaBeta: [], betaTp: [] },
    };
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > INGESTION_LIMITS.batchTotalBytes) {
    return {
      status: 'error',
      files: [],
      diagnostics: [{
        severity: 'error',
        code: 'batch_size_limit_exceeded',
        message: `The batch contains ${totalBytes} bytes; the fixed aggregate limit is ${INGESTION_LIMITS.batchTotalBytes} bytes.`,
        suggestion: 'Import a smaller, scientifically coherent batch.',
      }],
      records: [],
      tables: { tAlphaBeta: [], betaTp: [] },
    };
  }

  const results: IngestionResult[] = new Array(files.length);
  let nextFileIndex = 0;
  async function ingestNext(): Promise<void> {
    while (nextFileIndex < files.length) {
      const index = nextFileIndex;
      nextFileIndex += 1;
      const file = files[index];
      const fileOptions = Array.isArray(options)
        ? (options[index] ?? {})
        : (options as IngestionOptions);
      results[index] = await ingestThermalFile(file, fileOptions);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(files.length, INGESTION_LIMITS.batchConcurrency) },
      () => ingestNext(),
    ),
  );

  const seenSourceIds = new Map<string, string>();
  const duplicateDiagnostics: IngestionDiagnostic[] = [];
  for (const result of results) {
    const sourceFileId = result.source.sourceFileId;
    if (!sourceFileId) continue;
    const firstFileName = seenSourceIds.get(sourceFileId);
    if (firstFileName === undefined) {
      seenSourceIds.set(sourceFileId, result.source.fileName);
    } else {
      duplicateDiagnostics.push({
        severity: 'warning',
        code: 'duplicate_source_bytes_detected',
        message: `The batch contains byte-identical source files "${firstFileName}" and "${result.source.fileName}".`,
        sourceFile: result.source.fileName,
        suggestion: 'Confirm whether these are intentional independent runs or a duplicated upload before analysis.',
      });
    }
  }

  const status: IngestionStatus = results.some((result) => result.status === 'error')
    ? 'error'
    : results.some((result) => result.status === 'needs_mapping')
      ? 'needs_mapping'
      : 'ready';
  const diagnostics = [
    ...results.flatMap((result) => result.diagnostics),
    ...duplicateDiagnostics,
  ];
  const wideSeriesAudit = results.flatMap((result) => (
    result.wideSeriesAudit ? [result.wideSeriesAudit] : []
  ));

  if (status !== 'ready') {
    return {
      status,
      files: results,
      diagnostics,
      records: [],
      tables: { tAlphaBeta: [], betaTp: [] },
      ...(wideSeriesAudit.length > 0 ? { wideSeriesAudit } : {}),
    };
  }

  const records = results.flatMap((result) => result.records);
  return {
    status,
    files: results,
    diagnostics,
    records,
    tables: {
      tAlphaBeta: results.flatMap((result) => result.tables.tAlphaBeta),
      betaTp: results.flatMap((result) => result.tables.betaTp),
    },
    ...(wideSeriesAudit.length > 0 ? { wideSeriesAudit } : {}),
  };
}
