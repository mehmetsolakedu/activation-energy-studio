import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createUsabilityStudyEvidence,
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  PARTICIPANT_SCHEMA,
  serializeUsabilityStudyEvidence,
} from '../scripts/record-usability-study.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_MANIFEST = resolve(
  PROJECT_ROOT,
  'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json',
);
const RELEASE = resolve(
  PROJECT_ROOT,
  'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
);
const RECORDER = resolve(PROJECT_ROOT, 'scripts/record-usability-study.mjs');
const REFUSALS = {
  R1: 'INSUFFICIENT_DISTINCT_HEATING_RATES',
  R2: 'NO_COMMON_ALPHA_RANGE',
  R3: 'NON_MONOTONIC_ALPHA',
  R4: 'INCONSISTENT_CONTEXT',
  R5: 'NONLINEAR_HEATING_UNSUPPORTED',
};
const WARNINGS = {
  W1: 'LIMITED_HEATING_RATES',
  W2: 'NUMERICAL_DERIVATIVE',
  W3: 'LOW_R2',
  W4: 'MULTISTEP_EA_VARIATION',
};
const SECOND_RATER_SELECTION_METHOD = 'SHA256_SEEDED_ASC_V1';
const temporaryStudyDirectories = new Set();

afterEach(() => {
  for (const directory of temporaryStudyDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryStudyDirectories.clear();
});

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function json(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function substantiveStderr(value) {
  return stripVTControlCharacters(value)
    .split(/\r?\n/gu)
    .filter((line) => !/^__CM_FS__:\d+$/u.test(line.trim()))
    .join('\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '')
    .trim();
}

function artifact(dir, name, content) {
  const path = resolve(dir, name);
  writeFileSync(path, content);
  return { path: name, sha256: sha(path) };
}

function realisticArtifactBytes(size, header, trailer = '') {
  const bytes = Buffer.alloc(size, 0x5a);
  Buffer.from(header).copy(bytes);
  if (trailer) Buffer.from(trailer).copy(bytes, size - Buffer.byteLength(trailer));
  return bytes;
}

function deterministicSecondRaterScenarioIds(seed, scenarioIds, requiredCount) {
  return scenarioIds
    .map((scenarioId) => ({
      scenarioId,
      digest: createHash('sha256').update(`${seed}\0${scenarioId}`).digest('hex'),
    }))
    .sort(
      (a, b) =>
        a.digest.localeCompare(b.digest) || a.scenarioId.localeCompare(b.scenarioId),
    )
    .slice(0, requiredCount)
    .map((item) => item.scenarioId);
}

function participant(dir, index, options = {}) {
  const id = `P${String(index).padStart(2, '0')}`;
  const exportPdf = artifact(
    dir,
    `${id}-report.pdf`,
    realisticArtifactBytes(4 * 1024, '%PDF-1.4\n', '\n%%EOF\n'),
  );
  const screenshot = artifact(
    dir,
    `${id}-screen.png`,
    realisticArtifactBytes(16 * 1024, Buffer.from('89504e470d0a1a0a', 'hex')),
  );
  const screenRecording = artifact(
    dir,
    options.screenRecordingName ?? `${id}-screen-recording.mp4`,
    options.screenRecordingBytes ??
      realisticArtifactBytes(96 * 1024, Buffer.from('000000186674797069736f6d', 'hex')),
  );
  const audioRecording = artifact(
    dir,
    options.audioRecordingName ?? `${id}-audio-recording.wav`,
    options.audioRecordingBytes ??
      realisticArtifactBytes(32 * 1024, Buffer.from('524946460000000057415645666d7420', 'hex')),
  );
  const recordingTimecode = (startSeconds, endSeconds) => ({
    screenRecordingSha256: screenRecording.sha256,
    audioRecordingSha256: audioRecording.sha256,
    startSeconds,
    endSeconds,
  });
  const record = {
    schemaVersion: PARTICIPANT_SCHEMA,
    studyId: 'UX-v0.3.1-20260801',
    participantId: id,
    eligibility: {
      eligible: true,
      quantitativeField: true,
      csvXlsxAndPlotLiteracy: true,
      tgaExperience: index <= 2 ? 'basic' : 'none',
      routineKineticsLastTwoYears: false,
      productContributor: false,
      technicalEnglishReading: true,
      priorParticipantExposure: false,
      excludedReason: null,
    },
    consent: {
      version: 'UX-CONSENT-v1',
      signedAt: `2026-08-01T10:${String(index).padStart(2, '0')}:00Z`,
      recording: true,
      signedConsentReference: `CONSENT-${id}`,
    },
    environment: {
      os: 'test-os',
      browser: 'test-browser',
      zoomPercent: options.zoomPercent ?? 100,
      networkOff: true,
    },
    build: {
      path: 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
      bytes: readFileSync(RELEASE).length,
      sha256: sha(RELEASE),
    },
    fixtureManifestSha256: sha(FIXTURE_MANIFEST),
    happyPath: {
      startedAt: `2026-08-01T11:${String(index).padStart(2, '0')}:00Z`,
      endedAt: `2026-08-01T11:${String(index + 10).padStart(2, '0')}:00Z`,
      completed: true,
      macroDecisionCount: options.macroDecisions ?? 5,
      semanticUiActivations: options.activations ?? 11,
      rawPointerClicks: 14,
      osPickerClicks: 2,
      rescues: 0,
      formulaUsed: false,
      exportPath: exportPdf.path,
      exportSha256: exportPdf.sha256,
      openedSuccessfully: true,
    },
    refusals: Object.entries(REFUSALS).map(([fixtureId, targetCode], fixtureIndex) => ({
      fixtureId,
      targetCode,
      visible: true,
      problemScore: 1,
      riskScore: options.riskScore === 0 && fixtureId === 'R5' ? 0 : 1,
      actionScore: 1,
      verbatimAnswer: `Participant explanation recorded for ${fixtureId}.`,
      recordingTimecode: recordingTimecode(
        120 + fixtureIndex * 40,
        150 + fixtureIndex * 40,
      ),
    })),
    comprehension: {
      verbatimAnswer: 'The two results summarize different physical quantities and are not interchangeable.',
      score: options.comprehensionScore ?? 4,
      hintGiven: false,
      rubric: {
        notSameResult: true,
        eaAlphaIsConversionProfile: true,
        kissingerIsPeakSpecific: true,
        notInterchangeable: options.comprehensionScore === 3 ? false : true,
      },
      recordingTimecode: recordingTimecode(360, 410),
    },
    deviations: [],
    evidence: [
      ...(!options.omitScreenRecording
        ? [{ kind: 'screen-recording', ...screenRecording }]
        : []),
      ...(!options.omitAudioRecording
        ? [{ kind: 'audio-recording', ...audioRecording }]
        : []),
      ...(!options.omitScreenshot ? [{ kind: 'screenshot', ...screenshot }] : []),
    ],
    observer: 'O01',
    scoredAt: `2026-08-01T12:${String(index).padStart(2, '0')}:00Z`,
  };
  const path = resolve(dir, `${id}.json`);
  json(path, record);
  return { id, path, record };
}

function makeStudy(options = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'aes-usability-study-'));
  temporaryStudyDirectories.add(dir);
  const count = options.participantCount ?? 5;
  const participants = Array.from({ length: count }, (_, offset) =>
    participant(dir, offset + 1, options.participantOptions?.[offset] ?? {}),
  );
  const warningMatrix = [];
  for (const [fixtureId, targetCode] of Object.entries(WARNINGS)) {
    const ui = artifact(
      dir,
      `${fixtureId}-UI.png`,
      realisticArtifactBytes(16 * 1024, Buffer.from('89504e470d0a1a0a', 'hex')),
    );
    const pdf = artifact(
      dir,
      `${fixtureId}-PDF.pdf`,
      realisticArtifactBytes(4 * 1024, '%PDF-1.4\n', '\n%%EOF\n'),
    );
    warningMatrix.push(
      { fixtureId, targetCode, surface: 'UI', visible: true, evidence: ui },
      { fixtureId, targetCode, surface: 'PDF', visible: true, evidence: pdf },
    );
  }
  const possibleRatings = participants.flatMap(({ id }) =>
    Object.keys(REFUSALS).map((fixtureId) => ({
      participantId: id,
      fixtureId,
      blind: true,
      raterId: 'O02',
      problemScore: 1,
      riskScore: 1,
      actionScore: 1,
    })),
  );
  const requiredRatings = Math.ceil(count * 5 * 0.4);
  const selectionSeed =
    options.secondRaterSelectionSeed ?? 'UX-v0.3.1-20260801-second-rater-v1';
  const selectedScenarioIds = deterministicSecondRaterScenarioIds(
    selectionSeed,
    possibleRatings.map((item) => `${item.participantId}:${item.fixtureId}`),
    requiredRatings,
  );
  const ratingByScenarioId = new Map(
    possibleRatings.map((item) => [`${item.participantId}:${item.fixtureId}`, item]),
  );
  const selectedRatings = selectedScenarioIds.map((scenarioId) =>
    ratingByScenarioId.get(scenarioId),
  );
  const input = {
    schemaVersion: INPUT_SCHEMA,
    studyId: 'UX-v0.3.1-20260801',
    studyVersion: 'UX-v0.3.1',
    evidenceOrigin: options.evidenceOrigin ?? 'observed-human-sessions',
    fixtureManifest: {
      path: 'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json',
      sha256: sha(FIXTURE_MANIFEST),
    },
    build: {
      path: 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
      sha256: sha(RELEASE),
    },
    participantRecords: participants.map(({ path }) => basename(path)),
    excludedSessions: [],
    secondRaterSelection: {
      seed: selectionSeed,
      method: SECOND_RATER_SELECTION_METHOD,
      selectedScenarioIds,
    },
    secondRaterRatings: selectedRatings.slice(
      0,
      options.secondRatingCount ?? requiredRatings,
    ),
    warningMatrix,
    coordinator: {
      observerId: 'O01',
      finalizedAt: '2026-08-01T15:00:00Z',
      declarationAccepted: true,
      signedRecordReference: 'COORDINATOR-SIGNOFF-001',
    },
  };
  const manifestPath = resolve(dir, 'study-input.json');
  json(manifestPath, input);
  return { dir, participants, input, manifestPath };
}

describe('usability study evidence recorder', () => {
  it('computes all four prespecified PASS decisions without claiming human authentication', () => {
    const study = makeStudy();
    const record = createUsabilityStudyEvidence(study.manifestPath);

    expect(record.schemaVersion).toBe(OUTPUT_SCHEMA);
    expect(record.cohort.retainedParticipantCount).toBe(5);
    expect(record.cohort.tgaBasicCount).toBe(2);
    expect(record.cohort.tgaNoneCount).toBe(3);
    expect(record.happyPath.medianSemanticUiActivations).toBe(11);
    expect(record.refusalComprehension.proportion).toBe(1);
    expect(record.refusalComprehension.secondRater.coverage).toBe(0.4);
    expect(record.refusalComprehension.secondRater.selection).toMatchObject({
      method: SECOND_RATER_SELECTION_METHOD,
      candidateScenarioCount: 25,
      requiredScenarioCount: 10,
    });
    expect(
      record.refusalComprehension.secondRater.selection.selectedScenarioIds,
    ).toHaveLength(10);
    expect(record.participantRecords[0].requiredRecordings.screenRecording.bytes).toBe(
      96 * 1024,
    );
    expect(record.participantRecords[0].requiredRecordings.audioRecording.bytes).toBe(
      32 * 1024,
    );
    expect(record.participantRecords[0].taskTimecodeBindingCount).toBe(6);
    expect(record.automatedThresholds).toEqual({
      'AC-UX-01': 'PASS',
      'AC-UX-02': 'PASS',
      'AC-UX-03': 'PASS',
      'AC-UX-04': 'PASS',
    });
    expect(record.overallThresholdDecision).toBe('PASS');
    expect(record.evidenceState).toBe(
      'AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT',
    );
    expect(record.acceptanceGateStatus).toBe('NOT_AUTOMATICALLY_APPLIED');
    expect(record.authenticityStatus).toBe('NOT_VERIFIED_BY_SOFTWARE');
    expect(record.boundary).toContain('does not decode or authenticate media content');
    expect(record.boundary).toContain('human content audit');
  });

  it('treats screenshots as optional supplements while retaining both required recordings', () => {
    const study = makeStudy({
      participantOptions: [{ omitScreenshot: true }],
    });
    const record = createUsabilityStudyEvidence(study.manifestPath);

    expect(record.overallThresholdDecision).toBe('PASS');
    expect(record.participantRecords[0].evidenceArtifactCount).toBe(3);
    expect(record.participantRecords[0].requiredRecordings.screenRecording).toBeDefined();
    expect(record.participantRecords[0].requiredRecordings.audioRecording).toBeDefined();
  });

  it('labels CLI success as technical and keeps PASS scoped to automated thresholds', () => {
    const study = makeStudy();
    const output = resolve(study.dir, 'evidence-record.json');
    const recorded = spawnSync(
      process.execPath,
      [RECORDER, '--manifest', study.manifestPath, '--output', output],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );

    expect(recorded.status).toBe(0);
    // Some orchestration shells append terminal controls or a __CM_FS__
    // write-observation marker. Keep rejecting every recorder diagnostic.
    expect(substantiveStderr(recorded.stderr)).toBe('');
    expect(recorded.stdout).toContain('TECHNICAL_OK USABILITY_STUDY_RECORDED');
    expect(recorded.stdout).toContain('automatedThresholdDecision=PASS');
    expect(recorded.stdout).toContain(
      'acceptanceGateStatus=NOT_AUTOMATICALLY_APPLIED',
    );
    expect(recorded.stdout).toContain('authenticityStatus=NOT_VERIFIED_BY_SOFTWARE');
    expect(recorded.stdout).not.toMatch(/^PASS\b/mu);
    expect(recorded.stdout).not.toContain(' decision=PASS');

    const checked = spawnSync(
      process.execPath,
      [RECORDER, '--manifest', study.manifestPath, '--output', output, '--check'],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    expect(checked.status).toBe(0);
    expect(substantiveStderr(checked.stderr)).toBe('');
    expect(checked.stdout).toContain('TECHNICAL_OK USABILITY_STUDY_RECORD_CURRENT');
    expect(checked.stdout).toContain('automatedThresholdDecision=PASS');
  });

  it('returns NOT_TESTED for human gates when fewer than five retained participants exist', () => {
    const study = makeStudy({ participantCount: 4 });
    const record = createUsabilityStudyEvidence(study.manifestPath);

    expect(record.automatedThresholds).toMatchObject({
      'AC-UX-01': 'NOT_TESTED',
      'AC-UX-02': 'NOT_TESTED',
      'AC-UX-03': 'NOT_TESTED',
      'AC-UX-04': 'PASS',
    });
    expect(record.overallThresholdDecision).toBe('NOT_TESTED');
  });

  it('records a negative usability result instead of hiding a threshold failure', () => {
    const study = makeStudy({
      participantOptions: [{ activations: 16 }, {}, {}, {}, { comprehensionScore: 3 }],
    });
    const record = createUsabilityStudyEvidence(study.manifestPath);

    expect(record.automatedThresholds['AC-UX-01']).toBe('FAIL');
    expect(record.automatedThresholds['AC-UX-03']).toBe('FAIL');
    expect(record.overallThresholdDecision).toBe('FAIL');
  });

  it('fails AC-UX-01 for impossible zero-count or under-rehearsed completed paths', () => {
    const zeroCounts = makeStudy({
      participantOptions: [{ macroDecisions: 0, activations: 0 }, {}, {}, {}, {}],
    });
    const zeroRecord = createUsabilityStudyEvidence(zeroCounts.manifestPath);
    expect(zeroRecord.automatedThresholds['AC-UX-01']).toBe('FAIL');
    expect(zeroRecord.overallThresholdDecision).toBe('FAIL');

    const underRehearsed = makeStudy({
      participantOptions: [{ macroDecisions: 5, activations: 10 }, {}, {}, {}, {}],
    });
    const underRehearsedRecord = createUsabilityStudyEvidence(
      underRehearsed.manifestPath,
    );
    expect(underRehearsedRecord.automatedThresholds['AC-UX-01']).toBe('FAIL');
    expect(underRehearsedRecord.overallThresholdDecision).toBe('FAIL');
  });

  it('fails closed when blind second scoring covers less than 40 percent', () => {
    const study = makeStudy({ secondRatingCount: 9 });
    const record = createUsabilityStudyEvidence(study.manifestPath);

    expect(record.refusalComprehension.secondRater.requiredScenarioCount).toBe(10);
    expect(record.automatedThresholds['AC-UX-02']).toBe('FAIL');
  });

  it('rejects generated or synthetic participant evidence', () => {
    const study = makeStudy({ evidenceOrigin: 'synthetic-test-only' });
    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /observed-human-sessions/,
    );
  });

  it('requires technical-English reading eligibility for the current study', () => {
    const falseCriterion = makeStudy();
    falseCriterion.participants[0].record.eligibility.technicalEnglishReading = false;
    json(falseCriterion.participants[0].path, falseCriterion.participants[0].record);
    expect(() => createUsabilityStudyEvidence(falseCriterion.manifestPath)).toThrow(
      /technicalEnglishReading must be true/,
    );

    const legacyCriterion = makeStudy();
    delete legacyCriterion.participants[0].record.eligibility.technicalEnglishReading;
    legacyCriterion.participants[0].record.eligibility.turkishScientificReading = true;
    json(legacyCriterion.participants[0].path, legacyCriterion.participants[0].record);
    expect(() => createUsabilityStudyEvidence(legacyCriterion.manifestPath)).toThrow(
      /unsupported legacy criterion/,
    );
  });

  it('rejects missing recording consent', () => {
    const study = makeStudy();
    study.participants[0].record.consent.recording = false;
    json(study.participants[0].path, study.participants[0].record);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /did not consent to recording/,
    );
  });

  it('rejects any session that is not recorded at exactly 100 percent zoom', () => {
    const study = makeStudy({ participantOptions: [{ zoomPercent: 90 }] });

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /zoomPercent must be exactly 100/,
    );
  });

  it('requires separate retained screen and audio recording artifacts', () => {
    const missingScreen = makeStudy({
      participantOptions: [{ omitScreenRecording: true }],
    });
    expect(() => createUsabilityStudyEvidence(missingScreen.manifestPath)).toThrow(
      /must retain one screen-recording artifact/,
    );

    const missingAudio = makeStudy({
      participantOptions: [{ omitAudioRecording: true }],
    });
    expect(() => createUsabilityStudyEvidence(missingAudio.manifestPath)).toThrow(
      /must retain one audio-recording artifact/,
    );

    const duplicateBytes = realisticArtifactBytes(
      96 * 1024,
      Buffer.from('000000186674797069736f6d', 'hex'),
    );
    const sameContent = makeStudy({
      participantOptions: [
        {
          screenRecordingBytes: duplicateBytes,
          audioRecordingBytes: duplicateBytes,
        },
      ],
    });
    expect(() => createUsabilityStudyEvidence(sameContent.manifestPath)).toThrow(
      /must be separate retained files/,
    );
  });

  it('rejects recording artifacts with unsupported extensions or undersized bytes', () => {
    const badExtension = makeStudy({
      participantOptions: [{ screenRecordingName: 'P01-screen-recording.txt' }],
    });
    expect(() => createUsabilityStudyEvidence(badExtension.manifestPath)).toThrow(
      /file extensions/,
    );

    const undersizedAudio = makeStudy({
      participantOptions: [{ audioRecordingBytes: Buffer.alloc(1024, 0x41) }],
    });
    expect(() => createUsabilityStudyEvidence(undersizedAudio.manifestPath)).toThrow(
      /at least 16384 bytes/,
    );
  });

  it('rejects invalid R1-R5 recording timecode ranges', () => {
    const study = makeStudy();
    const range = study.participants[0].record.refusals[0].recordingTimecode;
    range.endSeconds = range.startSeconds;
    json(study.participants[0].path, study.participants[0].record);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /endSeconds must be greater than startSeconds/,
    );
  });

  it('rejects C1 timecodes that are not bound to the retained recording hashes', () => {
    const study = makeStudy();
    study.participants[0].record.comprehension.recordingTimecode.audioRecordingSha256 =
      '0'.repeat(64);
    json(study.participants[0].path, study.participants[0].record);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /C1\.recordingTimecode\.audioRecordingSha256 does not match/,
    );
  });

  it('rejects a second-rater selection that is not the exact seeded SHA-256 sample', () => {
    const study = makeStudy();
    study.input.secondRaterSelection.selectedScenarioIds.reverse();
    json(study.manifestPath, study.input);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /must equal the deterministic 10\/25 SHA-256 selection/,
    );
  });

  it('rejects a second rating outside the deterministic selected sample', () => {
    const study = makeStudy();
    const selected = new Set(study.input.secondRaterSelection.selectedScenarioIds);
    const unselectedScenarioId = study.participants
      .flatMap(({ id }) =>
        Object.keys(REFUSALS).map((fixtureId) => `${id}:${fixtureId}`),
      )
      .find((scenarioId) => !selected.has(scenarioId));
    const [participantId, fixtureId] = unselectedScenarioId.split(':');
    study.input.secondRaterRatings[0] = {
      ...study.input.secondRaterRatings[0],
      participantId,
      fixtureId,
    };
    json(study.manifestPath, study.input);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /is not in the deterministic second-rater selection/,
    );
  });

  it('rejects obvious personal identity fields in participant records', () => {
    const study = makeStudy();
    study.participants[0].record.email = 'participant@example.org';
    json(study.participants[0].path, study.participants[0].record);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /forbidden personal-identity field/,
    );
  });

  it('rejects tampered retained evidence', () => {
    const study = makeStudy();
    writeFileSync(resolve(study.dir, 'P01-screen.png'), 'tampered');

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /hash mismatch/,
    );
  });

  it('rejects refusal codes that do not match the frozen fixture manifest', () => {
    const study = makeStudy();
    study.participants[0].record.refusals[0].targetCode = 'LOW_R2';
    json(study.participants[0].path, study.participants[0].record);

    expect(() => createUsabilityStudyEvidence(study.manifestPath)).toThrow(
      /target code does not match/,
    );
  });

  it('serializes deterministically from the same retained bytes', () => {
    const study = makeStudy();
    const first = serializeUsabilityStudyEvidence(
      createUsabilityStudyEvidence(study.manifestPath),
    );
    const second = serializeUsabilityStudyEvidence(
      createUsabilityStudyEvidence(study.manifestPath),
    );
    expect(second).toBe(first);
  });
});
