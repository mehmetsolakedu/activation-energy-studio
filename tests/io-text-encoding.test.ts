import { describe, expect, it } from 'vitest';

import { ingestThermalFile } from '../src/io';

function byteBuffer(bytes: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function utf16(text: string, byteOrder: 'le' | 'be'): ArrayBuffer {
  const bytes: number[] = byteOrder === 'le' ? [0xff, 0xfe] : [0xfe, 0xff];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (byteOrder === 'le') bytes.push(code & 0xff, code >>> 8);
    else bytes.push(code >>> 8, code & 0xff);
  }
  return byteBuffer(bytes);
}

function windows1252(text: string): ArrayBuffer {
  return byteBuffer([...text].map((character) => {
    const code = character.charCodeAt(0);
    if (code > 0xff) throw new Error(`Test character is outside Windows-1252: ${character}`);
    return code;
  }));
}

const NR_CELS_EXPORT = [
  'NR-CELS 2Cmin 17012024 600C Ar Jana',
  'Creation Date : 12.08.2025 14:20:31',
  'User : admin',
  '',
  'TG |-bTG] :',
  ' Initial Mass : 10,479 mg',
  ' Molar Mass : N/A',
  '',
  'dTG :',
  ' Initial Mass : 10,479 mg',
  ' Molar Mass : N/A',
  '',
  'HeatFlow |-bHeatFlow] :',
  ' Initial Mass : 10,479 mg',
  ' Molar Mass : N/A',
  '',
  'Time(s)\tSample Temperature(°C)\tTG |-bTG](%)\tdTG(%/min)\tHeatFlow |-bHeatFlow](µV)',
  '326,11801\t21\t100,127088\t0,040709\t-0,083078',
  '',
  '414,522916\t22\t100,170532\t0,034228\t-0,208749',
].join('\r\n');

describe('instrument TXT decoding and physical-row provenance', () => {
  it('guides a UTF-16LE NR-CELS export to its real header and preserves blank source rows', async () => {
    const file = new File(
      [utf16(NR_CELS_EXPORT, 'le')],
      'NR-CELS 30 2Cmin.txt',
      { type: 'text/plain' },
    );

    const unresolved = await ingestThermalFile(file);
    expect(unresolved.status).toBe('needs_mapping');
    expect(unresolved.source).toMatchObject({
      fileType: 'txt',
      delimiter: '\t',
      textEncoding: 'utf-16le',
    });
    expect(unresolved.mappingNeeds).toContainEqual(
      expect.objectContaining({ kind: 'header_row' }),
    );
    expect(unresolved.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'text_encoding_detected',
        message: 'Delimited text was decoded as utf-16le.',
      }),
    );

    const resolved = await ingestThermalFile(file, {
      headerRow: 16,
      delimiter: '\t',
      decimalSeparator: ',',
      tableKind: 'curve',
      columnMapping: {
        time: { column: 0, unit: 's' },
        temperature: { column: 1, unit: 'C' },
        massPercent: { column: 2, unit: '%' },
      },
      defaults: {
        heatingRate: { value: 2, unit: 'C/min' },
        runId: 'nr-cels30-2',
        sample: 'NR-CELS30',
        atmosphere: 'Ar',
        stage: 'thermal-decomposition',
      },
    });
    expect(resolved.status).toBe('ready');
    expect(resolved.source.headerRow).toBe(16);
    expect(resolved.records).toHaveLength(2);
    expect(resolved.records[0]).toMatchObject({
      timeSeconds: 326.11801,
      temperatureK: 294.15,
      massPercent: 100.127088,
      heatingRateKPerMin: 2,
      runId: 'nr-cels30-2',
      sample: 'NR-CELS30',
      atmosphere: 'Ar',
      stage: 'thermal-decomposition',
      provenance: {
        sourceRow: 18,
      },
    });
    expect(resolved.records[1].provenance.sourceRow).toBe(20);

    const timeIgnored = await ingestThermalFile(file, {
      headerRow: 16,
      delimiter: '\t',
      decimalSeparator: ',',
      tableKind: 'curve',
      ignoredRoles: ['time'],
      columnMapping: {
        temperature: { column: 1, unit: 'C' },
        massPercent: { column: 2, unit: '%' },
      },
      defaults: {
        heatingRate: { value: 2, unit: 'C/min' },
        runId: 'nr-cels30-2',
      },
    });
    expect(timeIgnored.status).toBe('ready');
    expect(timeIgnored.mappings.some(({ role }) => role === 'time')).toBe(false);
    expect(timeIgnored.records.every(({ timeSeconds }) => timeSeconds === undefined)).toBe(true);
  });

  it('decodes UTF-16BE browser-side without relying on the operating system locale', async () => {
    const text = [
      'Temperature [K]\tAlpha [0-1]\tbeta [K/min]',
      '400\t0.1\t5',
      '425\t0.2\t5',
    ].join('\n');
    const result = await ingestThermalFile(
      new File([utf16(text, 'be')], 'canonical.txt', { type: 'text/plain' }),
    );

    expect(result.status).toBe('ready');
    expect(result.source.textEncoding).toBe('utf-16be');
    expect(result.records.map(({ temperatureK, alpha }) => ({ temperatureK, alpha }))).toEqual([
      { temperatureK: 400, alpha: 0.1 },
      { temperatureK: 425, alpha: 0.2 },
    ]);
  });

  it('falls back deterministically to Windows-1252 for legacy instrument text', async () => {
    const text = [
      'Temperature [°C]\tAlpha [0-1]\tbeta [K/min]',
      '100\t0.1\t5',
      '125\t0.2\t5',
    ].join('\r\n');
    const result = await ingestThermalFile(
      new File([windows1252(text)], 'legacy.txt', { type: 'text/plain' }),
    );

    expect(result.status).toBe('ready');
    expect(result.source.textEncoding).toBe('windows-1252');
    expect(result.records[0].temperatureK).toBe(373.15);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'text_encoding_detected',
      }),
    );
  });

  it('fails closed for a malformed BOM-declared UTF-16 stream', async () => {
    const result = await ingestThermalFile(
      new File([byteBuffer([0xff, 0xfe, 0x41])], 'broken.txt', {
        type: 'text/plain',
      }),
    );

    expect(result.status).toBe('error');
    expect(result.records).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'text_decode_failed',
      }),
    );
  });
});
