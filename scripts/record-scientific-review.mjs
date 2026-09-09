#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEW_INPUT_SCHEMA =
  'activation-energy-studio/scientific-review-input/v1';
export const REVIEW_EVIDENCE_SCHEMA =
  'activation-energy-studio/scientific-review-evidence-record/v1';
export const REVIEW_PACKAGE_SCHEMA =
  'activation-energy-studio/independent-scientific-review-package/v1';
export const REVIEW_RECORD_STATE =
  'STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT';
export const HUMAN_AUTHENTICITY_BOUNDARY =
  'This software verifies package and evidence hashes, record completeness, eligibility declarations, decision consistency, and signature-artifact presence. It cannot authenticate the reviewer identity, the truth of declarations, the scientific observations, or the legal/cryptographic validity of the signature; those remain an independent human verification gate.';

const PACKAGE_MANIFEST_NAME = 'PACKAGE_MANIFEST.json';
const PACKAGE_MANIFEST_SIDECAR_NAME = 'PACKAGE_MANIFEST.sha256';
const REVIEW_SURFACES = Object.freeze(['UI', 'PDF', 'CSV', 'JSON']);
const PLACEHOLDER_PATTERN =
  /(?:\[required|not[_ -]?reviewed|unsigned[_ -]?not[_ -]?reviewed|tbd|todo|placeholder)/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const LEGACY_V020_PACKAGE_MANIFEST_SHA256 =
  'e7d8c252d3528f6599eb494f773b4778182beb22adcaf7f4c625d232ec39b565';
const V032_PACKAGE_VERSION = '0.3.2';
const V032_RELEASE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const V032_RELEASE_MANIFEST_SHA256 =
  '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c';
const V032_RELEASE_CHECKSUM_SHA256 =
  '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0';
const V032_REPORT_SCHEMA_SHA256 =
  'ac385a67563e643481265880c5703f5b3caec0ba2199cf15539fa1b32ebf3d3a';
const V032_CANDIDATE_FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const V032_CANDIDATE_FREEZE_SIDECAR_SHA256 =
  'e718d22b3ca7865b7b0af4654536343d1a4325ac76b1c3769d4e64668874a7d3';
const V032_ACCEPTANCE_CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';

const V032_ROLE_LOCKS = Object.freeze([
  {
    role: 'release_html',
    sourcePath: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    packagePath:
      'evidence/project/release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    sha256: V032_RELEASE_SHA256,
  },
  {
    role: 'release_evidence_manifest',
    sourcePath: 'release/v0.3.2/MANIFEST.v0.3.2.json',
    packagePath:
      'evidence/project/release/v0.3.2/MANIFEST.v0.3.2.json',
    sha256: V032_RELEASE_MANIFEST_SHA256,
  },
  {
    role: 'release_checksum_index',
    sourcePath: 'release/v0.3.2/SHA256SUMS.v0.3.2.txt',
    packagePath:
      'evidence/project/release/v0.3.2/SHA256SUMS.v0.3.2.txt',
    sha256: V032_RELEASE_CHECKSUM_SHA256,
  },
  {
    role: 'project_report_schema',
    sourcePath: 'release/v0.3.2/project-report.schema.json',
    packagePath:
      'evidence/project/release/v0.3.2/project-report.schema.json',
    sha256: V032_REPORT_SCHEMA_SHA256,
  },
  {
    role: 'candidate_freeze',
    sourcePath:
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
    packagePath:
      'evidence/project/output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
    sha256: V032_CANDIDATE_FREEZE_SHA256,
  },
  {
    role: 'candidate_freeze_sidecar',
    sourcePath:
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
    packagePath:
      'evidence/project/output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
    sha256: V032_CANDIDATE_FREEZE_SIDECAR_SHA256,
  },
  {
    role: 'external_gate_acceptance_criteria',
    sourcePath:
      'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
    packagePath:
      'evidence/project/output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
    sha256: V032_ACCEPTANCE_CRITERIA_SHA256,
  },
]);

const V032_EXTERNAL_GATE_BASELINE = Object.freeze([
  ['AC-SCI-03', 'independent-scientific-review', 'EXTERNAL_OPEN'],
  ['AC-VAL-05', 'independent-scientific-review', 'EXTERNAL_OPEN'],
  ['AC-PLAT-01', 'cross-platform-runtime', 'EXTERNAL_OPEN'],
  ['AC-PLAT-02', 'cross-platform-runtime', 'EXTERNAL_OPEN'],
  ['AC-UX-01', 'observed-usability', 'EXTERNAL_OPEN'],
  ['AC-UX-02', 'observed-usability', 'EXTERNAL_OPEN'],
  ['AC-UX-03', 'observed-usability', 'EXTERNAL_OPEN'],
  ['AC-UX-04', 'observed-usability', 'EXTERNAL_OPEN'],
]);

export const EXPECTED_DECISION_IDS = Object.freeze([
  ...REVIEW_SURFACES.flatMap((surface) =>
    Array.from(
      { length: 7 },
      (_, index) =>
        `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
    ),
  ),
  ...Array.from(
    { length: 7 },
    (_, index) => `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
  ),
]);

export const ALLOWED_SIGNATURE_METHODS = Object.freeze([
  'PADES_DIGITAL_SIGNATURE',
  'PGP_DETACHED_SIGNATURE',
  'MINISIGN_DETACHED_SIGNATURE',
  'INSTITUTIONAL_EMAIL_ATTESTATION',
  'WET_SIGNATURE_WITH_INDEPENDENT_IDENTITY_CHECK',
]);

export const REQUIRED_TRUE_ELIGIBILITY_DECLARATIONS = Object.freeze([
  'isHumanReviewer',
  'hasCurrentThermalAnalysisOrSolidStateKineticsExperience',
]);

export const REQUIRED_FALSE_CONFLICT_DECLARATIONS = Object.freeze([
  'isAiAgent',
  'implementedCalculationCore',
  'authoredValidationFixtures',
  'isProductOwnerOrManuscriptAuthor',
  'hasProjectEmploymentOrSupervisoryDependency',
  'hasRecentCoauthorshipWithProjectTeam',
  'hasFinancialOrIntellectualPropertyInterest',
  'hasUndisclosedPaidConsultingOrReviewInfluence',
  'hasOtherUndisclosedConflictOfInterest',
]);

function fail(code, message) {
  throw new Error(`${code} ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('SCIENTIFIC_REVIEW_INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) {
    fail('SCIENTIFIC_REVIEW_INVALID_ARRAY', `${label} must be an array.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('SCIENTIFIC_REVIEW_EMPTY_FIELD', `${label} must be a non-empty string.`);
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    fail('SCIENTIFIC_REVIEW_PLACEHOLDER', `${label} contains a placeholder.`);
  }
  return value.trim();
}

function boolean(value, label) {
  if (typeof value !== 'boolean') {
    fail('SCIENTIFIC_REVIEW_INVALID_BOOLEAN', `${label} must be boolean.`);
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function expectedSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_SHA256',
      `${label} must be a lowercase SHA-256 value.`,
    );
  }
  return value;
}

function utcTimestamp(value, label) {
  const text = nonEmptyString(value, label);
  if (!UTC_TIMESTAMP_PATTERN.test(text) || !Number.isFinite(Date.parse(text))) {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_UTC_TIME',
      `${label} must be an ISO-8601 UTC timestamp ending in Z.`,
    );
  }
  return text;
}

function readJson(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail('SCIENTIFIC_REVIEW_FILE_MISSING', `${label}: ${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'SCIENTIFIC_REVIEW_JSON_INVALID',
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertOutsideImmutablePackage(packageRoot, candidate, label) {
  const packagePath = path.resolve(packageRoot);
  const resolvedPackagePath = existsSync(packagePath)
    ? realpathSync(packagePath)
    : packagePath;
  const resolvedCandidate = path.resolve(candidate);
  let existingAncestor = resolvedCandidate;
  const missingSegments = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  const realAncestor = existsSync(existingAncestor)
    ? realpathSync(existingAncestor)
    : existingAncestor;
  const realDestination = path.resolve(realAncestor, ...missingSegments);
  const relative = path.relative(resolvedPackagePath, realDestination);
  if (
    relative === ''
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== '..'
      && !path.isAbsolute(relative))
  ) {
    fail(
      'SCIENTIFIC_REVIEW_IMMUTABLE_PACKAGE_WRITE',
      `${label} must be outside the immutable review package.`,
    );
  }
}

function portableRelativePath(value, label) {
  const text = nonEmptyString(value, label);
  if (
    text.includes('\\')
    || path.posix.isAbsolute(text)
    || text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(
      'SCIENTIFIC_REVIEW_PATH_TRAVERSAL',
      `${label} must be a portable relative path without dot segments.`,
    );
  }
  return text;
}

function resolveContainedFile(root, candidate, label) {
  const portable = portableRelativePath(candidate, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...portable.split('/'));
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail('SCIENTIFIC_REVIEW_PATH_TRAVERSAL', `${label} escapes its evidence root.`);
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    fail('SCIENTIFIC_REVIEW_FILE_MISSING', `${label}: ${portable}`);
  }
  const realRoot = realpathSync(resolvedRoot);
  const realFile = realpathSync(resolved);
  const realRelative = path.relative(realRoot, realFile);
  if (
    realRelative === '..'
    || realRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(realRelative)
  ) {
    fail(
      'SCIENTIFIC_REVIEW_PATH_TRAVERSAL',
      `${label} resolves outside its evidence root.`,
    );
  }
  return { portable, resolved };
}

function verifyHashedFile(root, descriptor, label) {
  const item = object(descriptor, label);
  const { portable, resolved } = resolveContainedFile(root, item.path, `${label}.path`);
  const expected = expectedSha256(item.sha256, `${label}.sha256`);
  const actual = sha256File(resolved);
  if (actual !== expected) {
    fail(
      'SCIENTIFIC_REVIEW_HASH_MISMATCH',
      `${label}: expected ${expected}, actual ${actual}.`,
    );
  }
  return {
    path: portable,
    sha256: actual,
    bytes: statSync(resolved).size,
  };
}

function listRegularFiles(root, prefix = '') {
  const directory = prefix
    ? path.resolve(root, ...prefix.split('/'))
    : path.resolve(root);
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...listRegularFiles(root, relative));
    else if (entry.isFile()) result.push(relative);
    else {
      fail(
        'SCIENTIFIC_REVIEW_PACKAGE_UNSUPPORTED_ENTRY',
        `Immutable package contains a non-regular entry: ${relative}.`,
      );
    }
  }
  return result.sort();
}

function verifyPackageEntry(packageRoot, entry, label) {
  const item = object(entry, label);
  const verified = verifyHashedFile(
    packageRoot,
    { path: item.packagePath, sha256: item.sha256 },
    label,
  );
  if (!Number.isInteger(item.bytes) || item.bytes !== verified.bytes) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_SIZE_MISMATCH',
      `${label}: expected ${item.bytes}, actual ${verified.bytes}.`,
    );
  }
  return verified;
}

function uniqueArtifactByRole(manifest, role) {
  const matches = manifest.artifacts.filter((entry) => entry.role === role);
  if (matches.length !== 1) {
    fail(
      'SCIENTIFIC_REVIEW_V032_ROLE_CARDINALITY',
      `${role} must occur exactly once; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function assertExactValue(actual, expected, label) {
  if (actual !== expected) {
    fail(
      'SCIENTIFIC_REVIEW_V032_LOCK_MISMATCH',
      `${label}: expected ${String(expected)}, found ${String(actual)}.`,
    );
  }
}

function assertV032PackageContract(packageRoot, manifest) {
  assertExactValue(
    manifest.packageVersion,
    V032_PACKAGE_VERSION,
    'packageVersion',
  );
  assertExactValue(
    manifest.externalEvidenceComplete,
    false,
    'externalEvidenceComplete',
  );
  assertExactValue(
    manifest.technicalReadiness,
    'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW',
    'technicalReadiness',
  );

  const acceptanceGates = object(
    manifest.acceptanceGates,
    'package acceptanceGates',
  );
  const gateKeys = Object.keys(acceptanceGates).sort();
  if (JSON.stringify(gateKeys) !== JSON.stringify(['AC-SCI-03', 'AC-VAL-05'])) {
    fail(
      'SCIENTIFIC_REVIEW_V032_GATE_CARDINALITY',
      `Expected only AC-SCI-03 and AC-VAL-05; found ${gateKeys.join(', ')}.`,
    );
  }
  for (const gate of gateKeys) {
    assertExactValue(
      acceptanceGates[gate],
      'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW',
      `acceptanceGates.${gate}`,
    );
  }

  const checklist = object(manifest.checklist, 'package checklist');
  if (
    JSON.stringify(checklist.gateIds)
      !== JSON.stringify(['AC-SCI-03', 'AC-VAL-05'])
    || JSON.stringify(checklist.acSci03?.surfaces)
      !== JSON.stringify(REVIEW_SURFACES)
  ) {
    fail(
      'SCIENTIFIC_REVIEW_V032_CHECKLIST_BOUNDARY_MISMATCH',
      'Gate IDs or AC-SCI-03 surfaces do not match the frozen review contract.',
    );
  }
  assertExactValue(checklist.acSci03?.itemsPerSurface, 7, 'acSci03.itemsPerSurface');
  assertExactValue(checklist.acSci03?.requiredDecisions, 28, 'acSci03.requiredDecisions');
  assertExactValue(checklist.acVal05?.requiredDecisions, 7, 'acVal05.requiredDecisions');
  assertExactValue(checklist.totalRequiredDecisions, 35, 'totalRequiredDecisions');
  assertExactValue(checklist.initialDecision, 'NOT_REVIEWED', 'initialDecision');

  const lockedRelease = object(manifest.lockedRelease, 'package lockedRelease');
  const expectedReleaseFields = {
    version: V032_PACKAGE_VERSION,
    artifact: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    packageArtifact:
      'evidence/project/release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    sha256: V032_RELEASE_SHA256,
    releaseManifestPath: 'release/v0.3.2/MANIFEST.v0.3.2.json',
    releaseManifestSha256: V032_RELEASE_MANIFEST_SHA256,
    checksumIndexPath: 'release/v0.3.2/SHA256SUMS.v0.3.2.txt',
    checksumIndexSha256: V032_RELEASE_CHECKSUM_SHA256,
    reportSchemaPath: 'release/v0.3.2/project-report.schema.json',
    reportSchemaSha256: V032_REPORT_SCHEMA_SHA256,
    candidateFreezePath:
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
    candidateFreezeSha256: V032_CANDIDATE_FREEZE_SHA256,
    acceptanceCriteriaPath:
      'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
    acceptanceCriteriaSha256: V032_ACCEPTANCE_CRITERIA_SHA256,
  };
  for (const [field, expected] of Object.entries(expectedReleaseFields)) {
    assertExactValue(lockedRelease[field], expected, `lockedRelease.${field}`);
  }

  for (const expected of V032_ROLE_LOCKS) {
    const entry = uniqueArtifactByRole(manifest, expected.role);
    assertExactValue(entry.sourcePath, expected.sourcePath, `${expected.role}.sourcePath`);
    assertExactValue(entry.packagePath, expected.packagePath, `${expected.role}.packagePath`);
    assertExactValue(entry.sha256, expected.sha256, `${expected.role}.sha256`);
  }

  const releaseManifestEntry = uniqueArtifactByRole(
    manifest,
    'release_evidence_manifest',
  );
  const releaseManifestFile = resolveContainedFile(
    packageRoot,
    releaseManifestEntry.packagePath,
    'v0.3.2 release manifest',
  ).resolved;
  const releaseManifest = readJson(
    releaseManifestFile,
    'v0.3.2 release manifest',
  );
  assertExactValue(releaseManifest.release?.version, V032_PACKAGE_VERSION, 'release.version');
  assertExactValue(releaseManifest.release?.sha256, V032_RELEASE_SHA256, 'release.sha256');
  assertExactValue(
    releaseManifest.release?.artifact,
    'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    'release.artifact',
  );

  const freezeSidecarEntry = uniqueArtifactByRole(
    manifest,
    'candidate_freeze_sidecar',
  );
  const freezeSidecarFile = resolveContainedFile(
    packageRoot,
    freezeSidecarEntry.packagePath,
    'candidate-freeze sidecar',
  ).resolved;
  assertExactValue(
    readFileSync(freezeSidecarFile, 'utf8'),
    `${V032_CANDIDATE_FREEZE_SHA256}  CANDIDATE_FREEZE.json\n`,
    'candidate-freeze sidecar bytes',
  );

  const freezeEntry = uniqueArtifactByRole(manifest, 'candidate_freeze');
  const freezeFile = resolveContainedFile(
    packageRoot,
    freezeEntry.packagePath,
    'candidate freeze',
  ).resolved;
  const freeze = readJson(freezeFile, 'candidate freeze');
  assertExactValue(freeze.releaseVersion, V032_PACKAGE_VERSION, 'freeze.releaseVersion');
  assertExactValue(
    freeze.status,
    'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS',
    'freeze.status',
  );
  assertExactValue(freeze.candidate?.sha256, V032_RELEASE_SHA256, 'freeze.candidate.sha256');

  const actualGateBaseline = array(
    freeze.externalGateBaseline,
    'freeze.externalGateBaseline',
  )
    .map((gate) => [gate.id, gate.lane, gate.status])
    .sort(([left], [right]) => left.localeCompare(right));
  const expectedGateBaseline = [...V032_EXTERNAL_GATE_BASELINE]
    .map((gate) => [...gate])
    .sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualGateBaseline) !== JSON.stringify(expectedGateBaseline)) {
    fail(
      'SCIENTIFIC_REVIEW_V032_EXTERNAL_GATE_BASELINE_MISMATCH',
      'The frozen eight-gate EXTERNAL_OPEN baseline changed.',
    );
  }
  assertExactValue(
    freeze.boundArtifacts?.length,
    7,
    'freeze.boundArtifacts.length',
  );
  const expectedBoundRoles = [
    'external-gate-acceptance-criteria',
    'release-checksums',
    'release-html',
    'release-manifest',
    'remediation-gate-results',
    'remediation-report',
    'report-schema',
  ];
  const actualBoundRoles = freeze.boundArtifacts
    .map(({ role }) => role)
    .sort();
  if (JSON.stringify(actualBoundRoles) !== JSON.stringify(expectedBoundRoles)) {
    fail(
      'SCIENTIFIC_REVIEW_V032_FREEZE_ARTIFACT_CARDINALITY',
      `Unexpected freeze roles: ${actualBoundRoles.join(', ')}.`,
    );
  }
  for (const field of [
    'releaseDirectoryMutationAllowed',
    'selfSignedExternalEvidenceAllowed',
    'syntheticHumanOrDeviceEvidenceAllowed',
    'historicalEvidenceRelabelingAllowed',
  ]) {
    assertExactValue(freeze.integrityPolicy?.[field], false, `freeze.integrityPolicy.${field}`);
  }

  assertExactValue(
    manifest.reviewerEligibility?.humanRequired,
    true,
    'reviewerEligibility.humanRequired',
  );
  assertExactValue(
    manifest.reviewerEligibility?.signedVerdictRequired,
    true,
    'reviewerEligibility.signedVerdictRequired',
  );
  assertExactValue(
    manifest.reviewerEligibility?.aiAgentMaySign,
    false,
    'reviewerEligibility.aiAgentMaySign',
  );
  assertExactValue(
    manifest.generation?.signedEvidenceExcluded,
    true,
    'generation.signedEvidenceExcluded',
  );
  assertExactValue(
    manifest.generation?.observedEvidenceMustRemainOutsidePackage,
    true,
    'generation.observedEvidenceMustRemainOutsidePackage',
  );
}

function assertSupportedPackageProfile(packageRoot, manifest, manifestSha256) {
  if (manifest.packageVersion === V032_PACKAGE_VERSION) {
    assertV032PackageContract(packageRoot, manifest);
    return 'V032_HARD_LOCKED';
  }
  if (
    manifest.packageVersion === '0.2.0'
    && manifestSha256 === LEGACY_V020_PACKAGE_MANIFEST_SHA256
  ) {
    return 'V020_IMMUTABLE_LEGACY';
  }
  fail(
    'SCIENTIFIC_REVIEW_UNSUPPORTED_PACKAGE_PROFILE',
    `Package version ${String(manifest.packageVersion)} with manifest SHA-256 ${manifestSha256} is not an accepted recorder profile.`,
  );
}

export function verifyReviewPackageForRecord(packageRoot) {
  const resolvedRoot = path.resolve(packageRoot);
  if (!existsSync(resolvedRoot) || !statSync(resolvedRoot).isDirectory()) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_MISSING',
      `Review package directory not found: ${resolvedRoot}.`,
    );
  }

  const manifestPath = path.join(resolvedRoot, PACKAGE_MANIFEST_NAME);
  const sidecarPath = path.join(resolvedRoot, PACKAGE_MANIFEST_SIDECAR_NAME);
  const manifestBytes = readFileSync(manifestPath);
  const manifestSha256 = sha256Bytes(manifestBytes);
  const expectedSidecar = `${manifestSha256}  ${PACKAGE_MANIFEST_NAME}\n`;
  if (
    !existsSync(sidecarPath)
    || readFileSync(sidecarPath, 'utf8') !== expectedSidecar
  ) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_SIDECAR_MISMATCH',
      `${PACKAGE_MANIFEST_SIDECAR_NAME} does not authenticate the current manifest bytes.`,
    );
  }

  const manifest = readJson(manifestPath, PACKAGE_MANIFEST_NAME);
  if (manifest.schema !== REVIEW_PACKAGE_SCHEMA) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_SCHEMA_MISMATCH',
      `Expected ${REVIEW_PACKAGE_SCHEMA}, found ${String(manifest.schema)}.`,
    );
  }
  if (manifest.reviewState !== 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW') {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_STATE_INVALID',
      `Expected unsigned package state, found ${String(manifest.reviewState)}.`,
    );
  }
  if (manifest.checklist?.totalRequiredDecisions !== EXPECTED_DECISION_IDS.length) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_CHECKLIST_MISMATCH',
      `Expected ${EXPECTED_DECISION_IDS.length} decisions in the package manifest.`,
    );
  }

  const entries = [
    ...array(manifest.artifacts, 'package manifest artifacts'),
    ...array(manifest.generatedFiles, 'package manifest generatedFiles'),
  ];
  const entryPaths = new Set();
  for (const [index, entry] of entries.entries()) {
    const verified = verifyPackageEntry(
      resolvedRoot,
      entry,
      `package entry ${index + 1}`,
    );
    if (entryPaths.has(verified.path)) {
      fail(
        'SCIENTIFIC_REVIEW_PACKAGE_DUPLICATE_PATH',
        `Duplicate package path: ${verified.path}.`,
      );
    }
    entryPaths.add(verified.path);
  }

  const expectedFiles = [
    PACKAGE_MANIFEST_NAME,
    PACKAGE_MANIFEST_SIDECAR_NAME,
    ...entryPaths,
  ].sort();
  const actualFiles = listRegularFiles(resolvedRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_FILE_SET_MISMATCH',
      `Expected ${expectedFiles.length} files, found ${actualFiles.length}.`,
    );
  }

  const artifactByRole = new Map(
    manifest.artifacts.map((entry) => [entry.role, entry]),
  );
  const releaseArtifact = artifactByRole.get('release_html');
  const releaseManifestArtifact = artifactByRole.get('release_evidence_manifest');
  if (!releaseArtifact || !releaseManifestArtifact) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_LOCK_ARTIFACT_MISSING',
      'Package must contain release_html and release_evidence_manifest roles.',
    );
  }
  const lockedRelease = object(manifest.lockedRelease, 'package lockedRelease');
  const releaseSha256 = expectedSha256(
    releaseArtifact.sha256,
    'release artifact sha256',
  );
  const releaseManifestSha256 = expectedSha256(
    releaseManifestArtifact.sha256,
    'release manifest artifact sha256',
  );
  if (
    lockedRelease.sha256 !== releaseSha256
    || lockedRelease.releaseManifestSha256 !== releaseManifestSha256
  ) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_RELEASE_LOCK_MISMATCH',
      'Package lockedRelease values disagree with the hashed artifact inventory.',
    );
  }
  const packageProfile = assertSupportedPackageProfile(
    resolvedRoot,
    manifest,
    manifestSha256,
  );

  return {
    root: resolvedRoot,
    manifest,
    manifestSha256,
    packageProfile,
    releaseSha256,
    releaseManifestSha256,
    artifactCount: manifest.artifacts.length,
    fileCount: actualFiles.length,
  };
}

function validateLocks(input, packageInfo) {
  const locks = object(input.locks, 'input.locks');
  const actual = {
    releaseSha256: packageInfo.releaseSha256,
    releaseManifestSha256: packageInfo.releaseManifestSha256,
    packageManifestSha256: packageInfo.manifestSha256,
  };
  for (const [field, expected] of Object.entries(actual)) {
    const declared = expectedSha256(locks[field], `input.locks.${field}`);
    if (declared !== expected) {
      fail(
        'SCIENTIFIC_REVIEW_LOCK_MISMATCH',
        `${field}: declared ${declared}, package ${expected}.`,
      );
    }
  }
  return actual;
}

function validateReviewer(value) {
  const reviewer = object(value, 'input.reviewer');
  const normalized = {
    name: nonEmptyString(reviewer.name, 'input.reviewer.name'),
    affiliation: nonEmptyString(
      reviewer.affiliation,
      'input.reviewer.affiliation',
    ),
    professionalProfile: nonEmptyString(
      reviewer.professionalProfile,
      'input.reviewer.professionalProfile',
    ),
    relevantExpertise: nonEmptyString(
      reviewer.relevantExpertise,
      'input.reviewer.relevantExpertise',
    ),
    expertiseEvidence: nonEmptyString(
      reviewer.expertiseEvidence,
      'input.reviewer.expertiseEvidence',
    ),
    independenceStatement: nonEmptyString(
      reviewer.independenceStatement,
      'input.reviewer.independenceStatement',
    ),
    conflictOfInterestStatement: nonEmptyString(
      reviewer.conflictOfInterestStatement,
      'input.reviewer.conflictOfInterestStatement',
    ),
    declarations: {},
  };
  const declarations = object(
    reviewer.declarations,
    'input.reviewer.declarations',
  );
  for (const field of REQUIRED_TRUE_ELIGIBILITY_DECLARATIONS) {
    const valueAtField = boolean(
      declarations[field],
      `input.reviewer.declarations.${field}`,
    );
    if (!valueAtField) {
      fail(
        'SCIENTIFIC_REVIEW_REVIEWER_INELIGIBLE',
        `${field} must be true.`,
      );
    }
    normalized.declarations[field] = true;
  }
  for (const field of REQUIRED_FALSE_CONFLICT_DECLARATIONS) {
    const valueAtField = boolean(
      declarations[field],
      `input.reviewer.declarations.${field}`,
    );
    if (valueAtField) {
      fail(
        'SCIENTIFIC_REVIEW_REVIEWER_INELIGIBLE',
        `${field} must be false.`,
      );
    }
    normalized.declarations[field] = false;
  }
  return normalized;
}

function validateReviewContext(value) {
  const review = object(value, 'input.review');
  const startedAtUtc = utcTimestamp(
    review.startedAtUtc,
    'input.review.startedAtUtc',
  );
  const endedAtUtc = utcTimestamp(review.endedAtUtc, 'input.review.endedAtUtc');
  if (Date.parse(endedAtUtc) <= Date.parse(startedAtUtc)) {
    fail(
      'SCIENTIFIC_REVIEW_TIME_ORDER_INVALID',
      'Review end time must be later than review start time.',
    );
  }
  const environment = object(review.environment, 'input.review.environment');
  return {
    startedAtUtc,
    endedAtUtc,
    environment: {
      operatingSystem: nonEmptyString(
        environment.operatingSystem,
        'input.review.environment.operatingSystem',
      ),
      browser: nonEmptyString(
        environment.browser,
        'input.review.environment.browser',
      ),
      locale: nonEmptyString(
        environment.locale,
        'input.review.environment.locale',
      ),
    },
  };
}

function gateForDecisionId(id) {
  return id.startsWith('AC-SCI-03-') ? 'AC-SCI-03' : 'AC-VAL-05';
}

function validateDecision(value, index, evidenceRoot) {
  const decision = object(value, `input.decisions[${index}]`);
  const id = nonEmptyString(decision.id, `input.decisions[${index}].id`);
  if (!EXPECTED_DECISION_IDS.includes(id)) {
    fail('SCIENTIFIC_REVIEW_UNKNOWN_DECISION', `Unknown decision ID: ${id}.`);
  }
  if (decision.decision !== 'PASS' && decision.decision !== 'FAIL') {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_DECISION',
      `${id} must be PASS or FAIL, not ${String(decision.decision)}.`,
    );
  }
  const caseId = nonEmptyString(
    decision.caseId,
    `input.decisions[${index}].caseId`,
  );
  if (!CASE_ID_PATTERN.test(caseId)) {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_CASE_ID',
      `${id} has an invalid caseId: ${caseId}.`,
    );
  }
  const evidence = array(
    decision.evidence,
    `input.decisions[${index}].evidence`,
  );
  if (evidence.length === 0) {
    fail(
      'SCIENTIFIC_REVIEW_EMPTY_EVIDENCE',
      `${id} requires at least one hashed evidence artifact.`,
    );
  }
  return {
    id,
    gate: gateForDecisionId(id),
    decision: decision.decision,
    caseId,
    evidence: evidence.map((item, evidenceIndex) =>
      verifyHashedFile(
        evidenceRoot,
        item,
        `input.decisions[${index}].evidence[${evidenceIndex}]`,
      ),
    ),
    comment: nonEmptyString(
      decision.comment,
      `input.decisions[${index}].comment`,
    ),
  };
}

function validateDecisions(value, evidenceRoot) {
  const items = array(value, 'input.decisions');
  if (items.length !== EXPECTED_DECISION_IDS.length) {
    fail(
      'SCIENTIFIC_REVIEW_DECISION_COUNT_MISMATCH',
      `Expected ${EXPECTED_DECISION_IDS.length} decisions, found ${items.length}.`,
    );
  }
  const decisions = items.map((item, index) =>
    validateDecision(item, index, evidenceRoot),
  );
  const seen = new Set();
  for (const decision of decisions) {
    if (seen.has(decision.id)) {
      fail(
        'SCIENTIFIC_REVIEW_DUPLICATE_DECISION',
        `Duplicate decision ID: ${decision.id}.`,
      );
    }
    seen.add(decision.id);
  }
  const missing = EXPECTED_DECISION_IDS.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    fail(
      'SCIENTIFIC_REVIEW_MISSING_DECISION',
      `Missing decision IDs: ${missing.join(', ')}.`,
    );
  }
  const byId = new Map(decisions.map((decision) => [decision.id, decision]));
  return EXPECTED_DECISION_IDS.map((id) => byId.get(id));
}

function summarizeGate(decisions, gate) {
  const selected = decisions.filter((decision) => decision.gate === gate);
  const passCount = selected.filter(({ decision }) => decision === 'PASS').length;
  const failCount = selected.length - passCount;
  return {
    requiredDecisions: selected.length,
    passCount,
    failCount,
    binaryDisposition: failCount === 0 ? 'PASS' : 'FAIL',
  };
}

function validateVerdict(value, evidenceRoot, review, decisionSummary) {
  const verdict = object(value, 'input.verdict');
  const gateDispositions = object(
    verdict.gateDispositions,
    'input.verdict.gateDispositions',
  );
  const normalizedGateDispositions = {};
  for (const gate of ['AC-SCI-03', 'AC-VAL-05']) {
    const declared = nonEmptyString(
      gateDispositions[gate],
      `input.verdict.gateDispositions.${gate}`,
    );
    if (!['PASS', 'FAIL', 'REVISION_REQUIRED'].includes(declared)) {
      fail(
        'SCIENTIFIC_REVIEW_INVALID_GATE_DISPOSITION',
        `${gate} disposition must be PASS, FAIL, or REVISION_REQUIRED.`,
      );
    }
    const binary = decisionSummary[gate].binaryDisposition;
    if (
      (declared === 'PASS' && binary !== 'PASS')
      || (declared !== 'PASS' && binary === 'PASS')
    ) {
      fail(
        'SCIENTIFIC_REVIEW_GATE_PASS_CONTRADICTION',
        `${gate} disposition ${declared} contradicts its item decisions.`,
      );
    }
    normalizedGateDispositions[gate] = declared;
  }

  const overallVerdict = nonEmptyString(
    verdict.overallVerdict,
    'input.verdict.overallVerdict',
  );
  if (!['PASS', 'FAIL', 'REVISION_REQUIRED'].includes(overallVerdict)) {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_OVERALL_VERDICT',
      'overallVerdict must be PASS, FAIL, or REVISION_REQUIRED.',
    );
  }
  const bothGatesPass = Object.values(normalizedGateDispositions).every(
    (disposition) => disposition === 'PASS',
  );
  if (
    (overallVerdict === 'PASS' && !bothGatesPass)
    || (overallVerdict !== 'PASS' && bothGatesPass)
  ) {
    fail(
      'SCIENTIFIC_REVIEW_OVERALL_PASS_CONTRADICTION',
      `Overall verdict ${overallVerdict} contradicts the separate gate dispositions.`,
    );
  }

  const signedArtifact = verifyHashedFile(
    evidenceRoot,
    verdict.signedArtifact,
    'input.verdict.signedArtifact',
  );
  const signatureMethod = nonEmptyString(
    verdict.signatureMethod,
    'input.verdict.signatureMethod',
  );
  if (!ALLOWED_SIGNATURE_METHODS.includes(signatureMethod)) {
    fail(
      'SCIENTIFIC_REVIEW_SIGNATURE_METHOD_UNSUPPORTED',
      `Unsupported signature method: ${signatureMethod}.`,
    );
  }
  const signatureVerificationReference = nonEmptyString(
    verdict.signatureVerificationReference,
    'input.verdict.signatureVerificationReference',
  );
  const signatureUtc = utcTimestamp(
    verdict.signatureUtc,
    'input.verdict.signatureUtc',
  );
  if (Date.parse(signatureUtc) < Date.parse(review.endedAtUtc)) {
    fail(
      'SCIENTIFIC_REVIEW_SIGNATURE_TIME_INVALID',
      'Signature time cannot precede review completion.',
    );
  }

  return {
    gateDispositions: normalizedGateDispositions,
    overallVerdict,
    signedArtifact,
    signatureMethod,
    signatureVerificationReference,
    signatureUtc,
  };
}

function deduplicateEvidence(decisions, signedArtifact) {
  const artifacts = new Map();
  for (const decision of decisions) {
    for (const artifact of decision.evidence) {
      const key = `${artifact.path}\0${artifact.sha256}`;
      artifacts.set(key, artifact);
    }
  }
  artifacts.set(
    `${signedArtifact.path}\0${signedArtifact.sha256}`,
    signedArtifact,
  );
  return [...artifacts.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

export function createScientificReviewEvidenceRecord({
  packageRoot,
  inputPath,
}) {
  if (!packageRoot || !inputPath) {
    fail(
      'SCIENTIFIC_REVIEW_ARGUMENT_MISSING',
      'packageRoot and inputPath are required.',
    );
  }
  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedInputPath = path.resolve(inputPath);
  assertOutsideImmutablePackage(
    resolvedPackageRoot,
    resolvedInputPath,
    'Review input',
  );
  const packageInfo = verifyReviewPackageForRecord(resolvedPackageRoot);
  const input = readJson(resolvedInputPath, 'scientific review input');
  if (input.schema !== REVIEW_INPUT_SCHEMA) {
    fail(
      'SCIENTIFIC_REVIEW_INPUT_SCHEMA_MISMATCH',
      `Expected ${REVIEW_INPUT_SCHEMA}, found ${String(input.schema)}.`,
    );
  }
  const reviewId = nonEmptyString(input.reviewId, 'input.reviewId');
  if (!CASE_ID_PATTERN.test(reviewId)) {
    fail(
      'SCIENTIFIC_REVIEW_INVALID_REVIEW_ID',
      `Invalid reviewId: ${reviewId}.`,
    );
  }
  const locks = validateLocks(input, packageInfo);
  const reviewer = validateReviewer(input.reviewer);
  const review = validateReviewContext(input.review);
  const evidenceRoot = path.dirname(resolvedInputPath);
  const decisions = validateDecisions(input.decisions, evidenceRoot);
  const decisionSummary = {
    'AC-SCI-03': summarizeGate(decisions, 'AC-SCI-03'),
    'AC-VAL-05': summarizeGate(decisions, 'AC-VAL-05'),
  };
  const verdict = validateVerdict(
    input.verdict,
    evidenceRoot,
    review,
    decisionSummary,
  );
  for (const gate of ['AC-SCI-03', 'AC-VAL-05']) {
    decisionSummary[gate].reviewerDisposition =
      verdict.gateDispositions[gate];
  }

  return {
    schema: REVIEW_EVIDENCE_SCHEMA,
    reviewId,
    recordState: REVIEW_RECORD_STATE,
    packageIntegrity: {
      status: 'PASS',
      artifactCount: packageInfo.artifactCount,
      fileCount: packageInfo.fileCount,
    },
    locks,
    reviewer,
    review,
    decisions,
    gateDispositions: decisionSummary,
    overallVerdict: verdict.overallVerdict,
    signedVerdict: {
      ...verdict.signedArtifact,
      signatureMethod: verdict.signatureMethod,
      signatureVerificationReference:
        verdict.signatureVerificationReference,
      signatureUtc: verdict.signatureUtc,
      authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
    },
    retainedEvidence: deduplicateEvidence(
      decisions,
      verdict.signedArtifact,
    ),
    sourceInput: {
      fileName: path.basename(resolvedInputPath),
      sha256: sha256File(resolvedInputPath),
    },
    acceptanceGateClosure: 'NOT_AUTOMATICALLY_APPLIED',
    humanAuthenticityBoundary: HUMAN_AUTHENTICITY_BOUNDARY,
  };
}

export function serializeScientificReviewEvidenceRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writeScientificReviewEvidenceRecord({
  packageRoot,
  inputPath,
  outputPath,
}) {
  if (!outputPath) {
    fail('SCIENTIFIC_REVIEW_ARGUMENT_MISSING', 'outputPath is required.');
  }
  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath);
  assertOutsideImmutablePackage(
    resolvedPackageRoot,
    resolvedOutputPath,
    'Evidence record output',
  );
  if (resolvedOutputPath === resolvedInputPath) {
    fail(
      'SCIENTIFIC_REVIEW_OUTPUT_COLLISION',
      'Evidence record output cannot overwrite the reviewer input.',
    );
  }
  const record = createScientificReviewEvidenceRecord({
    packageRoot: resolvedPackageRoot,
    inputPath: resolvedInputPath,
  });
  const serialized = serializeScientificReviewEvidenceRecord(record);
  mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, serialized, 'utf8');
  return {
    record,
    outputPath: resolvedOutputPath,
    sha256: sha256Bytes(serialized),
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--package') {
      options.packageRoot = argv[index + 1];
      index += 1;
    } else if (argument === '--input') {
      options.inputPath = argv[index + 1];
      index += 1;
    } else if (argument === '--output') {
      options.outputPath = argv[index + 1];
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      fail('SCIENTIFIC_REVIEW_UNKNOWN_ARGUMENT', String(argument));
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/record-scientific-review.mjs \\
  --package <immutable-review-package> \\
  --input <completed-structured-review.json> \\
  --output <evidence-record.json>

The input and output must be outside the immutable package. Structural
validation never authenticates the reviewer or signature and never closes an
acceptance gate.`;
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    for (const required of ['packageRoot', 'inputPath', 'outputPath']) {
      if (!options[required]) {
        fail(
          'SCIENTIFIC_REVIEW_ARGUMENT_MISSING',
          `Missing ${required}.`,
        );
      }
    }
    const result = writeScientificReviewEvidenceRecord(options);
    console.log(
      `TECHNICAL_OK SCIENTIFIC_REVIEW_RECORD_STRUCTURALLY_VALID `
      + `output=${result.outputPath} sha256=${result.sha256} `
      + `AC-SCI-03=${result.record.gateDispositions['AC-SCI-03'].reviewerDisposition} `
      + `AC-VAL-05=${result.record.gateDispositions['AC-VAL-05'].reviewerDisposition} `
      + `authenticity=NOT_VERIFIED_BY_SOFTWARE gates=NOT_AUTOMATICALLY_APPLIED`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCli();
