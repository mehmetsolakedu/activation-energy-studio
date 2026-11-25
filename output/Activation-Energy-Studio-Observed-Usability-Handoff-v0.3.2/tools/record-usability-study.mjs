#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const INPUT_SCHEMA = 'activation-energy-studio/usability-study-input/v1';
export const PARTICIPANT_SCHEMA =
  'activation-energy-studio/usability-participant-record/v1';
export const OUTPUT_SCHEMA =
  'activation-energy-studio/usability-study-evidence-record/v1';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONSENT_VERSION = 'UX-CONSENT-v1';
const DEFAULT_STUDY_VERSION = 'UX-v0.3.1';
const EXPECTED_WARNING_SURFACES = ['UI', 'PDF'];
const SECOND_RATER_SELECTION_METHOD = 'SHA256_SEEDED_ASC_V1';
const UX01_EXPECTED_MACRO_DECISIONS = 5;
const UX01_MIN_SEMANTIC_UI_ACTIVATIONS = 11;
const UX01_MAX_SEMANTIC_UI_ACTIVATIONS = 15;
const RECORDING_RULES = {
  'screen-recording': {
    extensions: ['.m4v', '.mkv', '.mov', '.mp4', '.webm'],
    minimumBytes: 64 * 1024,
  },
  'audio-recording': {
    extensions: ['.aac', '.caf', '.flac', '.m4a', '.mp3', '.ogg', '.wav'],
    minimumBytes: 16 * 1024,
  },
};
const HUMAN_AUDIT_BOUNDARY =
  'This record verifies hashes, completeness, prespecified thresholds, separate screen/audio recording file extensions and minimum byte sizes, and task timecode bindings. It does not decode or authenticate media content, prove playable duration or captured audio/screen content, authenticate participant identity or consent, or prove observation truth; a human content audit of every retained recording remains required.';

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

function integer(value, label, min = 0) {
  if (!Number.isInteger(value) || value < min) {
    fail(`${label} must be an integer >= ${min}.`);
  }
  return value;
}

function binaryScore(value, label) {
  if (value !== 0 && value !== 1) fail(`${label} must be 0 or 1.`);
  return value;
}

function isoTimestamp(value, label) {
  const text = string(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text)) {
    fail(`${label} must be an explicit UTC ISO-8601 timestamp.`);
  }
  if (!Number.isFinite(Date.parse(text))) fail(`${label} is not a valid timestamp.`);
  return text;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function deterministicSecondRaterScenarioIds(seed, scenarioIds, requiredCount) {
  return scenarioIds
    .map((scenarioId) => ({
      scenarioId,
      digest: sha256Bytes(Buffer.from(`${seed}\0${scenarioId}`, 'utf8')),
    }))
    .sort(
      (a, b) =>
        a.digest.localeCompare(b.digest) || a.scenarioId.localeCompare(b.scenarioId),
    )
    .slice(0, requiredCount)
    .map((item) => item.scenarioId);
}

function expectedSha(value, label) {
  const digest = string(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) fail(`${label} must be a SHA-256 hex digest.`);
  return digest;
}

function readJson(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  return object(parsed, label);
}

function assertNoObviousPii(value, label, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoObviousPii(item, label, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:name|fullname|participantname|email|phone|telephone|address)$/i.test(key)) {
        fail(`${label}${path}.${key} is a forbidden personal-identity field.`);
      }
      assertNoObviousPii(item, label, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) {
    fail(`${label}${path} contains an email address; participant records must be de-identified.`);
  }
}

function resolveExisting(baseDir, candidate, label, confined = false) {
  const text = string(candidate, label);
  const path = isAbsolute(text) ? resolve(text) : resolve(baseDir, text);
  if (confined) {
    const rel = relative(baseDir, path);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
      fail(`${label} escapes its evidence directory.`);
    }
  }
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  return path;
}

function resolveProjectOrStudy(studyDir, candidate, label) {
  const text = string(candidate, label);
  if (isAbsolute(text)) return resolveExisting(studyDir, text, label);
  const projectCandidate = resolve(PROJECT_ROOT, text);
  if (existsSync(projectCandidate)) return projectCandidate;
  return resolveExisting(studyDir, text, label);
}

function verifyHashedFile(baseDir, descriptor, label, options = {}) {
  const item = object(descriptor, label);
  const path = resolveExisting(baseDir, item.path, `${label}.path`, options.confined ?? true);
  const expected = expectedSha(item.sha256, `${label}.sha256`);
  const actual = sha256File(path);
  if (actual !== expected) fail(`${label} hash mismatch: expected ${expected}, got ${actual}.`);
  const bytes = readFileSync(path);
  if (bytes.length === 0) fail(`${label} is empty.`);
  if (options.minimumBytes && bytes.length < options.minimumBytes) {
    fail(`${label} must contain at least ${options.minimumBytes} bytes; got ${bytes.length}.`);
  }
  if (options.extensions) {
    const extension = extname(path).toLowerCase();
    if (!options.extensions.includes(extension)) {
      fail(`${label} must use one of these file extensions: ${options.extensions.join(', ')}.`);
    }
  }
  if (options.pdf && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    fail(`${label} is not a PDF artifact.`);
  }
  return {
    path: relative(PROJECT_ROOT, path) || '.',
    bytes: bytes.length,
    sha256: actual,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function decision(evaluable, passed) {
  return evaluable ? (passed ? 'PASS' : 'FAIL') : 'NOT_TESTED';
}

function validateRecordingTimecode(value, label) {
  const item = object(value, label);
  const startSeconds = finite(item.startSeconds, `${label}.startSeconds`);
  const endSeconds = finite(item.endSeconds, `${label}.endSeconds`);
  if (startSeconds < 0) fail(`${label}.startSeconds must be >= 0.`);
  if (endSeconds <= startSeconds) {
    fail(`${label}.endSeconds must be greater than startSeconds.`);
  }
  return {
    screenRecordingSha256: expectedSha(
      item.screenRecordingSha256,
      `${label}.screenRecordingSha256`,
    ),
    audioRecordingSha256: expectedSha(
      item.audioRecordingSha256,
      `${label}.audioRecordingSha256`,
    ),
    startSeconds,
    endSeconds,
  };
}

function verifyRecordingTimecodeBindings(timecode, recordings, label) {
  if (timecode.screenRecordingSha256 !== recordings.screen.sha256) {
    fail(`${label}.screenRecordingSha256 does not match the retained screen recording.`);
  }
  if (timecode.audioRecordingSha256 !== recordings.audio.sha256) {
    fail(`${label}.audioRecordingSha256 does not match the retained audio recording.`);
  }
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

function expectedFixtureMaps(fixtureManifest, studyVersion) {
  if (fixtureManifest.schemaVersion !== 'activation-energy-studio/usability-fixtures/v1') {
    fail('Fixture manifest schema is not usability-fixtures/v1.');
  }
  if (fixtureManifest.studyVersion !== studyVersion) {
    fail(`Fixture manifest must target ${studyVersion}.`);
  }
  const fixtures = array(fixtureManifest.fixtures, 'fixtureManifest.fixtures');
  const refusals = new Map();
  const warnings = new Map();
  for (const fixture of fixtures) {
    const row = object(fixture, 'fixtureManifest fixture');
    const id = string(row.id, 'fixture.id');
    const expected = object(row.expected, `fixture ${id}.expected`);
    if (expected.kind === 'refusal') refusals.set(id, string(expected.code, `${id}.code`));
    if (expected.kind === 'warning') warnings.set(id, string(expected.code, `${id}.code`));
  }
  if ([...refusals.keys()].sort().join(',') !== 'R1,R2,R3,R4,R5') {
    fail('Fixture manifest must contain exact refusal fixtures R1-R5.');
  }
  if ([...warnings.keys()].sort().join(',') !== 'W1,W2,W3,W4') {
    fail('Fixture manifest must contain exact warning fixtures W1-W4.');
  }
  return { refusals, warnings };
}

function validateEligibility(value, label) {
  const item = object(value, label);
  if (bool(item.eligible, `${label}.eligible`) !== true) fail(`${label}.eligible must be true.`);
  if (bool(item.quantitativeField, `${label}.quantitativeField`) !== true) {
    fail(`${label}.quantitativeField must be true.`);
  }
  if (bool(item.csvXlsxAndPlotLiteracy, `${label}.csvXlsxAndPlotLiteracy`) !== true) {
    fail(`${label}.csvXlsxAndPlotLiteracy must be true.`);
  }
  if (!['none', 'basic'].includes(item.tgaExperience)) {
    fail(`${label}.tgaExperience must be none or basic.`);
  }
  for (const key of ['routineKineticsLastTwoYears', 'productContributor', 'priorParticipantExposure']) {
    if (bool(item[key], `${label}.${key}`) !== false) fail(`${label}.${key} must be false.`);
  }
  if (Object.hasOwn(item, 'turkishScientificReading')) {
    fail(`${label}.turkishScientificReading is an unsupported legacy criterion; use technicalEnglishReading.`);
  }
  if (bool(item.technicalEnglishReading, `${label}.technicalEnglishReading`) !== true) {
    fail(`${label}.technicalEnglishReading must be true.`);
  }
  if (item.excludedReason !== null) fail(`${label}.excludedReason must be null.`);
  return { tgaExperience: item.tgaExperience };
}

function validateParticipant(path, context) {
  const record = readJson(path, `participant record ${path}`);
  assertNoObviousPii(record, `participant record ${path}`);
  const baseDir = dirname(path);
  if (record.schemaVersion !== PARTICIPANT_SCHEMA) {
    fail(`${path} must use ${PARTICIPANT_SCHEMA}.`);
  }
  if (record.studyId !== context.studyId) fail(`${path} studyId mismatch.`);
  const participantId = string(record.participantId, `${path}.participantId`);
  if (!/^P\d{2,}$/.test(participantId)) fail(`${path}.participantId must match P01...Pnn.`);
  const eligibility = validateEligibility(record.eligibility, `${participantId}.eligibility`);

  const consent = object(record.consent, `${participantId}.consent`);
  if (consent.version !== CONSENT_VERSION) fail(`${participantId} consent version mismatch.`);
  isoTimestamp(consent.signedAt, `${participantId}.consent.signedAt`);
  if (bool(consent.recording, `${participantId}.consent.recording`) !== true) {
    fail(`${participantId} did not consent to recording.`);
  }
  string(consent.signedConsentReference, `${participantId}.consent.signedConsentReference`);

  const environment = object(record.environment, `${participantId}.environment`);
  string(environment.os, `${participantId}.environment.os`);
  string(environment.browser, `${participantId}.environment.browser`);
  const zoomPercent = finite(environment.zoomPercent, `${participantId}.environment.zoomPercent`);
  if (zoomPercent !== 100) fail(`${participantId} zoomPercent must be exactly 100.`);
  if (bool(environment.networkOff, `${participantId}.environment.networkOff`) !== true) {
    fail(`${participantId} session was not recorded as offline.`);
  }

  const build = object(record.build, `${participantId}.build`);
  if (build.path !== context.build.path || build.sha256 !== context.build.sha256) {
    fail(`${participantId} build lock does not match the study build.`);
  }
  if (record.fixtureManifestSha256 !== context.fixtureManifestSha256) {
    fail(`${participantId} fixture manifest hash mismatch.`);
  }

  const happy = object(record.happyPath, `${participantId}.happyPath`);
  const startedAt = isoTimestamp(happy.startedAt, `${participantId}.happyPath.startedAt`);
  const endedAt = isoTimestamp(happy.endedAt, `${participantId}.happyPath.endedAt`);
  if (Date.parse(endedAt) <= Date.parse(startedAt)) fail(`${participantId} happy-path duration is invalid.`);
  const completed = bool(happy.completed, `${participantId}.happyPath.completed`);
  const macroDecisionCount = integer(happy.macroDecisionCount, `${participantId}.happyPath.macroDecisionCount`);
  const semanticUiActivations = integer(happy.semanticUiActivations, `${participantId}.happyPath.semanticUiActivations`);
  integer(happy.rawPointerClicks, `${participantId}.happyPath.rawPointerClicks`);
  integer(happy.osPickerClicks, `${participantId}.happyPath.osPickerClicks`);
  const rescues = integer(happy.rescues, `${participantId}.happyPath.rescues`);
  const formulaUsed = bool(happy.formulaUsed, `${participantId}.happyPath.formulaUsed`);
  const openedSuccessfully = bool(happy.openedSuccessfully, `${participantId}.happyPath.openedSuccessfully`);
  const exportArtifact = verifyHashedFile(
    baseDir,
    { path: happy.exportPath, sha256: happy.exportSha256 },
    `${participantId}.happyPath.export`,
    { pdf: true },
  );

  const refusalRows = array(record.refusals, `${participantId}.refusals`);
  if (refusalRows.length !== context.refusals.size) fail(`${participantId} must contain exactly R1-R5.`);
  const refusals = new Map();
  for (const value of refusalRows) {
    const item = object(value, `${participantId} refusal`);
    const fixtureId = string(item.fixtureId, `${participantId}.refusal.fixtureId`);
    if (!context.refusals.has(fixtureId)) fail(`${participantId} has unexpected refusal ${fixtureId}.`);
    if (refusals.has(fixtureId)) fail(`${participantId} repeats refusal ${fixtureId}.`);
    if (item.targetCode !== context.refusals.get(fixtureId)) {
      fail(`${participantId} ${fixtureId} target code does not match the frozen fixture.`);
    }
    const answer = string(item.verbatimAnswer, `${participantId}.${fixtureId}.verbatimAnswer`);
    if (answer.length < 3) fail(`${participantId}.${fixtureId}.verbatimAnswer is too short.`);
    const recordingTimecode = validateRecordingTimecode(
      item.recordingTimecode,
      `${participantId}.${fixtureId}.recordingTimecode`,
    );
    refusals.set(fixtureId, {
      fixtureId,
      targetCode: item.targetCode,
      visible: bool(item.visible, `${participantId}.${fixtureId}.visible`),
      problemScore: binaryScore(item.problemScore, `${participantId}.${fixtureId}.problemScore`),
      riskScore: binaryScore(item.riskScore, `${participantId}.${fixtureId}.riskScore`),
      actionScore: binaryScore(item.actionScore, `${participantId}.${fixtureId}.actionScore`),
      recordingTimecode,
    });
  }

  const comprehension = object(record.comprehension, `${participantId}.comprehension`);
  string(comprehension.verbatimAnswer, `${participantId}.comprehension.verbatimAnswer`);
  const rubric = object(comprehension.rubric, `${participantId}.comprehension.rubric`);
  const rubricKeys = [
    'notSameResult',
    'eaAlphaIsConversionProfile',
    'kissingerIsPeakSpecific',
    'notInterchangeable',
  ];
  const rubricScore = rubricKeys.filter((key) => bool(rubric[key], `${participantId}.comprehension.rubric.${key}`)).length;
  const score = integer(comprehension.score, `${participantId}.comprehension.score`);
  if (score > 4 || score !== rubricScore) fail(`${participantId} comprehension score does not match its rubric.`);
  const hintGiven = bool(comprehension.hintGiven, `${participantId}.comprehension.hintGiven`);
  const comprehensionRecordingTimecode = validateRecordingTimecode(
    comprehension.recordingTimecode,
    `${participantId}.C1.recordingTimecode`,
  );

  const deviations = array(record.deviations, `${participantId}.deviations`).map((value, index) => {
    const item = object(value, `${participantId}.deviations[${index}]`);
    return {
      description: string(item.description, `${participantId}.deviations[${index}].description`),
      impact: string(item.impact, `${participantId}.deviations[${index}].impact`),
    };
  });
  const evidence = array(record.evidence, `${participantId}.evidence`);
  if (evidence.length === 0) fail(`${participantId} must retain evidence artifacts.`);
  const recordings = new Map();
  const evidenceArtifacts = evidence.map((value, index) => {
    const item = object(value, `${participantId}.evidence[${index}]`);
    const kind = string(item.kind, `${participantId}.evidence[${index}].kind`);
    if (!['screen-recording', 'audio-recording', 'screenshot', 'pdf', 'render'].includes(kind)) {
      fail(`${participantId}.evidence[${index}].kind is unsupported.`);
    }
    const recordingRule = RECORDING_RULES[kind];
    if (recordingRule && recordings.has(kind)) {
      fail(`${participantId} must retain exactly one ${kind} artifact.`);
    }
    const artifact = verifyHashedFile(
      baseDir,
      item,
      `${participantId}.evidence[${index}]`,
      recordingRule
        ? {
            extensions: recordingRule.extensions,
            minimumBytes: recordingRule.minimumBytes,
          }
        : {},
    );
    if (recordingRule) recordings.set(kind, artifact);
    return { kind, ...artifact };
  });
  const screenRecording = recordings.get('screen-recording');
  const audioRecording = recordings.get('audio-recording');
  if (!screenRecording) fail(`${participantId} must retain one screen-recording artifact.`);
  if (!audioRecording) fail(`${participantId} must retain one audio-recording artifact.`);
  if (screenRecording.sha256 === audioRecording.sha256) {
    fail(`${participantId} screen and audio recordings must be separate retained files.`);
  }
  for (const [fixtureId, refusal] of refusals) {
    verifyRecordingTimecodeBindings(
      refusal.recordingTimecode,
      { screen: screenRecording, audio: audioRecording },
      `${participantId}.${fixtureId}.recordingTimecode`,
    );
  }
  verifyRecordingTimecodeBindings(
    comprehensionRecordingTimecode,
    { screen: screenRecording, audio: audioRecording },
    `${participantId}.C1.recordingTimecode`,
  );
  string(record.observer, `${participantId}.observer`);
  isoTimestamp(record.scoredAt, `${participantId}.scoredAt`);

  return {
    participantId,
    recordPath: relative(PROJECT_ROOT, path),
    recordSha256: sha256File(path),
    tgaExperience: eligibility.tgaExperience,
    happyPath: {
      completed,
      macroDecisionCount,
      semanticUiActivations,
      rescues,
      formulaUsed,
      openedSuccessfully,
      export: exportArtifact,
    },
    refusals,
    comprehension: { score, hintGiven, recordingTimecode: comprehensionRecordingTimecode },
    deviations,
    evidence: evidenceArtifacts,
    recordings: {
      screen: screenRecording,
      audio: audioRecording,
    },
    observer: record.observer,
  };
}

function validateWarningMatrix(rows, warnings, studyDir) {
  const expected = new Map();
  for (const [fixtureId, code] of warnings) {
    for (const surface of EXPECTED_WARNING_SURFACES) expected.set(`${fixtureId}:${surface}`, { fixtureId, code, surface });
  }
  const actual = new Map();
  for (const value of array(rows, 'warningMatrix')) {
    const item = object(value, 'warningMatrix item');
    const fixtureId = string(item.fixtureId, 'warningMatrix.fixtureId');
    const surface = string(item.surface, 'warningMatrix.surface');
    const key = `${fixtureId}:${surface}`;
    const target = expected.get(key);
    if (!target) fail(`Unexpected warning matrix cell ${key}.`);
    if (actual.has(key)) fail(`Duplicate warning matrix cell ${key}.`);
    if (item.targetCode !== target.code) fail(`${key} warning code mismatch.`);
    const visible = bool(item.visible, `${key}.visible`);
    const artifact = verifyHashedFile(studyDir, item.evidence, `${key}.evidence`, {
      pdf: surface === 'PDF',
      confined: true,
    });
    actual.set(key, { ...target, visible, evidence: artifact });
  }
  if (actual.size !== expected.size) fail(`Warning matrix must contain exactly ${expected.size} cells.`);
  return [...actual.values()].sort((a, b) => `${a.fixtureId}:${a.surface}`.localeCompare(`${b.fixtureId}:${b.surface}`));
}

function validateSecondRaterSelection(value, participants, refusalMap) {
  const item = object(value, 'secondRaterSelection');
  const seed = string(item.seed, 'secondRaterSelection.seed');
  if (item.method !== SECOND_RATER_SELECTION_METHOD) {
    fail(`secondRaterSelection.method must be ${SECOND_RATER_SELECTION_METHOD}.`);
  }
  const scenarioIds = participants.flatMap((participant) =>
    [...refusalMap.keys()].map((fixtureId) => `${participant.participantId}:${fixtureId}`),
  );
  const requiredScenarioCount = Math.ceil(scenarioIds.length * 0.4);
  const expectedScenarioIds = deterministicSecondRaterScenarioIds(
    seed,
    scenarioIds,
    requiredScenarioCount,
  );
  const selectedScenarioIds = array(
    item.selectedScenarioIds,
    'secondRaterSelection.selectedScenarioIds',
  ).map((value, index) =>
    string(value, `secondRaterSelection.selectedScenarioIds[${index}]`),
  );
  if (new Set(selectedScenarioIds).size !== selectedScenarioIds.length) {
    fail('secondRaterSelection.selectedScenarioIds must not contain duplicates.');
  }
  if (
    selectedScenarioIds.length !== expectedScenarioIds.length ||
    selectedScenarioIds.some(
      (scenarioId, index) => scenarioId !== expectedScenarioIds[index],
    )
  ) {
    fail(
      `secondRaterSelection.selectedScenarioIds must equal the deterministic ${requiredScenarioCount}/${scenarioIds.length} SHA-256 selection.`,
    );
  }
  return {
    seed,
    method: SECOND_RATER_SELECTION_METHOD,
    candidateScenarioCount: scenarioIds.length,
    requiredScenarioCount,
    selectedScenarioIds,
    selectionSha256: sha256Bytes(Buffer.from(`${selectedScenarioIds.join('\n')}\n`, 'utf8')),
  };
}

function validateSecondRatings(rows, participants, refusalMap, selection) {
  const participantById = new Map(participants.map((item) => [item.participantId, item]));
  const selectedScenarioIds = new Set(selection.selectedScenarioIds);
  const ratings = [];
  const seen = new Set();
  for (const value of array(rows, 'secondRaterRatings')) {
    const item = object(value, 'secondRaterRatings item');
    const participantId = string(item.participantId, 'secondRating.participantId');
    const fixtureId = string(item.fixtureId, 'secondRating.fixtureId');
    const key = `${participantId}:${fixtureId}`;
    if (seen.has(key)) fail(`Duplicate second rating ${key}.`);
    if (!selectedScenarioIds.has(key)) {
      fail(`Second rating ${key} is not in the deterministic second-rater selection.`);
    }
    seen.add(key);
    const participant = participantById.get(participantId);
    if (!participant) fail(`Second rating references unknown participant ${participantId}.`);
    if (!refusalMap.has(fixtureId)) fail(`Second rating references unknown fixture ${fixtureId}.`);
    if (bool(item.blind, `${key}.blind`) !== true) fail(`${key} second rating must be blind.`);
    const raterId = string(item.raterId, `${key}.raterId`);
    if (raterId === participant.observer) fail(`${key} second rater must differ from the primary observer.`);
    const secondary = {
      problemScore: binaryScore(item.problemScore, `${key}.problemScore`),
      riskScore: binaryScore(item.riskScore, `${key}.riskScore`),
      actionScore: binaryScore(item.actionScore, `${key}.actionScore`),
    };
    const primary = participant.refusals.get(fixtureId);
    const agreements = ['problemScore', 'riskScore', 'actionScore'].filter(
      (field) => primary[field] === secondary[field],
    ).length;
    ratings.push({ participantId, fixtureId, raterId, agreements, ...secondary });
  }
  const totalDimensions = ratings.length * 3;
  const agreedDimensions = ratings.reduce((sum, item) => sum + item.agreements, 0);
  return {
    ratings: ratings.sort((a, b) => `${a.participantId}:${a.fixtureId}`.localeCompare(`${b.participantId}:${b.fixtureId}`)),
    selection,
    requiredScenarioCount: selection.requiredScenarioCount,
    ratedScenarioCount: ratings.length,
    coverage: participants.length === 0 ? 0 : ratings.length / (participants.length * refusalMap.size),
    exactDimensionAgreement: totalDimensions === 0 ? null : agreedDimensions / totalDimensions,
  };
}

export function createUsabilityStudyEvidenceForVersion(
  manifestPath,
  studyVersion,
) {
  if (!/^UX-v\d+\.\d+\.\d+$/.test(studyVersion)) {
    fail('studyVersion must match UX-vMAJOR.MINOR.PATCH.');
  }
  const absoluteManifest = resolve(manifestPath);
  const studyDir = dirname(absoluteManifest);
  const input = readJson(absoluteManifest, 'usability study manifest');
  if (input.schemaVersion !== INPUT_SCHEMA) fail(`Study manifest must use ${INPUT_SCHEMA}.`);
  if (input.studyVersion !== studyVersion) fail(`Study manifest must target ${studyVersion}.`);
  const studyId = string(input.studyId, 'studyId');
  const expectedStudyIdPrefix = `${studyVersion}-`;
  if (
    !studyId.startsWith(expectedStudyIdPrefix) ||
    !/^\d{8}$/.test(studyId.slice(expectedStudyIdPrefix.length))
  ) {
    fail(`studyId must match ${studyVersion}-YYYYMMDD.`);
  }
  if (input.evidenceOrigin !== 'observed-human-sessions') {
    fail('evidenceOrigin must be observed-human-sessions; generated or synthetic participant evidence is forbidden.');
  }

  const fixtureLock = object(input.fixtureManifest, 'fixtureManifest');
  const fixturePath = resolveProjectOrStudy(studyDir, fixtureLock.path, 'fixtureManifest.path');
  const fixtureManifestSha256 = expectedSha(fixtureLock.sha256, 'fixtureManifest.sha256');
  const actualFixtureHash = sha256File(fixturePath);
  if (actualFixtureHash !== fixtureManifestSha256) fail('Fixture manifest hash mismatch.');
  const fixtureManifest = readJson(fixturePath, 'fixture manifest');
  const { refusals, warnings } = expectedFixtureMaps(fixtureManifest, studyVersion);

  const build = object(input.build, 'build');
  const buildPath = resolveProjectOrStudy(studyDir, build.path, 'build.path');
  const buildSha256 = expectedSha(build.sha256, 'build.sha256');
  const actualBuildHash = sha256File(buildPath);
  if (actualBuildHash !== buildSha256) fail('Study build hash mismatch.');
  if (buildSha256 !== fixtureManifest.release?.sha256) {
    fail('Study build does not match the build frozen by the fixture manifest.');
  }
  const buildLock = { path: build.path, bytes: readFileSync(buildPath).length, sha256: buildSha256 };

  const participantPaths = array(input.participantRecords, 'participantRecords');
  const participants = participantPaths.map((candidate, index) =>
    validateParticipant(
      resolveExisting(studyDir, candidate, `participantRecords[${index}]`, true),
      { studyId, build: buildLock, fixtureManifestSha256, refusals },
    ),
  );
  const ids = new Set(participants.map((item) => item.participantId));
  if (ids.size !== participants.length) fail('Participant IDs must be unique.');
  participants.sort((a, b) => a.participantId.localeCompare(b.participantId));

  const warningMatrix = validateWarningMatrix(input.warningMatrix, warnings, studyDir);
  const secondRaterSelection = validateSecondRaterSelection(
    input.secondRaterSelection,
    participants,
    refusals,
  );
  const secondRater = validateSecondRatings(
    input.secondRaterRatings,
    participants,
    refusals,
    secondRaterSelection,
  );
  const excludedSessions = array(input.excludedSessions, 'excludedSessions').map((value, index) => {
    const item = object(value, `excludedSessions[${index}]`);
    return {
      sessionId: string(item.sessionId, `excludedSessions[${index}].sessionId`),
      reason: string(item.reason, `excludedSessions[${index}].reason`),
    };
  });
  const coordinator = object(input.coordinator, 'coordinator');
  const coordinatorId = string(coordinator.observerId, 'coordinator.observerId');
  const finalizedAt = isoTimestamp(coordinator.finalizedAt, 'coordinator.finalizedAt');
  if (bool(coordinator.declarationAccepted, 'coordinator.declarationAccepted') !== true) {
    fail('Coordinator declaration must be explicitly accepted.');
  }
  string(coordinator.signedRecordReference, 'coordinator.signedRecordReference');

  const n = participants.length;
  const evaluable = n >= 5;
  const tgaBasicCount = participants.filter((item) => item.tgaExperience === 'basic').length;
  const tgaNoneCount = participants.filter((item) => item.tgaExperience === 'none').length;
  const activations = participants.map((item) => item.happyPath.semanticUiActivations);
  const happyPathPassed =
    evaluable &&
    tgaBasicCount >= 2 &&
    tgaNoneCount >= 2 &&
    participants.every(
      (item) =>
        item.happyPath.completed &&
        item.happyPath.macroDecisionCount === UX01_EXPECTED_MACRO_DECISIONS &&
        item.happyPath.rescues === 0 &&
        !item.happyPath.formulaUsed &&
        item.happyPath.openedSuccessfully &&
        item.happyPath.semanticUiActivations >=
          UX01_MIN_SEMANTIC_UI_ACTIVATIONS &&
        item.happyPath.semanticUiActivations <=
          UX01_MAX_SEMANTIC_UI_ACTIVATIONS,
    ) &&
    median(activations) <= 12;

  const refusalRows = participants.flatMap((participant) =>
    [...participant.refusals.values()].map((row) => ({ participantId: participant.participantId, ...row })),
  );
  const totalScore = refusalRows.reduce(
    (sum, item) => sum + item.problemScore + item.riskScore + item.actionScore,
    0,
  );
  const totalDimensions = refusalRows.length * 3;
  const refusalPercent = totalDimensions === 0 ? 0 : totalScore / totalDimensions;
  const perFixture = [...refusals.keys()].sort().map((fixtureId) => {
    const rows = refusalRows.filter((item) => item.fixtureId === fixtureId);
    const score = rows.reduce(
      (sum, item) => sum + item.problemScore + item.riskScore + item.actionScore,
      0,
    );
    return { fixtureId, score, dimensions: rows.length * 3, proportion: rows.length === 0 ? 0 : score / (rows.length * 3) };
  });
  const refusalPassed =
    evaluable &&
    refusalRows.length === n * refusals.size &&
    refusalRows.every((item) => item.visible && item.problemScore === 1 && item.actionScore === 1) &&
    refusalPercent >= 0.9 &&
    perFixture.every((item) => item.proportion >= 0.8) &&
    secondRater.ratedScenarioCount >= secondRater.requiredScenarioCount;

  const comprehensionPassed =
    evaluable && participants.every((item) => item.comprehension.score === 4 && !item.comprehension.hintGiven);
  const warningPassed = warningMatrix.length === 8 && warningMatrix.every((item) => item.visible);
  const gates = {
    'AC-UX-01': decision(evaluable, happyPathPassed),
    'AC-UX-02': decision(evaluable, refusalPassed),
    'AC-UX-03': decision(evaluable, comprehensionPassed),
    'AC-UX-04': decision(true, warningPassed),
  };
  const gateValues = Object.values(gates);
  const overallThresholdDecision = gateValues.every((value) => value === 'PASS')
    ? 'PASS'
    : gateValues.some((value) => value === 'FAIL')
      ? 'FAIL'
      : 'NOT_TESTED';

  return {
    schemaVersion: OUTPUT_SCHEMA,
    studyId,
    studyVersion,
    evidenceOrigin: input.evidenceOrigin,
    inputManifest: {
      path: relative(PROJECT_ROOT, absoluteManifest),
      sha256: sha256File(absoluteManifest),
    },
    fixtureManifest: {
      path: relative(PROJECT_ROOT, fixturePath),
      sha256: fixtureManifestSha256,
    },
    build: buildLock,
    coordinator: {
      observerId: coordinatorId,
      finalizedAt,
      declarationAccepted: true,
      signedRecordReference: coordinator.signedRecordReference,
    },
    cohort: {
      retainedParticipantCount: n,
      excludedSessionCount: excludedSessions.length,
      tgaBasicCount,
      tgaNoneCount,
      participantIds: participants.map((item) => item.participantId),
      excludedSessions,
    },
    happyPath: {
      semanticUiActivations: activations,
      medianSemanticUiActivations: activations.length === 0 ? null : median(activations),
      maximumSemanticUiActivations: activations.length === 0 ? null : Math.max(...activations),
      allCompletedWithoutRescueOrFormula: participants.every(
        (item) => item.happyPath.completed && item.happyPath.rescues === 0 && !item.happyPath.formulaUsed,
      ),
    },
    refusalComprehension: {
      scenarioCount: refusalRows.length,
      score: totalScore,
      dimensions: totalDimensions,
      proportion: refusalPercent,
      allProblemAndActionCorrect: refusalRows.every(
        (item) => item.problemScore === 1 && item.actionScore === 1,
      ),
      perFixture,
      secondRater: {
        selection: secondRater.selection,
        requiredScenarioCount: secondRater.requiredScenarioCount,
        ratedScenarioCount: secondRater.ratedScenarioCount,
        coverage: secondRater.coverage,
        exactDimensionAgreement: secondRater.exactDimensionAgreement,
        disagreements: secondRater.ratings
          .filter((item) => item.agreements < 3)
          .map(({ participantId, fixtureId, agreements }) => ({ participantId, fixtureId, agreements })),
      },
    },
    resultTypeComprehension: {
      allFirstAttemptFourOfFour: participants.every(
        (item) => item.comprehension.score === 4 && !item.comprehension.hintGiven,
      ),
      scores: participants.map((item) => ({
        participantId: item.participantId,
        score: item.comprehension.score,
        hintGiven: item.comprehension.hintGiven,
      })),
    },
    warningVisibility: {
      completeCellCount: warningMatrix.length,
      cells: warningMatrix,
    },
    participantRecords: participants.map((item) => ({
      participantId: item.participantId,
      path: item.recordPath,
      sha256: item.recordSha256,
      evidenceArtifactCount: item.evidence.length + 1,
      requiredRecordings: {
        screenRecording: item.recordings.screen,
        audioRecording: item.recordings.audio,
      },
      taskTimecodeBindingCount: item.refusals.size + 1,
      deviationCount: item.deviations.length,
    })),
    automatedThresholds: gates,
    overallThresholdDecision,
    evidenceState: 'AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT',
    acceptanceGateStatus: 'NOT_AUTOMATICALLY_APPLIED',
    authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
    boundary: HUMAN_AUDIT_BOUNDARY,
  };
}

export function createUsabilityStudyEvidence(manifestPath) {
  return createUsabilityStudyEvidenceForVersion(
    manifestPath,
    DEFAULT_STUDY_VERSION,
  );
}

export function serializeUsabilityStudyEvidence(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const record = createUsabilityStudyEvidence(args.manifest);
  const bytes = serializeUsabilityStudyEvidence(record);
  const output = resolve(args.output);
  if (args.check) {
    if (!existsSync(output)) fail(`Output record does not exist: ${output}`);
    const current = readFileSync(output, 'utf8');
    if (current !== bytes) fail(`Output record is stale: ${output}`);
    console.log(
      `TECHNICAL_OK USABILITY_STUDY_RECORD_CURRENT ${output} participants=${record.cohort.retainedParticipantCount} automatedThresholdDecision=${record.overallThresholdDecision} acceptanceGateStatus=${record.acceptanceGateStatus} authenticityStatus=${record.authenticityStatus} state=${record.evidenceState}`,
    );
    return;
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  console.log(
    `TECHNICAL_OK USABILITY_STUDY_RECORDED ${output} participants=${record.cohort.retainedParticipantCount} automatedThresholdDecision=${record.overallThresholdDecision} acceptanceGateStatus=${record.acceptanceGateStatus} authenticityStatus=${record.authenticityStatus} state=${record.evidenceState}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`FAIL USABILITY_STUDY_RECORD ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
