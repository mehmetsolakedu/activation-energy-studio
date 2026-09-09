import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildCorpusIntegrityLedger,
  CORPUS_LEDGER_SCHEMA,
  serializeCorpusIntegrityLedger,
} from '../scripts/generate-corpus-integrity-ledger.mjs';

let ledger;

beforeAll(() => {
  ledger = buildCorpusIntegrityLedger();
});

describe('corpus integrity ledger', () => {
  it('accounts for 231 immutable PDF files without relabelling them as 231 articles', () => {
    expect(ledger.schemaVersion).toBe(CORPUS_LEDGER_SCHEMA);
    expect(ledger.corpusAccounting).toMatchObject({
      processingEntryCount: 231,
      uniquePdfPathCount: 231,
      primaryPdfEntryCount: 230,
      supplementaryPdfEntryCount: 1,
      totalPdfBytes: 803_823_114,
      accountingStatus: 'PASS_231_PDF_FILES_ACCOUNTED',
    });
    expect(ledger.corpusAccounting.sourcePdfs).toHaveLength(231);
    expect(new Set(ledger.corpusAccounting.sourcePdfs.map((item) => item.sha256)).size).toBe(231);
    expect(ledger.corpusAccounting.supplementaryEntries[0]).toMatchObject({
      paperId: '009',
      relatedPrimaryPaperId: '008',
      unitType: 'supplementary_pdf',
    });
    expect(ledger.corpusAccounting.unitBoundary).toContain(
      'does not prove 231 distinct research articles',
    );
  });

  it('locks complete 001-231 extraction and canonical-evidence coverage', () => {
    expect(ledger.extractionCoverage).toMatchObject({
      extractionNotes: 231,
      renderedPageDirectories: 231,
      contactSheets: 231,
      readyFindings: 231,
      qualityWarnings: 231,
      status: 'PASS_231_OF_231_PROCESSING_IDS',
    });
    expect(ledger.canonicalEvidenceCoverage).toEqual({
      rowCount: 3121,
      uniquePaperIdCount: 231,
      blankPaperIdRows: 0,
      missingPaperIds: [],
      status: 'PASS_EXACT_001_231',
    });
  });

  it('preserves the raw method-matrix defect and applies only fingerprinted derived assignments', () => {
    expect(ledger.methodMatrixCoverage).toMatchObject({
      sourceRowCount: 2066,
      sourceBlankPaperIdRows: 30,
      sourceUniquePaperIdCount: 228,
      sourceMissingPaperIds: ['011', '012', '013'],
      sourceStatus: 'SOURCE_HAS_KNOWN_BLANK_ID_DEFECT',
      sourceMutation: 'none',
    });
    const correction = ledger.methodMatrixCoverage.derivedCorrection;
    expect(correction.assignmentCountsByPaperId).toEqual({
      '011': 10,
      '012': 10,
      '013': 10,
    });
    expect(correction.assignments).toHaveLength(30);
    expect(correction.assignments.every((item) => /^[a-f0-9]{64}$/.test(item.rowFingerprintSha256))).toBe(true);
    expect(correction).toMatchObject({
      correctedUniquePaperIdCount: 231,
      correctedMissingPaperIds: [],
      status: 'PASS_DERIVED_EXACT_001_231',
    });
  });

  it('records five implemented method routes but refuses an exhaustive implementation claim', () => {
    expect(ledger.softwareMethodRoutes.routes.map((route) => route.method)).toEqual([
      'FWO',
      'KAS',
      'STARINK',
      'FRIEDMAN',
      'KISSINGER',
    ]);
    expect(ledger.softwareMethodRoutes.routes.every((route) => route.implementationClass.startsWith('implemented'))).toBe(true);
    expect(ledger.softwareMethodRoutes.boundary).toContain('not a claim that every corpus row was implemented');
  });

  it('fails the local Q1/Q2 evidence claim instead of inheriting user-supplied metadata', () => {
    expect(ledger.journalQuartileEvidence).toEqual({
      candidateLedgerPaths: [],
      verifiedPaperCount: 0,
      status: 'NOT_VERIFIED',
      boundary:
        'No authoritative per-paper journal-quartile ledger was found. Q1/Q2 status is user-supplied context and must not be presented as locally verified corpus metadata.',
    });
    expect(ledger.overallBoundary).toContain('Not locally verified');
  });

  it('is deterministic and its checker rejects a stale retained ledger', () => {
    const first = serializeCorpusIntegrityLedger(ledger);
    const second = serializeCorpusIntegrityLedger(buildCorpusIntegrityLedger());
    expect(second).toBe(first);

    const directory = mkdtempSync(resolve(tmpdir(), 'aes-corpus-ledger-'));
    const output = resolve(directory, 'ledger.json');
    writeFileSync(output, first);
    const current = spawnSync(
      process.execPath,
      ['scripts/generate-corpus-integrity-ledger.mjs', '--check', '--output', output],
      { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
    );
    expect(current.status, current.stderr).toBe(0);
    expect(current.stdout).toContain('PASS CORPUS_INTEGRITY_LEDGER_CURRENT');

    writeFileSync(output, readFileSync(output, 'utf8').replace('230', '229'));
    const stale = spawnSync(
      process.execPath,
      ['scripts/generate-corpus-integrity-ledger.mjs', '--check', '--output', output],
      { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
    );
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('is stale');
  }, 30_000);
});
