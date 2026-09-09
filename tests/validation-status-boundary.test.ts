import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const status = readFileSync(
  resolve(projectRoot, 'CURRENT_VALIDATION_STATUS.md'),
  'utf8',
);
const usabilityProtocol = readFileSync(
  resolve(projectRoot, 'USABILITY_VALIDATION_PROTOCOL.md'),
  'utf8',
);
const hostedPlatformHarness = readFileSync(
  resolve(projectRoot, 'scripts/run-hosted-platform-validation.mjs'),
  'utf8',
);
const localMacOSDiagnostic = readFileSync(
  resolve(projectRoot, 'scripts/run-local-macos-platform-diagnostic.mjs'),
  'utf8',
);
const localMacOSDiagnosticVerifier = readFileSync(
  resolve(projectRoot, 'scripts/verify-local-macos-diagnostic.mjs'),
  'utf8',
);

function gateRow(gateId: string) {
  const row = status
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`| ${gateId} |`));
  if (!row) throw new Error(`Missing validation-status row for ${gateId}.`);
  return row;
}

describe('validation-status claim boundaries', () => {
  it('maps interim labels to the normative WEAK/MISSING taxonomy', () => {
    expect(status).toContain('`PARTIAL` = `WEAK`, `NOT TESTED` = `MISSING`');
    expect(status).toContain('Yalnız `PASS` kapıyı kapatır.');
  });

  it('does not close AC-UX-04 while the required observed 8/8 evidence is absent', () => {
    expect(usabilityProtocol).toContain(
      'insan oturumlarına ait UI/PDF kayıtları toplanmamıştır',
    );
    expect(gateRow('AC-UX-04')).toContain('| PARTIAL |');
    expect(gateRow('AC-UX-04')).not.toContain('| PASS |');
    expect(gateRow('AC-UX-04')).toContain('8/8');
  });

  it('keeps the hosted-harness contract-test count byte-current', () => {
    expect(gateRow('AC-PLAT-01')).toContain('27/27');
    expect(gateRow('AC-PLAT-01')).toContain(
      'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE',
    );
    expect(gateRow('AC-PLAT-01')).toContain('| PARTIAL |');
    expect(gateRow('AC-PLAT-01')).not.toContain('16/16');
    expect(hostedPlatformHarness).toContain(
      'TECHNICAL_OK ${metadata.claimStatus}',
    );
    expect(localMacOSDiagnostic).toContain(
      'TECHNICAL_OK ${result.metadata.claimStatus}',
    );
    expect(localMacOSDiagnosticVerifier).toContain(
      'TECHNICAL_OK ${result.claimStatus}',
    );
    expect(hostedPlatformHarness).not.toContain(
      'PASS ${metadata.claimStatus}',
    );
    expect(localMacOSDiagnostic).not.toContain(
      'PASS ${result.metadata.claimStatus}',
    );
    expect(localMacOSDiagnosticVerifier).not.toContain(
      'PASS ${result.claimStatus}',
    );
  });

  it('keeps the summary counts equal to the 72 gate rows', () => {
    const rows = status
      .split(/\r?\n/u)
      .filter((line) => /^\| AC-[A-Z]+-\d+ \|/u.test(line));
    const count = (label: string) =>
      rows.filter((line) => line.includes(`| ${label} |`)).length;

    expect(rows).toHaveLength(72);
    expect(count('PASS')).toBe(64);
    expect(count('PARTIAL')).toBe(6);
    expect(count('NOT TESTED')).toBe(2);
  });
});
