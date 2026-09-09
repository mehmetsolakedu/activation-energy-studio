import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyExternalCandidateFreeze } from './verify-v0.3.2-external-candidate.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

const CANDIDATE_SHA256 = '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const FREEZE_PATH = 'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json';
const FREEZE_SHA256 = '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const CRITERIA_PATH =
  'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md';
const CRITERIA_SHA256 = '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';

const DEFAULT_STATUS_PATHS = Object.freeze({
  scientific:
    'output/v0.3.2-external-validation/scientific-review/SCIENTIFIC_REVIEW_STATUS.json',
  platform:
    'output/v0.3.2-external-validation/platform/PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
  usability: 'evidence/usability/v0.3.2/USABILITY_LANE_STATUS.json',
});

const DEFAULT_OUTPUT_PATH =
  'output/v0.3.2-external-validation/CURRENT_RELEASE_DECISION.json';

const EXPECTED_LANE_GATES = Object.freeze({
  scientific: ['AC-SCI-03', 'AC-VAL-05'],
  platform: ['AC-PLAT-01', 'AC-PLAT-02'],
  usability: ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveRelative(projectRoot, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'Relative path is required.');
  assert(!path.isAbsolute(relativePath), `Absolute path is forbidden: ${relativePath}`);
  const resolved = path.resolve(projectRoot, relativePath);
  assert(
    resolved.startsWith(`${projectRoot}${path.sep}`),
    `Path escapes project root: ${relativePath}`,
  );
  return resolved;
}

async function digestFile(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function bindFile(projectRoot, relativePath) {
  const absolutePath = resolveRelative(projectRoot, relativePath);
  const fileStat = await stat(absolutePath);
  assert(fileStat.isFile(), `Expected file: ${relativePath}`);
  return {
    path: relativePath,
    bytes: fileStat.size,
    sha256: await digestFile(absolutePath),
  };
}

async function verifyReference(projectRoot, reference, label) {
  assert(reference && typeof reference === 'object', `${label} reference is required.`);
  assert(/^[a-f0-9]{64}$/.test(reference.sha256), `${label} SHA-256 is invalid.`);
  const actual = await bindFile(projectRoot, reference.path);
  assert(actual.sha256 === reference.sha256, `${label} SHA-256 mismatch.`);
  if (reference.bytes !== undefined) {
    assert(actual.bytes === reference.bytes, `${label} byte-size mismatch.`);
  }
  return actual;
}

async function readStatus(projectRoot, relativePath) {
  const bound = await bindFile(projectRoot, relativePath);
  return {
    bound,
    value: JSON.parse(await readFile(resolveRelative(projectRoot, relativePath), 'utf8')),
  };
}

function assertExactGateSet(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} gate identifiers or ordering changed.`,
  );
}

function assertAllOpen(gateStatus, expected, label) {
  assert(
    gateStatus && expected.every((gateId) => gateStatus[gateId] === 'EXTERNAL_OPEN'),
    `${label} cannot claim an external gate is closed.`,
  );
}

async function verifyScientificLane(projectRoot, record) {
  const expected = EXPECTED_LANE_GATES.scientific;
  assert(
    record.schemaVersion === 'activation-energy-studio/independent-scientific-review-lane-status/v1',
    'Unexpected scientific status schema.',
  );
  assert(record.releaseVersion === '0.3.2', 'Scientific status release mismatch.');
  assert(record.candidateSha256 === CANDIDATE_SHA256, 'Scientific candidate mismatch.');
  assert(record.candidateFreeze?.path === FREEZE_PATH, 'Scientific freeze path mismatch.');
  assert(record.candidateFreeze?.sha256 === FREEZE_SHA256, 'Scientific freeze hash mismatch.');
  assertExactGateSet(record.gateIds, expected, 'Scientific');
  assertAllOpen(record.gateStatus, expected, 'Scientific');
  assert(
    record.reviewState === 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW',
    'Scientific review state must remain unsigned.',
  );
  assert(record.externalEvidenceComplete === false, 'Scientific external evidence cannot be complete.');
  assert(
    record.technicalReadiness?.status === 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW',
    'Scientific package is not technically ready.',
  );
  await verifyReference(
    projectRoot,
    record.packageArtifacts?.packageManifest,
    'Scientific package manifest',
  );
  await verifyReference(
    projectRoot,
    record.packageArtifacts?.packageManifestSidecar,
    'Scientific package-manifest sidecar',
  );
}

async function verifyPlatformLane(projectRoot, record) {
  const expected = EXPECTED_LANE_GATES.platform;
  assert(
    record.schemaVersion === 'activation-energy-studio/platform-external-evidence-status/v1',
    'Unexpected platform status schema.',
  );
  assert(record.releaseVersion === '0.3.2', 'Platform status release mismatch.');
  assert(record.candidate?.sha256 === CANDIDATE_SHA256, 'Platform candidate mismatch.');
  assert(record.candidate?.freezeSha256 === FREEZE_SHA256, 'Platform freeze hash mismatch.');
  assertExactGateSet(record.gateIds, expected, 'Platform');
  assertAllOpen(record.gateStatus, expected, 'Platform');
  assert(record.externalEvidenceComplete === false, 'Platform external evidence cannot be complete.');
  assert(record.eligibleForPlatformGateClosure === false, 'Platform gate closure must be ineligible.');
  assert(record.matrixRecordPresent === false, 'Platform matrix cannot be present in dispatch state.');
  assert(
    record.independentHumanReviewPresent === false,
    'Independent platform review cannot be present in dispatch state.',
  );
  assert(
    record.technicalReadiness?.state === 'READY_FOR_GENUINE_DEVICE_EXECUTION',
    'Platform package is not technically ready.',
  );
  assert(
    Array.isArray(record.actualRetainedOsEvidenceSet?.genuineOneRunRecords)
      && record.actualRetainedOsEvidenceSet.genuineOneRunRecords.length === 0,
    'Dispatch status must not relabel a local diagnostic as genuine platform evidence.',
  );
  for (const artifact of record.packageArtifacts ?? []) {
    await verifyReference(projectRoot, artifact, `Platform ${artifact.role}`);
  }
}

async function verifyUsabilityLane(projectRoot, record) {
  const expected = EXPECTED_LANE_GATES.usability;
  assert(
    record.schemaVersion === 'activation-energy-studio/usability-external-validation-lane-status/v1',
    'Unexpected usability status schema.',
  );
  assert(record.releaseVersion === '0.3.2', 'Usability status release mismatch.');
  assert(record.candidate?.sha256 === CANDIDATE_SHA256, 'Usability candidate mismatch.');
  assert(record.candidateFreeze?.path === FREEZE_PATH, 'Usability freeze path mismatch.');
  assert(record.candidateFreeze?.sha256 === FREEZE_SHA256, 'Usability freeze hash mismatch.');
  assert(record.acceptanceCriteria?.path === CRITERIA_PATH, 'Usability criteria path mismatch.');
  assert(record.acceptanceCriteria?.sha256 === CRITERIA_SHA256, 'Usability criteria hash mismatch.');
  assertExactGateSet(record.gateIds, expected, 'Usability');
  assert(
    Array.isArray(record.gates)
      && JSON.stringify(record.gates.map((gate) => gate.id)) === JSON.stringify(expected)
      && record.gates.every((gate) => gate.status === 'EXTERNAL_OPEN'),
    'Usability cannot claim an external gate is closed.',
  );
  assert(record.participantCount === 0, 'Dispatch status cannot contain participants.');
  assert(record.observedSessionCount === 0, 'Dispatch status cannot contain observed sessions.');
  assert(
    record.humanEvidenceAuditStatus === 'NOT_PERFORMED',
    'Usability human audit must remain unperformed.',
  );
  assert(record.externalEvidenceComplete === false, 'Usability external evidence cannot be complete.');
  assert(
    record.technicalReadiness === 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
    'Usability package is not technically ready.',
  );
  await verifyReference(projectRoot, record.fixtureManifest, 'Usability fixture manifest');
  const bundleManifest = await bindFile(
    projectRoot,
    `${record.package.directory}/BUNDLE_MANIFEST.json`,
  );
  assert(
    bundleManifest.sha256 === record.package.bundleManifestSha256,
    'Usability bundle-manifest hash mismatch.',
  );
  const archive = await bindFile(projectRoot, record.package.archive);
  assert(archive.bytes === record.package.archiveBytes, 'Usability archive byte-size mismatch.');
  assert(archive.sha256 === record.package.archiveSha256, 'Usability archive hash mismatch.');
}

export function serializeExternalValidationDecision(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export async function buildExternalValidationDecision({
  projectRoot = PROJECT_ROOT,
  statusPaths = DEFAULT_STATUS_PATHS,
} = {}) {
  const freezeResult = await verifyExternalCandidateFreeze({
    projectRoot,
    freezePath: resolveRelative(projectRoot, FREEZE_PATH),
  });
  assert(freezeResult.candidateSha256 === CANDIDATE_SHA256, 'Candidate-freeze identity mismatch.');
  const freeze = await bindFile(projectRoot, FREEZE_PATH);
  const criteria = await bindFile(projectRoot, CRITERIA_PATH);
  assert(freeze.sha256 === FREEZE_SHA256, 'Candidate-freeze file hash mismatch.');
  assert(criteria.sha256 === CRITERIA_SHA256, 'Acceptance-criteria file hash mismatch.');

  const scientific = await readStatus(projectRoot, statusPaths.scientific);
  const platform = await readStatus(projectRoot, statusPaths.platform);
  const usability = await readStatus(projectRoot, statusPaths.usability);

  await verifyScientificLane(projectRoot, scientific.value);
  await verifyPlatformLane(projectRoot, platform.value);
  await verifyUsabilityLane(projectRoot, usability.value);

  const gates = [
    ...EXPECTED_LANE_GATES.scientific.map((id) => ({ id, lane: 'scientific', status: 'EXTERNAL_OPEN' })),
    ...EXPECTED_LANE_GATES.platform.map((id) => ({ id, lane: 'platform', status: 'EXTERNAL_OPEN' })),
    ...EXPECTED_LANE_GATES.usability.map((id) => ({ id, lane: 'usability', status: 'EXTERNAL_OPEN' })),
  ];

  return {
    schemaVersion: 'activation-energy-studio/external-validation-current-decision/v1',
    releaseVersion: '0.3.2',
    candidate: {
      path: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
      sha256: CANDIDATE_SHA256,
    },
    candidateFreeze: freeze,
    acceptanceCriteria: criteria,
    laneStatusArtifacts: {
      scientific: scientific.bound,
      platform: platform.bound,
      usability: usability.bound,
    },
    technicalCollectionReadiness: {
      scientific: 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW',
      platform: 'READY_FOR_GENUINE_DEVICE_EXECUTION',
      usability: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
      overall: 'PASS',
    },
    gates,
    soloScopeResearchPreview: {
      publicationDecision: 'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
      publicationClass: 'SOLO_RESEARCH_PREVIEW',
      externalLanesRequiredForProjectClosure: false,
      simulationAcceptedAsExternalEvidence: false,
      claimsNotEstablished: [
        'independent scientific approval',
        'cross-platform compatibility',
        'observed usability',
        'validated-MVP status',
      ],
    },
    summary: {
      gateCount: 8,
      passCount: 0,
      failCount: 0,
      externalOpenCount: 8,
      externalEvidenceComplete: false,
      currentDecision: 'EXTERNAL_OPEN',
      reasonCode: 'OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED',
      soloScopePublicationDecision:
        'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
      candidateDisposition: 'FROZEN_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
      externalLanesRequiredForProjectClosure: false,
      packageChangeRequired: false,
    },
    optionalExternalEvidenceLanes: [
      {
        id: 'KI-REV-001',
        state: 'EXTERNAL_OPEN',
        requiredForProjectClosure: false,
        gateIds: [...EXPECTED_LANE_GATES.scientific],
      },
      {
        id: 'KI-PLAT-001',
        state: 'EXTERNAL_OPEN',
        requiredForProjectClosure: false,
        gateIds: [...EXPECTED_LANE_GATES.platform],
      },
      {
        id: 'KI-UX-001',
        state: 'EXTERNAL_OPEN',
        requiredForProjectClosure: false,
        gateIds: [...EXPECTED_LANE_GATES.usability],
      },
    ],
    optionalFutureEvidenceIfPursued: [
      'eligible independent scientific reviewer decisions and signed verdict',
      'genuine Windows 11, macOS, and Ubuntu one-run evidence plus independent matrix review',
      'five observed usability sessions, second ratings, warning audit, and signed adjudication',
      'independent authenticity checks before elevating any externally validated claim',
    ],
    boundary:
      'The frozen v0.3.2 candidate is publishable as a solo-scope Research Preview with declared limitations. All external gates remain open, and no simulation or local substitute may close them. The optional external lanes are not project-closing requirements; independent scientific approval, cross-platform compatibility, observed usability, and validated-MVP status are not established.',
  };
}

async function main() {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
  assert(mode, 'Use --write or --check.');
  const outputArgumentIndex = process.argv.indexOf('--output');
  const outputPath =
    outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : DEFAULT_OUTPUT_PATH;
  assert(outputPath, '--output requires a path.');
  const record = await buildExternalValidationDecision();
  const serialized = serializeExternalValidationDecision(record);
  const absoluteOutput = resolveRelative(PROJECT_ROOT, outputPath);

  if (mode === 'write') {
    await writeFile(absoluteOutput, serialized);
  } else {
    const current = await readFile(absoluteOutput, 'utf8');
    assert(current === serialized, 'Current external-validation decision is stale.');
  }

  console.log(
    `PASS EXTERNAL_VALIDATION_DECISION_V032 decision=${record.summary.currentDecision} reason=${record.summary.reasonCode} open=${record.summary.externalOpenCount} readiness=${record.technicalCollectionReadiness.overall}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL EXTERNAL_VALIDATION_DECISION_V032 ${error.message}`);
    process.exitCode = 1;
  });
}
