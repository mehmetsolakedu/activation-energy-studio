import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { ingestThermalFile } from '../src/io';

/**
 * A valid minimal workbook with inline strings and without the optional
 * sharedStrings.xml or styles.xml parts. read-excel-file 9.3.2 crashed on this
 * shape with `readFiles(...).then is not a function` (upstream issue #124).
 */
function workbookWithoutOptionalParts(): File {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Temperature [K]</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Alpha [0-1]</t></is></c>
      <c r="C1" t="inlineStr"><is><t>beta [K/min]</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Run ID</t></is></c>
    </row>
    <row r="2"><c r="A2"><v>500</v></c><c r="B2"><v>0.2</v></c><c r="C2"><v>5</v></c><c r="D2" t="inlineStr"><is><t>values-run</t></is></c></row>
    <row r="3"><c r="A3"><v>550</v></c><c r="B3"><v>0.5</v></c><c r="C3"><v>5</v></c><c r="D3" t="inlineStr"><is><t>values-run</t></is></c></row>
    <row r="4"><c r="A4"><v>600</v></c><c r="B4"><v>0.8</v></c><c r="C4"><v>5</v></c><c r="D4" t="inlineStr"><is><t>values-run</t></is></c></row>
  </sheetData>
</worksheet>`),
  };
  const bytes = Uint8Array.from(zipSync(files, { level: 0 }));
  const file = new File([bytes.buffer], 'no-optional-parts.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: 0,
  });
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => bytes.slice().buffer,
  });
  return file;
}

describe('XLSX reader regression for optional OOXML parts', () => {
  it('reads a single-sheet workbook without shared strings or styles', async () => {
    const result = await ingestThermalFile(workbookWithoutOptionalParts());

    expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
    expect(result.source.sheetName).toBe('Data');
    expect(result.records).toHaveLength(3);
    expect(result.records[0]).toMatchObject({
      temperatureK: 500,
      alpha: 0.2,
      heatingRateKPerMin: 5,
      runId: 'values-run',
    });
  });
});
