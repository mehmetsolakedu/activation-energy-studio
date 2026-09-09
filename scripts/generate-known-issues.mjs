#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

export const KNOWN_ISSUES_SCHEMA =
  'activation-energy-studio/known-issues/v1';
export const KNOWN_ISSUES_LEDGER_STATE =
  'OPEN_BLOCKERS_RETAINED_NOT_VALIDATED_MVP';
export const KNOWN_ISSUES_RELEASE_VERSION = '0.2.0';
export const DEFAULT_KNOWN_ISSUES_RELATIVE_PATH =
  'governance/KNOWN_ISSUES.json';
export const DEFAULT_KNOWN_ISSUES_SCHEMA_RELATIVE_PATH =
  'governance/KNOWN_ISSUES.schema.json';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

export const SEVERITIES = Object.freeze([
  'CRITICAL',
  'MAJOR',
  'MINOR',
  'INFO',
]);
export const PRIORITIES = Object.freeze(['P0', 'P1']);
export const ISSUE_STATES = Object.freeze([
  'OPEN',
  'CLOSED',
  'DOCUMENTED_NEGATIVE',
]);
export const BLOCKING_SEVERITIES = Object.freeze(['CRITICAL', 'MAJOR']);
export const BLOCKING_STATES = Object.freeze(['OPEN']);

export const SOURCE_LOCK_PATHS = Object.freeze([
  '02_ACCEPTANCE_CRITERIA.md',
  'CURRENT_VALIDATION_STATUS.md',
  'REAL_DATA_VALIDATION_STATUS.md',
  'SECOND_RAW_DATASET_SEARCH.md',
  'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
  'tests/fixtures/real/manifest.json',
]);

export const KNOWN_ISSUE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'KI-CORPUS-001',
    title: '231-PDF corpus does not establish 231 distinct articles or Q1/Q2 identity',
    severity: 'MINOR',
    priority: 'P1',
    state: 'OPEN',
    blockerClass: 'CORPUS_IDENTITY_BOUNDARY',
    blocksValidatedMvp: false,
    externalGate: false,
    acceptanceCriteria: Object.freeze([]),
    evidencePaths: Object.freeze([
      'CURRENT_VALIDATION_STATUS.md',
      'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
    ]),
    statement:
      'The integrity ledger proves 231 unique PDF files and complete extraction accounting. It does not prove 231 distinct article identities, nor current Q1/Q2 quartile status.',
    closureCondition:
      'Create an independently auditable article-identity ledger and verify journal quartiles against dated authoritative indexing records without converting supplementary PDFs into separate articles.',
  }),
  Object.freeze({
    id: 'KI-DATA-001',
    title: 'External second raw-curve candidate is not yet scientifically integrated',
    severity: 'MINOR',
    priority: 'P1',
    state: 'OPEN',
    blockerClass: 'SCIENTIFIC_EVIDENCE_BOUNDARY',
    blocksValidatedMvp: false,
    externalGate: false,
    acceptanceCriteria: Object.freeze([]),
    evidencePaths: Object.freeze([
      'REAL_DATA_VALIDATION_STATUS.md',
      'SECOND_RAW_DATASET_SEARCH.md',
      'tests/fixtures/real/manifest.json',
      'tests/fixtures/real/paper063/provenance.json',
    ]),
    statement:
      'Paper 010 remains the only integrated and independent-oracle-locked row-wise raw-curve lane. A licensed five-rate NETZSCH TG candidate was found at Zenodo DOI 10.5281/zenodo.20777046, but it is external to the local corpus and has not completed stage adjudication, non-linear-heating handling, sensitivity analysis, fixture locking, or independent-oracle validation. Paper 063 remains publication-derived peak evidence.',
    closureCondition:
      'Immutably acquire and provenance-lock the Zenodo candidate, predeclare and independently review the stage/preprocessing policy, retain the non-linear-heating and numerical-derivative boundaries, build an independent reference, and validate the result through ingestion and the scientific core.',
  }),
  Object.freeze({
    id: 'KI-PLAT-001',
    title: 'Real three-platform offline evidence and human review are incomplete',
    severity: 'MAJOR',
    priority: 'P0',
    state: 'OPEN',
    blockerClass: 'EXTERNAL_EVIDENCE',
    blocksValidatedMvp: true,
    externalGate: true,
    acceptanceCriteria: Object.freeze(['AC-PLAT-01', 'AC-PLAT-02']),
    evidencePaths: Object.freeze([
      '02_ACCEPTANCE_CRITERIA.md',
      'CURRENT_VALIDATION_STATUS.md',
      'PLATFORM_VALIDATION_PROTOCOL.md',
      'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    ]),
    statement:
      'The Parallels-free hosted workflow and local macOS diagnostic are technical preparation only. Real retained Windows 11, macOS, and Ubuntu runs plus the required human evidence review have not closed the platform gates.',
    closureCondition:
      'Execute the fixed hosted three-OS matrix on the locked release, retain and verify every required artifact, obtain the protocol-defined human review, and bind AC-PLAT-01/02 to a signed independent adjudication without treating automation or structural validation as platform PASS.',
  }),
  Object.freeze({
    id: 'KI-PUB-001',
    title: 'Paper 010 publication Table 4 is not exactly reproduced from raw curves',
    severity: 'MAJOR',
    priority: 'P1',
    state: 'DOCUMENTED_NEGATIVE',
    blockerClass: 'PUBLICATION_METHOD_BOUNDARY',
    blocksValidatedMvp: false,
    externalGate: false,
    acceptanceCriteria: Object.freeze([]),
    evidencePaths: Object.freeze([
      'REAL_DATA_VALIDATION_STATUS.md',
      'tests/fixtures/real/manifest.json',
      'tests/fixtures/real/paper010_rh_reference.json',
    ]),
    statement:
      'Equation-correct processing of the official Paper 010 raw S2 curves does not reproduce the publication Table 4 averages. The Friedman mismatch and S4 label/value inconsistency are retained as negative publication-methodology evidence, not accepted preprocessing oracles.',
    closureCondition:
      'Do not close by fitting undocumented transformations. Closure requires author-supplied preprocessing provenance or an independently reproducible explanation that preserves the equation-correct software path.',
  }),
  Object.freeze({
    id: 'KI-REV-001',
    title: 'Independent scientific reviewer identity, signature, and gate sign-off are unverified',
    severity: 'MAJOR',
    priority: 'P0',
    state: 'OPEN',
    blockerClass: 'EXTERNAL_EVIDENCE',
    blocksValidatedMvp: true,
    externalGate: true,
    acceptanceCriteria: Object.freeze(['AC-SCI-03', 'AC-VAL-05']),
    evidencePaths: Object.freeze([
      '02_ACCEPTANCE_CRITERIA.md',
      'CURRENT_VALIDATION_STATUS.md',
      'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
      'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    ]),
    statement:
      'The independent-review package and recorder are structurally validated, but no eligible human reviewer identity, declaration truth, signature authenticity, or final scientific sign-off has been independently authenticated.',
    closureCondition:
      'Complete the locked review protocol with an eligible independent thermal-analysis reviewer, verify identity, declarations, evidence decisions, signature artifact and authenticity outside the software, and bind AC-SCI-03/AC-VAL-05 to the signed independent adjudication record.',
  }),
  Object.freeze({
    id: 'KI-UX-001',
    title: 'Five-user usability, comprehension, and warning-visibility human evidence are incomplete',
    severity: 'MAJOR',
    priority: 'P0',
    state: 'OPEN',
    blockerClass: 'EXTERNAL_EVIDENCE',
    blocksValidatedMvp: true,
    externalGate: true,
    acceptanceCriteria: Object.freeze([
      'AC-UX-01',
      'AC-UX-02',
      'AC-UX-03',
      'AC-UX-04',
    ]),
    evidencePaths: Object.freeze([
      '02_ACCEPTANCE_CRITERIA.md',
      'CURRENT_VALIDATION_STATUS.md',
      'USABILITY_VALIDATION_PROTOCOL.md',
      'WARNING_VISIBILITY_VISUAL_QA.md',
      'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    ]),
    statement:
      'Automation proves technical workflow and warning rendering preconditions only. Five observed nonexpert sessions, verbatim/content review, 4/4 comprehension evidence, and named human review of all warning cells remain absent.',
    closureCondition:
      'Run the protocol with five eligible nonexpert participants, retain consented evidence and independent scoring, meet every threshold, complete named human visual review of the 8/8 warning matrix, and bind AC-UX-01..04 to the signed independent adjudication record.',
  }),
]);

function fail(code, message) {
  throw new Error(`${code} ${message}`);
}

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function resolveProjectPath(projectRoot, portablePath) {
  if (
    typeof portablePath !== 'string' ||
    portablePath.length === 0 ||
    path.isAbsolute(portablePath) ||
    portablePath.includes('\\')
  ) {
    fail(
      'KNOWN_ISSUES_INVALID_PATH',
      `Expected a non-empty portable relative path, received ${JSON.stringify(portablePath)}.`,
    );
  }
  const parts = portablePath.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    fail(
      'KNOWN_ISSUES_PATH_TRAVERSAL',
      `Refusing unsafe path ${portablePath}.`,
    );
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, ...parts);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    fail(
      'KNOWN_ISSUES_PATH_TRAVERSAL',
      `Refusing path outside project root: ${portablePath}.`,
    );
  }
  return resolved;
}

function assertNonemptyRegularFile(filePath, label) {
  if (!existsSync(filePath)) {
    fail('KNOWN_ISSUES_SOURCE_MISSING', `${label} is missing at ${filePath}.`);
  }
  const statistics = statSync(filePath);
  if (!statistics.isFile() || statistics.size === 0) {
    fail(
      'KNOWN_ISSUES_SOURCE_INVALID',
      `${label} must be a non-empty regular file: ${filePath}.`,
    );
  }
}

function countBy(values, expectedKeys) {
  return Object.fromEntries(
    expectedKeys.map((key) => [
      key,
      values.reduce((count, value) => count + (value === key ? 1 : 0), 0),
    ]),
  );
}

export function deriveKnownIssuesSummary(issues) {
  const openCriticalOrMajorIds = issues
    .filter(
      (issue) =>
        BLOCKING_STATES.includes(issue.state) &&
        BLOCKING_SEVERITIES.includes(issue.severity),
    )
    .map((issue) => issue.id);
  const unresolvedP0Ids = issues
    .filter((issue) => issue.state === 'OPEN' && issue.priority === 'P0')
    .map((issue) => issue.id);

  return {
    total: issues.length,
    bySeverity: countBy(
      issues.map((issue) => issue.severity),
      SEVERITIES,
    ),
    byPriority: countBy(
      issues.map((issue) => issue.priority),
      PRIORITIES,
    ),
    byState: countBy(
      issues.map((issue) => issue.state),
      ISSUE_STATES,
    ),
    openCriticalOrMajorIds,
    unresolvedP0Ids,
    validatedMvpEligible:
      openCriticalOrMajorIds.length === 0 && unresolvedP0Ids.length === 0,
    releaseReadiness:
      openCriticalOrMajorIds.length === 0 && unresolvedP0Ids.length === 0
        ? 'ELIGIBLE_FOR_SEPARATE_HUMAN_RELEASE_DECISION'
        : 'BLOCKED_BY_OPEN_CRITICAL_MAJOR_OR_P0_ISSUES',
  };
}

export function buildKnownIssuesLedger(projectRoot = DEFAULT_PROJECT_ROOT) {
  const sourceLocks = SOURCE_LOCK_PATHS.map((relativePath) => {
    const sourcePath = resolveProjectPath(projectRoot, relativePath);
    assertNonemptyRegularFile(sourcePath, relativePath);
    return {
      path: portable(relativePath),
      sha256: sha256File(sourcePath),
    };
  });
  const issues = KNOWN_ISSUE_DEFINITIONS.map((issue) => ({
    ...issue,
    acceptanceCriteria: [...issue.acceptanceCriteria],
    evidencePaths: [...issue.evidencePaths],
  })).sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: KNOWN_ISSUES_SCHEMA,
    releaseVersion: KNOWN_ISSUES_RELEASE_VERSION,
    ledgerState: KNOWN_ISSUES_LEDGER_STATE,
    policy: {
      severityOrder: [...SEVERITIES],
      priorityOrder: [...PRIORITIES],
      blockingStates: [...BLOCKING_STATES],
      validatedMvpBlockingSeverities: [...BLOCKING_SEVERITIES],
      rule:
        'Any OPEN CRITICAL or MAJOR issue, and any unresolved P0 issue, makes validatedMvpEligible=false and must fail a validated-MVP release-readiness assertion.',
      externalGateBoundary:
        'External evidence remains OPEN until retained evidence and the required human authenticity/content review exist; automation or a prepared protocol cannot close it.',
    },
    sourceLocks,
    issues,
    summary: deriveKnownIssuesSummary(issues),
  };
}

export function serializeKnownIssuesLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'KNOWN_ISSUES_JSON_INVALID',
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function assertExactJson(left, right, code, message) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail(code, message);
  }
}

export function validateKnownIssuesLedger({
  ledger,
  schema,
  projectRoot = DEFAULT_PROJECT_ROOT,
} = {}) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(ledger)) {
    fail(
      'KNOWN_ISSUES_SCHEMA_INVALID',
      ajv.errorsText(validate.errors, { separator: '; ' }),
    );
  }

  const ids = ledger.issues.map((issue) => issue.id);
  if (new Set(ids).size !== ids.length) {
    fail('KNOWN_ISSUES_DUPLICATE_ID', 'Issue IDs must be unique.');
  }
  const sortedIds = [...ids].sort((left, right) => left.localeCompare(right));
  assertExactJson(
    ids,
    sortedIds,
    'KNOWN_ISSUES_ORDER_INVALID',
    'Issues must be sorted by ID for deterministic review.',
  );

  for (const issue of ledger.issues) {
    const shouldBlock =
      issue.state === 'OPEN' &&
      BLOCKING_SEVERITIES.includes(issue.severity);
    if (issue.blocksValidatedMvp !== shouldBlock) {
      fail(
        'KNOWN_ISSUES_BLOCKING_FLAG_FALSE',
        `${issue.id} blocksValidatedMvp must be ${shouldBlock}.`,
      );
    }
    if (
      issue.priority === 'P0' &&
      issue.state === 'OPEN' &&
      !issue.blocksValidatedMvp
    ) {
      fail(
        'KNOWN_ISSUES_P0_FALSE_NONBLOCKING',
        `${issue.id} is an unresolved P0 issue and cannot be non-blocking.`,
      );
    }
    if (issue.externalGate && issue.state !== 'OPEN') {
      fail(
        'KNOWN_ISSUES_EXTERNAL_GATE_FALSE_CLOSURE',
        `${issue.id} is an external gate and must remain OPEN until evidence is relocked.`,
      );
    }
    for (const evidencePath of issue.evidencePaths) {
      const resolved = resolveProjectPath(projectRoot, evidencePath);
      assertNonemptyRegularFile(resolved, `${issue.id} evidence ${evidencePath}`);
    }
  }

  const derivedSummary = deriveKnownIssuesSummary(ledger.issues);
  assertExactJson(
    ledger.summary,
    derivedSummary,
    'KNOWN_ISSUES_SUMMARY_MISMATCH',
    'Ledger summary is not a deterministic derivation of its issues.',
  );
  return ledger;
}

export function verifyKnownIssuesLedger({
  projectRoot = DEFAULT_PROJECT_ROOT,
  ledgerPath = path.resolve(
    projectRoot,
    ...DEFAULT_KNOWN_ISSUES_RELATIVE_PATH.split('/'),
  ),
  schemaPath = path.resolve(
    projectRoot,
    ...DEFAULT_KNOWN_ISSUES_SCHEMA_RELATIVE_PATH.split('/'),
  ),
} = {}) {
  assertNonemptyRegularFile(ledgerPath, 'known-issues ledger');
  assertNonemptyRegularFile(schemaPath, 'known-issues schema');
  const ledger = readJson(ledgerPath, 'known-issues ledger');
  const schema = readJson(schemaPath, 'known-issues schema');
  validateKnownIssuesLedger({ ledger, schema, projectRoot });

  const expected = buildKnownIssuesLedger(projectRoot);
  assertExactJson(
    ledger,
    expected,
    'KNOWN_ISSUES_LEDGER_STALE',
    'Checked-in KNOWN_ISSUES.json is stale or was edited outside the deterministic generator.',
  );
  const expectedBytes = serializeKnownIssuesLedger(expected);
  if (readFileSync(ledgerPath, 'utf8') !== expectedBytes) {
    fail(
      'KNOWN_ISSUES_LEDGER_NONCANONICAL',
      'Checked-in KNOWN_ISSUES.json is not byte-canonical.',
    );
  }
  return ledger;
}

export function assertValidatedMvpReleaseReadiness(ledger) {
  const summary = deriveKnownIssuesSummary(ledger.issues);
  const blockers = summary.openCriticalOrMajorIds;
  if (
    blockers.length > 0 ||
    summary.unresolvedP0Ids.length > 0 ||
    !summary.validatedMvpEligible
  ) {
    fail(
      'KNOWN_ISSUES_RELEASE_READINESS_BLOCKED',
      `Validated-MVP release is blocked by ${[
        ...new Set([...blockers, ...summary.unresolvedP0Ids]),
      ].join(', ')}.`,
    );
  }
  return true;
}

export function writeKnownIssuesLedger({
  projectRoot = DEFAULT_PROJECT_ROOT,
  ledgerPath = path.resolve(
    projectRoot,
    ...DEFAULT_KNOWN_ISSUES_RELATIVE_PATH.split('/'),
  ),
} = {}) {
  const ledger = buildKnownIssuesLedger(projectRoot);
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, serializeKnownIssuesLedger(ledger), 'utf8');
  return ledger;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/generate-known-issues.mjs --check',
    '  node scripts/generate-known-issues.mjs --write',
  ].join('\n');
}

export function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.length !== 1) {
    fail('KNOWN_ISSUES_ARGUMENTS_INVALID', usage());
  }
  if (argumentsList[0] === '--check') {
    const ledger = verifyKnownIssuesLedger();
    console.log(
      `KNOWN_ISSUES PASS: ${ledger.issues.length} issues; validatedMvpEligible=${ledger.summary.validatedMvpEligible}.`,
    );
    return ledger;
  }
  if (argumentsList[0] === '--write') {
    const ledger = writeKnownIssuesLedger();
    console.log(
      `KNOWN_ISSUES written: ${DEFAULT_KNOWN_ISSUES_RELATIVE_PATH}; validatedMvpEligible=${ledger.summary.validatedMvpEligible}.`,
    );
    return ledger;
  }
  fail('KNOWN_ISSUES_ARGUMENTS_INVALID', usage());
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
