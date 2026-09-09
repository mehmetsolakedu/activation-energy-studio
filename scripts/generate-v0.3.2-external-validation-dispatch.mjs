import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildExternalValidationDecision,
  serializeExternalValidationDecision,
} from './generate-v0.3.2-external-validation-decision.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

const DEFAULT_INPUT_PATHS = Object.freeze({
  freeze: 'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
  criteria: 'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
  scientific:
    'output/v0.3.2-external-validation/scientific-review/SCIENTIFIC_REVIEW_STATUS.json',
  platform:
    'output/v0.3.2-external-validation/platform/PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
  usability: 'evidence/usability/v0.3.2/USABILITY_LANE_STATUS.json',
  decision: 'output/v0.3.2-external-validation/CURRENT_RELEASE_DECISION.json',
});

const DEFAULT_OUTPUT_PATHS = Object.freeze({
  dispatch: 'output/v0.3.2-external-validation/DISPATCH_INDEX.json',
  report: 'output/v0.3.2-external-validation/EXTERNAL_VALIDATION_REPORT.md',
});

const CANDIDATE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';

const EXPECTED_GATES = Object.freeze([
  { id: 'AC-SCI-03', lane: 'scientific', status: 'EXTERNAL_OPEN' },
  { id: 'AC-VAL-05', lane: 'scientific', status: 'EXTERNAL_OPEN' },
  { id: 'AC-PLAT-01', lane: 'platform', status: 'EXTERNAL_OPEN' },
  { id: 'AC-PLAT-02', lane: 'platform', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-01', lane: 'usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-02', lane: 'usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-03', lane: 'usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-04', lane: 'usability', status: 'EXTERNAL_OPEN' },
]);

const EXPECTED_FREEZE_GATES = Object.freeze([
  { id: 'AC-SCI-03', lane: 'independent-scientific-review', status: 'EXTERNAL_OPEN' },
  { id: 'AC-VAL-05', lane: 'independent-scientific-review', status: 'EXTERNAL_OPEN' },
  { id: 'AC-PLAT-01', lane: 'cross-platform-runtime', status: 'EXTERNAL_OPEN' },
  { id: 'AC-PLAT-02', lane: 'cross-platform-runtime', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-01', lane: 'observed-usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-02', lane: 'observed-usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-03', lane: 'observed-usability', status: 'EXTERNAL_OPEN' },
  { id: 'AC-UX-04', lane: 'observed-usability', status: 'EXTERNAL_OPEN' },
]);

const REQUIRED_CRITERIA_MARKERS = Object.freeze([
  `Candidate SHA-256:\n\`${CANDIDATE_SHA256}\``,
  '### AC-SCI-03',
  'PASS requires all 28 unique decisions',
  '### AC-VAL-05',
  'PASS requires all seven unique decisions',
  '### AC-PLAT-01',
  'Runtime external-network request count must be zero.',
  '### AC-PLAT-02',
  '- Windows 11;',
  '- a supported macOS release; and',
  '- Ubuntu 22.04 or later.',
  'Five valid participants are required.',
  '### AC-UX-01',
  'PASS requires 5/5 correct PDFs',
  '### AC-UX-02',
  'all 25\nparticipant-case combinations',
  '### AC-UX-03',
  'all 5/5 participants',
  '### AC-UX-04',
  '8/8 cells',
  'Any remediation that changes a release-package byte stops v0.3.2 validation',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveRelative(projectRoot, relativePath) {
  invariant(typeof relativePath === 'string' && relativePath.length > 0, 'Path is required.');
  invariant(!path.isAbsolute(relativePath), `Absolute path is forbidden: ${relativePath}`);
  const resolved = path.resolve(projectRoot, relativePath);
  invariant(
    resolved.startsWith(`${projectRoot}${path.sep}`),
    `Path escapes project root: ${relativePath}`,
  );
  return resolved;
}

async function bindFile(projectRoot, relativePath) {
  const absolutePath = resolveRelative(projectRoot, relativePath);
  const fileStat = await stat(absolutePath);
  invariant(fileStat.isFile(), `Expected file: ${relativePath}`);
  const bytes = await readFile(absolutePath);
  return {
    path: relativePath,
    bytes: fileStat.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function readJson(projectRoot, relativePath) {
  const absolutePath = resolveRelative(projectRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

function requireStringArray(value, label) {
  invariant(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array.`);
  invariant(
    value.every((item) => typeof item === 'string' && item.trim().length > 0),
    `${label} must contain non-empty strings.`,
  );
  return [...value];
}

function requireMatch(items, expression, label) {
  invariant(items.some((item) => expression.test(item)), `${label} is missing.`);
}

function verifyCriteriaContract(criteria) {
  for (const marker of REQUIRED_CRITERIA_MARKERS) {
    invariant(criteria.includes(marker), `Acceptance criteria marker is missing: ${marker}`);
  }

  for (const gate of EXPECTED_GATES) {
    const heading = `### ${gate.id}`;
    invariant(
      criteria.split(heading).length === 2,
      `Acceptance criteria must define ${gate.id} exactly once.`,
    );
  }
}

function verifyRemainingEvidence(scientific, platform, usability) {
  const scientificItems = requireStringArray(
    scientific.humanRequirementsOpen,
    'Scientific human requirements',
  );
  invariant(scientificItems.length === 4, 'Scientific requirements must contain four items.');
  requireMatch(scientificItems, /eligible independent reviewer identity/i, 'Reviewer identity');
  requireMatch(scientificItems, /35 evidence-linked reviewer decisions/i, '35 decisions');
  requireMatch(scientificItems, /signed verdict artifact/i, 'Signed scientific verdict');
  requireMatch(
    scientificItems,
    /identity and signature-authenticity verification/i,
    'Scientific authenticity verification',
  );

  const platformItems = requireStringArray(
    platform.missingExternalRequirements,
    'Platform external requirements',
  );
  invariant(platformItems.length === 5, 'Platform requirements must contain five items.');
  requireMatch(platformItems, /genuine macOS one-run evidence/i, 'Genuine macOS evidence');
  requireMatch(platformItems, /genuine Windows 11 one-run evidence/i, 'Genuine Windows evidence');
  requireMatch(platformItems, /genuine Ubuntu .* one-run evidence/i, 'Genuine Ubuntu evidence');
  requireMatch(platformItems, /three-OS matrix record/i, 'Three-OS matrix');
  requireMatch(platformItems, /independent .*human review/i, 'Independent platform review');

  const usabilityItems = requireStringArray(
    usability.openHumanRequirements,
    'Usability human requirements',
  );
  invariant(usabilityItems.length === 5, 'Usability requirements must contain five items.');
  requireMatch(usabilityItems, /exactly five eligible independent participants/i, 'Five users');
  requireMatch(usabilityItems, /five live moderated sessions/i, 'Five observed sessions');
  requireMatch(usabilityItems, /screen and audio recordings/i, 'Session recordings');
  requireMatch(usabilityItems, /ten deterministic blind second ratings/i, 'Second ratings');
  requireMatch(usabilityItems, /independent human media\/content audit/i, 'Human audit');

  return {
    scientific: {
      requiredDecisionCounts: {
        claimBoundary: 28,
        crossMethodInterpretation: 7,
        total: 35,
      },
      requirements: scientificItems,
    },
    platform: {
      targetOperatingSystems: ['Windows 11', 'supported macOS', 'Ubuntu 22.04 or later'],
      requiredRuntimeNetworkRequestCount: 0,
      requirements: platformItems,
    },
    usability: {
      requiredParticipantCount: 5,
      requiredObservedSessionCount: 5,
      requiredParticipantCaseCombinations: 25,
      requiredWarningSurfaceCells: 8,
      requirements: usabilityItems,
    },
    optionalClaimElevation: [
      'Independently verify human identity, signatures, and evidence authenticity.',
      'Elevate externally validated claims only after all eight external gates pass.',
    ],
  };
}

function verifyDecisionContract(decision) {
  invariant(
    decision.schemaVersion ===
      'activation-energy-studio/external-validation-current-decision/v1',
    'Unexpected current-decision schema.',
  );
  invariant(decision.releaseVersion === '0.3.2', 'Current-decision release mismatch.');
  invariant(decision.candidate?.sha256 === CANDIDATE_SHA256, 'Current-decision candidate mismatch.');
  invariant(sameJson(decision.gates, EXPECTED_GATES), 'Current-decision gate contract changed.');
  invariant(decision.technicalCollectionReadiness?.overall === 'PASS', 'Collection tooling is not ready.');

  const expectedSummary = {
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
  };
  invariant(sameJson(decision.summary, expectedSummary), 'Current-decision summary changed.');
  invariant(
    typeof decision.boundary === 'string'
      && decision.boundary.includes('publishable as a solo-scope Research Preview')
      && decision.boundary.includes('not project-closing requirements'),
    'Current-decision claim boundary is missing.',
  );
  invariant(
    decision.soloScopeResearchPreview?.publicationDecision
      === 'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS'
      && decision.soloScopeResearchPreview.externalLanesRequiredForProjectClosure === false
      && decision.soloScopeResearchPreview.simulationAcceptedAsExternalEvidence === false,
    'Solo-scope Research Preview contract changed.',
  );
}

function verifyLaneReadinessContracts(scientific, platform, usability) {
  invariant(
    scientific.technicalReadiness?.status === 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW'
      && scientific.technicalReadiness.deterministicPackageBuilt === true
      && scientific.technicalReadiness.packageIntegrityVerified === true
      && scientific.technicalReadiness.structuredRecorderIncluded === true
      && scientific.technicalReadiness.requiredDecisionCount === 35,
    'Scientific collection-readiness contract is not satisfied.',
  );

  const platformChecks = platform.technicalReadiness?.checks;
  invariant(
    platform.technicalReadiness?.state === 'READY_FOR_GENUINE_DEVICE_EXECUTION'
      && platform.technicalReadiness.legacyV020CompatibilityPreserved === true
      && platform.technicalReadiness.v032ContractReady === true
      && Array.isArray(platformChecks)
      && platformChecks.length > 0
      && platformChecks.every((check) => check?.status === 'PASS'),
    'Platform collection-readiness contract is not satisfied.',
  );

  invariant(
    usability.technicalReadiness === 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN'
      && usability.technicalInfrastructureReady === true,
    'Usability collection-readiness contract is not satisfied.',
  );
}

function buildDispatchArtifacts(projectRoot, scientific, platform, usability) {
  return Promise.all([
    bindFile(projectRoot, scientific.packageArtifacts.packageManifest.path),
    bindFile(projectRoot, scientific.packageArtifacts.packageManifestSidecar.path),
    ...platform.packageArtifacts.map((artifact) => bindFile(projectRoot, artifact.path)),
    bindFile(projectRoot, `${usability.package.directory}/BUNDLE_MANIFEST.json`),
    bindFile(projectRoot, usability.package.archive),
  ]).then((artifacts) => ({
    scientific: {
      handoffRoot: scientific.packageArtifacts.handoffRoot,
      artifacts: artifacts.slice(0, 2),
    },
    platform: {
      artifacts: artifacts.slice(2, 2 + platform.packageArtifacts.length),
    },
    usability: {
      handoffRoot: usability.package.directory,
      artifacts: artifacts.slice(2 + platform.packageArtifacts.length),
    },
  }));
}

export function serializeDispatchIndex(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function artifactRows(lane, laneDispatch) {
  return laneDispatch.artifacts.map(
    (artifact) =>
      `| ${lane} | \`${artifact.path}\` | ${artifact.bytes} | \`${artifact.sha256}\` |`,
  );
}

export function renderExternalValidationReport(record) {
  const artifactTableRows = [
    ...artifactRows('Scientific review', record.lanes.scientific.dispatch),
    ...artifactRows('Platform runtime', record.lanes.platform.dispatch),
    ...artifactRows('Observed usability', record.lanes.usability.dispatch),
  ].join('\n');
  const gateRows = record.gates
    .map((gate) => `| ${gate.id} | ${gate.lane} | ${gate.status} |`)
    .join('\n');

  return `# Activation Energy Studio v0.3.2 External Validation Report

## Current disposition

| Field | Value |
| --- | --- |
| Candidate SHA-256 | \`${record.candidate.sha256}\` |
| Decision | **${record.currentDecision.decision}** |
| Reason | \`${record.currentDecision.reasonCode}\` |
| Solo-scope publication decision | **${record.currentDecision.soloScopePublicationDecision}** |
| Gate state | ${record.gateSummary.externalOpenCount}/${record.gateSummary.gateCount} \`EXTERNAL_OPEN\` |
| Technical collection readiness | ${record.technicalCollectionReadiness.overall} — collection infrastructure only |
| External evidence complete | ${record.currentDecision.externalEvidenceComplete} |
| External lanes required for project closure | ${record.currentDecision.externalLanesRequiredForProjectClosure} |
| Package change required | ${record.currentDecision.packageChangeRequired} |

The exact v0.3.2 candidate remains frozen and is publishable as a solo-scope
Research Preview with declared limitations. Collection packages and
deterministic verifiers are ready, but they are not external evidence. The
three external lanes are optional future work and are not project-closing
requirements. This report does not establish independent scientific approval,
cross-platform compatibility, observed usability, or validated-MVP status.

## External-gate state

| Gate | Lane | Status |
| --- | --- | --- |
${gateRows}

## Reviewer and device dispatch artifacts

| Lane | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
${artifactTableRows}

Handoff roots:

- Scientific review: \`${record.lanes.scientific.dispatch.handoffRoot}\`
- Observed usability: \`${record.lanes.usability.dispatch.handoffRoot}\`

## Optional future external evidence

The following work is required only if a future version seeks the corresponding
independently validated claims. Simulation, templates, and local substitutes
must never be relabelled as genuine external evidence.

### Independent scientific review

If independent scientific approval is pursued, an eligible reviewer must
complete 28 claim-boundary decisions and seven cross-method decisions, for 35
evidence-linked decisions in total.

${markdownList(record.optionalFutureExternalEvidence.scientific.requirements)}

### Cross-platform offline runtime

If cross-platform compatibility is pursued, the target set is Windows 11, a
supported macOS release, and Ubuntu 22.04 or later. Every retained run must show
zero runtime external-network requests.

${markdownList(record.optionalFutureExternalEvidence.platform.requirements)}

### Observed usability

If observed-usability claims are pursued, five valid participants and five
observed sessions are required. The evidence must cover 25 participant-case
combinations and all eight warning/surface cells.

${markdownList(record.optionalFutureExternalEvidence.usability.requirements)}

### Optional claim elevation

${markdownList(record.optionalFutureExternalEvidence.optionalClaimElevation)}

## Release boundary

The present external-lane result is **EXTERNAL_OPEN /
OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED**. All eight gates remain
\`EXTERNAL_OPEN\`. The solo-scope publication decision is
**PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS**. Technical
collection readiness is not external validation, and simulation cannot
substitute for genuine external evidence. \`packageChangeRequired=false\`: no
current evidence requires a change to the frozen package. Independent
scientific approval, cross-platform compatibility, observed usability, and
validated-MVP status remain unestablished.
`;
}

export async function buildExternalValidationDispatch({
  projectRoot = PROJECT_ROOT,
  inputPaths: inputOverrides = {},
} = {}) {
  const inputPaths = { ...DEFAULT_INPUT_PATHS, ...inputOverrides };
  const rebuiltDecision = await buildExternalValidationDecision({
    projectRoot,
    statusPaths: {
      scientific: inputPaths.scientific,
      platform: inputPaths.platform,
      usability: inputPaths.usability,
    },
  });
  const currentDecisionText = await readFile(
    resolveRelative(projectRoot, inputPaths.decision),
    'utf8',
  );
  invariant(
    currentDecisionText === serializeExternalValidationDecision(rebuiltDecision),
    'CURRENT_RELEASE_DECISION.json is stale, altered, or not bound to the canonical lane statuses.',
  );

  const [freeze, criteria, scientific, platform, usability, decision] = await Promise.all([
    readJson(projectRoot, inputPaths.freeze),
    readFile(resolveRelative(projectRoot, inputPaths.criteria), 'utf8'),
    readJson(projectRoot, inputPaths.scientific),
    readJson(projectRoot, inputPaths.platform),
    readJson(projectRoot, inputPaths.usability),
    readJson(projectRoot, inputPaths.decision),
  ]);

  invariant(freeze.releaseVersion === '0.3.2', 'Candidate-freeze release mismatch.');
  invariant(freeze.candidate?.sha256 === CANDIDATE_SHA256, 'Candidate-freeze hash mismatch.');
  invariant(
    sameJson(freeze.externalGateBaseline, EXPECTED_FREEZE_GATES),
    'Candidate-freeze external-gate baseline changed.',
  );
  verifyCriteriaContract(criteria);
  verifyDecisionContract(decision);
  verifyLaneReadinessContracts(scientific, platform, usability);

  const sourceArtifacts = {
    candidateFreeze: await bindFile(projectRoot, inputPaths.freeze),
    acceptanceCriteria: await bindFile(projectRoot, inputPaths.criteria),
    laneStatusArtifacts: {
      scientific: await bindFile(projectRoot, inputPaths.scientific),
      platform: await bindFile(projectRoot, inputPaths.platform),
      usability: await bindFile(projectRoot, inputPaths.usability),
    },
    currentReleaseDecision: await bindFile(projectRoot, inputPaths.decision),
  };

  invariant(
    sameJson(sourceArtifacts.candidateFreeze, decision.candidateFreeze),
    'Current decision does not bind the candidate-freeze artifact.',
  );
  invariant(
    sameJson(sourceArtifacts.acceptanceCriteria, decision.acceptanceCriteria),
    'Current decision does not bind the acceptance-criteria artifact.',
  );
  invariant(
    sameJson(sourceArtifacts.laneStatusArtifacts, decision.laneStatusArtifacts),
    'Current decision does not bind the canonical lane-status artifacts.',
  );

  const remainingExternalEvidence = verifyRemainingEvidence(scientific, platform, usability);
  const dispatchArtifacts = await buildDispatchArtifacts(
    projectRoot,
    scientific,
    platform,
    usability,
  );

  return {
    schemaVersion: 'activation-energy-studio/external-validation-dispatch-index/v1',
    releaseVersion: '0.3.2',
    candidate: {
      path: freeze.candidate.path,
      bytes: freeze.candidate.bytes,
      sha256: CANDIDATE_SHA256,
      freezeStatus: freeze.status,
    },
    sourceArtifacts,
    currentDecision: {
      decision: 'EXTERNAL_OPEN',
      reasonCode: 'OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED',
      soloScopePublicationDecision:
        'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
      candidateDisposition: 'FROZEN_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
      externalEvidenceComplete: false,
      externalLanesRequiredForProjectClosure: false,
      packageChangeRequired: false,
    },
    gateSummary: {
      gateCount: 8,
      externalOpenCount: 8,
      passCount: 0,
      failCount: 0,
      status: '8_OF_8_EXTERNAL_OPEN',
    },
    gates: EXPECTED_GATES.map((gate) => ({ ...gate })),
    technicalCollectionReadiness: {
      overall: 'PASS',
      scope: 'COLLECTION_INFRASTRUCTURE_ONLY',
      scientific: decision.technicalCollectionReadiness.scientific,
      platform: decision.technicalCollectionReadiness.platform,
      usability: decision.technicalCollectionReadiness.usability,
      externalValidationEstablished: false,
    },
    lanes: {
      scientific: {
        gateIds: ['AC-SCI-03', 'AC-VAL-05'],
        status: 'EXTERNAL_OPEN',
        dispatch: dispatchArtifacts.scientific,
      },
      platform: {
        gateIds: ['AC-PLAT-01', 'AC-PLAT-02'],
        status: 'EXTERNAL_OPEN',
        dispatch: dispatchArtifacts.platform,
      },
      usability: {
        gateIds: ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
        status: 'EXTERNAL_OPEN',
        dispatch: dispatchArtifacts.usability,
      },
    },
    optionalFutureExternalEvidence: remainingExternalEvidence,
    claimBoundary:
      'The frozen v0.3.2 candidate is publishable as a solo-scope Research Preview with declared limitations. The optional external lanes are not project-closing requirements. This index does not establish independent scientific approval, cross-platform compatibility, observed usability, or validated-MVP status, and simulation cannot substitute for genuine external evidence.',
  };
}

async function main() {
  const mode = process.argv.includes('--write')
    ? 'write'
    : process.argv.includes('--check')
      ? 'check'
      : null;
  invariant(mode, 'Use --write or --check.');

  const record = await buildExternalValidationDispatch();
  const dispatchText = serializeDispatchIndex(record);
  const reportText = renderExternalValidationReport(record);

  if (mode === 'write') {
    await Promise.all([
      writeFile(resolveRelative(PROJECT_ROOT, DEFAULT_OUTPUT_PATHS.dispatch), dispatchText),
      writeFile(resolveRelative(PROJECT_ROOT, DEFAULT_OUTPUT_PATHS.report), reportText),
    ]);
  } else {
    const [currentDispatch, currentReport] = await Promise.all([
      readFile(resolveRelative(PROJECT_ROOT, DEFAULT_OUTPUT_PATHS.dispatch), 'utf8'),
      readFile(resolveRelative(PROJECT_ROOT, DEFAULT_OUTPUT_PATHS.report), 'utf8'),
    ]);
    invariant(currentDispatch === dispatchText, 'DISPATCH_INDEX.json is stale.');
    invariant(currentReport === reportText, 'EXTERNAL_VALIDATION_REPORT.md is stale.');
  }

  console.log(
    'PASS EXTERNAL_VALIDATION_DISPATCH_V032 decision=EXTERNAL_OPEN reason=OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED soloScope=PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS open=8/8 packageChangeRequired=false',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL EXTERNAL_VALIDATION_DISPATCH_V032 ${error.message}`);
    process.exitCode = 1;
  });
}
