import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertValidatedMvpReleaseReadiness,
  BLOCKING_SEVERITIES,
  buildKnownIssuesLedger,
  DEFAULT_KNOWN_ISSUES_RELATIVE_PATH,
  deriveKnownIssuesSummary,
  KNOWN_ISSUES_LEDGER_STATE,
  KNOWN_ISSUE_DEFINITIONS,
  serializeKnownIssuesLedger,
  validateKnownIssuesLedger,
  verifyKnownIssuesLedger,
} from '../scripts/generate-known-issues.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const LEDGER_PATH = path.resolve(
  PROJECT_ROOT,
  ...DEFAULT_KNOWN_ISSUES_RELATIVE_PATH.split('/'),
);
const SCHEMA_PATH = path.resolve(
  PROJECT_ROOT,
  'governance/KNOWN_ISSUES.schema.json',
);
const SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  'scripts/generate-known-issues.mjs',
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function checkedInLedger() {
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
}

function schema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

test('checked-in ledger is schema-valid, deterministic, canonical, and current', () => {
  const verified = verifyKnownIssuesLedger({ projectRoot: PROJECT_ROOT });
  const rebuilt = buildKnownIssuesLedger(PROJECT_ROOT);
  assert.deepEqual(verified, rebuilt);
  assert.equal(readFileSync(LEDGER_PATH, 'utf8'), serializeKnownIssuesLedger(rebuilt));
  assert.equal(verified.ledgerState, KNOWN_ISSUES_LEDGER_STATE);
  assert.equal(verified.summary.validatedMvpEligible, false);
  assert.equal(verified.summary.releaseReadiness, 'BLOCKED_BY_OPEN_CRITICAL_MAJOR_OR_P0_ISSUES');
});

test('issue definitions retain every required evidence boundary and severity', () => {
  const byId = Object.fromEntries(
    KNOWN_ISSUE_DEFINITIONS.map((issue) => [issue.id, issue]),
  );
  assert.deepEqual(Object.keys(byId).sort(), [
    'KI-CORPUS-001',
    'KI-DATA-001',
    'KI-PLAT-001',
    'KI-PUB-001',
    'KI-REV-001',
    'KI-UX-001',
  ]);

  assert.match(byId['KI-CORPUS-001'].statement, /231 distinct article identities/iu);
  assert.match(byId['KI-CORPUS-001'].statement, /Q1\/Q2/iu);
  assert.equal(byId['KI-CORPUS-001'].priority, 'P1');
  assert.equal(byId['KI-CORPUS-001'].blocksValidatedMvp, false);

  assert.match(byId['KI-DATA-001'].statement, /only integrated.*raw-curve lane/iu);
  assert.match(
    byId['KI-DATA-001'].statement,
    /Zenodo DOI 10\.5281\/zenodo\.20777046/iu,
  );
  assert.match(byId['KI-DATA-001'].statement, /Paper 063.*publication-derived/iu);
  assert.equal(byId['KI-DATA-001'].priority, 'P1');
  assert.equal(byId['KI-DATA-001'].blocksValidatedMvp, false);

  assert.equal(byId['KI-PUB-001'].state, 'DOCUMENTED_NEGATIVE');
  assert.equal(byId['KI-PUB-001'].severity, 'MAJOR');
  assert.match(byId['KI-PUB-001'].statement, /does not reproduce/iu);
  assert.match(byId['KI-PUB-001'].statement, /negative publication-methodology evidence/iu);

  for (const id of ['KI-PLAT-001', 'KI-REV-001', 'KI-UX-001']) {
    assert.equal(byId[id].state, 'OPEN');
    assert.equal(byId[id].priority, 'P0');
    assert.equal(byId[id].severity, 'MAJOR');
    assert.equal(byId[id].externalGate, true);
    assert.equal(byId[id].blocksValidatedMvp, true);
  }
  assert.deepEqual(byId['KI-PLAT-001'].acceptanceCriteria, [
    'AC-PLAT-01',
    'AC-PLAT-02',
  ]);
  assert.deepEqual(byId['KI-REV-001'].acceptanceCriteria, [
    'AC-SCI-03',
    'AC-VAL-05',
  ]);
  assert.deepEqual(byId['KI-UX-001'].acceptanceCriteria, [
    'AC-UX-01',
    'AC-UX-02',
    'AC-UX-03',
    'AC-UX-04',
  ]);
});

test('summary is a total deterministic derivation and release assertion fails closed', () => {
  const ledger = checkedInLedger();
  assert.deepEqual(ledger.summary, deriveKnownIssuesSummary(ledger.issues));
  assert.deepEqual(ledger.summary.openCriticalOrMajorIds, [
    'KI-PLAT-001',
    'KI-REV-001',
    'KI-UX-001',
  ]);
  assert.deepEqual(ledger.summary.unresolvedP0Ids, [
    'KI-PLAT-001',
    'KI-REV-001',
    'KI-UX-001',
  ]);
  assert.throws(
    () => assertValidatedMvpReleaseReadiness(ledger),
    /KNOWN_ISSUES_RELEASE_READINESS_BLOCKED.*KI-PLAT-001.*KI-REV-001.*KI-UX-001/u,
  );

  const hypotheticalClosed = clone(ledger);
  for (const issue of hypotheticalClosed.issues) {
    if (issue.state === 'OPEN' && BLOCKING_SEVERITIES.includes(issue.severity)) {
      issue.state = 'CLOSED';
      issue.blocksValidatedMvp = false;
      issue.externalGate = false;
    }
  }
  hypotheticalClosed.summary = deriveKnownIssuesSummary(hypotheticalClosed.issues);
  assert.equal(hypotheticalClosed.summary.validatedMvpEligible, true);
  assert.equal(assertValidatedMvpReleaseReadiness(hypotheticalClosed), true);
});

test('schema and semantic validator reject drift, false blocking flags, and false external closure', () => {
  const baseline = checkedInLedger();
  const jsonSchema = schema();

  const extraProperty = clone(baseline);
  extraProperty.unknown = true;
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: extraProperty,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_SCHEMA_INVALID/u,
  );

  const duplicateId = clone(baseline);
  duplicateId.issues[1].id = duplicateId.issues[0].id;
  duplicateId.summary = deriveKnownIssuesSummary(duplicateId.issues);
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: duplicateId,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_DUPLICATE_ID/u,
  );

  const wrongOrder = clone(baseline);
  wrongOrder.issues.reverse();
  wrongOrder.summary = deriveKnownIssuesSummary(wrongOrder.issues);
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: wrongOrder,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_ORDER_INVALID/u,
  );

  const falseNonblocking = clone(baseline);
  falseNonblocking.issues.find((issue) => issue.id === 'KI-PLAT-001').blocksValidatedMvp =
    false;
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: falseNonblocking,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_BLOCKING_FLAG_FALSE/u,
  );

  const falseExternalClosure = clone(baseline);
  const external = falseExternalClosure.issues.find(
    (issue) => issue.id === 'KI-REV-001',
  );
  external.state = 'CLOSED';
  external.blocksValidatedMvp = false;
  falseExternalClosure.summary = deriveKnownIssuesSummary(
    falseExternalClosure.issues,
  );
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: falseExternalClosure,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_EXTERNAL_GATE_FALSE_CLOSURE/u,
  );

  const summaryTamper = clone(baseline);
  summaryTamper.summary.validatedMvpEligible = true;
  assert.throws(
    () =>
      validateKnownIssuesLedger({
        ledger: summaryTamper,
        schema: jsonSchema,
        projectRoot: PROJECT_ROOT,
      }),
    /KNOWN_ISSUES_SUMMARY_MISMATCH/u,
  );
});

test('verifier rejects a manually closed blocker even when its summary is recomputed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ae-known-issues-'));
  try {
    const evidencePaths = new Set([
      ...buildKnownIssuesLedger(PROJECT_ROOT).sourceLocks.map((lock) => lock.path),
      ...checkedInLedger().issues.flatMap((issue) => issue.evidencePaths),
    ]);
    for (const relativePath of evidencePaths) {
      const source = path.resolve(PROJECT_ROOT, ...relativePath.split('/'));
      const destination = path.resolve(root, ...relativePath.split('/'));
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(source, destination, { recursive: true });
    }
    mkdirSync(path.resolve(root, 'governance'), { recursive: true });
    cpSync(
      SCHEMA_PATH,
      path.resolve(root, 'governance/KNOWN_ISSUES.schema.json'),
    );
    const generated = buildKnownIssuesLedger(root);
    const changed = clone(generated);
    const blocker = changed.issues.find((issue) => issue.id === 'KI-PLAT-001');
    blocker.state = 'CLOSED';
    blocker.externalGate = false;
    blocker.blocksValidatedMvp = false;
    changed.summary = deriveKnownIssuesSummary(changed.issues);
    writeFileSync(
      path.resolve(root, 'governance/KNOWN_ISSUES.json'),
      serializeKnownIssuesLedger(changed),
      'utf8',
    );
    assert.throws(
      () => verifyKnownIssuesLedger({ projectRoot: root }),
      /KNOWN_ISSUES_LEDGER_STALE/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI check succeeds and invalid invocation fails without rewriting the ledger', () => {
  const before = readFileSync(LEDGER_PATH);
  const checked = spawnSync(process.execPath, [SCRIPT_PATH, '--check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /validatedMvpEligible=false/u);

  const invalid = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /KNOWN_ISSUES_ARGUMENTS_INVALID/u);
  assert.deepEqual(readFileSync(LEDGER_PATH), before);
});
