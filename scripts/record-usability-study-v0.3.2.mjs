#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createUsabilityStudyEvidenceForVersion,
  serializeUsabilityStudyEvidence,
} from './record-usability-study.mjs';

export const UX_V032_STUDY_VERSION = 'UX-v0.3.2';
export const UX_V032_GATE_IDS = Object.freeze([
  'AC-UX-01',
  'AC-UX-02',
  'AC-UX-03',
  'AC-UX-04',
]);
export const UX_V032_CANDIDATE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
export const UX_V032_CANDIDATE_BYTES = 2_503_952;
export const UX_V032_CANDIDATE_FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
export const UX_V032_ACCEPTANCE_CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';
export const UX_V032_FIXTURE_MANIFEST_SHA256 =
  '14f2e715578886139c63637300e3daa5ef544ff4a83226783ef0877159cd8e99';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXACT_PARTICIPANT_IDS = ['P01', 'P02', 'P03', 'P04', 'P05'];
const OBSERVATION_MODE = 'LIVE_MODERATED_OBSERVATION';
const EXECUTION_STATE = 'OBSERVED_SESSIONS_COMPLETED';
const PLACEHOLDER_PATTERN =
  /(?:REPLACE|PLACEHOLDER|TEMPLATE|PXX|YYYYMMDD|NOT[_ -]?RUN|TO[_ -]?BE[_ -]?(?:RECORDED|COMPLETED))/iu;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number.`);
  }
  return value;
}

function isoTimestamp(value, label) {
  const text = string(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) ||
    !Number.isFinite(Date.parse(text))
  ) {
    fail(`${label} must be a valid explicit UTC ISO-8601 timestamp.`);
  }
  return text;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectedSha(value, label) {
  const digest = string(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    fail(`${label} must be a SHA-256 hex digest.`);
  }
  return digest;
}

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  return object(value, label);
}

function resolveConfined(baseDir, candidate, label) {
  const text = string(candidate, label);
  const path = isAbsolute(text) ? resolve(text) : resolve(baseDir, text);
  const rel = relative(baseDir, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail(`${label} escapes the study directory.`);
  }
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  return path;
}

function resolveStudyOrProject(studyDir, candidate, label) {
  const text = string(candidate, label);
  if (isAbsolute(text)) {
    if (!existsSync(text)) fail(`${label} does not exist: ${text}`);
    return resolve(text);
  }
  const studyPath = resolve(studyDir, text);
  if (existsSync(studyPath)) return studyPath;
  const projectPath = resolve(PROJECT_ROOT, text);
  if (existsSync(projectPath)) return projectPath;
  fail(`${label} does not exist in the study package or project: ${text}`);
}

function assertNoPlaceholder(value, label) {
  const text = string(value, label);
  if (PLACEHOLDER_PATTERN.test(text)) {
    fail(`${label} still contains a non-observation placeholder.`);
  }
  return text;
}

function validateCandidateFreeze(input, studyDir) {
  const descriptor = object(input.candidateFreeze, 'candidateFreeze');
  const path = resolveStudyOrProject(studyDir, descriptor.path, 'candidateFreeze.path');
  const bytes = readFileSync(path);
  const actualSha256 = sha256(bytes);
  const declaredSha256 = expectedSha(descriptor.sha256, 'candidateFreeze.sha256');
  if (actualSha256 !== declaredSha256) fail('Candidate freeze hash mismatch.');
  if (actualSha256 !== UX_V032_CANDIDATE_FREEZE_SHA256) {
    fail('Candidate freeze is not the exact v0.3.2 external-validation freeze.');
  }
  const freeze = readJson(path, 'candidate freeze');
  if (
    freeze.schemaVersion !==
      'activation-energy-studio/external-validation-candidate-freeze/v1' ||
    freeze.releaseVersion !== '0.3.2' ||
    freeze.status !== 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS'
  ) {
    fail('Candidate freeze identity or state is invalid.');
  }
  if (
    freeze.candidate?.sha256 !== UX_V032_CANDIDATE_SHA256 ||
    freeze.candidate?.bytes !== UX_V032_CANDIDATE_BYTES
  ) {
    fail('Candidate freeze release identity is invalid.');
  }
  const criteria = freeze.boundArtifacts?.find(
    (artifact) => artifact.role === 'external-gate-acceptance-criteria',
  );
  if (criteria?.sha256 !== UX_V032_ACCEPTANCE_CRITERIA_SHA256) {
    fail('Candidate freeze acceptance-criteria lock is invalid.');
  }
  const uxGates = (freeze.externalGateBaseline ?? [])
    .filter((gate) => UX_V032_GATE_IDS.includes(gate.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    uxGates.length !== 4 ||
    uxGates.some(
      (gate, index) =>
        gate.id !== UX_V032_GATE_IDS[index] ||
        gate.lane !== 'observed-usability' ||
        gate.status !== 'EXTERNAL_OPEN',
    )
  ) {
    fail('Candidate freeze does not preserve all four usability gates as EXTERNAL_OPEN.');
  }
  if (
    freeze.integrityPolicy?.syntheticHumanOrDeviceEvidenceAllowed !== false ||
    freeze.integrityPolicy?.historicalEvidenceRelabelingAllowed !== false ||
    freeze.integrityPolicy?.selfSignedExternalEvidenceAllowed !== false
  ) {
    fail('Candidate freeze anti-fabrication policy is not fail-closed.');
  }
  return {
    path: relative(PROJECT_ROOT, path),
    bytes: bytes.byteLength,
    sha256: actualSha256,
  };
}

function refusalOrderForParticipant(participantId) {
  const offset = Number(participantId.slice(1)) - 1;
  return Array.from({ length: 5 }, (_, index) => `R${((offset + index) % 5) + 1}`);
}

function validateCanonicalFixturePayloads(fixtureManifest, fixtureManifestPath) {
  const fixtures = array(fixtureManifest.fixtures, 'fixtureManifest.fixtures');
  if (fixtures.length !== 11) {
    fail('Canonical fixture manifest must contain exactly eleven fixture payloads.');
  }
  const fixtureRoot = dirname(fixtureManifestPath);
  const seenIds = new Set();
  const retained = [];
  for (const [index, fixtureValue] of fixtures.entries()) {
    const fixture = object(fixtureValue, `fixtureManifest.fixtures[${index}]`);
    const id = string(fixture.id, `fixtureManifest.fixtures[${index}].id`);
    if (seenIds.has(id)) fail(`Canonical fixture manifest repeats ${id}.`);
    seenIds.add(id);
    const payloadPath = resolveConfined(
      fixtureRoot,
      fixture.path,
      `fixtureManifest fixture ${id}.path`,
    );
    const payloadBytes = readFileSync(payloadPath);
    if (!Number.isInteger(fixture.bytes) || fixture.bytes <= 0) {
      fail(`fixtureManifest fixture ${id}.bytes must be a positive integer.`);
    }
    const declaredSha256 = expectedSha(
      fixture.sha256,
      `fixtureManifest fixture ${id}.sha256`,
    );
    const actualSha256 = sha256(payloadBytes);
    if (
      payloadBytes.byteLength !== fixture.bytes ||
      actualSha256 !== declaredSha256
    ) {
      fail(`Canonical fixture payload ${id} byte count or SHA-256 mismatch.`);
    }
    retained.push({
      id,
      path: relative(PROJECT_ROOT, payloadPath),
      bytes: payloadBytes.byteLength,
      sha256: actualSha256,
    });
  }
  const expectedIds = [
    'UX01',
    'R1',
    'R2',
    'R3',
    'R4',
    'R5',
    'C1',
    'W1',
    'W2',
    'W3',
    'W4',
  ];
  if (
    [...seenIds].sort().join(',') !== [...expectedIds].sort().join(',')
  ) {
    fail('Canonical fixture payload IDs are incomplete or unexpected.');
  }
  return retained;
}

function validateObservationSession(record, participantId) {
  if (record.evidenceOrigin !== 'observed-human-session') {
    fail(`${participantId}.evidenceOrigin must be observed-human-session.`);
  }
  const session = object(record.observationSession, `${participantId}.observationSession`);
  const sessionId = assertNoPlaceholder(session.sessionId, `${participantId}.observationSession.sessionId`);
  if (!new RegExp(`^SESSION-${participantId}-[A-Za-z0-9._-]+$`).test(sessionId)) {
    fail(`${participantId}.observationSession.sessionId must begin SESSION-${participantId}-.`);
  }
  if (session.captureMode !== OBSERVATION_MODE) {
    fail(`${participantId}.observationSession.captureMode must be ${OBSERVATION_MODE}.`);
  }
  if (bool(session.observerPresent, `${participantId}.observationSession.observerPresent`) !== true) {
    fail(`${participantId} was not declared as live-observed.`);
  }
  if (
    bool(
      session.recordingsCreatedDuringSession,
      `${participantId}.observationSession.recordingsCreatedDuringSession`,
    ) !== true
  ) {
    fail(`${participantId} recordings were not declared as session-created.`);
  }
  if (
    bool(
      session.generatedOrSyntheticParticipantEvidenceUsed,
      `${participantId}.observationSession.generatedOrSyntheticParticipantEvidenceUsed`,
    ) !== false
  ) {
    fail(`${participantId} declares generated or synthetic participant evidence.`);
  }
  const startedAt = isoTimestamp(session.startedAt, `${participantId}.observationSession.startedAt`);
  const endedAt = isoTimestamp(session.endedAt, `${participantId}.observationSession.endedAt`);
  if (Date.parse(endedAt) <= Date.parse(startedAt)) {
    fail(`${participantId} observation-session duration is invalid.`);
  }
  const screenDurationSeconds = finite(
    session.screenRecordingDurationSeconds,
    `${participantId}.observationSession.screenRecordingDurationSeconds`,
  );
  const audioDurationSeconds = finite(
    session.audioRecordingDurationSeconds,
    `${participantId}.observationSession.audioRecordingDurationSeconds`,
  );
  if (screenDurationSeconds <= 0 || audioDurationSeconds <= 0) {
    fail(`${participantId} declared recording durations must be positive.`);
  }

  const consentAt = Date.parse(record.consent?.signedAt);
  const happyStartedAt = Date.parse(record.happyPath?.startedAt);
  const happyEndedAt = Date.parse(record.happyPath?.endedAt);
  const scoredAt = Date.parse(record.scoredAt);
  if (
    ![consentAt, happyStartedAt, happyEndedAt, scoredAt].every(Number.isFinite) ||
    consentAt > Date.parse(startedAt) ||
    happyStartedAt < Date.parse(startedAt) ||
    happyEndedAt <= happyStartedAt ||
    happyEndedAt > Date.parse(endedAt) ||
    scoredAt < Date.parse(endedAt)
  ) {
    fail(`${participantId} consent/session/task/scoring chronology is inconsistent.`);
  }

  const refusalRows = array(record.refusals, `${participantId}.refusals`);
  const actualOrder = refusalRows.map((row, index) =>
    string(row?.fixtureId, `${participantId}.refusals[${index}].fixtureId`),
  );
  const expectedOrder = refusalOrderForParticipant(participantId);
  if (actualOrder.some((id, index) => id !== expectedOrder[index])) {
    fail(`${participantId} refusal order must be ${expectedOrder.join(',')}.`);
  }

  let maximumTimecode = 0;
  for (const [index, row] of refusalRows.entries()) {
    assertNoPlaceholder(
      row.verbatimAnswer,
      `${participantId}.refusals[${index}].verbatimAnswer`,
    );
    if (row.verbatimAnswer.trim().length < 12) {
      fail(`${participantId}.refusals[${index}].verbatimAnswer is too short for a retained verbatim response.`);
    }
    maximumTimecode = Math.max(
      maximumTimecode,
      finite(
        row.recordingTimecode?.endSeconds,
        `${participantId}.refusals[${index}].recordingTimecode.endSeconds`,
      ),
    );
  }
  assertNoPlaceholder(
    record.comprehension?.verbatimAnswer,
    `${participantId}.comprehension.verbatimAnswer`,
  );
  if (record.comprehension.verbatimAnswer.trim().length < 12) {
    fail(`${participantId}.comprehension.verbatimAnswer is too short for a retained verbatim response.`);
  }
  maximumTimecode = Math.max(
    maximumTimecode,
    finite(
      record.comprehension?.recordingTimecode?.endSeconds,
      `${participantId}.comprehension.recordingTimecode.endSeconds`,
    ),
  );
  if (
    maximumTimecode > screenDurationSeconds ||
    maximumTimecode > audioDurationSeconds
  ) {
    fail(`${participantId} task timecodes exceed a declared recording duration.`);
  }

  const evidence = array(record.evidence, `${participantId}.evidence`);
  const screen = evidence.find((item) => item?.kind === 'screen-recording');
  const audio = evidence.find((item) => item?.kind === 'audio-recording');
  if (!screen || !audio) {
    fail(`${participantId} must declare screen and audio recording artifacts.`);
  }
  return {
    participantId,
    sessionId,
    startedAt,
    endedAt,
    scoredAt: record.scoredAt,
    consentReference: assertNoPlaceholder(
      record.consent?.signedConsentReference,
      `${participantId}.consent.signedConsentReference`,
    ),
    screenRecordingSha256: expectedSha(
      screen.sha256,
      `${participantId}.screenRecording.sha256`,
    ),
    audioRecordingSha256: expectedSha(
      audio.sha256,
      `${participantId}.audioRecording.sha256`,
    ),
  };
}

export function validateUsabilityV032ObservedStudyInput(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const studyDir = dirname(absoluteManifest);
  const input = readJson(absoluteManifest, 'v0.3.2 usability study manifest');
  if (input.studyVersion !== UX_V032_STUDY_VERSION) {
    fail(`Study manifest must target ${UX_V032_STUDY_VERSION}.`);
  }
  if (input.executionState !== EXECUTION_STATE) {
    fail(`executionState must be ${EXECUTION_STATE}; a NOT_RUN template is not evidence.`);
  }
  if (input.evidenceOrigin !== 'observed-human-sessions') {
    fail('evidenceOrigin must be observed-human-sessions.');
  }
  if (!/^UX-v0\.3\.2-\d{8}$/.test(input.studyId ?? '')) {
    fail('studyId must match UX-v0.3.2-YYYYMMDD.');
  }

  const candidateFreeze = validateCandidateFreeze(input, studyDir);
  const build = object(input.build, 'build');
  if (
    expectedSha(build.sha256, 'build.sha256') !== UX_V032_CANDIDATE_SHA256
  ) {
    fail('Study build does not match the exact frozen v0.3.2 candidate SHA-256.');
  }
  const buildPath = resolveStudyOrProject(studyDir, build.path, 'build.path');
  const buildBytes = readFileSync(buildPath);
  if (
    buildBytes.byteLength !== UX_V032_CANDIDATE_BYTES ||
    sha256(buildBytes) !== UX_V032_CANDIDATE_SHA256
  ) {
    fail('Study build bytes do not match the exact frozen v0.3.2 candidate.');
  }

  const fixtureDescriptor = object(input.fixtureManifest, 'fixtureManifest');
  const fixturePath = resolveStudyOrProject(
    studyDir,
    fixtureDescriptor.path,
    'fixtureManifest.path',
  );
  const fixtureBytes = readFileSync(fixturePath);
  const actualFixtureManifestSha256 = sha256(fixtureBytes);
  if (
    actualFixtureManifestSha256 !==
    expectedSha(fixtureDescriptor.sha256, 'fixtureManifest.sha256')
  ) {
    fail('Fixture manifest hash mismatch.');
  }
  if (actualFixtureManifestSha256 !== UX_V032_FIXTURE_MANIFEST_SHA256) {
    fail(
      'Fixture manifest is not the exact canonical v0.3.2 usability fixture manifest.',
    );
  }
  const fixtureManifest = readJson(fixturePath, 'fixture manifest');
  if (
    fixtureManifest.studyVersion !== UX_V032_STUDY_VERSION ||
    fixtureManifest.release?.sha256 !== UX_V032_CANDIDATE_SHA256 ||
    fixtureManifest.candidateFreeze?.sha256 !==
      UX_V032_CANDIDATE_FREEZE_SHA256 ||
    fixtureManifest.acceptanceCriteria?.sha256 !==
      UX_V032_ACCEPTANCE_CRITERIA_SHA256
  ) {
    fail('Fixture manifest is not bound to the v0.3.2 candidate freeze and criteria.');
  }
  const fixturePayloads = validateCanonicalFixturePayloads(
    fixtureManifest,
    fixturePath,
  );

  const participantPaths = array(input.participantRecords, 'participantRecords');
  if (participantPaths.length !== 5) {
    fail('The v0.3.2 observed study requires exactly five retained participant records.');
  }
  const participantSummaries = participantPaths.map((candidate, index) => {
    const path = resolveConfined(studyDir, candidate, `participantRecords[${index}]`);
    const record = readJson(path, `participant record ${index + 1}`);
    return validateObservationSession(record, string(record.participantId, 'participantId'));
  });
  participantSummaries.sort((a, b) => a.participantId.localeCompare(b.participantId));
  if (
    participantSummaries.some(
      (participant, index) => participant.participantId !== EXACT_PARTICIPANT_IDS[index],
    )
  ) {
    fail('Retained participant IDs must be exactly P01 through P05.');
  }
  for (const [field, label] of [
    ['sessionId', 'observation session IDs'],
    ['consentReference', 'consent references'],
    ['screenRecordingSha256', 'screen recording hashes'],
    ['audioRecordingSha256', 'audio recording hashes'],
  ]) {
    const values = participantSummaries.map((item) => item[field]);
    if (new Set(values).size !== values.length) {
      fail(`All five ${label} must be unique.`);
    }
  }
  const allRecordingHashes = participantSummaries.flatMap((item) => [
    item.screenRecordingSha256,
    item.audioRecordingSha256,
  ]);
  if (new Set(allRecordingHashes).size !== allRecordingHashes.length) {
    fail('No retained recording artifact may be reused across participants or media kinds.');
  }

  const warningHashes = array(input.warningMatrix, 'warningMatrix').map(
    (item, index) =>
      expectedSha(item?.evidence?.sha256, `warningMatrix[${index}].evidence.sha256`),
  );
  if (warningHashes.length !== 8 || new Set(warningHashes).size !== 8) {
    fail('Warning matrix must bind eight distinct retained UI/PDF evidence artifacts.');
  }

  const coordinator = object(input.coordinator, 'coordinator');
  const declaration = object(
    coordinator.evidenceDeclaration,
    'coordinator.evidenceDeclaration',
  );
  if (
    bool(
      declaration.fiveSessionsObservedLive,
      'coordinator.evidenceDeclaration.fiveSessionsObservedLive',
    ) !== true ||
    bool(
      declaration.recordingsCreatedDuringSessions,
      'coordinator.evidenceDeclaration.recordingsCreatedDuringSessions',
    ) !== true ||
    bool(
      declaration.generatedOrSyntheticParticipantEvidenceUsed,
      'coordinator.evidenceDeclaration.generatedOrSyntheticParticipantEvidenceUsed',
    ) !== false
  ) {
    fail('Coordinator evidence declaration does not attest five genuine observed sessions.');
  }
  const humanAudit = object(coordinator.humanEvidenceAudit, 'coordinator.humanEvidenceAudit');
  if (
    humanAudit.status !== 'NOT_PERFORMED' ||
    humanAudit.auditorId !== null ||
    humanAudit.signedRecordReference !== null
  ) {
    fail('Initial recorder input must keep the independent human evidence audit NOT_PERFORMED.');
  }
  if (bool(coordinator.acceptanceGateApplied, 'coordinator.acceptanceGateApplied') !== false) {
    fail('Initial recorder input must not apply an acceptance gate.');
  }
  const finalizedAt = Date.parse(isoTimestamp(coordinator.finalizedAt, 'coordinator.finalizedAt'));
  if (
    participantSummaries.some(
      (participant) => finalizedAt < Date.parse(participant.scoredAt),
    )
  ) {
    fail('Coordinator finalization precedes participant scoring.');
  }
  assertNoPlaceholder(
    coordinator.signedRecordReference,
    'coordinator.signedRecordReference',
  );

  return {
    input,
    absoluteManifest,
    studyDir,
    candidateFreeze,
    fixtureManifest: {
      path: relative(PROJECT_ROOT, fixturePath),
      bytes: fixtureBytes.byteLength,
      sha256: sha256(fixtureBytes),
    },
    fixturePayloads,
    participants: participantSummaries,
  };
}

export function createUsabilityV032StudyEvidence(manifestPath) {
  const validation = validateUsabilityV032ObservedStudyInput(manifestPath);
  const record = createUsabilityStudyEvidenceForVersion(
    manifestPath,
    UX_V032_STUDY_VERSION,
  );
  if (record.cohort.retainedParticipantCount !== 5) {
    fail('Recorder did not retain exactly five participants.');
  }
  return {
    ...record,
    candidateFreeze: validation.candidateFreeze,
    antiFabricationControls: {
      exactFiveParticipantIds: true,
      distinctSessionIds: true,
      distinctConsentReferences: true,
      distinctRecordingHashesAcrossCohort: true,
      cyclicRefusalOrderVerified: true,
      timecodesWithinDeclaredRecordingDurations: true,
      canonicalFixtureManifestVerified: true,
      canonicalFixturePayloadsVerified: true,
      generatedOrSyntheticParticipantEvidenceDeclaredAbsent: true,
    },
    humanEvidenceAuditStatus: 'NOT_PERFORMED',
    externalEvidenceComplete: false,
    externalGateStatuses: Object.fromEntries(
      UX_V032_GATE_IDS.map((gateId) => [gateId, 'EXTERNAL_OPEN']),
    ),
    v032Boundary:
      'Automated threshold calculations and artifact hashes are not proof that recordings contain genuine observed sessions. AC-UX-01 through AC-UX-04 remain EXTERNAL_OPEN until an independent human content audit and external adjudication accept the retained evidence.',
  };
}

function parseArgs(argv) {
  const result = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      result.check = true;
    } else if (arg === '--manifest' || arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${arg} requires a path.`);
      result[arg.slice(2)] = value;
      index += 1;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  if (!result.manifest) fail('Missing --manifest <study-input.json>.');
  if (!result.output) fail('Missing --output <evidence-record.json>.');
  return result;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const record = createUsabilityV032StudyEvidence(args.manifest);
  const bytes = serializeUsabilityStudyEvidence(record);
  const output = resolve(args.output);
  if (args.check) {
    if (!existsSync(output)) fail(`Output record does not exist: ${output}`);
    if (readFileSync(output, 'utf8') !== bytes) {
      fail(`Output record is stale: ${output}`);
    }
    console.log(
      `TECHNICAL_OK UX_V032_OBSERVED_STUDY_RECORD_CURRENT participants=5 automatedThresholdDecision=${record.overallThresholdDecision} humanEvidenceAuditStatus=NOT_PERFORMED externalEvidenceComplete=false`,
    );
    return;
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  console.log(
    `TECHNICAL_OK UX_V032_OBSERVED_STUDY_RECORDED participants=5 automatedThresholdDecision=${record.overallThresholdDecision} humanEvidenceAuditStatus=NOT_PERFORMED externalEvidenceComplete=false`,
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
      `FAIL UX_V032_OBSERVED_STUDY ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
