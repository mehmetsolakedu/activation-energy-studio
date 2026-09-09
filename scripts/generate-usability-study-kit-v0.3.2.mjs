#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zipSync } from 'fflate';

import {
  buildUsabilityV032FixtureBundle,
  checkUsabilityV032FixtureBundle,
  writeUsabilityV032FixtureBundle,
  UX_V032_FIXTURE_MANIFEST_PATH,
} from './generate-usability-fixtures-v0.3.2.mjs';
import { verifyUsabilityV032StudyKit } from './verify-usability-study-kit-v0.3.2.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const KIT_NAME =
  'Activation-Energy-Studio-Observed-Usability-Handoff-v0.3.2';
const OUTPUT_DIRECTORY = resolve(PROJECT_ROOT, 'output', KIT_NAME);
const ARCHIVE_PATH = resolve(PROJECT_ROOT, 'output', `${KIT_NAME}.zip`);
const ARCHIVE_SHA_PATH = `${ARCHIVE_PATH}.sha256`;
const LANE_STATUS_PATH = resolve(
  PROJECT_ROOT,
  'evidence/usability/v0.3.2/USABILITY_LANE_STATUS.json',
);
const OWNER_FILE = '.usability-study-kit-owner.json';
const OWNER_SCHEMA =
  'activation-energy-studio/observed-usability-study-kit-owner/v1';
const MANIFEST_SCHEMA =
  'activation-energy-studio/observed-usability-study-kit/v1';
const LANE_STATUS_SCHEMA =
  'activation-energy-studio/usability-external-validation-lane-status/v1';
const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z');
const CANDIDATE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const CANDIDATE_BYTES = 2_503_952;
const FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';
const FIXTURE_MANIFEST_SHA256 =
  '14f2e715578886139c63637300e3daa5ef544ff4a83226783ef0877159cd8e99';
const GATE_IDS = ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'];
const SECOND_RATER_METHOD = 'SHA256_SEEDED_ASC_V1';
const SECOND_RATER_SEED = 'UX-v0.3.2-five-user-second-rater-v1';

const SOURCE_PATHS = Object.freeze({
  candidate: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
  releaseManifest: 'release/v0.3.2/MANIFEST.v0.3.2.json',
  releaseChecksums: 'release/v0.3.2/SHA256SUMS.v0.3.2.txt',
  reportSchema: 'release/v0.3.2/project-report.schema.json',
  freeze: 'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
  freezeSidecar: 'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
  criteria:
    'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
  protocol:
    'docs/technical-english/USABILITY_VALIDATION_PROTOCOL_v0.3.2.md',
  recorderCore: 'scripts/record-usability-study.mjs',
  recorderV032: 'scripts/record-usability-study-v0.3.2.mjs',
  verifier: 'scripts/verify-usability-study-kit-v0.3.2.mjs',
});

const DOCUMENT_SOURCES = [
  ['docs/usability-v0.3.2/README-FIRST.md', 'README-FIRST.md', 'handoff_readme'],
  [SOURCE_PATHS.protocol, 'PROTOCOL.md', 'normative_protocol'],
  ['docs/usability-v0.3.2/MODERATOR-SCRIPT.md', 'MODERATOR-SCRIPT.md', 'moderator_script'],
  ['docs/usability-v0.3.2/SECOND-RATER-GUIDE.md', 'SECOND-RATER-GUIDE.md', 'second_rater_guide'],
  ['docs/usability-v0.3.2/HUMAN-EVIDENCE-AUDIT.md', 'HUMAN-EVIDENCE-AUDIT.md', 'human_evidence_audit'],
  ['docs/usability-v0.3.2/RETURN-CHECKLIST.md', 'RETURN-CHECKLIST.md', 'return_checklist'],
  ['docs/usability-v0.3.2/UX-CONSENT-v1.md', 'UX-CONSENT-v1.md', 'consent_requirements'],
  ['docs/usability-v0.3.2/RECRUITMENT-SCREENING.md', 'RECRUITMENT-SCREENING.md', 'recruitment_screening'],
];

const HISTORICAL_LOCKS = Object.freeze([
  {
    role: 'v0.3.1-release-html',
    path: 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
    bytes: 2_490_589,
    sha256: 'e9750c6a7cae1aafe970094567736c042512daddcd35d67e4b17ffea3bc72587',
  },
  {
    role: 'v0.3.1-release-manifest',
    path: 'release/v0.3.1/MANIFEST.v0.3.1.json',
    sha256: '72056e404fc0de538c1979f847a42245ecd9046c705b5610812dad70ffd9f20c',
  },
  {
    role: 'v0.3.1-release-checksums',
    path: 'release/v0.3.1/SHA256SUMS.v0.3.1.txt',
    sha256: 'a4c4ce64817aa35b21b27fdf960d40f81b11059e2835a12d930e4921af9c9de3',
  },
  {
    role: 'v0.3.1-usability-fixture-manifest',
    path: 'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json',
    sha256: '700e3af9001890c4b8635cf8f25ed4f1c17c1c43ad5980e25b0a461ef6a3dd8d',
  },
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readProject(relativePath) {
  const path = resolve(PROJECT_ROOT, relativePath);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Required usability-kit source is missing: ${relativePath}`);
  }
  return readFileSync(path);
}

function verifyHistoricalLocks() {
  for (const lock of HISTORICAL_LOCKS) {
    const bytes = readProject(lock.path);
    if (
      (lock.bytes !== undefined && bytes.byteLength !== lock.bytes) ||
      sha256(bytes) !== lock.sha256
    ) {
      throw new Error(`Historical lock changed: ${lock.path}`);
    }
  }
}

function add(payload, path, bytes, role) {
  if (!/^[a-z0-9_]+$/.test(role)) throw new Error(`Invalid payload role: ${role}`);
  if (payload.has(path)) throw new Error(`Duplicate payload path: ${path}`);
  payload.set(path, {
    bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
    role,
  });
}

function deterministicSecondRaterScenarioIds() {
  const scenarioIds = Array.from({ length: 5 }, (_, participantIndex) =>
    Array.from(
      { length: 5 },
      (_, refusalIndex) => `P0${participantIndex + 1}:R${refusalIndex + 1}`,
    ),
  ).flat();
  return scenarioIds
    .map((scenarioId) => ({
      scenarioId,
      digest: sha256(Buffer.from(`${SECOND_RATER_SEED}\0${scenarioId}`, 'utf8')),
    }))
    .sort(
      (a, b) =>
        a.digest.localeCompare(b.digest) || a.scenarioId.localeCompare(b.scenarioId),
    )
    .slice(0, 10)
    .map((item) => item.scenarioId);
}

function participantTemplate(participantId, fixtureManifestSha256) {
  const offset = Number(participantId.slice(1)) - 1;
  const refusalCodes = {
    R1: 'INSUFFICIENT_DISTINCT_HEATING_RATES',
    R2: 'NO_COMMON_ALPHA_RANGE',
    R3: 'NON_MONOTONIC_ALPHA',
    R4: 'INCONSISTENT_CONTEXT',
    R5: 'NONLINEAR_HEATING_UNSUPPORTED',
  };
  const order = Array.from({ length: 5 }, (_, index) => `R${((offset + index) % 5) + 1}`);
  const zeroSha = '0'.repeat(64);
  return {
    schemaVersion: 'activation-energy-studio/usability-participant-record/v1',
    studyId: 'UX-v0.3.2-YYYYMMDD',
    participantId,
    evidenceOrigin: 'NOT_OBSERVED_TEMPLATE',
    eligibility: {
      eligible: null,
      quantitativeField: null,
      csvXlsxAndPlotLiteracy: null,
      tgaExperience: 'REPLACE_WITH_none_OR_basic',
      routineKineticsLastTwoYears: null,
      productContributor: null,
      technicalEnglishReading: null,
      priorParticipantExposure: null,
      excludedReason: null,
    },
    consent: {
      version: 'UX-CONSENT-v1',
      signedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      recording: null,
      signedConsentReference: `REPLACE_WITH_CONSENT_REFERENCE_${participantId}`,
    },
    observationSession: {
      sessionId: `SESSION-${participantId}-REPLACE_WITH_LOCAL_ID`,
      captureMode: 'LIVE_MODERATED_OBSERVATION',
      observerPresent: null,
      recordingsCreatedDuringSession: null,
      generatedOrSyntheticParticipantEvidenceUsed: null,
      startedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      endedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      screenRecordingDurationSeconds: null,
      audioRecordingDurationSeconds: null,
    },
    environment: {
      os: 'REPLACE_WITH_OBSERVED_OS',
      browser: 'REPLACE_WITH_OBSERVED_BROWSER',
      zoomPercent: 100,
      networkOff: true,
    },
    build: {
      path: 'build/Activation-Energy-Studio-v0.3.2.html',
      bytes: CANDIDATE_BYTES,
      sha256: CANDIDATE_SHA256,
    },
    fixtureManifestSha256,
    happyPath: {
      startedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      endedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      completed: null,
      macroDecisionCount: null,
      semanticUiActivations: null,
      rawPointerClicks: null,
      osPickerClicks: null,
      rescues: null,
      formulaUsed: null,
      exportPath: `REPLACE_WITH_${participantId}_PDF_PATH`,
      exportSha256: zeroSha,
      openedSuccessfully: null,
    },
    refusals: order.map((fixtureId) => ({
      fixtureId,
      targetCode: refusalCodes[fixtureId],
      visible: null,
      problemScore: null,
      riskScore: null,
      actionScore: null,
      verbatimAnswer: 'REPLACE_WITH_VERBATIM_FIRST_RESPONSE',
      recordingTimecode: {
        screenRecordingSha256: zeroSha,
        audioRecordingSha256: zeroSha,
        startSeconds: null,
        endSeconds: null,
      },
    })),
    comprehension: {
      verbatimAnswer: 'REPLACE_WITH_VERBATIM_FIRST_RESPONSE',
      score: null,
      hintGiven: null,
      rubric: {
        notSameResult: null,
        eaAlphaIsConversionProfile: null,
        kissingerIsPeakSpecific: null,
        notInterchangeable: null,
      },
      recordingTimecode: {
        screenRecordingSha256: zeroSha,
        audioRecordingSha256: zeroSha,
        startSeconds: null,
        endSeconds: null,
      },
    },
    deviations: [],
    evidence: [
      {
        kind: 'screen-recording',
        path: `REPLACE_WITH_${participantId}_SCREEN_RECORDING_PATH`,
        sha256: zeroSha,
      },
      {
        kind: 'audio-recording',
        path: `REPLACE_WITH_${participantId}_AUDIO_RECORDING_PATH`,
        sha256: zeroSha,
      },
    ],
    observer: 'REPLACE_WITH_PRIMARY_OBSERVER_ID',
    scoredAt: 'REPLACE_WITH_UTC_TIMESTAMP',
  };
}

function studyInputTemplate(fixtureManifestSha256) {
  const warnings = {
    W1: 'LIMITED_HEATING_RATES',
    W2: 'NUMERICAL_DERIVATIVE',
    W3: 'LOW_R2',
    W4: 'MULTISTEP_EA_VARIATION',
  };
  const selectedScenarioIds = deterministicSecondRaterScenarioIds();
  return {
    schemaVersion: 'activation-energy-studio/usability-study-input/v1',
    studyId: 'UX-v0.3.2-YYYYMMDD',
    studyVersion: 'UX-v0.3.2',
    executionState: 'NOT_RUN_TEMPLATE',
    evidenceOrigin: 'not-collected',
    candidateFreeze: {
      path: 'locks/CANDIDATE_FREEZE.json',
      sha256: FREEZE_SHA256,
    },
    fixtureManifest: {
      path: 'fixtures/UX_FIXTURE_MANIFEST.json',
      sha256: fixtureManifestSha256,
    },
    build: {
      path: 'build/Activation-Energy-Studio-v0.3.2.html',
      sha256: CANDIDATE_SHA256,
    },
    participantRecords: Array.from(
      { length: 5 },
      (_, index) => `participants/P0${index + 1}.template.json`,
    ),
    excludedSessions: [],
    secondRaterSelection: {
      seed: SECOND_RATER_SEED,
      method: SECOND_RATER_METHOD,
      selectedScenarioIds,
    },
    secondRaterRatings: selectedScenarioIds.map((scenarioId) => {
      const [participantId, fixtureId] = scenarioId.split(':');
      return {
        participantId,
        fixtureId,
        blind: null,
        raterId: 'REPLACE_WITH_SECOND_RATER_ID',
        problemScore: null,
        riskScore: null,
        actionScore: null,
      };
    }),
    warningMatrix: Object.entries(warnings).flatMap(([fixtureId, targetCode]) =>
      ['UI', 'PDF'].map((surface) => ({
        fixtureId,
        targetCode,
        surface,
        visible: null,
        evidence: {
          path: `REPLACE_WITH_${fixtureId}_${surface}_EVIDENCE_PATH`,
          sha256: '0'.repeat(64),
        },
      })),
    ),
    coordinator: {
      observerId: 'REPLACE_WITH_COORDINATOR_ID',
      finalizedAt: 'REPLACE_WITH_UTC_TIMESTAMP',
      declarationAccepted: null,
      signedRecordReference: 'REPLACE_WITH_COORDINATOR_SIGNED_RECORD_REFERENCE',
      evidenceDeclaration: {
        fiveSessionsObservedLive: null,
        recordingsCreatedDuringSessions: null,
        generatedOrSyntheticParticipantEvidenceUsed: null,
      },
      humanEvidenceAudit: {
        status: 'NOT_PERFORMED',
        auditorId: null,
        signedRecordReference: null,
      },
      acceptanceGateApplied: false,
    },
  };
}

function ownerBytes() {
  return jsonBytes({ schemaVersion: OWNER_SCHEMA, releaseVersion: '0.3.2' });
}

function buildPackagePlan() {
  verifyHistoricalLocks();
  const fixtureBundle = buildUsabilityV032FixtureBundle(PROJECT_ROOT);
  const fixtureManifestBytes = Buffer.from(
    fixtureBundle.files.get(UX_V032_FIXTURE_MANIFEST_PATH),
    'utf8',
  );
  const fixtureManifestSha256 = sha256(fixtureManifestBytes);
  if (fixtureManifestSha256 !== FIXTURE_MANIFEST_SHA256) {
    throw new Error(
      'Generated fixture manifest does not match the canonical v0.3.2 fixture-manifest lock.',
    );
  }
  const payload = new Map();
  add(payload, OWNER_FILE, ownerBytes(), 'ownership_marker');

  for (const [source, destination, role] of DOCUMENT_SOURCES) {
    add(payload, destination, readProject(source), role);
  }
  add(
    payload,
    'build/Activation-Energy-Studio-v0.3.2.html',
    readProject(SOURCE_PATHS.candidate),
    'locked_candidate_html',
  );
  add(
    payload,
    'build/MANIFEST.v0.3.2.json',
    readProject(SOURCE_PATHS.releaseManifest),
    'release_manifest',
  );
  add(
    payload,
    'build/SHA256SUMS.v0.3.2.txt',
    readProject(SOURCE_PATHS.releaseChecksums),
    'release_checksum_index',
  );
  add(
    payload,
    'build/project-report.schema.json',
    readProject(SOURCE_PATHS.reportSchema),
    'report_schema',
  );
  add(
    payload,
    'locks/CANDIDATE_FREEZE.json',
    readProject(SOURCE_PATHS.freeze),
    'candidate_freeze',
  );
  add(
    payload,
    'locks/CANDIDATE_FREEZE.sha256',
    readProject(SOURCE_PATHS.freezeSidecar),
    'candidate_freeze_checksum',
  );
  add(
    payload,
    'locks/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
    readProject(SOURCE_PATHS.criteria),
    'external_gate_acceptance_criteria',
  );
  add(
    payload,
    'tools/record-usability-study.mjs',
    readProject(SOURCE_PATHS.recorderCore),
    'usability_recorder_core',
  );
  add(
    payload,
    'tools/record-usability-study-v0.3.2.mjs',
    readProject(SOURCE_PATHS.recorderV032),
    'v032_usability_recorder',
  );
  add(
    payload,
    'VERIFY-KIT.mjs',
    readProject(SOURCE_PATHS.verifier),
    'standalone_kit_verifier',
  );

  add(
    payload,
    'fixtures/UX_FIXTURE_MANIFEST.json',
    fixtureManifestBytes,
    'fixture_manifest',
  );
  for (const fixture of fixtureBundle.manifest.fixtures) {
    const fileName = fixture.path.replace(/^study_bundle\//, '');
    const projectPath = `evidence/usability/v0.3.2/study_bundle/${fileName}`;
    const content = fixtureBundle.files.get(projectPath);
    if (content === undefined) throw new Error(`Missing v0.3.2 fixture ${fileName}.`);
    add(
      payload,
      `fixtures/study_bundle/${fileName}`,
      Buffer.from(content, 'utf8'),
      'synthetic_usability_fixture',
    );
  }

  for (let index = 1; index <= 5; index += 1) {
    const participantId = `P0${index}`;
    add(
      payload,
      `participants/${participantId}.template.json`,
      jsonBytes(participantTemplate(participantId, fixtureManifestSha256)),
      'non_evidence_participant_template',
    );
  }
  add(
    payload,
    'study-input.template.json',
    jsonBytes(studyInputTemplate(fixtureManifestSha256)),
    'non_evidence_study_input_template',
  );
  const studyStatus = {
    schemaVersion: 'activation-energy-studio/usability-study-readiness/v1',
    releaseVersion: '0.3.2',
    gateIds: GATE_IDS,
    candidateSha256: CANDIDATE_SHA256,
    candidateFreezeSha256: FREEZE_SHA256,
    fixtureManifestSha256,
    technicalReadiness: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
    participantCount: 0,
    observedSessionCount: 0,
    humanEvidenceAuditStatus: 'NOT_PERFORMED',
    externalEvidenceComplete: false,
    gates: GATE_IDS.map((id) => ({ id, status: 'EXTERNAL_OPEN' })),
    boundary:
      'This package contains protocols, locks, synthetic task inputs, and non-evidence templates. It contains no participant observation and closes no usability gate.',
  };
  add(payload, 'STUDY_STATUS.json', jsonBytes(studyStatus), 'not_run_study_status');

  const checksumEntries = [...payload.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, item]) => `${sha256(item.bytes)}  ${path}`);
  add(
    payload,
    'BUNDLE_PAYLOAD_SHA256SUMS.txt',
    Buffer.from(`${checksumEntries.join('\n')}\n`, 'utf8'),
    'payload_checksum_index',
  );

  const files = [...payload.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, item]) => ({
      path,
      role: item.role,
      bytes: item.bytes.byteLength,
      sha256: sha256(item.bytes),
    }));
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA,
    kit: {
      name: KIT_NAME,
      releaseVersion: '0.3.2',
      archiveRoot: KIT_NAME,
    },
    gateIds: GATE_IDS,
    candidate: {
      path: 'build/Activation-Energy-Studio-v0.3.2.html',
      bytes: CANDIDATE_BYTES,
      sha256: CANDIDATE_SHA256,
    },
    candidateFreeze: {
      path: 'locks/CANDIDATE_FREEZE.json',
      bytes: readProject(SOURCE_PATHS.freeze).byteLength,
      sha256: FREEZE_SHA256,
    },
    acceptanceCriteria: {
      path: 'locks/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
      bytes: readProject(SOURCE_PATHS.criteria).byteLength,
      sha256: CRITERIA_SHA256,
    },
    fixtureManifest: {
      path: 'fixtures/UX_FIXTURE_MANIFEST.json',
      bytes: fixtureManifestBytes.byteLength,
      sha256: fixtureManifestSha256,
    },
    historicalV031Preservation: HISTORICAL_LOCKS,
    technicalReadiness: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
    participantCount: 0,
    observedSessionCount: 0,
    humanEvidenceAuditStatus: 'NOT_PERFORMED',
    externalEvidenceComplete: false,
    gates: GATE_IDS.map((id) => ({ id, status: 'EXTERNAL_OPEN' })),
    generation: {
      deterministic: true,
      generatedAtOmitted: true,
      fixedZipMtime: FIXED_ZIP_TIME.toISOString(),
    },
    boundary:
      'Technical readiness is not observed-usability evidence. Five genuine sessions, retained media, independent content audit, and external adjudication remain required.',
    files,
  };
  const manifestBytes = jsonBytes(manifest);
  const manifestShaBytes = Buffer.from(
    `${sha256(manifestBytes)}  BUNDLE_MANIFEST.json\n`,
    'utf8',
  );
  const allFiles = new Map(payload);
  allFiles.set('BUNDLE_MANIFEST.json', {
    bytes: manifestBytes,
    role: 'bundle_manifest',
  });
  allFiles.set('BUNDLE_MANIFEST.sha256', {
    bytes: manifestShaBytes,
    role: 'bundle_manifest_checksum',
  });

  const zipInput = {};
  for (const [path, item] of [...allFiles.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    zipInput[`${KIT_NAME}/${path}`] = [
      new Uint8Array(item.bytes),
      { level: 6, mtime: FIXED_ZIP_TIME },
    ];
  }
  const archiveBytes = Buffer.from(zipSync(zipInput, { level: 6 }));
  const laneStatus = {
    schemaVersion: LANE_STATUS_SCHEMA,
    releaseVersion: '0.3.2',
    lane: 'observed-usability',
    gateIds: GATE_IDS,
    candidate: {
      path: SOURCE_PATHS.candidate,
      bytes: CANDIDATE_BYTES,
      sha256: CANDIDATE_SHA256,
    },
    candidateFreeze: {
      path: SOURCE_PATHS.freeze,
      sha256: FREEZE_SHA256,
    },
    acceptanceCriteria: {
      path: SOURCE_PATHS.criteria,
      sha256: CRITERIA_SHA256,
    },
    fixtureManifest: {
      path: UX_V032_FIXTURE_MANIFEST_PATH,
      bytes: fixtureManifestBytes.byteLength,
      sha256: fixtureManifestSha256,
      fixtureCount: fixtureBundle.manifest.fixtures.length,
    },
    package: {
      directory: relative(PROJECT_ROOT, OUTPUT_DIRECTORY),
      bundleManifestSha256: sha256(manifestBytes),
      archive: relative(PROJECT_ROOT, ARCHIVE_PATH),
      archiveBytes: archiveBytes.byteLength,
      archiveSha256: sha256(archiveBytes),
    },
    technicalReadiness: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
    technicalInfrastructureReady: true,
    participantCount: 0,
    observedSessionCount: 0,
    humanEvidenceAuditStatus: 'NOT_PERFORMED',
    externalEvidenceComplete: false,
    gates: GATE_IDS.map((id) => ({ id, status: 'EXTERNAL_OPEN' })),
    historicalV031Preserved: true,
    historicalV031Locks: HISTORICAL_LOCKS,
    openHumanRequirements: [
      'Recruit and retain exactly five eligible independent participants.',
      'Run five live moderated sessions on the frozen v0.3.2 candidate.',
      'Retain and hash separate screen and audio recordings for every session.',
      'Collect ten deterministic blind second ratings and eight warning-visibility artifacts.',
      'Complete an independent human media/content audit and signed adjudication.',
    ],
    boundary:
      'The v0.3.2 usability infrastructure is technically ready, but no human session or human audit evidence exists. AC-UX-01 through AC-UX-04 remain EXTERNAL_OPEN.',
  };
  return {
    payload: allFiles,
    manifest,
    manifestBytes,
    manifestSha256: sha256(manifestBytes),
    archiveBytes,
    archiveSha256: sha256(archiveBytes),
    laneStatus,
    laneStatusBytes: jsonBytes(laneStatus),
    fixtureBundle,
  };
}

function assertOwnedOutput() {
  if (!existsSync(OUTPUT_DIRECTORY)) return;
  const markerPath = resolve(OUTPUT_DIRECTORY, OWNER_FILE);
  if (!existsSync(markerPath) || !readFileSync(markerPath).equals(ownerBytes())) {
    throw new Error(`Refusing to replace unowned output directory: ${OUTPUT_DIRECTORY}`);
  }
}

function writePackage(plan) {
  assertOwnedOutput();
  if (existsSync(OUTPUT_DIRECTORY)) {
    rmSync(OUTPUT_DIRECTORY, { recursive: true, force: false });
  }
  for (const [relativePath, item] of plan.payload) {
    const path = resolve(OUTPUT_DIRECTORY, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, item.bytes);
  }
  writeFileSync(ARCHIVE_PATH, plan.archiveBytes);
  writeFileSync(
    ARCHIVE_SHA_PATH,
    `${plan.archiveSha256}  ${KIT_NAME}.zip\n`,
  );
  mkdirSync(dirname(LANE_STATUS_PATH), { recursive: true });
  writeFileSync(LANE_STATUS_PATH, plan.laneStatusBytes);
}

function walkFiles(directory, current = directory) {
  const result = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(directory, path));
    else if (entry.isFile()) result.push(relative(directory, path).split(sep).join('/'));
    else throw new Error(`Unsupported output entry: ${path}`);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function checkPackage(plan) {
  checkUsabilityV032FixtureBundle(PROJECT_ROOT);
  if (!existsSync(OUTPUT_DIRECTORY)) throw new Error('Usability study package is missing.');
  const actualPaths = walkFiles(OUTPUT_DIRECTORY);
  const expectedPaths = [...plan.payload.keys()].sort((a, b) => a.localeCompare(b));
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    throw new Error('Usability study package file inventory is stale.');
  }
  for (const [relativePath, item] of plan.payload) {
    const actual = readFileSync(resolve(OUTPUT_DIRECTORY, relativePath));
    if (!actual.equals(item.bytes)) throw new Error(`Stale package file: ${relativePath}`);
  }
  if (!readFileSync(ARCHIVE_PATH).equals(plan.archiveBytes)) {
    throw new Error('Usability study package archive is stale.');
  }
  if (
    readFileSync(ARCHIVE_SHA_PATH, 'utf8') !==
    `${plan.archiveSha256}  ${KIT_NAME}.zip\n`
  ) {
    throw new Error('Usability study package archive sidecar is stale.');
  }
  if (!readFileSync(LANE_STATUS_PATH).equals(plan.laneStatusBytes)) {
    throw new Error('Usability lane status is stale.');
  }
  verifyUsabilityV032StudyKit(OUTPUT_DIRECTORY);
}

export function writeUsabilityV032StudyKit() {
  writeUsabilityV032FixtureBundle(PROJECT_ROOT);
  const plan = buildPackagePlan();
  writePackage(plan);
  verifyUsabilityV032StudyKit(OUTPUT_DIRECTORY);
  return plan;
}

export function checkUsabilityV032StudyKit() {
  const plan = buildPackagePlan();
  checkPackage(plan);
  return plan;
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--check')) {
    throw new Error(
      'Usage: node scripts/generate-usability-study-kit-v0.3.2.mjs [--check]',
    );
  }
  const plan = args[0] === '--check'
    ? checkUsabilityV032StudyKit()
    : writeUsabilityV032StudyKit();
  console.log(
    `${args[0] === '--check' ? 'TECHNICAL_OK UX_V032_STUDY_KIT_CURRENT' : 'WROTE UX_V032_STUDY_KIT'} files=${plan.manifest.files.length} candidateSha256=${CANDIDATE_SHA256} fixtureManifestSha256=${plan.manifest.fixtureManifest.sha256} bundleManifestSha256=${plan.manifestSha256} archiveSha256=${plan.archiveSha256} participantCount=0 technicalReadiness=READY_FOR_OBSERVED_SESSIONS_NOT_RUN externalEvidenceComplete=false`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `FAIL UX_V032_STUDY_KIT_GENERATION ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
