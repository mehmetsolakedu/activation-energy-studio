import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { ingestThermalFile } from '../src/io';
import { INGESTION_LIMITS } from '../src/io/fileSecurity';

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function canonicalWorksheet(options: {
  formula?: boolean;
  merged?: boolean;
  rowReference?: number;
  cellReference?: string;
  prefixXml?: string;
} = {}): string {
  const rowReference = options.rowReference ?? 2;
  const temperatureReference = options.cellReference ?? `A${rowReference}`;
  const alphaCell = options.formula
    ? `<c r="B${rowReference}"><f>0.05*2</f><v>0.1</v></c>`
    : `<c r="B${rowReference}"><v>0.1</v></c>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${options.prefixXml ?? ''}
  <sheetData>
    <row r="1">
      ${inlineCell('A1', 'Temperature [K]')}
      ${inlineCell('B1', 'Alpha [0-1]')}
      ${inlineCell('C1', 'beta [K/min]')}
      ${inlineCell('D1', 'Run ID')}
    </row>
    <row r="${rowReference}">
      <c r="${temperatureReference}"><v>400</v></c>
      ${alphaCell}
      <c r="C${rowReference}"><v>5</v></c>
      ${inlineCell(`D${rowReference}`, 'run-5')}
    </row>
    <row r="${rowReference + 1}">
      <c r="A${rowReference + 1}"><v>425</v></c>
      <c r="B${rowReference + 1}"><v>0.2</v></c>
      <c r="C${rowReference + 1}"><v>5</v></c>
      ${inlineCell(`D${rowReference + 1}`, 'run-5')}
    </row>
  </sheetData>
  ${options.merged ? '<mergeCells count="1"><mergeCell ref="A1:A1"/></mergeCells>' : ''}
</worksheet>`;
}

function xlsxBytes(options: {
  sheetName?: string;
  sheetState?: 'hidden' | 'veryHidden';
  worksheetXml?: string;
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  workbookDoctype?: boolean;
} = {}): Uint8Array {
  const sheetName = options.sheetName ?? 'Data';
  const state = options.sheetState ? ` state="${options.sheetState}"` : '';
  const workbookDoctype = options.workbookDoctype
    ? '<!DOCTYPE workbook [<!ENTITY audit "unsafe">]>'
    : '';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
${workbookDoctype}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${sheetName}" sheetId="1"${state} r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts><fills count="1"><fill/></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(options.worksheetXml ?? canonicalWorksheet()),
  };
  return Uint8Array.from(zipSync(files, { level: options.level ?? 0 }));
}

function xlsxFile(bytes: Uint8Array, name = 'audit.xlsx'): File {
  const copy = Uint8Array.from(bytes);
  return new File([copy.buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function findCentralEntry(bytes: Uint8Array, entryName: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === entryName) return offset;
  }
  throw new Error(`Central entry not found: ${entryName}`);
}

describe('bounded delimited-text ingestion', () => {
  it('imports an unambiguous quoted whitespace-delimited TXT table', async () => {
    const text = [
      '"Temperature [K]" "Alpha [0-1]" "beta [K/min]" "Run ID"',
      '400 0.1 5 run-5',
      '425 0.2 5 run-5',
    ].join('\n');
    const result = await ingestThermalFile(new File([text], 'space-table.txt'));

    expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
    expect(result.source.delimiter).toBe('whitespace');
    expect(result.records.map(({ temperatureK, alpha, heatingRateKPerMin }) => ({
      temperatureK,
      alpha,
      heatingRateKPerMin,
    }))).toStrictEqual([
      { temperatureK: 400, alpha: 0.1, heatingRateKPerMin: 5 },
      { temperatureK: 425, alpha: 0.2, heatingRateKPerMin: 5 },
    ]);
  });

  it('does not mistake decimal commas for a CSV delimiter in whitespace TXT', async () => {
    const text = [
      '"Temperature [K]" "Alpha [0-1]" "beta [K/min]" "Run ID"',
      '400,5 0,1 5 run-5',
      '425,5 0,2 5 run-5',
    ].join('\n');
    const result = await ingestThermalFile(new File([text], 'comma-decimal.txt'));

    expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
    expect(result.source).toMatchObject({ delimiter: 'whitespace', decimalSeparator: ',' });
    expect(result.records[0]).toMatchObject({ temperatureK: 400.5, alpha: 0.1 });
  });

  it('refuses an ambiguous unquoted whitespace header without partial records', async () => {
    const text = [
      'Sample temperature [K] Alpha [0-1] beta [K/min]',
      '400 0.1 5',
      '425 0.2 5',
    ].join('\n');
    const result = await ingestThermalFile(new File([text], 'ambiguous-spaces.txt'));

    expect(result.status).toBe('error');
    expect(result.records).toEqual([]);
    expect(result.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'single_column_table' }),
    );
  });

  it('rejects measured row and column inflation with controlled diagnostics', async () => {
    const tooManyRows = [
      '"Temperature [K]" "Alpha [0-1]" "beta [K/min]" "Run ID"',
      '400 0.1 5 run-5\n'.repeat(INGESTION_LIMITS.tableRows),
    ].join('\n');
    const rowResult = await ingestThermalFile(new File([tooManyRows], 'rows.txt'));
    expect(rowResult.status).toBe('error');
    expect(rowResult.records).toEqual([]);
    expect(rowResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'delimited_row_limit_exceeded' }),
    );

    const columnCount = INGESTION_LIMITS.tableColumns + 1;
    const header = Array.from({ length: columnCount }, (_, index) => `field_${index}`).join(' ');
    const values = Array.from({ length: columnCount }, () => '1').join(' ');
    const columnResult = await ingestThermalFile(
      new File([`${header}\n${values}`], 'columns.txt'),
    );
    expect(columnResult.status).toBe('error');
    expect(columnResult.records).toEqual([]);
    expect(columnResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'delimited_column_limit_exceeded', row: 1 }),
    );
  });

  it('checks the measured file size before hashing or parsing', async () => {
    const file = new File(['small'], 'declared-large.csv');
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: INGESTION_LIMITS.delimitedFileBytes + 1,
    });
    const result = await ingestThermalFile(file);

    expect(result.status).toBe('error');
    expect(result.source.sourceFileId).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'file_size_limit_exceeded' }),
    );
  });
});

describe('raw OOXML security inspection', () => {
  it('rejects cached formula values before workbook normalization', async () => {
    const result = await ingestThermalFile(
      xlsxFile(xlsxBytes({ worksheetXml: canonicalWorksheet({ formula: true }) }), 'formula.xlsx'),
    );

    expect(result.status).toBe('error');
    expect(result.records).toEqual([]);
    expect(result.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
    expect(result.source.sourceFileId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_formula_cells_rejected',
      sourceFile: 'formula.xlsx',
      sheetName: 'Data',
      row: 2,
      column: 2,
    }));
  });

  it('requires explicit selection of a sole hidden worksheet and records the warning', async () => {
    const file = xlsxFile(xlsxBytes({ sheetName: 'Hidden data', sheetState: 'hidden' }), 'hidden.xlsx');
    const unresolved = await ingestThermalFile(file);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.records).toEqual([]);
    expect(unresolved.mappingNeeds).toContainEqual(expect.objectContaining({
      kind: 'sheet',
      allowedValues: ['Hidden data'],
    }));
    expect(unresolved.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_hidden_sheets_detected',
      sourceFile: 'hidden.xlsx',
    }));

    const selected = await ingestThermalFile(file, { sheet: 'Hidden data' });
    expect(selected.status, JSON.stringify(selected.diagnostics)).toBe('ready');
    expect(selected.records).toHaveLength(2);
    expect(selected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_hidden_sheets_detected',
    }));
  });

  it('makes merged-cell presence visible without silently fabricating values', async () => {
    const result = await ingestThermalFile(
      xlsxFile(xlsxBytes({ worksheetXml: canonicalWorksheet({ merged: true }) }), 'merged.xlsx'),
    );

    expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
    expect(result.records).toHaveLength(2);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      code: 'xlsx_merged_cells_detected',
      sourceFile: 'merged.xlsx',
    }));
  });

  it('rejects sparse row and column coordinates before rectangular allocation', async () => {
    const excessiveRow = INGESTION_LIMITS.tableRows + 1;
    const rowResult = await ingestThermalFile(xlsxFile(xlsxBytes({
      worksheetXml: canonicalWorksheet({ rowReference: excessiveRow }),
    }), 'sparse-row.xlsx'));
    expect(rowResult.status).toBe('error');
    expect(rowResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_row_limit_exceeded',
      row: excessiveRow,
    }));

    const columnResult = await ingestThermalFile(xlsxFile(xlsxBytes({
      worksheetXml: canonicalWorksheet({ cellReference: 'XFD2' }),
    }), 'sparse-column.xlsx'));
    expect(columnResult.status).toBe('error');
    expect(columnResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_column_limit_exceeded',
      column: 16_384,
    }));
  });

  it('rejects decompression bombs from declared size and compression ratio metadata', async () => {
    const declaredBomb = xlsxBytes();
    const worksheetEntry = findCentralEntry(declaredBomb, 'xl/worksheets/sheet1.xml');
    new DataView(
      declaredBomb.buffer,
      declaredBomb.byteOffset,
      declaredBomb.byteLength,
    ).setUint32(
      worksheetEntry + 24,
      INGESTION_LIMITS.xlsxXmlEntryBytes + 1,
      true,
    );
    const declaredResult = await ingestThermalFile(
      xlsxFile(declaredBomb, 'declared-xml-bomb.xlsx'),
    );
    expect(declaredResult.status).toBe('error');
    expect(declaredResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_xml_entry_limit_exceeded',
    }));

    const repeatedXml = canonicalWorksheet({
      prefixXml: `<extLst><ext>${'A'.repeat(1_000_000)}</ext></extLst>`,
    });
    const ratioResult = await ingestThermalFile(xlsxFile(xlsxBytes({
      worksheetXml: repeatedXml,
      level: 9,
    }), 'ratio-bomb.xlsx'));
    expect(ratioResult.status).toBe('error');
    expect(ratioResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_xml_compression_ratio_exceeded',
    }));
  });

  it('rejects encrypted flags and unsafe XML while keeping corrupt input controlled', async () => {
    const encrypted = xlsxBytes();
    const centralEntry = findCentralEntry(encrypted, '[Content_Types].xml');
    const encryptedView = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength);
    encryptedView.setUint16(centralEntry + 8, encryptedView.getUint16(centralEntry + 8, true) | 1, true);
    const encryptedResult = await ingestThermalFile(xlsxFile(encrypted, 'encrypted.xlsx'));
    expect(encryptedResult.status).toBe('error');
    expect(encryptedResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_encrypted_workbook',
    }));

    const unsafeXmlResult = await ingestThermalFile(
      xlsxFile(xlsxBytes({ workbookDoctype: true }), 'entity.xlsx'),
    );
    expect(unsafeXmlResult.status).toBe('error');
    expect(unsafeXmlResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_unsafe_xml_rejected',
    }));

    const corruptResult = await ingestThermalFile(
      xlsxFile(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), 'corrupt.xlsx'),
    );
    expect(corruptResult.status).toBe('error');
    expect(corruptResult.records).toEqual([]);
    expect(corruptResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_corrupt_archive',
    }));

    const nonZipResult = await ingestThermalFile(
      new File(['not a workbook'], 'not-zip.xlsx'),
    );
    expect(nonZipResult.status).toBe('error');
    expect(nonZipResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'xlsx_read_failed',
    }));
  });
});
