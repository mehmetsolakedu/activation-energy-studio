import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXTERNAL_OPEN_IDS,
  P0_EVIDENCE_LEDGER_PATH,
  P0_EVIDENCE_MAP_PATH,
  P0EvidenceLedgerError,
  buildP0EvidenceLedger,
  serializeP0EvidenceLedger,
  verifyP0EvidenceLedger,
} from '../scripts/p0-evidence-ledger.mjs';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CHECKED_LEDGER = path.resolve(PROJECT_ROOT, P0_EVIDENCE_LEDGER_PATH);
const temporaryDirectories = [];

function temporaryDirectory(prefix = 'aes-p0-ledger-') {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof P0EvidenceLedgerError);
    assert.equal(error.code, code);
    return true;
  });
}

function retainedCopy(mutator) {
  const directory = temporaryDirectory();
  const ledger = JSON.parse(readFileSync(CHECKED_LEDGER, 'utf8'));
  mutator(ledger);
  const ledgerPath = path.join(directory, 'ledger.json');
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledgerPath;
}

function copyProjectFile(projectRoot, relativePath) {
  const source = path.resolve(PROJECT_ROOT, ...relativePath.split('/'));
  const destination = path.resolve(projectRoot, ...relativePath.split('/'));
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function cloneMinimalLedgerProject() {
  const projectRoot = temporaryDirectory('aes-p0-project-');
  const ledger = buildP0EvidenceLedger(PROJECT_ROOT);
  const paths = new Set([
    ...Object.values(ledger.bindings).map((binding) => binding.path),
    ...ledger.criteria.map((entry) => entry.evidence.path),
  ]);
  for (const relativePath of paths) copyProjectFile(projectRoot, relativePath);
  return projectRoot;
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('checked-in ledger is deterministic, hash-current, and preserves 64 proven plus 8 external-open gates', () => {
  const expected = buildP0EvidenceLedger(PROJECT_ROOT);
  const retainedBytes = readFileSync(CHECKED_LEDGER, 'utf8');
  assert.equal(retainedBytes, serializeP0EvidenceLedger(expected));
  const verified = verifyP0EvidenceLedger({
    projectRoot: PROJECT_ROOT,
    ledgerPath: CHECKED_LEDGER,
  });
  assert.deepEqual(verified.summary, {
    criterionCount: 72,
    provenCount: 64,
    externalOpenCount: 8,
    evidenceFileCount: 14,
    evidenceSetSha256: verified.summary.evidenceSetSha256,
  });
  assert.match(verified.summary.evidenceSetSha256, /^[a-f0-9]{64}$/);
  assert.equal(new Set(verified.criteria.map((entry) => entry.id)).size, 72);
  assert.deepEqual(
    verified.criteria
      .filter((entry) => entry.disposition === 'EXTERNAL_OPEN')
      .map((entry) => entry.id),
    EXTERNAL_OPEN_IDS,
  );
  assert.equal(verified.claimBoundary.externalGatesClosed, false);
});

test('every criterion has a concrete current file hash and an explicit verifier outcome', () => {
  const ledger = verifyP0EvidenceLedger({
    projectRoot: PROJECT_ROOT,
    ledgerPath: CHECKED_LEDGER,
  });
  for (const entry of ledger.criteria) {
    const evidencePath = path.resolve(
      PROJECT_ROOT,
      ...entry.evidence.path.split('/'),
    );
    assert.equal(lstatSync(evidencePath).isSymbolicLink(), false);
    const bytes = readFileSync(evidencePath);
    assert.equal(entry.evidence.bytes, bytes.length);
    assert.equal(entry.evidence.sha256, sha256(bytes));
    assert.match(entry.verification.command, /^npm /);
    if (EXTERNAL_OPEN_IDS.includes(entry.id)) {
      assert.notEqual(entry.sourceStatus, 'PASS');
      assert.equal(
        entry.verification.observedOutcome,
        'TECHNICAL_PRECONDITION_PASS_EXTERNAL_EVIDENCE_MISSING',
      );
    } else {
      assert.equal(entry.sourceStatus, 'PASS');
      assert.equal(entry.verification.observedOutcome, 'PASS');
    }
  }
  for (const binding of Object.values(ledger.bindings)) {
    const bytes = readFileSync(path.resolve(PROJECT_ROOT, ...binding.path.split('/')));
    assert.equal(binding.sha256, sha256(bytes));
  }
});

test('rejects duplicate and missing criterion IDs', () => {
  const duplicate = retainedCopy((ledger) => {
    ledger.criteria[1].id = ledger.criteria[0].id;
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: duplicate }),
    'P0_LEDGER_DUPLICATE_ID',
  );

  const missing = retainedCopy((ledger) => {
    ledger.criteria.pop();
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: missing }),
    'P0_LEDGER_MISSING_ID',
  );
});

test('rejects stale evidence hashes, path traversal, placeholders, and status inflation', () => {
  const stale = retainedCopy((ledger) => {
    ledger.criteria[0].evidence.sha256 = '0'.repeat(64);
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: stale }),
    'P0_LEDGER_STALE_HASH',
  );

  const traversal = retainedCopy((ledger) => {
    ledger.criteria[0].evidence.path = '../outside.txt';
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: traversal }),
    'P0_LEDGER_PATH_TRAVERSAL',
  );

  const placeholder = retainedCopy((ledger) => {
    ledger.criteria[0].verification.command = 'npm run TODO';
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: placeholder }),
    'P0_LEDGER_PLACEHOLDER',
  );

  const inflated = retainedCopy((ledger) => {
    const entry = ledger.criteria.find((item) => item.id === 'AC-PLAT-02');
    entry.sourceStatus = 'PASS';
    entry.disposition = 'PROVEN';
    entry.verification.observedOutcome = 'PASS';
    entry.externalRequirement = null;
  });
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot: PROJECT_ROOT, ledgerPath: inflated }),
    'P0_LEDGER_STATUS_INFLATION',
  );
});

test('rejects symlink evidence even when the target bytes are unchanged', (context) => {
  const projectRoot = cloneMinimalLedgerProject();
  const ledger = buildP0EvidenceLedger(projectRoot);
  const ledgerPath = path.resolve(projectRoot, P0_EVIDENCE_LEDGER_PATH);
  writeFileSync(ledgerPath, serializeP0EvidenceLedger(ledger));

  const evidencePath = path.resolve(projectRoot, 'SCIENTIFIC_TRACEABILITY_REPORT.md');
  const targetPath = path.resolve(projectRoot, 'real-traceability-report.md');
  copyFileSync(evidencePath, targetPath);
  unlinkSync(evidencePath);
  try {
    symlinkSync(targetPath, evidencePath);
  } catch (error) {
    context.skip(`Symlink creation unavailable: ${error.code ?? error}`);
    return;
  }
  expectCode(
    () => verifyP0EvidenceLedger({ projectRoot, ledgerPath }),
    'P0_LEDGER_SYMLINK',
  );
});

test('mapping spec itself rejects duplicate/missing IDs and external-gate inflation', () => {
  const duplicateRoot = cloneMinimalLedgerProject();
  const duplicateMapPath = path.resolve(duplicateRoot, P0_EVIDENCE_MAP_PATH);
  const duplicateMap = JSON.parse(readFileSync(duplicateMapPath, 'utf8'));
  duplicateMap.groups[0].ids[1] = duplicateMap.groups[0].ids[0];
  writeFileSync(duplicateMapPath, `${JSON.stringify(duplicateMap, null, 2)}\n`);
  expectCode(
    () => buildP0EvidenceLedger(duplicateRoot),
    'P0_LEDGER_DUPLICATE_ID',
  );

  const missingRoot = cloneMinimalLedgerProject();
  const missingMapPath = path.resolve(missingRoot, P0_EVIDENCE_MAP_PATH);
  const missingMap = JSON.parse(readFileSync(missingMapPath, 'utf8'));
  missingMap.groups[1].ids.pop();
  writeFileSync(missingMapPath, `${JSON.stringify(missingMap, null, 2)}\n`);
  expectCode(
    () => buildP0EvidenceLedger(missingRoot),
    'P0_LEDGER_MISSING_ID',
  );

  const inflatedRoot = cloneMinimalLedgerProject();
  const inflatedMapPath = path.resolve(inflatedRoot, P0_EVIDENCE_MAP_PATH);
  const inflatedMap = JSON.parse(readFileSync(inflatedMapPath, 'utf8'));
  inflatedMap.expectedDispositionCounts = { PROVEN: 72, EXTERNAL_OPEN: 0 };
  writeFileSync(inflatedMapPath, `${JSON.stringify(inflatedMap, null, 2)}\n`);
  expectCode(
    () => buildP0EvidenceLedger(inflatedRoot),
    'P0_LEDGER_STATUS_INFLATION',
  );
});
