import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import englishDotCsv from '../release/Platform-Locale-English-dot.csv?raw';
import mixedDecimalCsv from '../release/Platform-Locale-Mixed-invalid.csv?raw';
import legacyCommaCsv from '../release/Platform-Locale-Turkish-comma.csv?raw';

import {
  ingestThermalFile,
  normalizeThermalTable,
  type IngestionOptions,
  type NormalizedThermalRecord,
  type RawCell,
} from '../src/io';

const CANONICAL_HEADERS = [
  'Temperature [K]',
  'Time [s]',
  'Mass [mg]',
  'Mass [%]',
  'Alpha [0-1]',
  'beta [K/min]',
  'Run ID',
  'Sample',
  'Atmosphere',
] as const;

const CANONICAL_ROWS = [
  [400, 30, 250, 95, 0.1, 5, 'run-5', 'cellulose', 'N2'],
  [425.5, 60, 240, 90, 0.2, 5, 'run-5', 'cellulose', 'N2'],
] as const;

type NumericRecord = Pick<
  NormalizedThermalRecord,
  | 'temperatureK'
  | 'timeSeconds'
  | 'massMg'
  | 'massPercent'
  | 'alpha'
  | 'heatingRateKPerMin'
>;

const CANONICAL_NUMERIC: NumericRecord[] = [
  {
    temperatureK: 400,
    timeSeconds: 30,
    massMg: 250,
    massPercent: 95,
    alpha: 0.1,
    heatingRateKPerMin: 5,
  },
  {
    temperatureK: 425.5,
    timeSeconds: 60,
    massMg: 240,
    massPercent: 90,
    alpha: 0.2,
    heatingRateKPerMin: 5,
  },
];

function numericProjection(records: readonly NormalizedThermalRecord[]): NumericRecord[] {
  return records.map((record) => ({
    temperatureK: record.temperatureK,
    timeSeconds: record.timeSeconds,
    massMg: record.massMg,
    massPercent: record.massPercent,
    alpha: record.alpha,
    heatingRateKPerMin: record.heatingRateKPerMin,
  }));
}

function delimitedFixture(delimiter: ',' | '\t'): string {
  return [CANONICAL_HEADERS, ...CANONICAL_ROWS]
    .map((row) => row.join(delimiter))
    .join('\n');
}

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
          if (typeof value === 'number') {
            return `<c r="${reference}"><v>${value}</v></c>`;
          }
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

/** Builds a real minimal OOXML workbook so the XLSX decoder is not mocked. */
function xlsxFixture(): File {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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
      worksheetXml([CANONICAL_HEADERS, ...CANONICAL_ROWS]),
    ),
  };
  const bytes = Uint8Array.from(zipSync(files, { level: 0 }));
  return new File([bytes.buffer], 'canonical.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('AC-IO-01 canonical format equality', () => {
  const formatFixtures: [string, () => File][] = [
    [
      'CSV',
      () => new File([delimitedFixture(',')], 'canonical.csv', { type: 'text/csv' }),
    ],
    [
      'TSV',
      () =>
        new File([delimitedFixture('\t')], 'canonical.tsv', {
          type: 'text/tab-separated-values',
        }),
    ],
    ['XLSX', xlsxFixture],
  ];

  it.each(formatFixtures)(
    'normalizes the same numeric records from %s without tolerance',
    async (_format, makeFile) => {
      const result = await ingestThermalFile(makeFile());

      expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
      expect(numericProjection(result.records)).toStrictEqual(CANONICAL_NUMERIC);
      expect(
        result.tables.tAlphaBeta.map(({ temperatureK, alpha, heatingRateKPerMin }) => ({
          temperatureK,
          alpha,
          heatingRateKPerMin,
        })),
      ).toStrictEqual(
        CANONICAL_NUMERIC.map(({ temperatureK, alpha, heatingRateKPerMin }) => ({
          temperatureK,
          alpha,
          heatingRateKPerMin,
        })),
      );
    },
  );
});

const UNIT_BASE_HEADERS = [
  'Temperature [K]',
  'Time [s]',
  'Mass [mg]',
  'Mass [%]',
  'Alpha [0-1]',
  'beta [K/min]',
] as const;
const UNIT_BASE_ROW = [373.15, 120, 2500, 75, 0.25, 60] as const;
const UNIT_EXPECTED: NumericRecord = {
  temperatureK: 373.15,
  timeSeconds: 120,
  massMg: 2500,
  massPercent: 75,
  alpha: 0.25,
  heatingRateKPerMin: 60,
};

interface UnitVariant {
  name: string;
  column: number;
  header: string;
  value: number;
}

const UNIT_VARIANTS: UnitVariant[] = [
  { name: 'kelvin', column: 0, header: 'Temperature [K]', value: 373.15 },
  { name: 'celsius to kelvin', column: 0, header: 'Temperature [°C]', value: 100 },
  { name: 'seconds', column: 1, header: 'Time [s]', value: 120 },
  { name: 'minutes to seconds', column: 1, header: 'Time [min]', value: 2 },
  { name: 'milligrams', column: 2, header: 'Mass [mg]', value: 2500 },
  { name: 'grams to milligrams', column: 2, header: 'Mass [g]', value: 2.5 },
  { name: 'mass percent', column: 3, header: 'Mass [%]', value: 75 },
  { name: 'mass fraction to percent', column: 3, header: 'Mass fraction', value: 0.75 },
  { name: 'alpha fraction', column: 4, header: 'Alpha [0-1]', value: 0.25 },
  { name: 'alpha percent to fraction', column: 4, header: 'Alpha [%]', value: 25 },
  { name: 'kelvin per minute', column: 5, header: 'beta [K/min]', value: 60 },
  { name: 'kelvin per second', column: 5, header: 'beta [K/s]', value: 1 },
  { name: 'celsius per minute', column: 5, header: 'beta [°C/min]', value: 60 },
  { name: 'celsius per second', column: 5, header: 'beta [°C/s]', value: 1 },
];

function expectWithinRelativeTolerance(
  actual: number | undefined,
  expected: number | undefined,
): void {
  expect(actual).not.toBeUndefined();
  expect(expected).not.toBeUndefined();
  const scale = Math.max(Math.abs(expected!), 1);
  expect(Math.abs(actual! - expected!) / scale).toBeLessThanOrEqual(1e-12);
}

function expectCanonicalUnits(record: NormalizedThermalRecord): void {
  for (const key of Object.keys(UNIT_EXPECTED) as (keyof NumericRecord)[]) {
    expectWithinRelativeTolerance(record[key], UNIT_EXPECTED[key]);
  }
}

describe('AC-IO-05 complete unit conversion matrix', () => {
  it.each(UNIT_VARIANTS)('$name produces the canonical normalized row', (variant) => {
    const headers: string[] = [...UNIT_BASE_HEADERS];
    const row: number[] = [...UNIT_BASE_ROW];
    headers[variant.column] = variant.header;
    row[variant.column] = variant.value;

    const result = normalizeThermalTable(
      [headers, row],
      { fileName: `${variant.name}.table`, fileType: 'table' },
    );

    expect(result.status).toBe('ready');
    expectCanonicalUnits(result.records[0]);
  });

  const defaultRateVariants: [string, NonNullable<IngestionOptions['defaults']>['heatingRate']][] = [
    ['K/min', { value: 60, unit: 'K/min' }],
    ['K/s', { value: 1, unit: 'K/s' }],
    ['C/min', { value: 60, unit: 'C/min' }],
    ['C/s', { value: 1, unit: 'C/s' }],
  ];

  it.each(defaultRateVariants)(
    'normalizes a %s per-file heating-rate default to 60 K/min',
    (_name, heatingRate) => {
      const result = normalizeThermalTable(
        [UNIT_BASE_HEADERS.slice(0, 5), UNIT_BASE_ROW.slice(0, 5)],
        { fileName: `default-${_name}.table`, fileType: 'table' },
        { defaults: { heatingRate } },
      );

      expect(result.status).toBe('ready');
      expectCanonicalUnits(result.records[0]);
    },
  );
});

describe('AC-PLAT-03 numeric-locale safety', () => {
  it('gives the same canonical result for dot and comma decimals under English headers', async () => {
    const englishCommaCsv = [
      'Temperature [°C];Time [min];Mass [g];Mass [%];Alpha [%];beta [°C/s];Run ID;Sample;Atmosphere',
      '100;2;2,5;75;25;1;run-60;cellulose;N2',
    ].join('\n');
    const [dotDecimal, commaDecimal] = await Promise.all([
      ingestThermalFile(new File([englishDotCsv], 'english.csv', { type: 'text/csv' })),
      ingestThermalFile(new File([englishCommaCsv], 'comma-decimal.csv', { type: 'text/csv' })),
    ]);

    expect(dotDecimal.status).toBe('ready');
    expect(commaDecimal.status).toBe('ready');
    expect(dotDecimal.source).toMatchObject({ delimiter: ',', decimalSeparator: '.' });
    expect(commaDecimal.source).toMatchObject({ delimiter: ';', decimalSeparator: ',' });
    expect(numericProjection(commaDecimal.records)).toStrictEqual(
      numericProjection(dotDecimal.records),
    );
    expectCanonicalUnits(dotDecimal.records[0]);
  });

  it('requires explicit mapping for a retained non-English legacy fixture', async () => {
    const result = await ingestThermalFile(
      new File([legacyCommaCsv], 'legacy-comma.csv', { type: 'text/csv' }),
    );

    expect(result.status).toBe('needs_mapping');
    expect(result.records).toEqual([]);
    expect(result.source.delimiter).toBe(';');
    expect(result.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'column', role: 'temperature' }),
    );
  });

  it('fails closed for mixed decimal conventions even after an unsafe forced choice', async () => {
    const mixedDecimalEnglishCsv = mixedDecimalCsv.replace(
      /^.*$/mu,
      'Temperature [°C];Alpha [%];beta [°C/s]',
    );
    const file = new File([mixedDecimalEnglishCsv], 'mixed-decimal.csv', { type: 'text/csv' });

    const unresolved = await ingestThermalFile(file);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.records).toEqual([]);
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'decimal_separator', allowedValues: ['.', ','] }),
    );

    const forced = await ingestThermalFile(file, { decimalSeparator: ',' });
    expect(forced.status).toBe('error');
    expect(forced.records).toEqual([]);
    expect(forced.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid_numeric_value', value: '110.0' }),
    );
  });

  it('does not silently choose between duplicate English temperature aliases', () => {
    const result = normalizeThermalTable(
      [
        ['Temperature [K]', 'Sample temperature [K]', 'Alpha [0-1]', 'beta [K/min]'],
        [373.15, 373.15, 0.25, 60],
      ],
      { fileName: 'duplicate-temperature.table', fileType: 'table' },
    );

    expect(result.status).toBe('needs_mapping');
    expect(result.records).toEqual([]);
    expect(result.mappingNeeds).toContainEqual(
      expect.objectContaining({
        kind: 'column',
        role: 'temperature',
        candidateColumns: [0, 1],
      }),
    );
  });
});
