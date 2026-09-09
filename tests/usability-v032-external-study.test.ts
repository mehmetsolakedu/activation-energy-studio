// @ts-nocheck

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';
import {
  buildUsabilityV032FixtureBundle,
  checkUsabilityV032FixtureBundle,
} from '../scripts/generate-usability-fixtures-v0.3.2.mjs';
import { checkUsabilityV032StudyKit } from '../scripts/generate-usability-study-kit-v0.3.2.mjs';
import {
  createUsabilityV032StudyEvidence,
  validateUsabilityV032ObservedStudyInput,
} from '../scripts/record-usability-study-v0.3.2.mjs';
import { verifyUsabilityV032StudyKit } from '../scripts/verify-usability-study-kit-v0.3.2.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_ROOT = resolve(PROJECT_ROOT, 'evidence/usability/v0.3.2');
const FIXTURE_MANIFEST = resolve(FIXTURE_ROOT, 'UX_FIXTURE_MANIFEST.json');
const RELEASE = resolve(
  PROJECT_ROOT,
  'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
);
const FREEZE = resolve(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
);
const KIT_ROOT = resolve(
  PROJECT_ROOT,
  'output/Activation-Energy-Studio-Observed-Usability-Handoff-v0.3.2',
);
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
const temporaryDirectories = new Set<string>();

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

function sha(pathOrBytes: string | Buffer): string {
  const bytes = Buffer.isBuffer(pathOrBytes)
    ? pathOrBytes
    : readFileSync(pathOrBytes);
  return createHash('sha256').update(bytes).digest('hex');
}

function fixtureFile(fileName: string): File {
  const content = readFileSync(resolve(FIXTURE_ROOT, 'study_bundle', fileName));
  return new File([content], fileName, {
    type: fileName.endsWith('.tsv')
      ? 'text/tab-separated-values'
      : 'text/csv',
  });
}

async function scientificCodes(fileNames: string[]) {
  const ingestion = await ingestThermalFiles(fileNames.map(fixtureFile));
  const adapted = buildThermalRuns(ingestion, undefined, 'v0.3.2 usability precheck');
  const analysis = adapted.runs.length === 0
    ? undefined
    : analyzeActivationEnergy(adapted.runs, {
        methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
        includeKissinger: ingestion.tables.betaTp.length >= 3,
        minR2Warning: 0.98,
      });
  return {
    analysis,
    codes: [
      ...ingestion.diagnostics.map(({ code }) => code),
      ...adapted.diagnostics.map(({ code }) => code),
      ...(analysis?.refusals.map(({ code }) => code) ?? []),
      ...(analysis?.warnings.map(({ code }) => code) ?? []),
    ],
  };
}

function json(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function bytes(size: number, header: Buffer | string, marker: number): Buffer {
  const result = Buffer.alloc(size, marker);
  Buffer.from(header).copy(result);
  result[result.length - 1] = marker;
  return result;
}

function artifact(directory: string, name: string, content: Buffer) {
  const path = resolve(directory, name);
  writeFileSync(path, content);
  return { path: name, sha256: sha(path) };
}

function deterministicSelection(seed: string, scenarioIds: string[]) {
  return scenarioIds
    .map((scenarioId) => ({
      scenarioId,
      digest: createHash('sha256')
        .update(`${seed}\0${scenarioId}`)
        .digest('hex'),
    }))
    .sort(
      (a, b) =>
        a.digest.localeCompare(b.digest) ||
        a.scenarioId.localeCompare(b.scenarioId),
    )
    .slice(0, 10)
    .map(({ scenarioId }) => scenarioId);
}

function participant(directory: string, index: number) {
  const participantId = `P0${index}`;
  const screen = artifact(
    directory,
    `${participantId}-session.mp4`,
    bytes(96 * 1024, Buffer.from('000000186674797069736f6d', 'hex'), index),
  );
  const audio = artifact(
    directory,
    `${participantId}-session.wav`,
    bytes(32 * 1024, Buffer.from('524946460000000057415645666d7420', 'hex'), index + 10),
  );
  const exportPdf = artifact(
    directory,
    `${participantId}-report.pdf`,
    bytes(4 * 1024, '%PDF-1.4\n', index + 20),
  );
  const timecode = (startSeconds: number, endSeconds: number) => ({
    screenRecordingSha256: screen.sha256,
    audioRecordingSha256: audio.sha256,
    startSeconds,
    endSeconds,
  });
  const order = Array.from({ length: 5 }, (_, offset) =>
    `R${((index - 1 + offset) % 5) + 1}`,
  );
  const record = {
    schemaVersion: 'activation-energy-studio/usability-participant-record/v1',
    studyId: 'UX-v0.3.2-20260801',
    participantId,
    evidenceOrigin: 'observed-human-session',
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
      signedAt: '2026-08-01T09:00:00Z',
      recording: true,
      signedConsentReference: `CONSENT-${participantId}-unit-test-only`,
    },
    observationSession: {
      sessionId: `SESSION-${participantId}-unit-test-only`,
      captureMode: 'LIVE_MODERATED_OBSERVATION',
      observerPresent: true,
      recordingsCreatedDuringSession: true,
      generatedOrSyntheticParticipantEvidenceUsed: false,
      startedAt: '2026-08-01T10:00:00Z',
      endedAt: '2026-08-01T11:00:00Z',
      screenRecordingDurationSeconds: 3600,
      audioRecordingDurationSeconds: 3600,
    },
    environment: {
      os: 'unit-test-only',
      browser: 'unit-test-only',
      zoomPercent: 100,
      networkOff: true,
    },
    build: {
      path: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
      bytes: readFileSync(RELEASE).byteLength,
      sha256: sha(RELEASE),
    },
    fixtureManifestSha256: sha(FIXTURE_MANIFEST),
    happyPath: {
      startedAt: '2026-08-01T10:05:00Z',
      endedAt: '2026-08-01T10:15:00Z',
      completed: true,
      macroDecisionCount: 5,
      semanticUiActivations: 11,
      rawPointerClicks: 14,
      osPickerClicks: 2,
      rescues: 0,
      formulaUsed: false,
      exportPath: exportPdf.path,
      exportSha256: exportPdf.sha256,
      openedSuccessfully: true,
    },
    refusals: order.map((fixtureId, offset) => ({
      fixtureId,
      targetCode: REFUSALS[fixtureId],
      visible: true,
      problemScore: 1,
      riskScore: 1,
      actionScore: 1,
      verbatimAnswer: `Unit-test-only retained answer for ${fixtureId}; not human evidence.`,
      recordingTimecode: timecode(120 + offset * 40, 150 + offset * 40),
    })),
    comprehension: {
      verbatimAnswer:
        'Unit-test-only four-element response; this is not observed human evidence.',
      score: 4,
      hintGiven: false,
      rubric: {
        notSameResult: true,
        eaAlphaIsConversionProfile: true,
        kissingerIsPeakSpecific: true,
        notInterchangeable: true,
      },
      recordingTimecode: timecode(360, 410),
    },
    deviations: [],
    evidence: [
      { kind: 'screen-recording', ...screen },
      { kind: 'audio-recording', ...audio },
    ],
    observer: 'O01',
    scoredAt: '2026-08-01T11:10:00Z',
  };
  const path = resolve(directory, `${participantId}.json`);
  json(path, record);
  return { participantId, path, record };
}

function mockStudy() {
  const directory = mkdtempSync(resolve(tmpdir(), 'aes-v032-usability-unit-test-'));
  temporaryDirectories.add(directory);
  const participants = Array.from({ length: 5 }, (_, index) =>
    participant(directory, index + 1),
  );
  const warningMatrix = Object.entries(WARNINGS).flatMap(
    ([fixtureId, targetCode], fixtureIndex) => {
      const ui = artifact(
        directory,
        `${fixtureId}-UI.png`,
        bytes(
          16 * 1024,
          Buffer.from('89504e470d0a1a0a', 'hex'),
          50 + fixtureIndex,
        ),
      );
      const pdf = artifact(
        directory,
        `${fixtureId}-PDF.pdf`,
        bytes(4 * 1024, '%PDF-1.4\n', 60 + fixtureIndex),
      );
      return [
        { fixtureId, targetCode, surface: 'UI', visible: true, evidence: ui },
        { fixtureId, targetCode, surface: 'PDF', visible: true, evidence: pdf },
      ];
    },
  );
  const seed = 'UX-v0.3.2-five-user-second-rater-v1';
  const scenarioIds = participants.flatMap(({ participantId }) =>
    Object.keys(REFUSALS).map((fixtureId) => `${participantId}:${fixtureId}`),
  );
  const selectedScenarioIds = deterministicSelection(seed, scenarioIds);
  const input = {
    schemaVersion: 'activation-energy-studio/usability-study-input/v1',
    studyId: 'UX-v0.3.2-20260801',
    studyVersion: 'UX-v0.3.2',
    executionState: 'OBSERVED_SESSIONS_COMPLETED',
    evidenceOrigin: 'observed-human-sessions',
    candidateFreeze: {
      path: 'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
      sha256: sha(FREEZE),
    },
    fixtureManifest: {
      path: 'evidence/usability/v0.3.2/UX_FIXTURE_MANIFEST.json',
      sha256: sha(FIXTURE_MANIFEST),
    },
    build: {
      path: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
      sha256: sha(RELEASE),
    },
    participantRecords: participants.map(({ path }) => basename(path)),
    excludedSessions: [],
    secondRaterSelection: {
      seed,
      method: 'SHA256_SEEDED_ASC_V1',
      selectedScenarioIds,
    },
    secondRaterRatings: selectedScenarioIds.map((scenarioId) => {
      const [participantId, fixtureId] = scenarioId.split(':');
      return {
        participantId,
        fixtureId,
        blind: true,
        raterId: 'O02',
        problemScore: 1,
        riskScore: 1,
        actionScore: 1,
      };
    }),
    warningMatrix,
    coordinator: {
      observerId: 'O01',
      finalizedAt: '2026-08-01T12:00:00Z',
      declarationAccepted: true,
      signedRecordReference: 'COORDINATOR-unit-test-only',
      evidenceDeclaration: {
        fiveSessionsObservedLive: true,
        recordingsCreatedDuringSessions: true,
        generatedOrSyntheticParticipantEvidenceUsed: false,
      },
      humanEvidenceAudit: {
        status: 'NOT_PERFORMED',
        auditorId: null,
        signedRecordReference: null,
      },
      acceptanceGateApplied: false,
    },
  };
  const manifestPath = resolve(directory, 'study-input.json');
  json(manifestPath, input);
  return { directory, participants, input, manifestPath };
}

describe('v0.3.2 observed-usability external-validation lane', () => {
  it('freezes eleven deterministic fixtures against the exact candidate and external criteria', () => {
    const expected = buildUsabilityV032FixtureBundle(PROJECT_ROOT);
    const current = checkUsabilityV032FixtureBundle(PROJECT_ROOT);
    expect(current.manifest).toStrictEqual(expected.manifest);
    expect(current.manifest.studyVersion).toBe('UX-v0.3.2');
    expect(current.manifest.release).toEqual({
      path: 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
      bytes: 2_503_952,
      sha256: '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8',
    });
    expect(current.manifest.candidateFreeze.sha256).toBe(
      '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758',
    );
    expect(current.manifest.acceptanceCriteria.sha256).toBe(
      '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54',
    );
    expect(current.manifest.fixtures).toHaveLength(11);
    expect(current.manifest.boundary).toContain('close no external usability gate');
  });

  it.each(Object.entries(REFUSALS))(
    'prechecks %s against exact v0.3.2 refusal %s',
    async (fixtureId, expectedCode) => {
      const fixture = {
        R1: 'R1_two_rates.csv',
        R2: 'R2_no_common_alpha.csv',
        R3: 'R3_nonmonotonic_alpha.csv',
        R4: 'R4_context_conflict.csv',
        R5: 'R5_nonlinear_time.csv',
      }[fixtureId];
      const result = await scientificCodes([fixture]);
      expect(result.codes).toContain(expectedCode);
      expect(result.analysis?.methods ?? []).toEqual([]);
    },
  );

  it.each(Object.entries(WARNINGS))(
    'prechecks %s against exact v0.3.2 warning %s',
    async (fixtureId, expectedCode) => {
      const fixture = {
        W1: 'W1_three_rates.csv',
        W2: 'W2_synthetic_kas_150.csv',
        W3: 'W3_low_r2.csv',
        W4: 'W4_multistep.csv',
      }[fixtureId];
      const result = await scientificCodes([fixture]);
      expect(result.codes).toContain(expectedCode);
      expect(result.analysis?.methods.some(({ estimates }) => estimates.length > 0)).toBe(true);
    },
  );

  it('verifies the portable package while preserving a zero-participant external-open state', () => {
    const generated = checkUsabilityV032StudyKit();
    const verified = verifyUsabilityV032StudyKit(KIT_ROOT);
    const laneStatus = JSON.parse(
      readFileSync(resolve(FIXTURE_ROOT, 'USABILITY_LANE_STATUS.json'), 'utf8'),
    );
    expect(generated.manifest.externalEvidenceComplete).toBe(false);
    expect(verified).toMatchObject({
      fixtureManifestSha256:
        '14f2e715578886139c63637300e3daa5ef544ff4a83226783ef0877159cd8e99',
      participantCount: 0,
      technicalReadiness: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
      externalEvidenceComplete: false,
    });
    expect(laneStatus).toMatchObject({
      schemaVersion:
        'activation-energy-studio/usability-external-validation-lane-status/v1',
      gateIds: ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
      participantCount: 0,
      externalEvidenceComplete: false,
      historicalV031Preserved: true,
    });
    expect(laneStatus.gates.every(({ status }) => status === 'EXTERNAL_OPEN')).toBe(true);
  });

  it('keeps all historical v0.3.1 byte locks unchanged', () => {
    expect(sha(resolve(PROJECT_ROOT, 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html'))).toBe(
      'e9750c6a7cae1aafe970094567736c042512daddcd35d67e4b17ffea3bc72587',
    );
    expect(sha(resolve(PROJECT_ROOT, 'release/v0.3.1/MANIFEST.v0.3.1.json'))).toBe(
      '72056e404fc0de538c1979f847a42245ecd9046c705b5610812dad70ffd9f20c',
    );
    expect(sha(resolve(PROJECT_ROOT, 'release/v0.3.1/SHA256SUMS.v0.3.1.txt'))).toBe(
      'a4c4ce64817aa35b21b27fdf960d40f81b11059e2835a12d930e4921af9c9de3',
    );
    expect(sha(resolve(PROJECT_ROOT, 'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json'))).toBe(
      '700e3af9001890c4b8635cf8f25ed4f1c17c1c43ad5980e25b0a461ef6a3dd8d',
    );
  });

  it('calculates structural mock thresholds without authenticating or closing a human gate', () => {
    const study = mockStudy();
    const precheck = validateUsabilityV032ObservedStudyInput(study.manifestPath);
    const record = createUsabilityV032StudyEvidence(study.manifestPath);
    expect(precheck.participants).toHaveLength(5);
    expect(record.overallThresholdDecision).toBe('PASS');
    expect(record.humanEvidenceAuditStatus).toBe('NOT_PERFORMED');
    expect(record.externalEvidenceComplete).toBe(false);
    expect(record.authenticityStatus).toBe('NOT_VERIFIED_BY_SOFTWARE');
    expect(record.externalGateStatuses).toEqual({
      'AC-UX-01': 'EXTERNAL_OPEN',
      'AC-UX-02': 'EXTERNAL_OPEN',
      'AC-UX-03': 'EXTERNAL_OPEN',
      'AC-UX-04': 'EXTERNAL_OPEN',
    });
    expect(record.v032Boundary).toContain('not proof');
  });

  it('runs the packaged recorder portably while preserving the human-audit boundary', () => {
    const study = mockStudy();
    study.input.candidateFreeze.path = 'locks/CANDIDATE_FREEZE.json';
    study.input.fixtureManifest.path = 'fixtures/UX_FIXTURE_MANIFEST.json';
    study.input.build.path = 'build/Activation-Energy-Studio-v0.3.2.html';
    for (const participant of study.participants) {
      participant.record.build.path = 'build/Activation-Energy-Studio-v0.3.2.html';
      json(participant.path, participant.record);
    }
    json(study.manifestPath, study.input);
    const output = resolve(study.directory, 'usability-evidence-record.json');
    const result = spawnSync(
      process.execPath,
      [
        resolve(KIT_ROOT, 'tools/record-usability-study-v0.3.2.mjs'),
        '--manifest',
        study.manifestPath,
        '--output',
        output,
      ],
      { cwd: KIT_ROOT, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('TECHNICAL_OK UX_V032_OBSERVED_STUDY_RECORDED');
    expect(result.stdout).toContain('humanEvidenceAuditStatus=NOT_PERFORMED');
    expect(result.stdout).toContain('externalEvidenceComplete=false');
    const record = JSON.parse(readFileSync(output, 'utf8'));
    expect(record.externalEvidenceComplete).toBe(false);
    expect(record.externalGateStatuses['AC-UX-01']).toBe('EXTERNAL_OPEN');
  });

  it('rejects the pristine NOT_RUN template as participant evidence', () => {
    expect(() =>
      validateUsabilityV032ObservedStudyInput(
        resolve(KIT_ROOT, 'study-input.template.json'),
      ),
    ).toThrow(/NOT_RUN template is not evidence/);
  });

  it('rejects a rehashed fixture-manifest substitution before participant parsing', () => {
    const study = mockStudy();
    const substitutedManifest = JSON.parse(
      readFileSync(FIXTURE_MANIFEST, 'utf8'),
    );
    substitutedManifest.fixtures.find(({ id }) => id === 'R1').expected.code =
      'LOW_R2';
    const substitutedPath = resolve(
      study.directory,
      'substituted-UX_FIXTURE_MANIFEST.json',
    );
    json(substitutedPath, substitutedManifest);
    study.input.fixtureManifest = {
      path: basename(substitutedPath),
      sha256: sha(substitutedPath),
    };
    study.input.participantRecords = [];
    json(study.manifestPath, study.input);

    expect(() =>
      validateUsabilityV032ObservedStudyInput(study.manifestPath),
    ).toThrow(/not the exact canonical v0\.3\.2 usability fixture manifest/);
  });

  it('rehashes all eleven fixture payloads at record time and rejects post-preflight tampering', () => {
    const study = mockStudy();
    const fixtureCopyRoot = resolve(study.directory, 'fixture-copy');
    const fixtureCopyBundle = resolve(fixtureCopyRoot, 'study_bundle');
    mkdirSync(fixtureCopyBundle, { recursive: true });
    const fixtureManifest = JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf8'));
    const copiedManifestPath = resolve(fixtureCopyRoot, 'UX_FIXTURE_MANIFEST.json');
    copyFileSync(FIXTURE_MANIFEST, copiedManifestPath);
    for (const fixture of fixtureManifest.fixtures) {
      copyFileSync(
        resolve(FIXTURE_ROOT, fixture.path),
        resolve(fixtureCopyRoot, fixture.path),
      );
    }
    study.input.fixtureManifest = {
      path: 'fixture-copy/UX_FIXTURE_MANIFEST.json',
      sha256: sha(copiedManifestPath),
    };
    json(study.manifestPath, study.input);

    const preflight = validateUsabilityV032ObservedStudyInput(study.manifestPath);
    expect(preflight.fixturePayloads).toHaveLength(11);

    writeFileSync(
      resolve(fixtureCopyBundle, 'R1_two_rates.csv'),
      Buffer.concat([
        readFileSync(resolve(fixtureCopyBundle, 'R1_two_rates.csv')),
        Buffer.from('\npost-preflight-tamper\n'),
      ]),
    );
    expect(() =>
      validateUsabilityV032ObservedStudyInput(study.manifestPath),
    ).toThrow(/Canonical fixture payload R1 byte count or SHA-256 mismatch/);
  });

  it('rejects a generated-evidence declaration and reused cross-participant recording', () => {
    const generated = mockStudy();
    generated.participants[0].record.observationSession.generatedOrSyntheticParticipantEvidenceUsed = true;
    json(generated.participants[0].path, generated.participants[0].record);
    expect(() => createUsabilityV032StudyEvidence(generated.manifestPath)).toThrow(
      /generated or synthetic participant evidence/,
    );

    const reused = mockStudy();
    const p01Screen = reused.participants[0].record.evidence.find(
      ({ kind }) => kind === 'screen-recording',
    );
    const p02Screen = reused.participants[1].record.evidence.find(
      ({ kind }) => kind === 'screen-recording',
    );
    writeFileSync(
      resolve(reused.directory, p02Screen.path),
      readFileSync(resolve(reused.directory, p01Screen.path)),
    );
    p02Screen.sha256 = p01Screen.sha256;
    for (const refusal of reused.participants[1].record.refusals) {
      refusal.recordingTimecode.screenRecordingSha256 = p01Screen.sha256;
    }
    reused.participants[1].record.comprehension.recordingTimecode.screenRecordingSha256 =
      p01Screen.sha256;
    json(reused.participants[1].path, reused.participants[1].record);
    expect(() => createUsabilityV032StudyEvidence(reused.manifestPath)).toThrow(
      /recording hashes must be unique|reused across participants/,
    );
  });

  it('rejects premature gate application and placeholder verbatim responses', () => {
    const premature = mockStudy();
    premature.input.coordinator.acceptanceGateApplied = true;
    json(premature.manifestPath, premature.input);
    expect(() => createUsabilityV032StudyEvidence(premature.manifestPath)).toThrow(
      /must not apply an acceptance gate/,
    );

    const placeholder = mockStudy();
    placeholder.participants[0].record.refusals[0].verbatimAnswer =
      'REPLACE_WITH_VERBATIM_FIRST_RESPONSE';
    json(placeholder.participants[0].path, placeholder.participants[0].record);
    expect(() => createUsabilityV032StudyEvidence(placeholder.manifestPath)).toThrow(
      /non-observation placeholder/,
    );
  });
});
