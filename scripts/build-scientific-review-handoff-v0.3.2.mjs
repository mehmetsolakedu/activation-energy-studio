#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_SCHEMA =
  'activation-energy-studio/independent-scientific-review-package/v1';
export const REVIEW_STATE = 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW';
export const RELEASE_VERSION = '0.3.2';
export const RELEASE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
export const RELEASE_MANIFEST_SHA256 =
  '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c';
export const RELEASE_CHECKSUM_SHA256 =
  '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0';
export const REPORT_SCHEMA_SHA256 =
  'ac385a67563e643481265880c5703f5b3caec0ba2199cf15539fa1b32ebf3d3a';
export const CANDIDATE_FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
export const ACCEPTANCE_CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
export const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/scientific-review/Activation-Energy-Studio-Scientific-Review-Handoff-v0.3.2',
);
export const DEFAULT_STATUS_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/scientific-review/SCIENTIFIC_REVIEW_STATUS.json',
);

const PACKAGE_MANIFEST_NAME = 'PACKAGE_MANIFEST.json';
const PACKAGE_MANIFEST_SIDECAR_NAME = 'PACKAGE_MANIFEST.sha256';
const RELEASE_HTML_PATH =
  'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html';
const RELEASE_MANIFEST_PATH = 'release/v0.3.2/MANIFEST.v0.3.2.json';
const RELEASE_CHECKSUM_PATH = 'release/v0.3.2/SHA256SUMS.v0.3.2.txt';
const REPORT_SCHEMA_PATH = 'release/v0.3.2/project-report.schema.json';
const CANDIDATE_FREEZE_PATH =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json';
const CANDIDATE_FREEZE_SIDECAR_PATH =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256';
const ACCEPTANCE_CRITERIA_PATH =
  'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md';
const REVIEW_RECORD_SCRIPT = 'scripts/record-scientific-review.mjs';
const VERIFIER_SCRIPT =
  'scripts/verify-scientific-review-handoff-v0.3.2.mjs';

const SOURCE_DIRECTORIES = Object.freeze([
  'release/v0.3.2',
  'examples',
  'src',
  'tests',
  'evidence/usability/v0.2.0/study_bundle',
  'evidence/validation/oak-publication-audit',
  'evidence/validation/dryad-polyisoprene',
  'evidence/validation/nr-cels',
  'evidence/validation/coal-spt-paraffin',
]);

const SOURCE_FILES = Object.freeze([
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'docs/technical-english/00_MISSION_LOCK.md',
  'docs/technical-english/01_SCIENTIFIC_SPEC_V1.md',
  'docs/technical-english/02_ACCEPTANCE_CRITERIA.md',
  'SCIENTIFIC_TRACEABILITY_REPORT.md',
  'output/v0.3.2-remediation/BASELINE.md',
  'output/v0.3.2-remediation/GATE_RESULTS.json',
  'output/v0.3.2-remediation/REMEDIATION_REPORT.md',
  'output/v0.3.2-remediation/v0.3.1-code-baseline.tar.gz',
  'output/pdf/activation-energy-report-schema-v6-qa.pdf',
  CANDIDATE_FREEZE_PATH,
  CANDIDATE_FREEZE_SIDECAR_PATH,
  ACCEPTANCE_CRITERIA_PATH,
  'scripts/build-scientific-review-handoff-v0.3.2.mjs',
  VERIFIER_SCRIPT,
  REVIEW_RECORD_SCRIPT,
  'scripts/verify-release-package.mjs',
  'scripts/run-paper010-oracle.mjs',
  'scripts/run-oak-oracle.mjs',
  'scripts/run-dryad-polyisoprene-oracle.mjs',
  'scripts/run-nr-cels-friedman-oracle.mjs',
  'scripts/run-coal-spt-paraffin-oracle.mjs',
]);

const ROOT_SOURCE_FILES = Object.freeze([
  {
    sourcePath: 'scientific-review/v0.3.2/REVIEW_PROTOCOL.md',
    packagePath: 'REVIEW_PROTOCOL.md',
    role: 'review_protocol',
  },
  {
    sourcePath:
      'scientific-review/v0.3.2/SCIENTIFIC_REMEDIATION_ADDENDUM.md',
    packagePath: 'SCIENTIFIC_REMEDIATION_ADDENDUM.md',
    role: 'scientific_remediation_addendum',
  },
  {
    sourcePath: 'scientific-review/v0.3.2/REVIEW_CASES.json',
    packagePath: 'REVIEW_CASES.json',
    role: 'review_case_index',
  },
  {
    sourcePath: VERIFIER_SCRIPT,
    packagePath: 'VERIFY_PACKAGE.mjs',
    role: 'portable_package_verifier',
  },
]);

const REVIEW_SURFACES = Object.freeze(['UI', 'PDF', 'CSV', 'JSON']);
const SCI_CHECKLIST_ITEMS = Object.freeze([
  'Results are labelled apparent activation energy.',
  'Sample, process/stage, atmosphere, method, and conversion/peak context remain visible or machine-readable.',
  'FWO, KAS, Starink, and Friedman are not presented as one immutable material constant.',
  'Kissinger remains a separate peak result, not an Ea(alpha) point.',
  'No result is described as proving a one-step mechanism.',
  'Regression confidence intervals are not described as complete experimental uncertainty; excluded uncertainty sources remain explicit.',
  'Refused or partial analyses cannot be mistaken for a successful complete analysis.',
]);
const VAL_CHECKLIST_ITEMS = Object.freeze([
  'The four isoconversional methods remain method-specific estimates on the same alpha basis.',
  'Numeric agreement is not called truth, proof, universal accuracy, or validation of a universal constant.',
  'Divergence across methods or alpha remains visible and is not hidden by averaging.',
  'Low-R2, derivative-provenance, limited-rate, and multistep diagnostics remain attached.',
  'Kissinger remains one separate peak estimate and is not pooled with Ea(alpha).',
  'Paper010 publication non-reproduction and its supplied-derivative boundary remain explicit.',
  'The observations support only correct implementation and transparent comparison for the tested fixtures.',
]);

function fail(code, message) {
  throw new Error(`${code} ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

function portablePath(value) {
  const normalized = String(value).split(path.sep).join('/');
  if (
    normalized.startsWith('/')
    || normalized.includes('\\')
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail('SCIENTIFIC_REVIEW_UNSAFE_PATH', String(value));
  }
  return normalized;
}

function projectFile(relative) {
  const portable = portablePath(relative);
  const resolved = path.resolve(PROJECT_ROOT, ...portable.split('/'));
  const relation = path.relative(PROJECT_ROOT, resolved);
  if (relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('SCIENTIFIC_REVIEW_PATH_ESCAPE', portable);
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    fail('SCIENTIFIC_REVIEW_SOURCE_MISSING', portable);
  }
  return resolved;
}

function listDirectory(relative, prefix = '') {
  const root = path.resolve(PROJECT_ROOT, ...portablePath(relative).split('/'));
  const directory = prefix ? path.join(root, ...prefix.split('/')) : root;
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    fail('SCIENTIFIC_REVIEW_SOURCE_DIRECTORY_MISSING', relative);
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listDirectory(relative, child));
    else if (entry.isFile()) files.push(`${relative}/${child}`);
    else fail('SCIENTIFIC_REVIEW_UNSUPPORTED_SOURCE', `${relative}/${child}`);
  }
  return files.sort();
}

function expectedDecisionIds() {
  return [
    ...REVIEW_SURFACES.flatMap((surface) =>
      SCI_CHECKLIST_ITEMS.map(
        (_item, index) =>
          `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
      ),
    ),
    ...VAL_CHECKLIST_ITEMS.map(
      (_item, index) => `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}

function roleForSource(sourcePath) {
  if (sourcePath === RELEASE_HTML_PATH) return 'release_html';
  if (sourcePath === RELEASE_MANIFEST_PATH) return 'release_evidence_manifest';
  if (sourcePath === RELEASE_CHECKSUM_PATH) return 'release_checksum_index';
  if (sourcePath === REPORT_SCHEMA_PATH) return 'project_report_schema';
  if (sourcePath === CANDIDATE_FREEZE_PATH) return 'candidate_freeze';
  if (sourcePath === CANDIDATE_FREEZE_SIDECAR_PATH) {
    return 'candidate_freeze_sidecar';
  }
  if (sourcePath === ACCEPTANCE_CRITERIA_PATH) {
    return 'external_gate_acceptance_criteria';
  }
  if (sourcePath === REVIEW_RECORD_SCRIPT) return 'review_record_validator';
  if (sourcePath.startsWith('tests/fixtures/real/')) return 'real_fixture';
  if (sourcePath.startsWith('tests/')) return 'test_or_test_fixture';
  if (sourcePath.startsWith('src/')) return 'implementation_source';
  if (sourcePath.startsWith('evidence/validation/')) {
    return 'retained_validation_evidence';
  }
  if (sourcePath.startsWith('evidence/usability/')) return 'review_case_fixture';
  if (sourcePath.startsWith('output/v0.3.2-remediation/')) {
    return 'remediation_evidence';
  }
  return 'supporting_project_artifact';
}

function packagePathForSource(sourcePath) {
  if (sourcePath === REVIEW_RECORD_SCRIPT) {
    return 'evidence/scripts/record-scientific-review.mjs';
  }
  return `evidence/project/${sourcePath}`;
}

function artifactEntry(sourcePath) {
  const file = projectFile(sourcePath);
  return {
    role: roleForSource(sourcePath),
    sourcePath,
    packagePath: packagePathForSource(sourcePath),
    bytes: statSync(file).size,
    sha256: sha256File(file),
  };
}

function renderReadme() {
  return `# Activation Energy Studio v0.3.2 — Independent Scientific Review Handoff

State: \`${REVIEW_STATE}\`  
External evidence complete: \`false\`

This immutable package is ready for an eligible external reviewer. It is not a
scientific approval, signed verdict, validated-MVP declaration, or release
authorization.

## Candidate lock

- Release HTML SHA-256: \`${RELEASE_SHA256}\`
- Release-manifest SHA-256: \`${RELEASE_MANIFEST_SHA256}\`
- Release-checksum-index SHA-256: \`${RELEASE_CHECKSUM_SHA256}\`
- Report-schema SHA-256: \`${REPORT_SCHEMA_SHA256}\`
- Candidate-freeze SHA-256: \`${CANDIDATE_FREEZE_SHA256}\`
- Version-specific external-gate criteria SHA-256: \`${ACCEPTANCE_CRITERIA_SHA256}\`

## Start here

1. Run \`node VERIFY_PACKAGE.mjs\` from this directory.
2. Read \`REVIEW_PROTOCOL.md\`, \`SCIENTIFIC_REMEDIATION_ADDENDUM.md\`, and
   \`REVIEW_CASES.json\`.
3. Copy the two unsigned templates and all observation output outside this
   immutable package.
4. Review the exact HTML at
   \`evidence/project/${RELEASE_HTML_PATH}\`.
5. Complete all 35 decisions and return a signed verdict plus structured input.
6. Run the structural recorder exactly as shown in \`REVIEW_PROTOCOL.md\`.

Package-integrity PASS proves only that the transferred files match this
manifest. Human identity, expertise, conflicts, observations, and signature
authenticity require separate independent verification.
`;
}

function renderStructuredInputTemplate() {
  const template = {
    schema: 'activation-energy-studio/scientific-review-input/v1',
    reviewId: '[REQUIRED_REVIEW_ID]',
    locks: {
      releaseSha256: RELEASE_SHA256,
      releaseManifestSha256: RELEASE_MANIFEST_SHA256,
      packageManifestSha256: '[COPY_FROM_PACKAGE_MANIFEST_SHA256]',
    },
    reviewer: {
      name: '[REQUIRED]',
      affiliation: '[REQUIRED]',
      professionalProfile: '[REQUIRED_ORCID_OR_PUBLIC_PROFILE]',
      relevantExpertise: '[REQUIRED]',
      expertiseEvidence: '[REQUIRED]',
      independenceStatement: '[REQUIRED]',
      conflictOfInterestStatement: '[REQUIRED]',
      declarations: {
        isHumanReviewer: null,
        hasCurrentThermalAnalysisOrSolidStateKineticsExperience: null,
        isAiAgent: null,
        implementedCalculationCore: null,
        authoredValidationFixtures: null,
        isProductOwnerOrManuscriptAuthor: null,
        hasProjectEmploymentOrSupervisoryDependency: null,
        hasRecentCoauthorshipWithProjectTeam: null,
        hasFinancialOrIntellectualPropertyInterest: null,
        hasUndisclosedPaidConsultingOrReviewInfluence: null,
        hasOtherUndisclosedConflictOfInterest: null,
      },
    },
    review: {
      startedAtUtc: '[REQUIRED_ISO_UTC]',
      endedAtUtc: '[REQUIRED_ISO_UTC]',
      environment: {
        operatingSystem: '[REQUIRED]',
        browser: '[REQUIRED]',
        locale: '[REQUIRED]',
      },
    },
    decisions: expectedDecisionIds().map((id) => ({
      id,
      decision: 'NOT_REVIEWED',
      caseId: '[REQUIRED_CASE_ID]',
      evidence: [
        {
          path: '[REQUIRED_RELATIVE_EVIDENCE_PATH]',
          sha256: '[REQUIRED_SHA256]',
        },
      ],
      comment: '[REQUIRED_REVIEWER_COMMENT]',
    })),
    verdict: {
      gateDispositions: {
        'AC-SCI-03': 'NOT_REVIEWED',
        'AC-VAL-05': 'NOT_REVIEWED',
      },
      overallVerdict: 'NOT_REVIEWED',
      signedArtifact: {
        path: '[REQUIRED_RELATIVE_SIGNED_VERDICT_PATH]',
        sha256: '[REQUIRED_SHA256]',
      },
      signatureMethod: '[REQUIRED_ALLOWED_SIGNATURE_METHOD]',
      signatureVerificationReference: '[REQUIRED]',
      signatureUtc: '[REQUIRED_ISO_UTC]',
    },
  };
  return `${JSON.stringify(template, null, 2)}\n`;
}

function verdictRow(id, scope, index, text) {
  return `| \`${id}\` | ${scope} | ${index} | ${text} | \`NOT_REVIEWED\` | [REQUIRED] | [REQUIRED] |`;
}

function renderVerdictTemplate() {
  const scienceRows = REVIEW_SURFACES.flatMap((surface) =>
    SCI_CHECKLIST_ITEMS.map((item, index) =>
      verdictRow(
        `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
        surface,
        index + 1,
        item,
      ),
    ),
  ).join('\n');
  const validationRows = VAL_CHECKLIST_ITEMS.map((item, index) =>
    verdictRow(
      `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
      'Cross-method',
      index + 1,
      item,
    ),
  ).join('\n');
  return `# Independent Scientific Review Verdict — UNSIGNED TEMPLATE

No reviewer identity, observation, decision, signature, or PASS verdict has
been supplied. Complete this copy outside the immutable handoff.

| Field | Required value |
| --- | --- |
| Candidate version | \`${RELEASE_VERSION}\` |
| Release HTML SHA-256 | \`${RELEASE_SHA256}\` |
| Release-manifest SHA-256 | \`${RELEASE_MANIFEST_SHA256}\` |
| Package-manifest SHA-256 | [COPY FROM PACKAGE_MANIFEST.sha256] |
| Reviewer name and affiliation | [REQUIRED] |
| Public professional profile | [REQUIRED] |
| Relevant expertise and evidence | [REQUIRED] |
| Independence and conflicts | [REQUIRED] |
| Review environment and UTC interval | [REQUIRED] |

## AC-SCI-03 decisions

| Decision ID | Surface | Item | Audit statement | Decision | Evidence path and SHA-256 | Comment |
| --- | --- | ---: | --- | --- | --- | --- |
${scienceRows}

## AC-VAL-05 decisions

| Decision ID | Scope | Item | Audit statement | Decision | Evidence path and SHA-256 | Comment |
| --- | --- | ---: | --- | --- | --- | --- |
${validationRows}

## Gate dispositions and signature

| Field | Required value |
| --- | --- |
| AC-SCI-03 disposition | \`NOT_REVIEWED\` — replace with PASS, FAIL, or REVISION_REQUIRED |
| AC-VAL-05 disposition | \`NOT_REVIEWED\` — replace with PASS, FAIL, or REVISION_REQUIRED |
| Overall verdict | \`NOT_REVIEWED\` — replace with PASS, FAIL, or REVISION_REQUIRED |
| Signature method and reference | [REQUIRED] |
| Signature UTC | [REQUIRED] |

Structural validation does not authenticate this document or automatically
close an acceptance gate.
`;
}

function validateBoundSources() {
  const expected = new Map([
    [RELEASE_HTML_PATH, RELEASE_SHA256],
    [RELEASE_MANIFEST_PATH, RELEASE_MANIFEST_SHA256],
    [RELEASE_CHECKSUM_PATH, RELEASE_CHECKSUM_SHA256],
    [REPORT_SCHEMA_PATH, REPORT_SCHEMA_SHA256],
    [CANDIDATE_FREEZE_PATH, CANDIDATE_FREEZE_SHA256],
    [ACCEPTANCE_CRITERIA_PATH, ACCEPTANCE_CRITERIA_SHA256],
  ]);
  for (const [relative, expectedHash] of expected) {
    const actual = sha256File(projectFile(relative));
    if (actual !== expectedHash) {
      fail(
        'SCIENTIFIC_REVIEW_BOUND_SOURCE_DRIFT',
        `${relative}: expected ${expectedHash}, actual ${actual}`,
      );
    }
  }
  const sidecar = readFileSync(projectFile(CANDIDATE_FREEZE_SIDECAR_PATH), 'utf8');
  if (sidecar !== `${CANDIDATE_FREEZE_SHA256}  CANDIDATE_FREEZE.json\n`) {
    fail('SCIENTIFIC_REVIEW_FREEZE_SIDECAR_DRIFT', CANDIDATE_FREEZE_SIDECAR_PATH);
  }
  const freeze = JSON.parse(readFileSync(projectFile(CANDIDATE_FREEZE_PATH), 'utf8'));
  if (
    freeze.releaseVersion !== RELEASE_VERSION
    || freeze.status !== 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS'
    || freeze.candidate?.sha256 !== RELEASE_SHA256
  ) {
    fail('SCIENTIFIC_REVIEW_FREEZE_CONTRACT_MISMATCH', CANDIDATE_FREEZE_PATH);
  }
  const scientificGates = freeze.externalGateBaseline
    ?.filter((gate) => gate.lane === 'independent-scientific-review')
    .map((gate) => `${gate.id}:${gate.status}`)
    .sort();
  if (
    JSON.stringify(scientificGates)
      !== JSON.stringify(['AC-SCI-03:EXTERNAL_OPEN', 'AC-VAL-05:EXTERNAL_OPEN'])
  ) {
    fail('SCIENTIFIC_REVIEW_FREEZE_GATE_MISMATCH', JSON.stringify(scientificGates));
  }
}

function createPlan() {
  validateBoundSources();
  const sourcePaths = [
    ...SOURCE_FILES,
    ...SOURCE_DIRECTORIES.flatMap((directory) => listDirectory(directory)),
  ];
  const unique = [...new Set(sourcePaths)].sort();
  if (unique.length !== sourcePaths.length) {
    fail('SCIENTIFIC_REVIEW_DUPLICATE_SOURCE', 'Source inventory contains duplicates.');
  }
  const artifacts = unique.map(artifactEntry);
  const generatedContent = [
    {
      role: 'package_readme',
      packagePath: 'README.md',
      sourcePath: null,
      content: renderReadme(),
    },
    {
      role: 'unsigned_structured_review_input_template',
      packagePath: 'SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json',
      sourcePath: null,
      content: renderStructuredInputTemplate(),
    },
    {
      role: 'unsigned_verdict_template',
      packagePath: 'INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md',
      sourcePath: null,
      content: renderVerdictTemplate(),
    },
    ...ROOT_SOURCE_FILES.map((descriptor) => ({
      ...descriptor,
      content: readFileSync(projectFile(descriptor.sourcePath)),
    })),
  ];
  const generatedFiles = generatedContent.map(({ content, ...descriptor }) => ({
    ...descriptor,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  }));
  const manifest = {
    schema: PACKAGE_SCHEMA,
    packageVersion: RELEASE_VERSION,
    reviewState: REVIEW_STATE,
    externalEvidenceComplete: false,
    technicalReadiness: 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW',
    acceptanceGates: {
      'AC-SCI-03': 'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW',
      'AC-VAL-05': 'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW',
    },
    boundary:
      'This is an unsigned review input. Package integrity and automated evidence are not independent scientific sign-off and cannot close either gate.',
    lockedRelease: {
      name: 'Activation Energy Studio',
      version: RELEASE_VERSION,
      artifact: RELEASE_HTML_PATH,
      packageArtifact: `evidence/project/${RELEASE_HTML_PATH}`,
      sha256: RELEASE_SHA256,
      releaseManifestPath: RELEASE_MANIFEST_PATH,
      releaseManifestSha256: RELEASE_MANIFEST_SHA256,
      checksumIndexPath: RELEASE_CHECKSUM_PATH,
      checksumIndexSha256: RELEASE_CHECKSUM_SHA256,
      reportSchemaPath: REPORT_SCHEMA_PATH,
      reportSchemaSha256: REPORT_SCHEMA_SHA256,
      candidateFreezePath: CANDIDATE_FREEZE_PATH,
      candidateFreezeSha256: CANDIDATE_FREEZE_SHA256,
      acceptanceCriteriaPath: ACCEPTANCE_CRITERIA_PATH,
      acceptanceCriteriaSha256: ACCEPTANCE_CRITERIA_SHA256,
    },
    reviewerEligibility: {
      humanRequired: true,
      relevantCurrentExpertiseRequired: true,
      independentFromCoreImplementation: true,
      independentFromValidationFixtureAuthorship: true,
      conflictDisclosureRequired: true,
      signedVerdictRequired: true,
      aiAgentMaySign: false,
    },
    checklist: {
      gateIds: ['AC-SCI-03', 'AC-VAL-05'],
      acSci03: {
        surfaces: REVIEW_SURFACES,
        itemsPerSurface: SCI_CHECKLIST_ITEMS.length,
        requiredDecisions: 28,
      },
      acVal05: { requiredDecisions: VAL_CHECKLIST_ITEMS.length },
      totalRequiredDecisions: expectedDecisionIds().length,
      initialDecision: 'NOT_REVIEWED',
      completedItemDecisions: ['PASS', 'FAIL'],
      gateDispositions: ['PASS', 'FAIL', 'REVISION_REQUIRED'],
    },
    artifacts,
    generatedFiles,
    generation: {
      generator: 'scripts/build-scientific-review-handoff-v0.3.2.mjs',
      verifier: 'VERIFY_PACKAGE.mjs',
      deterministic: true,
      generatedTimestampOmitted: true,
      hashAlgorithm: 'sha256',
      hashInput: 'raw_file_bytes',
      manifestSelfHashExcluded: true,
      signedEvidenceExcluded: true,
      observedEvidenceMustRemainOutsidePackage: true,
    },
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(serializedManifest);
  const manifestSidecar = `${manifestSha256}  ${PACKAGE_MANIFEST_NAME}\n`;
  return {
    artifacts,
    generatedContent,
    generatedFiles,
    manifest,
    serializedManifest,
    manifestSha256,
    manifestSidecar,
  };
}

function expectedPackageFiles(plan) {
  return [
    PACKAGE_MANIFEST_NAME,
    PACKAGE_MANIFEST_SIDECAR_NAME,
    ...plan.artifacts.map(({ packagePath }) => packagePath),
    ...plan.generatedFiles.map(({ packagePath }) => packagePath),
  ].sort();
}

function listFiles(root, prefix = '') {
  const directory = prefix ? path.join(root, ...prefix.split('/')) : root;
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...listFiles(root, relative));
    else if (entry.isFile()) result.push(relative);
    else fail('SCIENTIFIC_REVIEW_PACKAGE_UNSUPPORTED_ENTRY', relative);
  }
  return result.sort();
}

function resolveIn(root, portable) {
  const resolved = path.resolve(root, ...portablePath(portable).split('/'));
  const relation = path.relative(root, resolved);
  if (relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('SCIENTIFIC_REVIEW_PACKAGE_PATH_ESCAPE', portable);
  }
  return resolved;
}

function verifyOutput(output, plan) {
  if (!existsSync(output) || !statSync(output).isDirectory()) {
    fail('SCIENTIFIC_REVIEW_PACKAGE_MISSING', output);
  }
  const actualFiles = listFiles(output);
  const expectedFiles = expectedPackageFiles(plan);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_FILE_SET_MISMATCH',
      `expected=${expectedFiles.length} actual=${actualFiles.length}`,
    );
  }
  const expectedBytes = new Map([
    [PACKAGE_MANIFEST_NAME, Buffer.from(plan.serializedManifest)],
    [PACKAGE_MANIFEST_SIDECAR_NAME, Buffer.from(plan.manifestSidecar)],
    ...plan.artifacts.map((artifact) => [
      artifact.packagePath,
      readFileSync(projectFile(artifact.sourcePath)),
    ]),
    ...plan.generatedContent.map((entry) => [
      entry.packagePath,
      Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content),
    ]),
  ]);
  for (const [relative, expected] of expectedBytes) {
    const actual = readFileSync(resolveIn(output, relative));
    if (!actual.equals(expected)) {
      fail('SCIENTIFIC_REVIEW_PACKAGE_BYTE_MISMATCH', relative);
    }
  }
  return {
    output,
    fileCount: actualFiles.length,
    artifactCount: plan.artifacts.length,
    manifestSha256: plan.manifestSha256,
  };
}

function assertOwnedExistingOutput(output) {
  if (!existsSync(output)) return;
  if (!statSync(output).isDirectory()) {
    fail('SCIENTIFIC_REVIEW_OUTPUT_NOT_DIRECTORY', output);
  }
  const marker = path.join(output, PACKAGE_MANIFEST_NAME);
  if (!existsSync(marker)) {
    fail('SCIENTIFIC_REVIEW_OUTPUT_NOT_OWNED', output);
  }
  const parsed = JSON.parse(readFileSync(marker, 'utf8'));
  if (parsed.schema !== PACKAGE_SCHEMA || parsed.packageVersion !== RELEASE_VERSION) {
    fail('SCIENTIFIC_REVIEW_OUTPUT_NOT_OWNED', output);
  }
}

function writePackage(output, plan) {
  const parent = path.dirname(output);
  mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(output)}.staging-${process.pid}`);
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const artifact of plan.artifacts) {
      const destination = resolveIn(staging, artifact.packagePath);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(projectFile(artifact.sourcePath), destination);
    }
    for (const entry of plan.generatedContent) {
      const destination = resolveIn(staging, entry.packagePath);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, entry.content);
    }
    writeFileSync(path.join(staging, PACKAGE_MANIFEST_NAME), plan.serializedManifest);
    writeFileSync(
      path.join(staging, PACKAGE_MANIFEST_SIDECAR_NAME),
      plan.manifestSidecar,
    );
    verifyOutput(staging, plan);
    assertOwnedExistingOutput(output);
    if (existsSync(output)) rmSync(output, { recursive: true, force: true });
    renameSync(staging, output);
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return verifyOutput(output, plan);
}

function renderStatus(output, plan) {
  const packageManifestPath = path.join(output, PACKAGE_MANIFEST_NAME);
  const sidecarPath = path.join(output, PACKAGE_MANIFEST_SIDECAR_NAME);
  return `${JSON.stringify(
    {
      schemaVersion:
        'activation-energy-studio/independent-scientific-review-lane-status/v1',
      releaseVersion: RELEASE_VERSION,
      lane: 'independent-scientific-review',
      gateIds: ['AC-SCI-03', 'AC-VAL-05'],
      candidateSha256: RELEASE_SHA256,
      candidateFreeze: {
        path: path.relative(PROJECT_ROOT, projectFile(CANDIDATE_FREEZE_PATH)).split(path.sep).join('/'),
        sha256: CANDIDATE_FREEZE_SHA256,
      },
      reviewState: REVIEW_STATE,
      gateStatus: {
        'AC-SCI-03': 'EXTERNAL_OPEN',
        'AC-VAL-05': 'EXTERNAL_OPEN',
      },
      technicalReadiness: {
        status: 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW',
        deterministicPackageBuilt: true,
        packageIntegrityVerified: true,
        structuredRecorderIncluded: true,
        requiredDecisionCount: 35,
      },
      packageArtifacts: {
        handoffRoot: path.relative(PROJECT_ROOT, output).split(path.sep).join('/'),
        packageManifest: {
          path: path.relative(PROJECT_ROOT, packageManifestPath).split(path.sep).join('/'),
          bytes: statSync(packageManifestPath).size,
          sha256: plan.manifestSha256,
        },
        packageManifestSidecar: {
          path: path.relative(PROJECT_ROOT, sidecarPath).split(path.sep).join('/'),
          bytes: statSync(sidecarPath).size,
          sha256: sha256File(sidecarPath),
        },
      },
      externalEvidenceComplete: false,
      humanRequirementsOpen: [
        'eligible independent reviewer identity and expertise verification',
        '35 evidence-linked reviewer decisions',
        'signed verdict artifact',
        'independent identity and signature-authenticity verification',
      ],
      boundary:
        'Technical readiness and package integrity do not establish independent scientific approval or close either gate.',
    },
    null,
    2,
  )}\n`;
}

function writeStatus(statusPath, output, plan) {
  mkdirSync(path.dirname(statusPath), { recursive: true });
  const serialized = renderStatus(output, plan);
  writeFileSync(statusPath, serialized, 'utf8');
  return { statusPath, sha256: sha256(serialized) };
}

function verifyStatus(statusPath, output, plan) {
  if (!existsSync(statusPath) || !statSync(statusPath).isFile()) {
    fail('SCIENTIFIC_REVIEW_STATUS_MISSING', statusPath);
  }
  const expected = renderStatus(output, plan);
  const actual = readFileSync(statusPath, 'utf8');
  if (actual !== expected) fail('SCIENTIFIC_REVIEW_STATUS_DRIFT', statusPath);
  return { statusPath, sha256: sha256(actual) };
}

function parseArguments(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    statusPath: DEFAULT_STATUS_PATH,
    check: false,
  };
  let customOutput = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output') {
      if (!argv[index + 1]) fail('SCIENTIFIC_REVIEW_ARGUMENT_MISSING', '--output');
      options.output = path.resolve(argv[index + 1]);
      customOutput = true;
      index += 1;
    } else if (argument === '--status') {
      if (!argv[index + 1]) fail('SCIENTIFIC_REVIEW_ARGUMENT_MISSING', '--status');
      options.statusPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--no-status') {
      options.statusPath = null;
    } else if (argument === '--check') {
      options.check = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      fail('SCIENTIFIC_REVIEW_UNKNOWN_ARGUMENT', argument);
    }
  }
  if (customOutput && !argv.includes('--status')) options.statusPath = null;
  return options;
}

function usage() {
  return `Usage: node scripts/build-scientific-review-handoff-v0.3.2.mjs [options]

Options:
  --output <directory>  package destination
  --status <file>       machine-readable lane status destination
  --no-status           do not write/check an adjacent status
  --check               verify without writing
`;
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const plan = createPlan();
    const result = options.check
      ? verifyOutput(options.output, plan)
      : writePackage(options.output, plan);
    const status = options.statusPath
      ? options.check
        ? verifyStatus(options.statusPath, options.output, plan)
        : writeStatus(options.statusPath, options.output, plan)
      : null;
    process.stdout.write(
      `TECHNICAL_OK SCIENTIFIC_REVIEW_HANDOFF_${options.check ? 'VERIFIED' : 'BUILT'} `
      + `version=${RELEASE_VERSION} files=${result.fileCount} artifacts=${result.artifactCount} `
      + `manifestSha256=${result.manifestSha256} reviewState=${REVIEW_STATE} `
      + `externalEvidenceComplete=false${status ? ` statusSha256=${status.sha256}` : ''}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) runCli();

export {
  createPlan,
  expectedDecisionIds,
  renderStatus,
  verifyOutput,
  writePackage,
};
