#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOLO_CLOSEOUT_SCHEMA =
  'activation-energy-studio/solo-research-preview-closeout/v1';
export const SOLO_CLOSEOUT_VERDICT =
  'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS';
export const SOLO_CLOSEOUT_REASON = 'SOLO_REPRODUCIBLE_EVIDENCE_PASS';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const OUTPUT_RELATIVE = 'output/v0.3.2-solo-closeout';
const CANDIDATE_RELATIVE =
  'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html';
const CANDIDATE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const FREEZE_RELATIVE =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json';
const FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const RELEASE_MANIFEST_RELATIVE = 'release/v0.3.2/MANIFEST.v0.3.2.json';
const RELEASE_MANIFEST_SHA256 =
  '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c';
const RELEASE_CHECKSUM_RELATIVE = 'release/v0.3.2/SHA256SUMS.v0.3.2.txt';
const RELEASE_CHECKSUM_SHA256 =
  '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0';
const LOCAL_DIAGNOSTIC_DIRECTORY =
  'evidence/solo-closure/v0.3.2/local-macos-diagnostic';
const LOCAL_DIAGNOSTIC_MANIFEST =
  `${LOCAL_DIAGNOSTIC_DIRECTORY}/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json`;
const LOCAL_DIAGNOSTIC_METADATA =
  `${LOCAL_DIAGNOSTIC_DIRECTORY}/local-macos-diagnostic.json`;
const EXTERNAL_DECISION_RELATIVE =
  'output/v0.3.2-external-validation/CURRENT_RELEASE_DECISION.json';
const EXTERNAL_DISPATCH_RELATIVE =
  'output/v0.3.2-external-validation/DISPATCH_INDEX.json';
const EXTERNAL_REPORT_RELATIVE =
  'output/v0.3.2-external-validation/EXTERNAL_VALIDATION_REPORT.md';
const FULL_CHECK_COMMAND = 'npm run check';
const SHA_PATTERN = /^[a-f0-9]{64}$/u;

const OUTPUT_FILES = Object.freeze([
  'FULL_CHECK.log',
  'FULL_CHECK_RECEIPT.json',
  'RESEARCH_PREVIEW_CLOSEOUT.json',
  'RESEARCH_PREVIEW_CLOSEOUT.md',
  'SHA256SUMS.txt',
]);

const SURFACE_ROOTS = Object.freeze([
  'src',
  'scripts',
  'tests',
  'docs/technical-english',
  'release/v0.3.2',
]);

const SURFACE_FILES = Object.freeze([
  'package.json',
  'package-lock.json',
  'README.md',
  'tsconfig.json',
  'vite.config.ts',
  'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json',
  'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
  'evidence/validation/paper010-raw-to-report-v0.2.0-local/PAPER010_RAW_TO_REPORT_MANIFEST.json',
  'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.en.md',
  'REAL_DATA_VALIDATION_STATUS.md',
  LOCAL_DIAGNOSTIC_MANIFEST,
  LOCAL_DIAGNOSTIC_METADATA,
  EXTERNAL_DECISION_RELATIVE,
  EXTERNAL_DISPATCH_RELATIVE,
  EXTERNAL_REPORT_RELATIVE,
]);

export class SoloCloseoutError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'SoloCloseoutError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new SoloCloseoutError(code, message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function regularFile(projectRoot, relativePath) {
  const absolute = path.resolve(projectRoot, ...relativePath.split('/'));
  const relative = path.relative(projectRoot, absolute);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || !existsSync(absolute)
    || lstatSync(absolute).isSymbolicLink()
    || !statSync(absolute).isFile()
  ) {
    fail('SOLO_CLOSEOUT_INPUT_INVALID', `Required regular file is unavailable: ${relativePath}.`);
  }
  return { absolute, bytes: readFileSync(absolute) };
}

function descriptor(projectRoot, relativePath) {
  const file = regularFile(projectRoot, relativePath);
  return {
    path: relativePath,
    bytes: file.bytes.length,
    sha256: sha256(file.bytes),
  };
}

function readJson(projectRoot, relativePath) {
  try {
    return JSON.parse(regularFile(projectRoot, relativePath).bytes.toString('utf8'));
  } catch (error) {
    fail(
      'SOLO_CLOSEOUT_JSON_INVALID',
      `${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function listTreeFiles(projectRoot, relativeRoot) {
  const root = path.resolve(projectRoot, ...relativeRoot.split('/'));
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !statSync(root).isDirectory()) {
    fail('SOLO_CLOSEOUT_SURFACE_INVALID', `Verification root is unavailable: ${relativeRoot}.`);
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail('SOLO_CLOSEOUT_SURFACE_SYMLINK', `Verification surface contains a symlink: ${absolute}.`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.push(path.relative(projectRoot, absolute).split(path.sep).join('/'));
      }
    }
  };
  visit(root);
  return files;
}

export function collectVerificationSurface(projectRoot = DEFAULT_PROJECT_ROOT) {
  const canonicalRoot = realpathSync(path.resolve(projectRoot));
  const paths = new Set(SURFACE_FILES);
  for (const relativeRoot of SURFACE_ROOTS) {
    for (const relativePath of listTreeFiles(canonicalRoot, relativeRoot)) paths.add(relativePath);
  }
  const files = [...paths].sort().map((relativePath) => descriptor(canonicalRoot, relativePath));
  const aggregateSha256 = sha256(Buffer.from(files
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join(''), 'utf8'));
  return { fileCount: files.length, aggregateSha256, files };
}

function assertExactDescriptor(projectRoot, relativePath, expectedSha256) {
  const value = descriptor(projectRoot, relativePath);
  if (value.sha256 !== expectedSha256) {
    fail(
      'SOLO_CLOSEOUT_LOCK_MISMATCH',
      `${relativePath} SHA-256 ${value.sha256} does not match ${expectedSha256}.`,
    );
  }
  return value;
}

function validateLocalDiagnostic(projectRoot) {
  const manifest = readJson(projectRoot, LOCAL_DIAGNOSTIC_MANIFEST);
  if (
    manifest.schema !== 'activation-energy-studio/local-macos-diagnostic-integrity-manifest/v1'
    || manifest.claimStatus !== 'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE'
    || manifest.evidenceClass !== 'local-automated-diagnostic'
    || !Array.isArray(manifest.platformCriteriaClosed)
    || manifest.platformCriteriaClosed.length !== 0
    || !Array.isArray(manifest.files)
    || manifest.fileCount !== manifest.files.length
  ) {
    fail('SOLO_CLOSEOUT_LOCAL_DIAGNOSTIC_INVALID', 'Local diagnostic manifest violates its solo-only claim boundary.');
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (
      typeof entry?.path !== 'string'
      || typeof entry?.bytes !== 'number'
      || !SHA_PATTERN.test(entry?.sha256 ?? '')
      || seen.has(entry.path)
    ) {
      fail('SOLO_CLOSEOUT_LOCAL_DIAGNOSTIC_INVALID', 'Local diagnostic manifest contains an invalid file entry.');
    }
    seen.add(entry.path);
    const actual = descriptor(projectRoot, `${LOCAL_DIAGNOSTIC_DIRECTORY}/${entry.path}`);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) {
      fail('SOLO_CLOSEOUT_LOCAL_DIAGNOSTIC_STALE', `${entry.path} differs from the local diagnostic manifest.`);
    }
  }
  const metadata = readJson(projectRoot, LOCAL_DIAGNOSTIC_METADATA);
  const requiredDownloads = ['selfTestJson', 'reportJson', 'reportCsv', 'reportPdf'];
  if (
    metadata.claimStatus !== 'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE'
    || metadata.humanReviewCompleted !== false
    || metadata.operatorConfirmationsCompleted !== false
    || !Array.isArray(metadata.platformCriteriaClosed)
    || metadata.platformCriteriaClosed.length !== 0
    || metadata.family !== 'macos'
    || metadata.runner?.platform !== 'darwin'
    || metadata.runtime?.documentProtocol !== 'file:'
    || metadata.runtime?.onlineStateDuringRun !== false
    || metadata.networkInspection?.totalRequests !== 1
    || !Array.isArray(metadata.networkInspection?.externalRequests)
    || metadata.networkInspection.externalRequests.length !== 0
    || requiredDownloads.some((key) => metadata.downloads?.[key]?.complete !== true)
    || metadata.artifacts?.release?.sha256 !== CANDIDATE_SHA256
    || metadata.candidateFreeze?.record?.sha256 !== FREEZE_SHA256
  ) {
    fail('SOLO_CLOSEOUT_LOCAL_DIAGNOSTIC_INVALID', 'Local diagnostic does not establish the bounded offline Mac workflow.');
  }
  return {
    manifest: descriptor(projectRoot, LOCAL_DIAGNOSTIC_MANIFEST),
    metadata: descriptor(projectRoot, LOCAL_DIAGNOSTIC_METADATA),
    environment: {
      osEdition: metadata.runner.osEdition,
      osBuild: metadata.osBuild,
      architecture: metadata.reportedArchitecture,
      browser: metadata.browser.product,
      browserVersion: metadata.browser.version,
      nodeVersion: metadata.provenance.nodeVersion,
      documentProtocol: metadata.runtime.documentProtocol,
      offline: true,
      totalRequests: 1,
      externalRequests: 0,
    },
    downloads: Object.fromEntries(requiredDownloads.map((key) => [key, {
      path: metadata.downloads[key].path,
      bytes: metadata.downloads[key].bytes,
      sha256: metadata.downloads[key].sha256,
    }])),
  };
}

function externalDecisionSummary(projectRoot) {
  const decision = readJson(projectRoot, EXTERNAL_DECISION_RELATIVE);
  const summary = decision.summary ?? decision.currentDecision ?? {};
  const decisionValue = summary.currentDecision ?? summary.decision;
  const reasonCode = summary.reasonCode;
  const gates = decision.gates;
  if (
    decisionValue !== 'EXTERNAL_OPEN'
    || reasonCode !== 'OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED'
    || summary.externalEvidenceComplete !== false
    || summary.packageChangeRequired !== false
    || !Array.isArray(gates)
    || gates.length !== 8
    || gates.some((gate) => gate.status !== 'EXTERNAL_OPEN')
  ) {
    fail('SOLO_CLOSEOUT_EXTERNAL_BOUNDARY_INVALID', 'External validation must remain optional, incomplete, and eight-of-eight open.');
  }
  return {
    decision: decisionValue,
    reasonCode,
    gates: gates.map((gate) => ({
      externalGate: gate.id,
      externalStatus: gate.status,
      soloClosureTreatment: 'OUT_OF_SCOPE_NOT_CLAIMED',
      blockingForSoloResearchPreview: false,
      substitutedByLocalEvidence: false,
    })),
    artifact: descriptor(projectRoot, EXTERNAL_DECISION_RELATIVE),
  };
}

function validateLockedInputs(projectRoot) {
  const candidate = assertExactDescriptor(projectRoot, CANDIDATE_RELATIVE, CANDIDATE_SHA256);
  const freeze = assertExactDescriptor(projectRoot, FREEZE_RELATIVE, FREEZE_SHA256);
  const releaseManifest = assertExactDescriptor(
    projectRoot,
    RELEASE_MANIFEST_RELATIVE,
    RELEASE_MANIFEST_SHA256,
  );
  const releaseChecksums = assertExactDescriptor(
    projectRoot,
    RELEASE_CHECKSUM_RELATIVE,
    RELEASE_CHECKSUM_SHA256,
  );
  const localDiagnostic = validateLocalDiagnostic(projectRoot);
  const externalValidation = externalDecisionSummary(projectRoot);
  return {
    candidate,
    freeze,
    releaseManifest,
    releaseChecksums,
    localDiagnostic,
    externalValidation,
  };
}

function runFullCheck(projectRoot) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, ['run', 'check'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 256 * 1024 * 1024,
  });
  const finishedAt = new Date().toISOString();
  const stdout = result.stdout ?? '';
  const stderr = `${result.stderr ?? ''}${result.error ? `${result.error.message}\n` : ''}`;
  const log = [
    'ACTIVATION_ENERGY_STUDIO_SOLO_CLOSEOUT_FULL_CHECK_V1',
    `COMMAND ${FULL_CHECK_COMMAND}`,
    `STARTED_AT ${startedAt}`,
    `FINISHED_AT ${finishedAt}`,
    `EXIT_CODE ${result.status ?? 'null'}`,
    `SIGNAL ${result.signal ?? 'null'}`,
    '[STDOUT]',
    stdout,
    '[STDERR]',
    stderr,
    '[END]',
    '',
  ].join('\n');
  return {
    startedAt,
    finishedAt,
    exitCode: result.status,
    signal: result.signal,
    log: Buffer.from(log, 'utf8'),
  };
}

export function assertSoloDecisionBoundary(decision) {
  const criteria = decision?.requiredCriteria;
  const externalGates = decision?.externalValidation?.gates;
  if (
    decision?.schemaVersion !== SOLO_CLOSEOUT_SCHEMA
    || decision?.verdict !== SOLO_CLOSEOUT_VERDICT
    || decision?.reasonCode !== SOLO_CLOSEOUT_REASON
    || decision?.projectStatus !== 'CLOSED_WITH_BOUNDED_CLAIMS'
    || decision?.artifactRole !== 'RESEARCH_PREVIEW'
    || decision?.openRequiredWork?.length !== 0
    || decision?.evidencePolicy?.externalEvidenceSubstitutionAllowed !== false
    || decision?.evidencePolicy?.sameHostSimulationCountsAsCrossPlatform !== false
    || decision?.evidencePolicy?.automatedInteractionCountsAsHumanUsability !== false
    || decision?.evidencePolicy?.selfAssessmentCountsAsIndependentReview !== false
    || !Array.isArray(criteria)
    || criteria.length !== 9
    || criteria.some((criterion) => criterion.status !== 'PASS')
    || !Array.isArray(externalGates)
    || externalGates.length !== 8
    || externalGates.some((gate) => (
      gate.externalStatus !== 'EXTERNAL_OPEN'
      || gate.blockingForSoloResearchPreview !== false
      || gate.substitutedByLocalEvidence !== false
    ))
    || decision?.claimsNotEstablished?.independentScientificValidation !== true
    || decision?.claimsNotEstablished?.crossPlatformCompatibility !== true
    || decision?.claimsNotEstablished?.observedHumanUsability !== true
    || decision?.claimsNotEstablished?.validatedMvp !== true
    || decision?.packageChangeRequired !== false
  ) {
    fail('SOLO_CLOSEOUT_DECISION_BOUNDARY_INVALID', 'Solo closeout decision exceeds or contradicts its bounded claim.');
  }
  return true;
}

function buildDecision({ receipt, locked }) {
  const evidence = {
    fullCheckReceipt: descriptorFromBytes(
      `${OUTPUT_RELATIVE}/FULL_CHECK_RECEIPT.json`,
      jsonBytes(receipt),
    ),
    candidate: locked.candidate,
    candidateFreeze: locked.freeze,
    releaseManifest: locked.releaseManifest,
    releaseChecksums: locked.releaseChecksums,
    fixtureManifest: receipt.boundEvidence.fixtureManifest,
    corpusLedger: receipt.boundEvidence.corpusLedger,
    paper010Reproduction: receipt.boundEvidence.paper010Reproduction,
    realDataValidationReport: receipt.boundEvidence.realDataValidationReport,
    localMacDiagnosticManifest: locked.localDiagnostic.manifest,
    localMacDiagnosticMetadata: locked.localDiagnostic.metadata,
  };
  const decision = {
    schemaVersion: SOLO_CLOSEOUT_SCHEMA,
    releaseVersion: '0.3.2',
    closureMode: 'SOLE_RESEARCHER_SINGLE_HOST',
    verdict: SOLO_CLOSEOUT_VERDICT,
    reasonCode: SOLO_CLOSEOUT_REASON,
    artifactRole: 'RESEARCH_PREVIEW',
    projectStatus: 'CLOSED_WITH_BOUNDED_CLAIMS',
    candidate: {
      ...locked.candidate,
      freeze: locked.freeze,
    },
    verification: {
      command: FULL_CHECK_COMMAND,
      result: 'PASS',
      startedAt: receipt.startedAt,
      finishedAt: receipt.finishedAt,
      verificationSurfaceFileCount: receipt.verificationSurface.fileCount,
      verificationSurfaceSha256: receipt.verificationSurface.aggregateSha256,
    },
    requiredCriteria: [
      { id: 'SC-INTEGRITY-01', status: 'PASS', statement: 'Candidate, freeze, release manifest, and checksum locks are exact.' },
      { id: 'SC-AUTO-01', status: 'PASS', statement: 'A fresh hash-bound npm run check receipt records exit code zero.' },
      { id: 'SC-SCI-01', status: 'PASS', statement: 'All retained deterministic scientific oracle lanes pass.' },
      { id: 'SC-PROV-01', status: 'PASS', statement: 'Fixture, corpus, source, licence, and provenance ledgers verify.' },
      { id: 'SC-OFFLINE-01', status: 'PASS', statement: 'The packaged single HTML passes static offline verification.' },
      { id: 'SC-RUNTIME-01', status: 'PASS', statement: 'The exact candidate completed the bounded offline workflow on the recorded local Mac and Chrome environment.' },
      { id: 'SC-EXPORT-01', status: 'PASS', statement: 'Self-test JSON and reproducible JSON, CSV, and PDF exports are retained and hash-bound.' },
      { id: 'SC-CLAIMS-01', status: 'PASS', statement: 'Standard technical English and the Research Preview claim boundary verify.' },
      { id: 'SC-LIMITS-01', status: 'PASS', statement: 'Required limitations and prohibited claims are explicit.' },
    ],
    evidence,
    localRuntime: {
      evidenceClass: 'LOCAL_AUTOMATED_RUNTIME',
      independent: false,
      simulated: false,
      countsTowardSoloResearchPreviewClosure: true,
      countsTowardExternalValidation: false,
      ...locked.localDiagnostic.environment,
      downloads: locked.localDiagnostic.downloads,
      claimBoundary: 'One genuine local macOS and Chrome execution only; not Windows, Ubuntu, human-observed, or independent evidence.',
    },
    sameHostSimulation: {
      evidenceClass: 'SAME_HOST_SIMULATION',
      status: 'PASS',
      source: 'npm run check automated application, ingestion, real-example, export, refusal, and network-boundary tests',
      supports: 'Deterministic workflow operability and fail-closed contract behavior on the current host.',
      doesNotSupport: [
        'first-time-user comprehension',
        'five-minute human task completion',
        'Windows or Ubuntu runtime compatibility',
        'independent scientific review',
      ],
      blockingIfAbsent: false,
    },
    evidencePolicy: {
      externalEvidenceSubstitutionAllowed: false,
      sameHostSimulationCountsAsCrossPlatform: false,
      automatedInteractionCountsAsHumanUsability: false,
      selfAssessmentCountsAsIndependentReview: false,
    },
    permittedClaims: [
      'The exact v0.3.2 artifact is hash-locked and can be distributed and cited as a Research Preview.',
      'Named deterministic scientific oracle lanes and the complete local automated verification command pass.',
      'The bounded workflow ran offline on the recorded local macOS and Chrome environment.',
      'Three licensed real examples, explicit scientific dispositions, and JSON, CSV, and PDF exports are packaged.',
    ],
    prohibitedClaims: [
      'independently scientifically validated or peer reviewed',
      'validated on Windows or Ubuntu or certified cross-platform compatible',
      'human-usability validated or proven usable within five minutes by a first-time user',
      'validated MVP, certified instrument software, or regulatory software',
      'mechanism determination or universal correctness outside the tested methods and evidence',
    ],
    declaredLimitations: [
      'Runtime evidence is limited to one computer, macOS environment, and Chrome version.',
      'No independent reviewer or external signature was used.',
      'No usability participants were observed.',
      'No genuine Windows or Linux execution was performed for v0.3.2.',
      'Scientific evidence is bounded to the implemented methods, retained fixtures, real-data lanes, and declared preprocessing.',
      'Reported values are apparent, stage-dependent, method-dependent activation energies and are not mechanism claims.',
    ],
    claimsNotEstablished: {
      independentScientificValidation: true,
      crossPlatformCompatibility: true,
      observedHumanUsability: true,
      validatedMvp: true,
      certificationOrRegulatoryFitness: true,
    },
    externalValidation: {
      decision: locked.externalValidation.decision,
      reasonCode: locked.externalValidation.reasonCode,
      requiredForSoloClosure: false,
      gates: locked.externalValidation.gates,
    },
    optionalFutureWork: [
      { lane: 'independent scientific review', blockingForThisProject: false },
      { lane: 'genuine Windows, macOS, and Linux compatibility evidence', blockingForThisProject: false },
      { lane: 'observed multi-participant usability validation', blockingForThisProject: false },
    ],
    openRequiredWork: [],
    packageChangeRequired: false,
    finalStatement: 'Activation Energy Studio v0.3.2 is publishable as a bounded Research Preview and the solo-researcher project is closed.',
  };
  assertSoloDecisionBoundary(decision);
  return decision;
}

function descriptorFromBytes(relativePath, bytes) {
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function reportMarkdown(decision) {
  const local = decision.localRuntime;
  return `# Activation Energy Studio v0.3.2 Solo Research Preview Closeout

## Decision

**${decision.verdict}**

Project status: **${decision.projectStatus}**  
Artifact role: **${decision.artifactRole}**  
Candidate SHA-256: \`${decision.candidate.sha256}\`

Activation Energy Studio v0.3.2 is ready for public distribution and citation
as a bounded Research Preview. This is a solo-researcher product decision, not
an independent certification or validated-MVP claim.

## Evidence completed on one computer

- The exact candidate, freeze, release manifest, and checksum index verify.
- A fresh \`${decision.verification.command}\` run exited successfully and is
  retained with a hash-bound log and ${decision.verification.verificationSurfaceFileCount}
  input files (surface SHA-256 \`${decision.verification.verificationSurfaceSha256}\`).
- Paper010, Chilean Oak, Dryad polyisoprene, NR-CELS, and
  Coal/SPT/paraffin deterministic scientific lanes are included in the passing
  verification chain.
- The exact candidate completed the offline golden workflow on
  ${local.osEdition}, ${local.architecture}, ${local.browser}; one local
  \`file:\` request and zero external requests were observed.
- Self-test JSON plus reproducible JSON, CSV, and PDF exports are retained and
  hash-bound.
- Automated same-host flows exercise ingestion, explicit mapping, all three
  licensed real examples, scientific refusal/warning behavior, and exports.

## Scope boundary

The closeout supports distribution as a Research Preview. It does not claim:

- independent scientific validation or peer review;
- Windows or Linux validation, or certified cross-platform compatibility;
- observed human usability or a proven five-minute first-use outcome;
- validated-MVP, instrument certification, or regulatory fitness; or
- mechanism determination or correctness outside the tested methods and
  retained evidence.

Same-host simulations and automated interactions are technical evidence only.
They are not relabelled as human, independent, Windows, or Linux evidence.

## External validation

The separate external-validation lane remains \`${decision.externalValidation.decision}\`
with all eight gates \`EXTERNAL_OPEN\`. Those gates govern stronger optional
claims and do not block this Research Preview closeout. No local evidence was
substituted for an external gate.

## Remaining required work

None for the declared solo Research Preview scope. Independent review,
multi-OS execution, and participant usability studies are optional future work
only if stronger claims are later desired.
`;
}

function buildReceipt({ check, surface, logDescriptor, locked, projectRoot }) {
  return {
    schemaVersion: 'activation-energy-studio/solo-full-check-receipt/v1',
    releaseVersion: '0.3.2',
    command: FULL_CHECK_COMMAND,
    shell: false,
    startedAt: check.startedAt,
    finishedAt: check.finishedAt,
    exitCode: check.exitCode,
    signal: check.signal,
    result: check.exitCode === 0 && check.signal === null ? 'PASS' : 'FAIL',
    log: logDescriptor,
    verificationSurface: surface,
    candidate: locked.candidate,
    candidateFreeze: locked.freeze,
    boundEvidence: {
      fixtureManifest: descriptor(projectRoot, 'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json'),
      corpusLedger: descriptor(projectRoot, 'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json'),
      paper010Reproduction: descriptor(
        projectRoot,
        'evidence/validation/paper010-raw-to-report-v0.2.0-local/PAPER010_RAW_TO_REPORT_MANIFEST.json',
      ),
      realDataValidationReport: descriptor(
        projectRoot,
        'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.en.md',
      ),
      localMacDiagnosticManifest: locked.localDiagnostic.manifest,
      externalValidationDecision: locked.externalValidation.artifact,
    },
    claimBoundary: 'This receipt proves only that the recorded local automated command passed against the bound verification surface.',
  };
}

function validateReceipt(receipt, logBytes, surface) {
  if (
    receipt?.schemaVersion !== 'activation-energy-studio/solo-full-check-receipt/v1'
    || receipt?.releaseVersion !== '0.3.2'
    || receipt?.command !== FULL_CHECK_COMMAND
    || receipt?.shell !== false
    || receipt?.exitCode !== 0
    || receipt?.signal !== null
    || receipt?.result !== 'PASS'
    || receipt?.log?.path !== `${OUTPUT_RELATIVE}/FULL_CHECK.log`
    || receipt?.log?.bytes !== logBytes.length
    || receipt?.log?.sha256 !== sha256(logBytes)
    || receipt?.verificationSurface?.fileCount !== surface.fileCount
    || receipt?.verificationSurface?.aggregateSha256 !== surface.aggregateSha256
    || JSON.stringify(receipt.verificationSurface.files) !== JSON.stringify(surface.files)
  ) {
    fail('SOLO_CLOSEOUT_RECEIPT_INVALID', 'Full-check receipt or verification surface is missing, failed, or stale.');
  }
}

function checksumText(artifacts) {
  return `${artifacts.map((artifact) => `${artifact.sha256}  ${path.posix.basename(artifact.path)}`).join('\n')}\n`;
}

function ensureOutputDirectory(projectRoot) {
  const output = path.resolve(projectRoot, ...OUTPUT_RELATIVE.split('/'));
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink() || !statSync(output).isDirectory()) {
    fail('SOLO_CLOSEOUT_OUTPUT_INVALID', 'Solo closeout output must be a real directory.');
  }
  return output;
}

function execute(projectRoot) {
  const canonicalRoot = realpathSync(path.resolve(projectRoot));
  const lockedBefore = validateLockedInputs(canonicalRoot);
  const surfaceBefore = collectVerificationSurface(canonicalRoot);
  const check = runFullCheck(canonicalRoot);
  if (check.exitCode !== 0 || check.signal !== null) {
    fail('SOLO_CLOSEOUT_FULL_CHECK_FAILED', `${FULL_CHECK_COMMAND} did not pass; no closeout decision was written.`);
  }
  const lockedAfter = validateLockedInputs(canonicalRoot);
  const surfaceAfter = collectVerificationSurface(canonicalRoot);
  if (
    surfaceBefore.aggregateSha256 !== surfaceAfter.aggregateSha256
    || surfaceBefore.fileCount !== surfaceAfter.fileCount
  ) {
    fail('SOLO_CLOSEOUT_SURFACE_CHANGED', 'The verification surface changed while the full check ran.');
  }
  const output = ensureOutputDirectory(canonicalRoot);
  const logPath = path.join(output, 'FULL_CHECK.log');
  writeFileSync(logPath, check.log);
  const logDescriptor = descriptorFromBytes(`${OUTPUT_RELATIVE}/FULL_CHECK.log`, check.log);
  const receipt = buildReceipt({
    check,
    surface: surfaceAfter,
    logDescriptor,
    locked: lockedAfter,
    projectRoot: canonicalRoot,
  });
  const receiptBytes = jsonBytes(receipt);
  writeFileSync(path.join(output, 'FULL_CHECK_RECEIPT.json'), receiptBytes);
  const decision = buildDecision({ receipt, locked: lockedAfter });
  const decisionBytes = jsonBytes(decision);
  const reportBytes = Buffer.from(reportMarkdown(decision), 'utf8');
  writeFileSync(path.join(output, 'RESEARCH_PREVIEW_CLOSEOUT.json'), decisionBytes);
  writeFileSync(path.join(output, 'RESEARCH_PREVIEW_CLOSEOUT.md'), reportBytes);
  const checksums = checksumText([
    logDescriptor,
    descriptorFromBytes(`${OUTPUT_RELATIVE}/FULL_CHECK_RECEIPT.json`, receiptBytes),
    descriptorFromBytes(`${OUTPUT_RELATIVE}/RESEARCH_PREVIEW_CLOSEOUT.json`, decisionBytes),
    descriptorFromBytes(`${OUTPUT_RELATIVE}/RESEARCH_PREVIEW_CLOSEOUT.md`, reportBytes),
  ]);
  writeFileSync(path.join(output, 'SHA256SUMS.txt'), checksums);
  process.stdout.write(
    `PASS SOLO_RESEARCH_PREVIEW_CLOSEOUT verdict=${decision.verdict} surfaceFiles=${surfaceAfter.fileCount} surfaceSha256=${surfaceAfter.aggregateSha256}\n`,
  );
}

function check(projectRoot) {
  const canonicalRoot = realpathSync(path.resolve(projectRoot));
  const output = path.resolve(canonicalRoot, ...OUTPUT_RELATIVE.split('/'));
  if (!existsSync(output) || !statSync(output).isDirectory()) {
    fail('SOLO_CLOSEOUT_OUTPUT_MISSING', 'Solo closeout output directory is missing.');
  }
  const actualNames = readdirSync(output).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...OUTPUT_FILES].sort())) {
    fail('SOLO_CLOSEOUT_OUTPUT_SET_INVALID', 'Solo closeout output file set differs from the exact contract.');
  }
  const locked = validateLockedInputs(canonicalRoot);
  const surface = collectVerificationSurface(canonicalRoot);
  const logBytes = readFileSync(path.join(output, 'FULL_CHECK.log'));
  const receipt = JSON.parse(readFileSync(path.join(output, 'FULL_CHECK_RECEIPT.json'), 'utf8'));
  validateReceipt(receipt, logBytes, surface);
  const decision = buildDecision({ receipt, locked });
  const expectedDecision = jsonBytes(decision);
  const expectedReport = Buffer.from(reportMarkdown(decision), 'utf8');
  const actualDecision = readFileSync(path.join(output, 'RESEARCH_PREVIEW_CLOSEOUT.json'));
  const actualReport = readFileSync(path.join(output, 'RESEARCH_PREVIEW_CLOSEOUT.md'));
  if (!actualDecision.equals(expectedDecision) || !actualReport.equals(expectedReport)) {
    fail('SOLO_CLOSEOUT_ARTIFACT_STALE', 'Solo closeout decision or report is stale.');
  }
  const expectedChecksums = checksumText([
    descriptorFromBytes(`${OUTPUT_RELATIVE}/FULL_CHECK.log`, logBytes),
    descriptorFromBytes(`${OUTPUT_RELATIVE}/FULL_CHECK_RECEIPT.json`, jsonBytes(receipt)),
    descriptorFromBytes(`${OUTPUT_RELATIVE}/RESEARCH_PREVIEW_CLOSEOUT.json`, actualDecision),
    descriptorFromBytes(`${OUTPUT_RELATIVE}/RESEARCH_PREVIEW_CLOSEOUT.md`, actualReport),
  ]);
  const actualChecksums = readFileSync(path.join(output, 'SHA256SUMS.txt'), 'utf8');
  if (actualChecksums !== expectedChecksums) {
    fail('SOLO_CLOSEOUT_CHECKSUMS_STALE', 'Solo closeout checksum index is stale.');
  }
  process.stdout.write(
    `PASS SOLO_RESEARCH_PREVIEW_CLOSEOUT_CURRENT verdict=${decision.verdict} surfaceFiles=${surface.fileCount} surfaceSha256=${surface.aggregateSha256}\n`,
  );
}

function usage() {
  return [
    'Usage:',
    '  node scripts/generate-v0.3.2-solo-closeout.mjs --execute',
    '  node scripts/generate-v0.3.2-solo-closeout.mjs --check',
  ].join('\n');
}

function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.length !== 1 || !['--execute', '--check'].includes(argumentsList[0])) {
    throw new Error(usage());
  }
  if (argumentsList[0] === '--execute') execute(DEFAULT_PROJECT_ROOT);
  else check(DEFAULT_PROJECT_ROOT);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

