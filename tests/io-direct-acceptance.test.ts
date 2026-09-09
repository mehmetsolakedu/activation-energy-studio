import Ajv from 'ajv';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import {
  ingestThermalFile,
  ingestThermalFiles,
  normalizeThermalTable,
  type BatchIngestionResult,
  type IngestionResult,
  type ProvenanceColumnMapping,
  type RawCell,
} from '../src/io';
import {
  createProjectReport,
  serializeProjectReport,
  type ReproducibleProjectReport,
} from '../src/report';
import projectReportSchema from '../src/report/project-report.schema.json';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let result = '';
  let remaining = index + 1;
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    result = String.fromCharCode(65 + digit) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

function worksheetXml(rows: readonly (readonly RawCell[])[]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
          return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

/** A real two-sheet OOXML workbook. No XLSX reader mock participates in this fixture. */
function multiSheetXlsxFixture(): File {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Curves" sheetId="1" r:id="rId1"/>
    <sheet name="Peaks" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts>
  <fills count="1"><fill/></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(
      worksheetXml([
        ['Temperature [K]', 'Alpha [0-1]', 'beta [K/min]', 'Run ID'],
        [500, 0.2, 5, 'curve-5'],
        [550, 0.5, 5, 'curve-5'],
        [600, 0.8, 5, 'curve-5'],
        [510, 0.2, 10, 'curve-10'],
        [560, 0.5, 10, 'curve-10'],
        [610, 0.8, 10, 'curve-10'],
        [520, 0.2, 20, 'curve-20'],
        [570, 0.5, 20, 'curve-20'],
        [620, 0.8, 20, 'curve-20'],
      ]),
    ),
    'xl/worksheets/sheet2.xml': strToU8(
      worksheetXml([
        ['Tp [K]', 'beta [K/min]', 'Run ID', 'Peak resolved', 'Peak quality', 'Peak source signal', 'Analyst confirmed'],
        [620, 5, 'peak-5', true, 'clear-interior', 'external-beta-tp-table', true],
        [640, 10, 'peak-10', true, 'clear-interior', 'external-beta-tp-table', true],
        [660, 20, 'peak-20', true, 'clear-interior', 'external-beta-tp-table', true],
      ]),
    ),
  };

  const bytes = Uint8Array.from(zipSync(files, { level: 0 }));
  return new File([bytes.buffer], 'two-sheets.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const GENERIC_TEMPERATURE_BETA_TABLE = [
  ['Temperature [K]', 'beta [K/min]'],
  [620, 5],
  [640, 10],
  [660, 20],
] as const;

const VERIFIED_BETA_TP_TABLE = [
  ['Temperature [K]', 'beta [K/min]', 'Peak resolved', 'Peak quality', 'Peak source signal', 'Analyst confirmed'],
  [620, 5, true, 'clear-interior', 'external-beta-tp-table', true],
  [640, 10, true, 'clear-interior', 'external-beta-tp-table', true],
  [660, 20, true, 'clear-interior', 'external-beta-tp-table', true],
] as const;

function expectNoDownstreamResult(batch: BatchIngestionResult): void {
  expect(batch.records).toEqual([]);
  expect(batch.tables).toEqual({ tAlphaBeta: [], betaTp: [] });

  const adapted = buildThermalRuns(batch);
  expect(adapted.runs).toEqual([]);
  expect(adapted.diagnostics).toContainEqual(
    expect.objectContaining({ severity: 'error', code: 'INGESTION_NOT_READY' }),
  );

  const analysis = analyzeActivationEnergy(adapted.runs);
  expect(analysis.status).toBe('refused');
  expect(analysis.methods).toEqual([]);
  expect(analysis.kissinger).toBeUndefined();
}

describe('AC-IO-02 real multi-sheet XLSX selection', () => {
  it('fails closed before sheet selection and imports only the selected real OOXML sheet', async () => {
    const workbook = multiSheetXlsxFixture();

    const unresolved = await ingestThermalFile(workbook);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.records).toEqual([]);
    expect(unresolved.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
    expect(unresolved.source.availableSheets).toEqual(['Curves', 'Peaks']);
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'sheet', allowedValues: ['Curves', 'Peaks'] }),
    );

    const peaks = await ingestThermalFile(workbook, { sheet: 'Peaks' });
    expect(peaks.status, JSON.stringify(peaks.diagnostics)).toBe('ready');
    expect(peaks.source.sheetName).toBe('Peaks');
    expect(peaks.headers).toEqual([
      'Tp [K]',
      'beta [K/min]',
      'Run ID',
      'Peak resolved',
      'Peak quality',
      'Peak source signal',
      'Analyst confirmed',
    ]);
    expect(peaks.records).toHaveLength(3);
    expect(peaks.tables.tAlphaBeta).toEqual([]);
    expect(peaks.tables.betaTp).toHaveLength(3);
    expect(peaks.tables.betaTp.map((row) => row.peakTemperatureK)).toEqual([620, 640, 660]);
    expect(peaks.records.map((record) => record.provenance)).toMatchObject([
      { fileName: 'two-sheets.xlsx', sheetName: 'Peaks', sourceRow: 2, inferences: undefined },
      { fileName: 'two-sheets.xlsx', sheetName: 'Peaks', sourceRow: 3, inferences: undefined },
      { fileName: 'two-sheets.xlsx', sheetName: 'Peaks', sourceRow: 4, inferences: undefined },
    ]);
    expect(peaks.tables.betaTp.map((row) => row.provenance)).toEqual(
      peaks.records.map((record) => record.provenance),
    );

    const curves = await ingestThermalFile(workbook, { sheet: 'Curves' });
    expect(curves.status, JSON.stringify(curves.diagnostics)).toBe('ready');
    expect(curves.source.sheetName).toBe('Curves');
    expect(curves.tables.tAlphaBeta).toHaveLength(9);
    expect(curves.tables.betaTp).toEqual([]);
    expect(curves.records.every((record) => record.provenance.sheetName === 'Curves')).toBe(true);
  });
});

describe('AC-IO-03/04 table-kind and required-signal determinism', () => {
  it('requires a decision for generic temperature+beta and deterministically separates peak from curve', () => {
    const source = { fileName: 'generic-temperature-beta.table', fileType: 'table' as const };

    const automatic = normalizeThermalTable(GENERIC_TEMPERATURE_BETA_TABLE, source);
    expect(automatic.status).toBe('needs_mapping');
    expect(automatic.records).toEqual([]);
    expect(automatic.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
    expect(automatic.mappingNeeds).toContainEqual(
      expect.objectContaining({
        kind: 'table_kind',
        allowedValues: ['beta-tp', 'curve'],
      }),
    );

    const peak = normalizeThermalTable(GENERIC_TEMPERATURE_BETA_TABLE, source, {
      tableKind: 'beta-tp',
    });
    expect(peak.status).toBe('needs_mapping');
    expect(peak.records).toEqual([]);
    expect(peak.mappingNeeds.map((need) => need.role)).toEqual(expect.arrayContaining([
      'peakResolved',
      'peakQuality',
      'peakSourceSignal',
      'peakAnalystConfirmed',
    ]));

    const verifiedPeak = normalizeThermalTable(VERIFIED_BETA_TP_TABLE, source, {
      tableKind: 'beta-tp',
    });
    expect(verifiedPeak.status).toBe('ready');
    expect(verifiedPeak.records.every((record) => record.temperatureKind === 'peak')).toBe(true);
    expect(verifiedPeak.tables.tAlphaBeta).toEqual([]);
    expect(verifiedPeak.tables.betaTp.map((row) => row.peakTemperatureK)).toEqual([620, 640, 660]);

    const signalLessCurve = normalizeThermalTable(GENERIC_TEMPERATURE_BETA_TABLE, source, {
      tableKind: 'curve',
    });
    expect(signalLessCurve.status).toBe('needs_mapping');
    expect(signalLessCurve.records).toEqual([]);
    expect(signalLessCurve.tables).toEqual({ tAlphaBeta: [], betaTp: [] });
    expect(signalLessCurve.mappingNeeds).toContainEqual(
      expect.objectContaining({
        kind: 'column',
        message: expect.stringMatching(/conversion, mass, or mass-percentage signal/i),
      }),
    );
  });
});

describe('AC-IO-07 no partial downstream calculation', () => {
  it('keeps needs_mapping records, tables, adapter runs and method results empty', async () => {
    const csv = [
      'Temperature [K],beta [K/min]',
      '620,5',
      '640,10',
      '660,20',
    ].join('\n');
    const batch = await ingestThermalFiles([
      new File([csv], 'generic-temperature-beta.csv', { type: 'text/csv' }),
    ]);

    expect(batch.status).toBe('needs_mapping');
    expect(batch.files[0]?.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'table_kind' }),
    );
    expectNoDownstreamResult(batch);
  });

  it('keeps error records, tables, adapter runs and method results empty', async () => {
    const csv = [
      'Temperature [K],Alpha [0-1],beta [K/min]',
      '620,0.2,5',
      'not-a-number,0.5,10',
      '660,0.8,20',
    ].join('\n');
    const batch = await ingestThermalFiles([
      new File([csv], 'invalid-number.csv', { type: 'text/csv' }),
    ]);

    expect(batch.status).toBe('error');
    expect(batch.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'invalid_numeric_value' }),
    );
    expectNoDownstreamResult(batch);
  });
});

function provenanceMappingProjection(result: IngestionResult): ProvenanceColumnMapping[] {
  return result.mappings.map((mapping) => ({
    role: mapping.role,
    sourceColumnIndex: mapping.columnIndex,
    sourceHeader: mapping.header,
    sourceUnit: mapping.unit ?? null,
    confidence: mapping.confidence,
  }));
}

function createProvenanceReport(batch: BatchIngestionResult): ReproducibleProjectReport {
  expect(batch.status).toBe('ready');
  const adapted = buildThermalRuns(batch, undefined, 'provenance round-trip stage');
  expect(adapted.diagnostics).toEqual([]);
  expect(adapted.runs).toHaveLength(3);
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: [0.5],
    methods: ['KAS'],
    includeKissinger: false,
  });
  expect(analysis.status).not.toBe('refused');
  const sourceFileId = batch.files[0].source.sourceFileId;
  if (!sourceFileId?.startsWith('sha256:')) {
    throw new Error('The direct-ingestion fixture requires a hash-derived sourceFileId.');
  }

  return createProjectReport(
    analysis,
    {
      projectName: 'AC-IO-06 direct provenance round-trip',
      sample: 'direct-ingestion-fixture',
      process: 'thermal decomposition',
      stage: 'alpha 0.2-0.8',
      atmosphere: 'N2',
      sourceFiles: [
        {
          sourceFileId,
          name: batch.files[0].source.fileName,
          sizeBytes: 1,
          sha256: sourceFileId.slice('sha256:'.length),
        },
      ],
    },
    {
      ingestion: batch,
      analysisConfiguration: {
        alphaGrid: [0.5],
        methods: ['KAS'],
        includeKissinger: false,
        minR2Warning: 0.98,
      },
    },
  );
}

function expectProvenanceRoundTrip(
  batch: BatchIngestionResult,
  expected: {
    fileName: string;
    sheetName: string | null;
    sourceUnits: Record<string, string | null>;
  },
): void {
  const input = batch.files[0];
  const mappings = provenanceMappingProjection(input);
  expect(Object.fromEntries(mappings.map((mapping) => [mapping.role, mapping.sourceUnit]))).toEqual(
    expected.sourceUnits,
  );

  for (const record of batch.records) {
    expect(record.provenance).toMatchObject({
      fileName: expected.fileName,
      ...(expected.sheetName === null ? {} : { sheetName: expected.sheetName }),
      sourceRow: expect.any(Number),
      columnMappings: mappings,
    });
    expect(record.provenance.sourceRow).toBeGreaterThanOrEqual(2);
  }
  for (const row of batch.tables.tAlphaBeta) {
    const normalized = batch.records.find(
      (record) =>
        record.runId === row.runId && record.provenance.sourceRow === row.provenance.sourceRow,
    );
    expect(normalized).toBeDefined();
    expect(row.provenance).toEqual(normalized?.provenance);
  }

  const report = createProvenanceReport(batch);
  expect(report.traceability.gaps).toEqual([]);
  expect(report.traceability.observationLinks).toHaveLength(3);
  for (const observation of report.traceability.observationLinks) {
    expect(observation.sourceResolution).toBe('exact');
    expect(observation.sourceRows).toHaveLength(1);
    const source = observation.sourceRows[0];
    expect(source).toEqual({
      sourceFileId: batch.files[0].source.sourceFileId,
      fileName: expected.fileName,
      sheetName: expected.sheetName,
      sourceRow: expect.any(Number),
      contribution: 'exact',
      columnMappings: mappings,
    });
    const normalized = batch.records.find(
      (record) =>
        record.provenance.sourceRow === source.sourceRow && record.runId === observation.runId,
    );
    expect(normalized?.provenance.columnMappings).toEqual(source.columnMappings);
  }

  const serialized = serializeProjectReport(report);
  const parsed = JSON.parse(serialized) as ReproducibleProjectReport;
  expect(parsed.traceability.observationLinks[0].sourceRows[0].columnMappings).toEqual(mappings);
  const validate = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(
    projectReportSchema,
  );
  expect(validate(parsed), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

describe('AC-IO-06 row-level provenance round-trip', () => {
  it('carries mapping and source units from a real CSV into intermediate rows and JSON observations', async () => {
    const csv = [
      'Temperature [°C],Alpha [0-1],beta [°C/min],Run ID',
      '226.85,0.2,5,csv-5',
      '276.85,0.5,5,csv-5',
      '326.85,0.8,5,csv-5',
      '236.85,0.2,10,csv-10',
      '286.85,0.5,10,csv-10',
      '336.85,0.8,10,csv-10',
      '246.85,0.2,20,csv-20',
      '296.85,0.5,20,csv-20',
      '346.85,0.8,20,csv-20',
    ].join('\n');
    const batch = await ingestThermalFiles([
      new File([csv], 'provenance-curves.csv', { type: 'text/csv' }),
    ]);

    expectProvenanceRoundTrip(batch, {
      fileName: 'provenance-curves.csv',
      sheetName: null,
      sourceUnits: {
        temperature: 'C',
        alpha: 'fraction',
        heatingRate: 'C/min',
        run: null,
      },
    });
  });

  it('carries mapping, source units and sheet identity from a real OOXML XLSX into JSON observations', async () => {
    const batch = await ingestThermalFiles([multiSheetXlsxFixture()], [{ sheet: 'Curves' }]);

    expectProvenanceRoundTrip(batch, {
      fileName: 'two-sheets.xlsx',
      sheetName: 'Curves',
      sourceUnits: {
        temperature: 'K',
        alpha: 'fraction',
        heatingRate: 'K/min',
        run: null,
      },
    });
  });

  it('keeps legacy provenance readable but exposes absent row mapping as an explicit report gap', async () => {
    const batch = await ingestThermalFiles([multiSheetXlsxFixture()], [{ sheet: 'Curves' }]);
    const withoutMappings = <T extends { provenance: BatchIngestionResult['records'][number]['provenance'] }>(
      value: T,
    ): T => {
      const provenance = { ...value.provenance };
      delete provenance.columnMappings;
      return { ...value, provenance };
    };
    const legacyBatch: BatchIngestionResult = {
      ...batch,
      records: batch.records.map(withoutMappings),
      tables: {
        tAlphaBeta: batch.tables.tAlphaBeta.map(withoutMappings),
        betaTp: batch.tables.betaTp.map(withoutMappings),
      },
    };

    const report = createProvenanceReport(legacyBatch);
    expect(report.traceability.observationLinks).toHaveLength(3);
    expect(
      report.traceability.gaps.filter((gap) => gap.code === 'SOURCE_MAPPING_UNAVAILABLE'),
    ).toHaveLength(3);
    expect(
      report.traceability.observationLinks.every((observation) =>
        observation.sourceRows.every((source) => source.columnMappings.length === 0),
      ),
    ).toBe(true);
  });
});
