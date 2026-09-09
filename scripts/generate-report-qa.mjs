import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const vitest = resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', 'tests/report-qa-artifact.test.ts'],
  {
    cwd: process.cwd(),
    env: { ...process.env, WRITE_REPORT_QA_PDF: '1' },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
