import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPdfReport } from '../src/report';
import { makeSchemaV6QaReport } from './helpers/report-fixture';

const historicalV5Path = resolve(
  process.cwd(),
  'output/pdf/activation-energy-report-schema-v5-qa.pdf',
);
const currentV6Path = resolve(
  process.cwd(),
  'output/pdf/activation-energy-report-schema-v6-qa.pdf',
);

describe('report PDF QA artifacts', () => {
  it('preserves the historical schema-v5 artifact byte-for-byte', async () => {
    const checkedIn = await readFile(historicalV5Path);
    expect(checkedIn.byteLength).toBe(124_991);
    expect(createHash('sha256').update(checkedIn).digest('hex')).toBe(
      '8b68be40c080a0d4463ac200d3cc10d088b94ee3fdea51a29dedbb83d31ee5e3',
    );
  });

  it('renders the schema-v6 scientific report and keeps its checked-in artifact byte-current', async () => {
    const report = await makeSchemaV6QaReport();
    const pdf = createPdfReport(report);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(report.results.filter((result) => result.resultType === 'isoconversional').length).toBe(
      36,
    );
    expect(report.results.some((result) => result.resultType === 'peak')).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(100_000);
    if (process.env.WRITE_REPORT_QA_PDF === '1') {
      await mkdir(dirname(currentV6Path), { recursive: true });
      await writeFile(currentV6Path, bytes);
    }
    const checkedIn = await readFile(currentV6Path);
    expect(Buffer.compare(checkedIn, bytes)).toBe(0);
  });
});
