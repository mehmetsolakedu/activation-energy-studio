import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPdfReport } from '../src/report';
import { makeSchemaV7QaReport } from './helpers/report-fixture';

const historicalV5Path = resolve(
  process.cwd(),
  'tests/pdf-baselines/activation-energy-report-schema-v5-qa.pdf',
);
const currentV7Path = resolve(
  process.cwd(),
  'tests/pdf-baselines/activation-energy-report-schema-v7-qa.pdf',
);

function extractPdfTextTokens(pdfBytes: Uint8Array): string {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const strings: string[] = [];
  const regex = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match !== null) {
    strings.push(
      match[1]
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\'),
    );
    match = regex.exec(raw);
  }
  return strings
    .join('')
    .replace(/-?\d+\.\d+(?:e[+-]?\d+)?/gi, (numStr) => {
      const val = Number(numStr);
      if (!Number.isFinite(val)) return numStr;
      if (Math.abs(val) < 1e-6) return '0';
      return val.toPrecision(10);
    });
}

describe('report PDF QA artifacts', () => {
  it('preserves the historical schema-v5 artifact byte-for-byte', async () => {
    const checkedIn = await readFile(historicalV5Path);
    expect(checkedIn.byteLength).toBe(124_991);
    expect(createHash('sha256').update(checkedIn).digest('hex')).toBe(
      '8b68be40c080a0d4463ac200d3cc10d088b94ee3fdea51a29dedbb83d31ee5e3',
    );
  });

  it('renders the schema-v7 scientific report and keeps its checked-in artifact byte-current', async () => {
    const report = await makeSchemaV7QaReport();
    const pdf = createPdfReport(report);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(report.results.filter((result) => result.resultType === 'isoconversional').length).toBe(
      36,
    );
    expect(report.results.some((result) => result.resultType === 'peak')).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(100_000);
    const rawPdf = Buffer.from(bytes).toString('latin1');
    expect(rawPdf).toContain("/CreationDate (D:20260718000000+00'00')");
    expect(rawPdf).toContain('/Author (Mehmet Solak)');
    if (process.env.WRITE_REPORT_QA_PDF === '1') {
      await mkdir(dirname(currentV7Path), { recursive: true });
      await writeFile(currentV7Path, bytes);
    }
    const checkedIn = await readFile(currentV7Path);
    const checkedInRaw = checkedIn.toString('latin1');
    expect((rawPdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(
      (checkedInRaw.match(/\/Type \/Page\b/g) ?? []).length,
    );
    expect(extractPdfTextTokens(bytes)).toBe(extractPdfTextTokens(checkedIn));
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(Buffer.compare(checkedIn, bytes)).toBe(0);
    }
  });
});
