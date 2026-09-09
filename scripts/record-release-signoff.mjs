#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

import {
  DEFAULT_KNOWN_ISSUES_RELATIVE_PATH,
  deriveKnownIssuesSummary,
  sha256File,
  verifyKnownIssuesLedger,
} from './generate-known-issues.mjs';
import { verifyP0EvidenceLedger } from './p0-evidence-ledger.mjs';

export const RELEASE_SIGNOFF_INPUT_SCHEMA =
  'activation-energy-studio/five-role-release-signoff-input/v1';
export const RELEASE_SIGNOFF_RECORD_SCHEMA =
  'activation-energy-studio/five-role-release-signoff-record/v1';
export const RELEASE_SIGNOFF_RECORD_STATE =
  'STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT';
export const RELEASE_SIGNOFF_VERSION = '0.2.0';
export const RELEASE_SIGNOFF_TEMPLATE_RELATIVE_PATH =
  'governance/RELEASE_SIGNOFF_INPUT_TEMPLATE.json';
export const RELEASE_SIGNOFF_SCHEMA_RELATIVE_PATH =
  'governance/RELEASE_SIGNOFF_INPUT.schema.json';
export const HUMAN_AUTHENTICITY_BOUNDARY =
  'This recorder verifies exact artifact hashes, structural completeness, role separation, declarations, decisions, UTC ordering, and signature-artifact bytes. It cannot authenticate a human identity, declaration truth, scientific judgment, signature ownership, or legal/cryptographic validity. Those remain an independent human audit, and this record never by itself marks a validated MVP.';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

export const REQUIRED_RELEASE_SIGNOFF_ROLES = Object.freeze([
  'MATH_MAINTAINER',
  'DATA_IO_MAINTAINER',
  'THERMAL_ANALYSIS_REVIEWER',
  'QA',
  'PRODUCT_OWNER',
]);

export const COMMON_DECLARATIONS = Object.freeze([
  'isHumanSigner',
  'reviewedRoleScope',
  'reviewedExactLockedArtifacts',
  'reviewedKnownIssuesLedger',
  'understandsStructuralValidationDoesNotAuthenticateIdentityOrSignature',
]);

export const ROLE_SCOPED_DECLARATIONS = Object.freeze({
  MATH_MAINTAINER: Object.freeze([
    'reviewedFormulaRegressionReplicateAndUncertaintyImplementation',
  ]),
  DATA_IO_MAINTAINER: Object.freeze([
    'reviewedIngestionMappingUnitsProvenanceAndExports',
  ]),
  THERMAL_ANALYSIS_REVIEWER: Object.freeze([
    'hasCurrentThermalAnalysisOrSolidStateKineticsExperience',
    'reviewedScientificClaimBoundariesAndRealDataEvidence',
  ]),
  QA: Object.freeze([
    'reviewedAutomatedQaAndOpenPlatformUsabilityGates',
  ]),
  PRODUCT_OWNER: Object.freeze([
    'reviewedMissionAcceptanceCriteriaAndReleaseClaimBoundary',
  ]),
});

export const REQUIRED_ROLE_DECISIONS = Object.freeze([
  'SCOPE_EVIDENCE',
  'KNOWN_ISSUES',
  'VALIDATED_MVP_RELEASE',
]);

export const ALLOWED_SIGNATURE_METHODS = Object.freeze([
  'PADES_DIGITAL_SIGNATURE',
  'PGP_DETACHED_SIGNATURE',
  'MINISIGN_DETACHED_SIGNATURE',
  'INSTITUTIONAL_EMAIL_ATTESTATION',
  'WET_SIGNATURE_WITH_INDEPENDENT_IDENTITY_CHECK',
]);

export const LOCK_PATHS = Object.freeze({
  releaseArtifact: 'release/Activation-Energy-Studio-v0.2.0.html',
  releaseManifest: 'release/MANIFEST.v0.2.0.json',
  acceptanceCriteria: '02_ACCEPTANCE_CRITERIA.md',
  p0Ledger: 'evidence/governance/P0_EVIDENCE_LEDGER.v0.2.0.json',
  knownIssues: DEFAULT_KNOWN_ISSUES_RELATIVE_PATH,
});

const PLACEHOLDER_PATTERN =
  /(?:\[required|placeholder|tbd|todo|not[_ -]?reviewed|unsigned)/iu;
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

function fail(code, message) {
  throw new Error(`${code} ${message}`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'RELEASE_SIGNOFF_JSON_INVALID',
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RELEASE_SIGNOFF_INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(assertObject(value, label));
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      'RELEASE_SIGNOFF_EXACT_KEYS_MISMATCH',
      `${label} keys must be exactly ${expected.join(', ')} in canonical order; received ${actual.join(', ')}.`,
    );
  }
}

function assertCompleteText(value, label) {
  if (typeof value !== 'string' || value.trim().length < 3) {
    fail(
      'RELEASE_SIGNOFF_EMPTY_FIELD',
      `${label} must be a non-empty completed string.`,
    );
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    fail(
      'RELEASE_SIGNOFF_PLACEHOLDER',
      `${label} contains a placeholder or incomplete marker.`,
    );
  }
  return value.trim();
}

function assertUtc(value, label) {
  if (typeof value === 'string' && PLACEHOLDER_PATTERN.test(value)) {
    fail(
      'RELEASE_SIGNOFF_PLACEHOLDER',
      `${label} contains a placeholder or incomplete marker.`,
    );
  }
  if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) {
    fail(
      'RELEASE_SIGNOFF_TIME_INVALID',
      `${label} must be an ISO-8601 UTC timestamp ending in Z.`,
    );
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('RELEASE_SIGNOFF_TIME_INVALID', `${label} is not a real timestamp.`);
  }
  return milliseconds;
}

function resolvePortableFile(root, portablePath, label) {
  if (
    typeof portablePath !== 'string' ||
    portablePath.length === 0 ||
    path.isAbsolute(portablePath) ||
    portablePath.includes('\\')
  ) {
    fail(
      'RELEASE_SIGNOFF_INVALID_PATH',
      `${label} must be a portable relative path.`,
    );
  }
  const parts = portablePath.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    fail(
      'RELEASE_SIGNOFF_PATH_TRAVERSAL',
      `${label} contains an unsafe path component.`,
    );
  }
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, ...parts);
  if (
    resolved === absoluteRoot ||
    !resolved.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    fail(
      'RELEASE_SIGNOFF_PATH_TRAVERSAL',
      `${label} resolves outside its allowed root.`,
    );
  }
  if (!existsSync(resolved)) {
    fail('RELEASE_SIGNOFF_ARTIFACT_MISSING', `${label} is missing.`);
  }
  const statistics = statSync(resolved);
  if (!statistics.isFile() || statistics.size === 0) {
    fail(
      'RELEASE_SIGNOFF_ARTIFACT_INVALID',
      `${label} must be a non-empty regular file.`,
    );
  }
  const canonicalRoot = realpathSync(absoluteRoot);
  const canonicalFile = realpathSync(resolved);
  if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
    fail(
      'RELEASE_SIGNOFF_SYMLINK_ESCAPE',
      `${label} resolves outside its allowed root.`,
    );
  }
  return canonicalFile;
}

function fileLock(projectRoot, portablePath) {
  const filePath = resolvePortableFile(
    projectRoot,
    portablePath,
    `lock ${portablePath}`,
  );
  return {
    path: portablePath,
    sha256: sha256File(filePath),
  };
}

export function buildReleaseSignoffLocks(projectRoot = DEFAULT_PROJECT_ROOT) {
  return Object.fromEntries(
    Object.entries(LOCK_PATHS).map(([key, portablePath]) => [
      key,
      fileLock(projectRoot, portablePath),
    ]),
  );
}

function roleDeclarationsTemplate(role) {
  return Object.fromEntries(
    [...COMMON_DECLARATIONS, ...ROLE_SCOPED_DECLARATIONS[role]].map((key) => [
      key,
      false,
    ]),
  );
}

export function buildReleaseSignoffInputTemplate(
  projectRoot = DEFAULT_PROJECT_ROOT,
) {
  return {
    schema: RELEASE_SIGNOFF_INPUT_SCHEMA,
    releaseVersion: RELEASE_SIGNOFF_VERSION,
    locks: buildReleaseSignoffLocks(projectRoot),
    timeline: {
      preparedAtUtc: '[REQUIRED_ISO_UTC]',
      reviewStartedAtUtc: '[REQUIRED_ISO_UTC]',
      reviewCompletedAtUtc: '[REQUIRED_ISO_UTC]',
      recordedAtUtc: '[REQUIRED_ISO_UTC]',
    },
    roles: REQUIRED_RELEASE_SIGNOFF_ROLES.map((role) => ({
      role,
      identity: {
        identityId: '[REQUIRED_UNIQUE_ID]',
        name: '[REQUIRED_HUMAN_NAME]',
        affiliation: '[REQUIRED_AFFILIATION]',
        professionalProfile: '[REQUIRED_ORCID_OR_PROFILE]',
      },
      declarations: roleDeclarationsTemplate(role),
      decisions: REQUIRED_ROLE_DECISIONS.map((id) => ({
        id,
        decision: 'NOT_REVIEWED',
        comment: '[REQUIRED_ROLE_SCOPED_COMMENT]',
      })),
      signature: {
        artifact: {
          path: `[REQUIRED_${role}_SIGNATURE_ARTIFACT]`,
          sha256: '0'.repeat(64),
        },
        method: 'INSTITUTIONAL_EMAIL_ATTESTATION',
        verificationReference: '[REQUIRED_INDEPENDENT_VERIFICATION_REFERENCE]',
        signedAtUtc: '[REQUIRED_ISO_UTC]',
      },
    })),
  };
}

export function serializeReleaseSignoffInput(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writeReleaseSignoffInputTemplate({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputPath = path.resolve(
    projectRoot,
    ...RELEASE_SIGNOFF_TEMPLATE_RELATIVE_PATH.split('/'),
  ),
} = {}) {
  const template = buildReleaseSignoffInputTemplate(projectRoot);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serializeReleaseSignoffInput(template), 'utf8');
  return template;
}

export function verifyReleaseSignoffInputTemplate({
  projectRoot = DEFAULT_PROJECT_ROOT,
  templatePath = path.resolve(
    projectRoot,
    ...RELEASE_SIGNOFF_TEMPLATE_RELATIVE_PATH.split('/'),
  ),
} = {}) {
  const actual = readFileSync(templatePath, 'utf8');
  const expected = serializeReleaseSignoffInput(
    buildReleaseSignoffInputTemplate(projectRoot),
  );
  if (actual !== expected) {
    fail(
      'RELEASE_SIGNOFF_TEMPLATE_STALE',
      'Checked-in release sign-off template is stale or noncanonical.',
    );
  }
  return JSON.parse(actual);
}

function validateSchema(input, schema) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(input)) {
    fail(
      'RELEASE_SIGNOFF_SCHEMA_INVALID',
      ajv.errorsText(validate.errors, { separator: '; ' }),
    );
  }
}

function assertExactLocks(projectRoot, locks) {
  const lockKeys = Object.keys(LOCK_PATHS);
  assertExactKeys(locks, lockKeys, 'locks');
  const expected = buildReleaseSignoffLocks(projectRoot);
  for (const key of lockKeys) {
    assertExactKeys(locks[key], ['path', 'sha256'], `locks.${key}`);
    if (
      locks[key].path !== expected[key].path ||
      locks[key].sha256 !== expected[key].sha256
    ) {
      fail(
        'RELEASE_SIGNOFF_LOCK_MISMATCH',
        `${key} does not match the current authoritative file bytes.`,
      );
    }
  }

  const releaseManifest = readJson(
    resolvePortableFile(
      projectRoot,
      LOCK_PATHS.releaseManifest,
      'release manifest',
    ),
    'release manifest',
  );
  if (
    releaseManifest.release?.sha256 !== locks.releaseArtifact.sha256 ||
    releaseManifest.release?.artifact !== locks.releaseArtifact.path
  ) {
    fail(
      'RELEASE_SIGNOFF_RELEASE_MANIFEST_CONTRADICTION',
      'Release manifest does not lock the same release artifact and SHA-256.',
    );
  }

  const ledger = verifyKnownIssuesLedger({ projectRoot });
  const p0Ledger = verifyP0EvidenceLedger({
    projectRoot,
    ledgerPath: LOCK_PATHS.p0Ledger,
  });
  const p0ExternalOpen = p0Ledger.criteria
    .filter((criterion) => criterion.disposition === 'EXTERNAL_OPEN')
    .map((criterion) => criterion.id)
    .sort();
  const knownIssueExternalOpen = ledger.issues
    .filter((issue) => issue.state === 'OPEN' && issue.externalGate)
    .flatMap((issue) => issue.acceptanceCriteria)
    .sort();
  if (JSON.stringify(p0ExternalOpen) !== JSON.stringify(knownIssueExternalOpen)) {
    fail(
      'RELEASE_SIGNOFF_P0_KNOWN_ISSUES_CONTRADICTION',
      'P0 ledger EXTERNAL_OPEN criteria and known-issues external-gate criteria differ.',
    );
  }
  if (
    sha256File(
      resolvePortableFile(
        projectRoot,
        LOCK_PATHS.knownIssues,
        'known-issues ledger',
      ),
    ) !== locks.knownIssues.sha256
  ) {
    fail(
      'RELEASE_SIGNOFF_KNOWN_ISSUES_TAMPERED',
      'Known-issues hash changed during validation.',
    );
  }
  if (
    ledger.summary.validatedMvpEligible === false &&
    releaseManifest.status?.fullyP0ValidatedScientificRelease === true
  ) {
    fail(
      'RELEASE_SIGNOFF_FALSE_RELEASE_MANIFEST_PASS',
      'Release manifest cannot claim full P0 validation while known blocking issues remain.',
    );
  }
  return ledger;
}

function assertTimeline(timeline) {
  assertExactKeys(
    timeline,
    [
      'preparedAtUtc',
      'reviewStartedAtUtc',
      'reviewCompletedAtUtc',
      'recordedAtUtc',
    ],
    'timeline',
  );
  const prepared = assertUtc(timeline.preparedAtUtc, 'timeline.preparedAtUtc');
  const started = assertUtc(
    timeline.reviewStartedAtUtc,
    'timeline.reviewStartedAtUtc',
  );
  const completed = assertUtc(
    timeline.reviewCompletedAtUtc,
    'timeline.reviewCompletedAtUtc',
  );
  const recorded = assertUtc(timeline.recordedAtUtc, 'timeline.recordedAtUtc');
  if (!(prepared <= started && started < completed && completed <= recorded)) {
    fail(
      'RELEASE_SIGNOFF_TIME_ORDER_INVALID',
      'Required order is prepared <= reviewStarted < reviewCompleted <= recorded.',
    );
  }
  return { prepared, started, completed, recorded };
}

function assertUnique(
  values,
  label,
  code = 'RELEASE_SIGNOFF_DUPLICATE_IDENTITY',
) {
  const normalized = values.map((value) => value.trim().toLocaleLowerCase('en'));
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} must be unique.`);
  }
}

function assertRoleDeclarations(roleRecord) {
  const expected = [
    ...COMMON_DECLARATIONS,
    ...ROLE_SCOPED_DECLARATIONS[roleRecord.role],
  ];
  assertExactKeys(
    roleRecord.declarations,
    expected,
    `${roleRecord.role}.declarations`,
  );
  for (const key of expected) {
    if (roleRecord.declarations[key] !== true) {
      fail(
        'RELEASE_SIGNOFF_DECLARATION_FALSE',
        `${roleRecord.role}.declarations.${key} must be explicitly true.`,
      );
    }
  }
}

function assertRoleDecisions(roleRecord, blockersPresent) {
  if (
    roleRecord.decisions.length !== REQUIRED_ROLE_DECISIONS.length ||
    roleRecord.decisions.some(
      (decision, index) => decision.id !== REQUIRED_ROLE_DECISIONS[index],
    )
  ) {
    fail(
      'RELEASE_SIGNOFF_DECISION_SET_MISMATCH',
      `${roleRecord.role} must provide the exact role-scoped decision set in canonical order.`,
    );
  }
  const [scope, knownIssues, release] = roleRecord.decisions;
  for (const decision of roleRecord.decisions) {
    assertCompleteText(
      decision.comment,
      `${roleRecord.role}.${decision.id}.comment`,
    );
  }
  if (scope.decision !== 'PASS') {
    fail(
      'RELEASE_SIGNOFF_SCOPE_NOT_PASSED',
      `${roleRecord.role} must PASS its own reviewed scope evidence.`,
    );
  }
  if (knownIssues.decision !== 'ACKNOWLEDGED') {
    fail(
      'RELEASE_SIGNOFF_KNOWN_ISSUES_NOT_ACKNOWLEDGED',
      `${roleRecord.role} must ACKNOWLEDGE the exact locked known-issues ledger.`,
    );
  }
  const expectedReleaseDecision = blockersPresent ? 'BLOCKED' : 'PASS';
  if (release.decision !== expectedReleaseDecision) {
    const code =
      blockersPresent && release.decision === 'PASS'
        ? 'RELEASE_SIGNOFF_FALSE_PASS'
        : 'RELEASE_SIGNOFF_RELEASE_DECISION_MISMATCH';
    fail(
      code,
      `${roleRecord.role} VALIDATED_MVP_RELEASE must be ${expectedReleaseDecision}.`,
    );
  }
}

function assertSignature({
  roleRecord,
  inputRoot,
  completed,
  recorded,
}) {
  const signature = roleRecord.signature;
  assertExactKeys(
    signature,
    [
      'artifact',
      'method',
      'verificationReference',
      'signedAtUtc',
    ],
    `${roleRecord.role}.signature`,
  );
  assertExactKeys(
    signature.artifact,
    ['path', 'sha256'],
    `${roleRecord.role}.signature.artifact`,
  );
  assertCompleteText(
    signature.artifact.path,
    `${roleRecord.role}.signature.artifact.path`,
  );
  const artifactPath = resolvePortableFile(
    inputRoot,
    signature.artifact.path,
    `${roleRecord.role} signature artifact`,
  );
  const actualHash = sha256File(artifactPath);
  if (signature.artifact.sha256 !== actualHash) {
    fail(
      'RELEASE_SIGNOFF_SIGNATURE_HASH_MISMATCH',
      `${roleRecord.role} signature artifact hash is stale or tampered.`,
    );
  }
  if (!ALLOWED_SIGNATURE_METHODS.includes(signature.method)) {
    fail(
      'RELEASE_SIGNOFF_SIGNATURE_METHOD_UNSUPPORTED',
      `${roleRecord.role} signature method is unsupported.`,
    );
  }
  assertCompleteText(
    signature.verificationReference,
    `${roleRecord.role}.signature.verificationReference`,
  );
  const signed = assertUtc(
    signature.signedAtUtc,
    `${roleRecord.role}.signature.signedAtUtc`,
  );
  if (signed < completed || signed > recorded) {
    fail(
      'RELEASE_SIGNOFF_SIGNATURE_TIME_INVALID',
      `${roleRecord.role} signature must be at or after review completion and at or before record time.`,
    );
  }
  return actualHash;
}

export function createReleaseSignoffRecord({
  projectRoot = DEFAULT_PROJECT_ROOT,
  inputPath,
  schemaPath = path.resolve(
    projectRoot,
    ...RELEASE_SIGNOFF_SCHEMA_RELATIVE_PATH.split('/'),
  ),
} = {}) {
  if (!inputPath) {
    fail('RELEASE_SIGNOFF_INPUT_REQUIRED', 'inputPath is required.');
  }
  const resolvedInputPath = path.resolve(inputPath);
  if (!existsSync(resolvedInputPath) || !statSync(resolvedInputPath).isFile()) {
    fail('RELEASE_SIGNOFF_INPUT_MISSING', 'Input JSON file is missing.');
  }
  const inputBytes = readFileSync(resolvedInputPath);
  const input = readJson(resolvedInputPath, 'release sign-off input');
  const schema = readJson(schemaPath, 'release sign-off input schema');
  validateSchema(input, schema);

  assertExactKeys(
    input,
    ['schema', 'releaseVersion', 'locks', 'timeline', 'roles'],
    'input',
  );
  const ledger = assertExactLocks(projectRoot, input.locks);
  const summary = deriveKnownIssuesSummary(ledger.issues);
  const blockersPresent =
    summary.openCriticalOrMajorIds.length > 0 ||
    summary.unresolvedP0Ids.length > 0;
  const timeline = assertTimeline(input.timeline);

  if (
    input.roles.length !== REQUIRED_RELEASE_SIGNOFF_ROLES.length ||
    input.roles.some(
      (roleRecord, index) =>
        roleRecord.role !== REQUIRED_RELEASE_SIGNOFF_ROLES[index],
    )
  ) {
    fail(
      'RELEASE_SIGNOFF_ROLE_SET_MISMATCH',
      `Roles must be exactly ${REQUIRED_RELEASE_SIGNOFF_ROLES.join(', ')} in canonical order.`,
    );
  }

  assertUnique(
    input.roles.map((roleRecord) =>
      assertCompleteText(
        roleRecord.identity.identityId,
        `${roleRecord.role}.identity.identityId`,
      ),
    ),
    'identity IDs',
  );
  assertUnique(
    input.roles.map((roleRecord) =>
      assertCompleteText(
        roleRecord.identity.name,
        `${roleRecord.role}.identity.name`,
      ),
    ),
    'human names',
  );

  const signaturePaths = [];
  const signatureHashes = [];
  for (const roleRecord of input.roles) {
    assertExactKeys(
      roleRecord,
      ['role', 'identity', 'declarations', 'decisions', 'signature'],
      roleRecord.role,
    );
    assertExactKeys(
      roleRecord.identity,
      ['identityId', 'name', 'affiliation', 'professionalProfile'],
      `${roleRecord.role}.identity`,
    );
    assertCompleteText(
      roleRecord.identity.affiliation,
      `${roleRecord.role}.identity.affiliation`,
    );
    assertCompleteText(
      roleRecord.identity.professionalProfile,
      `${roleRecord.role}.identity.professionalProfile`,
    );
    assertRoleDeclarations(roleRecord);
    assertRoleDecisions(roleRecord, blockersPresent);
    signaturePaths.push(roleRecord.signature.artifact.path);
    signatureHashes.push(
      assertSignature({
        roleRecord,
        inputRoot: path.dirname(resolvedInputPath),
        completed: timeline.completed,
        recorded: timeline.recorded,
      }),
    );
  }
  assertUnique(
    signaturePaths,
    'signature artifact paths',
    'RELEASE_SIGNOFF_DUPLICATE_SIGNATURE',
  );
  assertUnique(
    signatureHashes,
    'signature artifact hashes',
    'RELEASE_SIGNOFF_DUPLICATE_SIGNATURE',
  );

  const blockingKnownIssueIds = [
    ...new Set([
      ...summary.openCriticalOrMajorIds,
      ...summary.unresolvedP0Ids,
    ]),
  ];
  return {
    schema: RELEASE_SIGNOFF_RECORD_SCHEMA,
    releaseVersion: RELEASE_SIGNOFF_VERSION,
    recordState: RELEASE_SIGNOFF_RECORD_STATE,
    validatedMvp: false,
    validatedMvpEligible: summary.validatedMvpEligible,
    releaseReadiness: blockersPresent
      ? 'BLOCKED_BY_LOCKED_KNOWN_ISSUES'
      : 'AWAITING_SEPARATE_HUMAN_AUTHENTICITY_AND_RELEASE_AUDIT',
    blockingKnownIssueIds,
    humanAuthenticityBoundary: HUMAN_AUTHENTICITY_BOUNDARY,
    input: {
      path: path.basename(resolvedInputPath),
      sha256: createHash('sha256').update(inputBytes).digest('hex'),
    },
    locks: input.locks,
    timeline: input.timeline,
    roles: input.roles,
  };
}

export function assertReleaseSignoffReadyForValidatedMvp(record) {
  assertObject(record, 'release sign-off record');
  if (record.validatedMvp !== false) {
    fail(
      'RELEASE_SIGNOFF_ILLEGAL_SELF_VALIDATION',
      'A structural sign-off record must never mark validatedMvp=true.',
    );
  }
  if (
    record.schema !== RELEASE_SIGNOFF_RECORD_SCHEMA ||
    record.recordState !== RELEASE_SIGNOFF_RECORD_STATE
  ) {
    fail(
      'RELEASE_SIGNOFF_RECORD_STATE_INVALID',
      'Release-readiness assertion requires an untampered structural record state.',
    );
  }
  if (
    record.validatedMvpEligible !== true ||
    record.blockingKnownIssueIds.length > 0
  ) {
    fail(
      'RELEASE_SIGNOFF_UNRESOLVED_BLOCKING_ISSUE',
      `Validated-MVP release assertion failed: ${record.blockingKnownIssueIds.join(', ')}.`,
    );
  }
  if (
    !Array.isArray(record.roles) ||
    record.roles.length !== REQUIRED_RELEASE_SIGNOFF_ROLES.length ||
    record.roles.some(
      (roleRecord, index) =>
        roleRecord.role !== REQUIRED_RELEASE_SIGNOFF_ROLES[index] ||
        roleRecord.decisions?.find(
          (decision) => decision.id === 'VALIDATED_MVP_RELEASE',
        )?.decision !== 'PASS',
    )
  ) {
    fail(
      'RELEASE_SIGNOFF_RECORD_DECISION_INVALID',
      'Every exact role must PASS VALIDATED_MVP_RELEASE before a separate release-readiness assertion can succeed.',
    );
  }
  return true;
}

export function serializeReleaseSignoffRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writeReleaseSignoffRecord({
  projectRoot = DEFAULT_PROJECT_ROOT,
  inputPath,
  outputPath,
  requireValidatedMvpRelease = false,
} = {}) {
  if (!outputPath) {
    fail('RELEASE_SIGNOFF_OUTPUT_REQUIRED', 'outputPath is required.');
  }
  const record = createReleaseSignoffRecord({ projectRoot, inputPath });
  if (requireValidatedMvpRelease) {
    assertReleaseSignoffReadyForValidatedMvp(record);
  }
  mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  writeFileSync(
    path.resolve(outputPath),
    serializeReleaseSignoffRecord(record),
    'utf8',
  );
  return record;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/record-release-signoff.mjs --write-template',
    '  node scripts/record-release-signoff.mjs --check-template',
    '  node scripts/record-release-signoff.mjs --input INPUT.json --output RECORD.json [--assert-validated-mvp]',
  ].join('\n');
}

export function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.length === 1 && argumentsList[0] === '--write-template') {
    writeReleaseSignoffInputTemplate();
    console.log(
      `Release sign-off template written: ${RELEASE_SIGNOFF_TEMPLATE_RELATIVE_PATH}.`,
    );
    return;
  }
  if (argumentsList.length === 1 && argumentsList[0] === '--check-template') {
    verifyReleaseSignoffInputTemplate();
    console.log(
      'TECHNICAL_OK RELEASE_SIGNOFF_INPUT_TEMPLATE_CURRENT validatedMvp=false.',
    );
    return;
  }

  const inputIndex = argumentsList.indexOf('--input');
  const outputIndex = argumentsList.indexOf('--output');
  const assertRelease = argumentsList.includes('--assert-validated-mvp');
  const expectedLength = assertRelease ? 5 : 4;
  if (
    inputIndex < 0 ||
    outputIndex < 0 ||
    !argumentsList[inputIndex + 1] ||
    !argumentsList[outputIndex + 1] ||
    argumentsList.length !== expectedLength
  ) {
    fail('RELEASE_SIGNOFF_ARGUMENTS_INVALID', usage());
  }
  const record = writeReleaseSignoffRecord({
    inputPath: argumentsList[inputIndex + 1],
    outputPath: argumentsList[outputIndex + 1],
    requireValidatedMvpRelease: assertRelease,
  });
  console.log(
    `Release sign-off record ${record.recordState}; validatedMvp=${record.validatedMvp}; releaseReadiness=${record.releaseReadiness}.`,
  );
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
