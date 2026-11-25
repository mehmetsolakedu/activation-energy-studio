import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPdfReport } from '../src/report';
import { makeSchemaV4QaReport } from './helpers/report-fixture';

const outputPath = resolve(
  process.cwd(),
  'output/pdf/activation-energy-report-schema-v4-qa.pdf',
);

describe('schema-v4 PDF QA artifact', () => {
  it('renders the multi-method scientific report and keeps the checked-in artifact byte-current', async () => {
    const report = await makeSchemaV4QaReport();
    const pdf = createPdfReport(report);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(report.results.filter((result) => result.resultType === 'isoconversional').length).toBe(
      36,
    );
    expect(report.results.some((result) => result.resultType === 'peak')).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(100_000);
    if (process.env.WRITE_REPORT_QA_PDF === '1') {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
    }
    const checkedIn = await readFile(outputPath);
    expect(Buffer.compare(checkedIn, bytes)).toBe(0);
  });
});
