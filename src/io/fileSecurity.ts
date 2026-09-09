import { unzip } from 'fflate';

import type { IngestionDiagnostic } from './types';

/**
 * Resource ceilings for untrusted browser-side input.
 *
 * These values are deliberately fixed and exported so a release, its tests,
 * and any user-facing documentation can name the exact boundary.  They are
 * not inferred from available device memory.
 */
export const INGESTION_LIMITS = Object.freeze({
  delimitedFileBytes: 16 * 1024 * 1024,
  xlsxFileBytes: 32 * 1024 * 1024,
  tableRows: 250_000,
  tableColumns: 512,
  tableCells: 2_000_000,
  cellCharacters: 1_000_000,
  physicalLineCharacters: 2_000_000,
  zipEntries: 1_024,
  xlsxXmlEntryBytes: 32 * 1024 * 1024,
  xlsxXmlTotalBytes: 64 * 1024 * 1024,
  xlsxXmlCompressionRatio: 500,
  zipEntryNameBytes: 1_024,
});

export type IngestionLimitName = keyof typeof INGESTION_LIMITS;

interface GuardLocation {
  sheetName?: string;
  row?: number;
  column?: number;
}

/** A controlled, provenance-preserving rejection of untrusted file content. */
export class IngestionGuardError extends Error {
  readonly code: string;
  readonly suggestion?: string;
  readonly location: GuardLocation;

  constructor(
    code: string,
    message: string,
    suggestion?: string,
    location: GuardLocation = {},
  ) {
    super(message);
    this.name = 'IngestionGuardError';
    this.code = code;
    this.suggestion = suggestion;
    this.location = location;
  }
}

export function diagnosticFromGuardError(
  error: IngestionGuardError,
  sourceFile: string,
): IngestionDiagnostic {
  return {
    severity: 'error',
    code: error.code,
    message: error.message,
    sourceFile,
    ...error.location,
    ...(error.suggestion ? { suggestion: error.suggestion } : {}),
  };
}

export function fileSizeLimitForExtension(extension: string): number | undefined {
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    return INGESTION_LIMITS.delimitedFileBytes;
  }
  if (extension === 'xlsx') return INGESTION_LIMITS.xlsxFileBytes;
  return undefined;
}

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataStart: number;
  dataEnd: number;
}

export interface XlsxSecurityInspection {
  arrayBuffer: ArrayBuffer;
  hiddenSheetNames: ReadonlySet<string>;
  diagnostics: IngestionDiagnostic[];
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

function readUint16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) {
    throw corruptArchive('A ZIP field extends beyond the uploaded file.');
  }
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw corruptArchive('A ZIP field extends beyond the uploaded file.');
  }
  return view.getUint32(offset, true);
}

function corruptArchive(detail: string): IngestionGuardError {
  return new IngestionGuardError(
    'xlsx_corrupt_archive',
    `The XLSX ZIP container is malformed. ${detail}`,
    'Open the workbook in a trusted spreadsheet application and export a new unencrypted .xlsx file.',
  );
}

function decodeZipEntryName(bytes: Uint8Array, utf8: boolean): string {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252', { fatal: true }).decode(bytes);
  } catch {
    throw corruptArchive('A ZIP entry name is not valid text.');
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  if (view.byteLength < 22) throw corruptArchive('The end-of-directory record is missing.');
  const firstPossibleOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = readUint16(view, offset + 20);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  throw corruptArchive('The end-of-directory record is missing or truncated.');
}

function isUnsafeZipPath(name: string): boolean {
  return name === ''
    || name.startsWith('/')
    || name.startsWith('\\')
    || name.includes('\\')
    || name.split('/').some((segment) => segment === '..' || segment === '.');
}

function parseZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const diskNumber = readUint16(view, eocdOffset + 4);
  const centralDirectoryDisk = readUint16(view, eocdOffset + 6);
  const entriesOnDisk = readUint16(view, eocdOffset + 8);
  const entryCount = readUint16(view, eocdOffset + 10);
  const directorySize = readUint32(view, eocdOffset + 12);
  const directoryOffset = readUint32(view, eocdOffset + 16);

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== entryCount
  ) {
    throw corruptArchive('Multi-volume ZIP containers are not supported.');
  }
  if (
    entryCount === ZIP64_SENTINEL_16
    || directorySize === ZIP64_SENTINEL_32
    || directoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new IngestionGuardError(
      'xlsx_zip64_not_supported',
      'The XLSX uses ZIP64 metadata, which this bounded browser importer does not accept.',
      'Export a smaller standard .xlsx workbook containing only the required measurements.',
    );
  }
  if (entryCount > INGESTION_LIMITS.zipEntries) {
    throw new IngestionGuardError(
      'xlsx_zip_entry_limit_exceeded',
      `The workbook declares ${entryCount} ZIP entries; the fixed limit is ${INGESTION_LIMITS.zipEntries}.`,
      'Export only the worksheets required for this analysis.',
    );
  }
  if (directoryOffset + directorySize > eocdOffset) {
    throw corruptArchive('The central-directory bounds are inconsistent.');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = directoryOffset;
  let totalXmlBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw corruptArchive(`Central-directory entry ${index + 1} is invalid.`);
    }
    const flags = readUint16(view, offset + 8);
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const diskStart = readUint16(view, offset + 34);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;

    if (
      compressedSize === ZIP64_SENTINEL_32
      || uncompressedSize === ZIP64_SENTINEL_32
      || localHeaderOffset === ZIP64_SENTINEL_32
      || diskStart === ZIP64_SENTINEL_16
    ) {
      throw new IngestionGuardError(
        'xlsx_zip64_not_supported',
        'The XLSX contains a ZIP64 entry, which this bounded browser importer does not accept.',
        'Export a smaller standard .xlsx workbook containing only the required measurements.',
      );
    }
    if (diskStart !== 0 || nextOffset > directoryOffset + directorySize) {
      throw corruptArchive(`Central-directory entry ${index + 1} has invalid bounds.`);
    }
    if (nameLength === 0 || nameLength > INGESTION_LIMITS.zipEntryNameBytes) {
      throw new IngestionGuardError(
        'xlsx_zip_entry_name_limit_exceeded',
        `A ZIP entry name uses ${nameLength} bytes; the fixed limit is ${INGESTION_LIMITS.zipEntryNameBytes}.`,
      );
    }
    const name = decodeZipEntryName(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
      (flags & 0x0800) !== 0,
    );
    if (isUnsafeZipPath(name)) {
      throw new IngestionGuardError(
        'xlsx_unsafe_zip_path',
        'The workbook contains an unsafe ZIP entry path.',
        'Export a new .xlsx workbook from a trusted spreadsheet application.',
      );
    }
    if (names.has(name)) {
      throw corruptArchive('The ZIP container contains duplicate entry names.');
    }
    names.add(name);
    if ((flags & 0x0001) !== 0) {
      throw new IngestionGuardError(
        'xlsx_encrypted_workbook',
        'Encrypted XLSX entries cannot be inspected and are not accepted.',
        'Remove workbook encryption and export a new .xlsx file before importing.',
      );
    }

    if (readUint32(view, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw corruptArchive(`The local header for ZIP entry ${index + 1} is invalid.`);
    }
    const localFlags = readUint16(view, localHeaderOffset + 6);
    const localMethod = readUint16(view, localHeaderOffset + 8);
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    if ((localFlags & 0x0001) !== 0) {
      throw new IngestionGuardError(
        'xlsx_encrypted_workbook',
        'Encrypted XLSX entries cannot be inspected and are not accepted.',
        'Remove workbook encryption and export a new .xlsx file before importing.',
      );
    }
    if (localMethod !== method) {
      throw corruptArchive('A ZIP entry has inconsistent compression metadata.');
    }
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > directoryOffset || dataEnd < dataStart) {
      throw corruptArchive('A ZIP entry payload has invalid bounds.');
    }
    const localName = decodeZipEntryName(
      bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength),
      (localFlags & 0x0800) !== 0,
    );
    if (localName !== name) {
      throw corruptArchive('A ZIP entry has inconsistent local and central names.');
    }

    if (/\.xml(?:\.rels)?$/i.test(name)) {
      if (method !== 0 && method !== 8) {
        throw new IngestionGuardError(
          'xlsx_unsupported_xml_compression',
          `OOXML entry "${name}" uses unsupported ZIP compression method ${method}.`,
        );
      }
      if (uncompressedSize > INGESTION_LIMITS.xlsxXmlEntryBytes) {
        throw new IngestionGuardError(
          'xlsx_xml_entry_limit_exceeded',
          `OOXML entry "${name}" declares ${uncompressedSize} decompressed bytes; the per-entry limit is ${INGESTION_LIMITS.xlsxXmlEntryBytes}.`,
          'Export only the rows, columns, and worksheets required for this analysis.',
        );
      }
      totalXmlBytes += uncompressedSize;
      if (totalXmlBytes > INGESTION_LIMITS.xlsxXmlTotalBytes) {
        throw new IngestionGuardError(
          'xlsx_xml_total_limit_exceeded',
          `The workbook declares ${totalXmlBytes} decompressed OOXML bytes; the total limit is ${INGESTION_LIMITS.xlsxXmlTotalBytes}.`,
          'Export only the rows, columns, and worksheets required for this analysis.',
        );
      }
      const ratio = uncompressedSize / Math.max(1, compressedSize);
      if (ratio > INGESTION_LIMITS.xlsxXmlCompressionRatio) {
        throw new IngestionGuardError(
          'xlsx_xml_compression_ratio_exceeded',
          `OOXML entry "${name}" declares a ${ratio.toFixed(1)}:1 compression ratio; the fixed limit is ${INGESTION_LIMITS.xlsxXmlCompressionRatio}:1.`,
          'Export a fresh .xlsx workbook containing only the required measurements.',
        );
      }
    }

    entries.push({
      name,
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataStart,
      dataEnd,
    });
    offset = nextOffset;
  }

  if (offset !== directoryOffset + directorySize) {
    throw corruptArchive('The central-directory size does not match its entries.');
  }
  const payloadRanges = entries
    .map(({ localHeaderOffset, dataEnd }) => [localHeaderOffset, dataEnd] as const)
    .sort(([startA], [startB]) => startA - startB);
  for (let index = 1; index < payloadRanges.length; index += 1) {
    if (payloadRanges[index][0] < payloadRanges[index - 1][1]) {
      throw corruptArchive('ZIP entry payloads overlap.');
    }
  }
  return entries;
}

function decodeXml(bytes: Uint8Array): string {
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new IngestionGuardError(
      'xlsx_xml_decode_failed',
      'An OOXML part is not valid UTF-8 or BOM-marked UTF-16 text.',
      'Export a fresh .xlsx workbook from a trusted spreadsheet application.',
    );
  }
}

function unzipXmlParts(
  bytes: Uint8Array,
  entries: readonly ZipEntry[],
): Promise<Record<string, Uint8Array>> {
  const xmlNames = new Set(
    entries.filter(({ name }) => /\.xml(?:\.rels)?$/i.test(name)).map(({ name }) => name),
  );
  return new Promise((resolve, reject) => {
    unzip(
      bytes,
      { filter: ({ name }) => xmlNames.has(name) },
      (error, data) => {
        if (error) {
          reject(corruptArchive(`XML decompression failed: ${error.message}`));
          return;
        }
        resolve(data);
      },
    );
  });
}

function xmlAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
  return match?.[2];
}

function decodeXmlAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|amp|quot|apos|lt|gt);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
      if (hexadecimal !== undefined) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      switch (entity.toLowerCase()) {
        case '&amp;': return '&';
        case '&quot;': return '"';
        case '&apos;': return "'";
        case '&lt;': return '<';
        case '&gt;': return '>';
        default: return entity;
      }
    },
  );
}

function boundedLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '�').slice(0, 200);
}

interface WorkbookSheetMetadata {
  name: string;
  state?: string;
  relationId?: string;
  xmlPath?: string;
}

function normalizeWorkbookTarget(target: string): string | undefined {
  const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function workbookSheetMetadata(xmlParts: Readonly<Record<string, string>>): WorkbookSheetMetadata[] {
  const relationships = new Map<string, string>();
  const relationshipsXml = xmlParts['xl/_rels/workbook.xml.rels'];
  if (relationshipsXml) {
    const relationshipTags = relationshipsXml.match(/<(?:[\w.-]+:)?Relationship\b[^>]*>/gi) ?? [];
    for (const tag of relationshipTags) {
      const id = xmlAttribute(tag, 'Id');
      const target = xmlAttribute(tag, 'Target');
      if (!id || !target) continue;
      const normalized = normalizeWorkbookTarget(decodeXmlAttribute(target));
      if (normalized) relationships.set(id, normalized);
    }
  }

  const workbookXml = xmlParts['xl/workbook.xml'];
  if (!workbookXml) return [];
  const sheetTags = workbookXml.match(/<(?:[\w.-]+:)?sheet\b[^>]*>/gi) ?? [];
  return sheetTags.flatMap((tag) => {
    const rawName = xmlAttribute(tag, 'name');
    if (!rawName) return [];
    const relationId = xmlAttribute(tag, 'r:id');
    return [{
      name: decodeXmlAttribute(rawName),
      state: xmlAttribute(tag, 'state'),
      relationId,
      xmlPath: relationId ? relationships.get(relationId) : undefined,
    }];
  });
}

function columnIndexFromReference(reference: string): number | undefined {
  const match = /^\$?([A-Z]{1,4})\$?(\d+)$/i.exec(reference);
  if (!match) return undefined;
  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return column;
}

function rowIndexFromReference(reference: string): number | undefined {
  const match = /^\$?[A-Z]{1,4}\$?(\d+)$/i.exec(reference);
  return match ? Number(match[1]) : undefined;
}

interface WorksheetInspection {
  formulas: number;
  firstFormula?: GuardLocation;
  mergedRanges: number;
  cells: number;
}

function inspectWorksheetXml(xml: string, sheetName?: string): WorksheetInspection {
  let rowTags = 0;
  let cellTags = 0;
  let firstFormula: GuardLocation | undefined;
  const formulas = (xml.match(/<(?:[\w.-]+:)?f(?:\s|\/?>)/gi) ?? []).length;

  const dimensionTags = xml.match(/<(?:[\w.-]+:)?dimension\b[^>]*>/gi) ?? [];
  for (const tag of dimensionTags) {
    const dimension = xmlAttribute(tag, 'ref');
    if (!dimension) continue;
    for (const reference of dimension.split(':')) {
      const row = rowIndexFromReference(reference);
      const column = columnIndexFromReference(reference);
      if (row !== undefined && row > INGESTION_LIMITS.tableRows) {
        throw new IngestionGuardError(
          'xlsx_row_limit_exceeded',
          `Worksheet dimension ${dimension} exceeds the fixed row limit of ${INGESTION_LIMITS.tableRows}.`,
          'Export only the measurement rows required for this analysis.',
          { sheetName, row },
        );
      }
      if (column !== undefined && column > INGESTION_LIMITS.tableColumns) {
        throw new IngestionGuardError(
          'xlsx_column_limit_exceeded',
          `Worksheet dimension ${dimension} exceeds the fixed column limit of ${INGESTION_LIMITS.tableColumns}.`,
          'Export only the measurement columns required for this analysis.',
          { sheetName, column },
        );
      }
    }
  }

  const rowTagPattern = /<(?:[\w.-]+:)?row\b([^>]*)>/gi;
  for (let match = rowTagPattern.exec(xml); match; match = rowTagPattern.exec(xml)) {
    rowTags += 1;
    if (rowTags > INGESTION_LIMITS.tableRows) {
      throw new IngestionGuardError(
        'xlsx_row_limit_exceeded',
        `A worksheet contains more than ${INGESTION_LIMITS.tableRows} physical row elements.`,
        'Export only the measurement rows required for this analysis.',
        { sheetName },
      );
    }
    const rawRow = xmlAttribute(match[1], 'r');
    const row = rawRow === undefined ? undefined : Number(rawRow);
    if (row !== undefined && (!Number.isSafeInteger(row) || row < 1)) {
      throw corruptArchive('A worksheet row has an invalid index.');
    }
    if (row !== undefined && row > INGESTION_LIMITS.tableRows) {
      throw new IngestionGuardError(
        'xlsx_row_limit_exceeded',
        `Worksheet row ${row} exceeds the fixed row limit of ${INGESTION_LIMITS.tableRows}.`,
        'Export only the measurement rows required for this analysis.',
        { sheetName, row },
      );
    }
  }

  const cellTagPattern = /<(?:[\w.-]+:)?c\b([^>]*)>/gi;
  for (let match = cellTagPattern.exec(xml); match; match = cellTagPattern.exec(xml)) {
    cellTags += 1;
    if (cellTags > INGESTION_LIMITS.tableCells) {
      throw new IngestionGuardError(
        'xlsx_cell_limit_exceeded',
        `A worksheet contains more than ${INGESTION_LIMITS.tableCells} physical cell elements.`,
        'Export only the measurement cells required for this analysis.',
        { sheetName },
      );
    }
    const reference = xmlAttribute(match[1], 'r');
    if (!reference) throw corruptArchive('A worksheet cell is missing its address.');
    const row = rowIndexFromReference(reference);
    const column = columnIndexFromReference(reference);
    if (row === undefined || column === undefined) {
      throw corruptArchive(`Worksheet cell address "${boundedLabel(reference)}" is invalid.`);
    }
    if (row > INGESTION_LIMITS.tableRows) {
      throw new IngestionGuardError(
        'xlsx_row_limit_exceeded',
        `Worksheet cell ${boundedLabel(reference)} exceeds the fixed row limit of ${INGESTION_LIMITS.tableRows}.`,
        'Export only the measurement rows required for this analysis.',
        { sheetName, row, column },
      );
    }
    if (column > INGESTION_LIMITS.tableColumns) {
      throw new IngestionGuardError(
        'xlsx_column_limit_exceeded',
        `Worksheet cell ${boundedLabel(reference)} exceeds the fixed column limit of ${INGESTION_LIMITS.tableColumns}.`,
        'Export only the measurement columns required for this analysis.',
        { sheetName, row, column },
      );
    }
  }

  const cellBlockPattern = /<(?:[\w.-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?c\s*>/gi;
  for (let match = cellBlockPattern.exec(xml); match; match = cellBlockPattern.exec(xml)) {
    const formulaMatches = match[2].match(/<(?:[\w.-]+:)?f(?:\s|\/?>)/gi);
    if (!formulaMatches) continue;
    if (!firstFormula) {
      const reference = xmlAttribute(match[1], 'r');
      firstFormula = {
        sheetName,
        ...(reference ? {
          row: rowIndexFromReference(reference),
          column: columnIndexFromReference(reference),
        } : {}),
      };
    }
  }

  const textNodePattern = /<(?:[\w.-]+:)?(?:v|t|f)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:v|t|f)\s*>/gi;
  for (let match = textNodePattern.exec(xml); match; match = textNodePattern.exec(xml)) {
    if (match[1].length > INGESTION_LIMITS.cellCharacters) {
      throw new IngestionGuardError(
        'xlsx_cell_size_limit_exceeded',
        `A worksheet cell contains more than ${INGESTION_LIMITS.cellCharacters} XML characters.`,
        'Shorten unusually long cell content before importing.',
        { sheetName },
      );
    }
  }

  return {
    formulas,
    firstFormula,
    mergedRanges: (xml.match(/<(?:[\w.-]+:)?mergeCell\b/gi) ?? []).length,
    cells: cellTags,
  };
}

/**
 * Inspects the raw OOXML container before the spreadsheet parser can expose
 * cached formula results or allocate a sparse, attacker-selected grid.
 */
export async function inspectXlsxSecurity(file: File): Promise<XlsxSecurityInspection> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const signature = bytes.length >= 4
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true)
    : undefined;

  // Preserve the spreadsheet reader's established corrupt-file handling for
  // non-ZIP input.  Such input cannot trigger ZIP decompression; the reader
  // will return its normal controlled `xlsx_read_failed` diagnostic.
  if (signature !== ZIP_LOCAL_FILE_HEADER && signature !== ZIP_END_OF_CENTRAL_DIRECTORY) {
    return { arrayBuffer, hiddenSheetNames: new Set(), diagnostics: [] };
  }

  const entries = parseZipDirectory(bytes);
  const unzipped = await unzipXmlParts(bytes, entries);
  const declaredXmlEntries = new Map(
    entries.filter(({ name }) => /\.xml(?:\.rels)?$/i.test(name)).map((entry) => [entry.name, entry]),
  );
  const xmlParts: Record<string, string> = {};
  for (const [name, data] of Object.entries(unzipped)) {
    const declared = declaredXmlEntries.get(name);
    if (!declared || data.length !== declared.uncompressedSize) {
      throw corruptArchive('An OOXML part does not match its declared decompressed size.');
    }
    const xml = decodeXml(data);
    if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
      throw new IngestionGuardError(
        'xlsx_unsafe_xml_rejected',
        `OOXML entry "${name}" contains a document type or entity declaration.`,
        'Export a fresh .xlsx workbook from a trusted spreadsheet application.',
      );
    }
    xmlParts[name] = xml;
  }

  const sheetMetadata = workbookSheetMetadata(xmlParts);
  const sheetNameByPath = new Map(
    sheetMetadata.flatMap(({ name, xmlPath }) => xmlPath ? [[xmlPath, name] as const] : []),
  );
  const hiddenSheetNames = new Set(
    sheetMetadata
      .filter(({ state }) => state?.toLowerCase() === 'hidden' || state?.toLowerCase() === 'veryhidden')
      .map(({ name }) => name),
  );

  let formulaCount = 0;
  let firstFormula: GuardLocation | undefined;
  let mergedRangeCount = 0;
  let totalCells = 0;
  for (const [name, xml] of Object.entries(xmlParts)) {
    if (!/^xl\/worksheets\/.*\.xml$/i.test(name)) continue;
    const inspection = inspectWorksheetXml(xml, sheetNameByPath.get(name));
    formulaCount += inspection.formulas;
    firstFormula ??= inspection.firstFormula;
    mergedRangeCount += inspection.mergedRanges;
    totalCells += inspection.cells;
    if (totalCells > INGESTION_LIMITS.tableCells) {
      throw new IngestionGuardError(
        'xlsx_cell_limit_exceeded',
        `The workbook contains more than ${INGESTION_LIMITS.tableCells} physical cell elements.`,
        'Export only the measurement cells required for this analysis.',
      );
    }
  }

  if (formulaCount > 0) {
    throw new IngestionGuardError(
      'xlsx_formula_cells_rejected',
      `The workbook contains ${formulaCount} formula cell${formulaCount === 1 ? '' : 's'}. Cached formula values are not accepted as measured source data.`,
      'Replace formulas with explicitly reviewed values in a new workbook, then import that value-only file.',
      firstFormula,
    );
  }

  const diagnostics: IngestionDiagnostic[] = [];
  if (hiddenSheetNames.size > 0) {
    const names = [...hiddenSheetNames].map(boundedLabel);
    diagnostics.push({
      severity: 'warning',
      code: 'xlsx_hidden_sheets_detected',
      message: `The workbook contains ${names.length} hidden worksheet${names.length === 1 ? '' : 's'}: ${names.join(', ')}. Hidden sheets require explicit selection.`,
      sourceFile: file.name,
      suggestion: 'Confirm the intended visible or hidden worksheet explicitly before analysis.',
    });
  }
  if (mergedRangeCount > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'xlsx_merged_cells_detected',
      message: `The workbook contains ${mergedRangeCount} merged cell range${mergedRangeCount === 1 ? '' : 's'}; only the stored top-left cell values are importable.`,
      sourceFile: file.name,
      suggestion: 'Unmerge measurement-table cells if any required value is represented only by formatting.',
    });
  }

  return { arrayBuffer, hiddenSheetNames, diagnostics };
}
