#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_SCHEMA =
  'activation-energy-studio/external-evidence-adjudication-input/v1';
export const EXTERNAL_EVIDENCE_ADJUDICATION_RECORD_SCHEMA =
  'activation-energy-studio/external-evidence-adjudication-record/v1';

export const EXTERNAL_GATE_IDS = Object.freeze([
  'AC-SCI-03',
  'AC-VAL-05',
  'AC-PLAT-01',
  'AC-PLAT-02',
  'AC-UX-01',
  'AC-UX-02',
  'AC-UX-03',
  'AC-UX-04',
]);

export const LANE_GATE_IDS = Object.freeze({
  scientific: Object.freeze(['AC-SCI-03', 'AC-VAL-05']),
  platform: Object.freeze(['AC-PLAT-01', 'AC-PLAT-02']),
  usability: Object.freeze([
    'AC-UX-01',
    'AC-UX-02',
    'AC-UX-03',
    'AC-UX-04',
  ]),
});

const LANE_RECORD_CONTRACTS = Object.freeze({
  scientific: Object.freeze({
    schemaField: 'schema',
    schema:
      'activation-energy-studio/scientific-review-evidence-record/v1',
    stateField: 'recordState',
    state:
      'STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT',
  }),
  platform: Object.freeze({
    schemaField: 'schemaVersion',
    schema: 'activation-energy-studio/platform-human-review-record/v1',
    stateField: 'recordState',
    state:
      'STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT',
  }),
  usability: Object.freeze({
    schemaField: 'schemaVersion',
    schema: 'activation-energy-studio/usability-study-evidence-record/v1',
    stateField: 'evidenceState',
    state:
      'AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT',
  }),
});

const ALLOWED_SIGNATURE_METHODS = Object.freeze([
  'PADES_DIGITAL_SIGNATURE',
  'PGP_DETACHED_SIGNATURE',
  'MINISIGN_DETACHED_SIGNATURE',
  'WET_SIGNATURE_WITH_INDEPENDENT_IDENTITY_CHECK',
  'OTHER_INDEPENDENTLY_VERIFIED_SIGNATURE',
]);
const CONTENT_DECISIONS = Object.freeze(['PASS', 'FAIL', 'NOT_VERIFIED']);
const AUTHENTICITY_DECISIONS = Object.freeze([
  'VERIFIED',
  'FAILED',
  'NOT_VERIFIED',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const PLACEHOLDER_PATTERN =
  /(?:\b(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER)\b|REPLACE[_ -]?WITH|NOT[_ -]?VERIFIED[_ -]?YET|YOUR[_ -]?NAME|<[^>]+>|\[[^\]]+\])/iu;

export class ExternalEvidenceAdjudicationError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'ExternalEvidenceAdjudicationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ExternalEvidenceAdjudicationError(code, message);
}

function objectAt(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('CLOSEOUT_INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const item = objectAt(value, label);
  const actual = Object.keys(item).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length
    || actual.some((key, index) => key !== required[index])
  ) {
    fail(
      'CLOSEOUT_EXACT_KEYS_MISMATCH',
      `${label} keys must be exactly ${required.join(', ')}; received ${actual.join(', ')}.`,
    );
  }
  return item;
}

function nonPlaceholderString(value, label) {
  if (typeof value !== 'string' || value.trim().length < 3) {
    fail('CLOSEOUT_EMPTY_FIELD', `${label} must be a completed string.`);
  }
  const text = value.trim();
  if (PLACEHOLDER_PATTERN.test(text)) {
    fail('CLOSEOUT_PLACEHOLDER', `${label} contains a placeholder.`);
  }
  return text;
}

function booleanAt(value, label) {
  if (typeof value !== 'boolean') {
    fail('CLOSEOUT_INVALID_BOOLEAN', `${label} must be boolean.`);
  }
  return value;
}

function utcAt(value, label) {
  const text = nonPlaceholderString(value, label);
  if (!UTC_PATTERN.test(text) || !Number.isFinite(Date.parse(text))) {
    fail(
      'CLOSEOUT_INVALID_UTC',
      `${label} must be a real ISO-8601 UTC timestamp ending in Z.`,
    );
  }
  return { text, epoch: Date.parse(text) };
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function expectedSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('CLOSEOUT_INVALID_SHA256', `${label} must be lowercase SHA-256.`);
  }
  return value;
}

function portablePath(value, label) {
  const text = nonPlaceholderString(value, label);
  if (
    path.isAbsolute(text)
    || text.includes('\\')
    || text.split('/').some((part) => ['', '.', '..'].includes(part))
  ) {
    fail(
      'CLOSEOUT_PATH_TRAVERSAL',
      `${label} must be a portable relative path without dot segments.`,
    );
  }
  return text;
}

function resolveContainedFile(root, descriptor, label) {
  const lock = exactKeys(descriptor, ['path', 'sha256'], label);
  const portable = portablePath(lock.path, `${label}.path`);
  const expected = expectedSha256(lock.sha256, `${label}.sha256`);
  const absoluteRoot = realpathSync(root);
  const candidate = path.resolve(absoluteRoot, ...portable.split('/'));
  if (
    !candidate.startsWith(`${absoluteRoot}${path.sep}`)
    || !existsSync(candidate)
    || !statSync(candidate).isFile()
    || statSync(candidate).size === 0
  ) {
    fail('CLOSEOUT_FILE_MISSING', `${label} is missing or empty: ${portable}.`);
  }
  const realCandidate = realpathSync(candidate);
  const relative = path.relative(absoluteRoot, realCandidate);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail(
      'CLOSEOUT_PATH_TRAVERSAL',
      `${label} resolves outside the adjudication evidence root.`,
    );
  }
  const actual = sha256File(realCandidate);
  if (actual !== expected) {
    fail(
      'CLOSEOUT_HASH_MISMATCH',
      `${label}: expected ${expected}, actual ${actual}.`,
    );
  }
  return {
    path: portable,
    sha256: actual,
    bytes: statSync(realCandidate).size,
    absolutePath: realCandidate,
  };
}

function publicLock(lock) {
  return {
    path: lock.path,
    sha256: lock.sha256,
    bytes: lock.bytes,
  };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'CLOSEOUT_JSON_INVALID',
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function assertLaneBoundary(lane, record) {
  const contract = LANE_RECORD_CONTRACTS[lane];
  if (
    record[contract.schemaField] !== contract.schema
    || record[contract.stateField] !== contract.state
  ) {
    fail(
      'CLOSEOUT_LANE_CONTRACT_MISMATCH',
      `${lane} record does not have the required schema and pre-adjudication state.`,
    );
  }
  if (lane === 'scientific') {
    if (
      record.acceptanceGateClosure !== 'NOT_AUTOMATICALLY_APPLIED'
      || record.signedVerdict?.authenticityStatus !==
        'NOT_VERIFIED_BY_SOFTWARE'
    ) {
      fail(
        'CLOSEOUT_LANE_BOUNDARY_MISMATCH',
        'Scientific record lost its non-automatic/authenticity boundary.',
      );
    }
  } else if (
    record.acceptanceGateStatus !== 'NOT_AUTOMATICALLY_APPLIED'
    || record.authenticityStatus !== 'NOT_VERIFIED_BY_SOFTWARE'
  ) {
    fail(
      'CLOSEOUT_LANE_BOUNDARY_MISMATCH',
      `${lane} record lost its non-automatic/authenticity boundary.`,
    );
  }
}

function scientificReleaseSha256(record) {
  return expectedSha256(
    record.locks?.releaseSha256,
    'scientific.locks.releaseSha256',
  );
}

function resolvePlatformSourceRecord(root, descriptor, label) {
  const item = exactKeys(
    descriptor,
    ['path', 'fileName', 'sizeBytes', 'sha256'],
    label,
  );
  const fileName = nonPlaceholderString(item.fileName, `${label}.fileName`);
  if (!Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0) {
    fail(
      'CLOSEOUT_PLATFORM_SOURCE_SIZE_INVALID',
      `${label}.sizeBytes must be a positive integer.`,
    );
  }
  const file = resolveContainedFile(
    root,
    { path: item.path, sha256: item.sha256 },
    label,
  );
  if (
    path.basename(file.path) !== fileName
    || file.bytes !== item.sizeBytes
  ) {
    fail(
      'CLOSEOUT_PLATFORM_SOURCE_METADATA_MISMATCH',
      `${label} fileName or sizeBytes differs from the retained source bytes.`,
    );
  }
  return file;
}

function platformSourceRecordReleaseBinding(
  record,
  recordFile,
  closeoutRoot,
) {
  const sources = record.matrixIntegrity?.sourceRecords;
  if (!Array.isArray(sources) || sources.length !== 3) {
    fail(
      'CLOSEOUT_PLATFORM_SOURCE_SET_INVALID',
      'Platform human-review record must bind exactly three source records.',
    );
  }
  const families = Array.isArray(record.platforms)
    ? record.platforms.map((item) => item?.osFamily)
    : [];
  if (
    JSON.stringify([...new Set(families)].sort())
    !== JSON.stringify(['macos', 'ubuntu', 'windows11'])
  ) {
    fail(
      'CLOSEOUT_PLATFORM_SOURCE_SET_INVALID',
      'Platform record must contain unique macos, ubuntu, and windows11 reviews.',
    );
  }
  const laneRoot = path.dirname(recordFile.absolutePath);
  const hashes = [];
  const sourceFiles = [];
  for (const [index, source] of sources.entries()) {
    const sourceLock = resolvePlatformSourceRecord(
      laneRoot,
      source,
      `platform.matrixIntegrity.sourceRecords[${index}]`,
    );
    const sourceRecord = readJson(
      sourceLock.absolutePath,
      `platform source record ${index}`,
    );
    if (
      sourceRecord.schemaVersion
        !== 'activation-energy-studio/platform-evidence-record/v1'
    ) {
      fail(
        'CLOSEOUT_PLATFORM_SOURCE_SCHEMA_MISMATCH',
        `Platform source record ${index} has the wrong schema.`,
      );
    }
    hashes.push(
      expectedSha256(
        sourceRecord.artifacts?.release?.sha256,
        `platform source record ${index} release sha256`,
      ),
    );
    sourceFiles.push({
      path: path
        .relative(closeoutRoot, sourceLock.absolutePath)
        .split(path.sep)
        .join('/'),
      sha256: sourceLock.sha256,
      bytes: sourceLock.bytes,
    });
  }
  if (new Set(hashes).size !== 1) {
    fail(
      'CLOSEOUT_RELEASE_MISMATCH',
      'Platform source records do not bind one identical release.',
    );
  }
  return {
    releaseSha256: hashes[0],
    sourceFiles,
  };
}

function usabilityReleaseSha256(record) {
  return expectedSha256(record.build?.sha256, 'usability.build.sha256');
}

function technicalDecisions(lane, record) {
  if (lane === 'scientific') {
    return Object.fromEntries(
      LANE_GATE_IDS.scientific.map((gateId) => {
        const decision =
          record.gateDispositions?.[gateId]?.reviewerDisposition;
        if (!['PASS', 'FAIL'].includes(decision)) {
          fail(
            'CLOSEOUT_LANE_DECISION_INVALID',
            `Scientific ${gateId} reviewer disposition is invalid.`,
          );
        }
        return [gateId, decision];
      }),
    );
  }
  if (lane === 'platform') {
    if (
      !['PASS', 'FAIL'].includes(record.reviewerMatrixDisposition)
      || typeof record.eligibleForHumanGateDisposition !== 'boolean'
    ) {
      fail(
        'CLOSEOUT_LANE_DECISION_INVALID',
        'Platform reviewer matrix disposition is invalid.',
      );
    }
    if (
      (record.reviewerMatrixDisposition === 'PASS')
      !== record.eligibleForHumanGateDisposition
    ) {
      fail(
        'CLOSEOUT_LANE_FALSE_PASS',
        'Platform eligibility contradicts the reviewer matrix disposition.',
      );
    }
    return Object.fromEntries(
      LANE_GATE_IDS.platform.map((gateId) => [
        gateId,
        record.reviewerMatrixDisposition,
      ]),
    );
  }
  return Object.fromEntries(
    LANE_GATE_IDS.usability.map((gateId) => {
      const decision = record.automatedThresholds?.[gateId];
      if (!['PASS', 'FAIL', 'NOT_TESTED'].includes(decision)) {
        fail(
          'CLOSEOUT_LANE_DECISION_INVALID',
          `Usability ${gateId} automated threshold is invalid.`,
        );
      }
      return [gateId, decision];
    }),
  );
}

function validateAdjudicator(value, label) {
  const item = exactKeys(
    value,
    [
      'name',
      'organization',
      'professionalReference',
      'isHumanAdjudicator',
      'independentFromProject',
      'notProjectContributor',
      'noConflictOfInterest',
    ],
    label,
  );
  const normalized = {
    name: nonPlaceholderString(item.name, `${label}.name`),
    organization: nonPlaceholderString(
      item.organization,
      `${label}.organization`,
    ),
    professionalReference: nonPlaceholderString(
      item.professionalReference,
      `${label}.professionalReference`,
    ),
    isHumanAdjudicator: booleanAt(
      item.isHumanAdjudicator,
      `${label}.isHumanAdjudicator`,
    ),
    independentFromProject: booleanAt(
      item.independentFromProject,
      `${label}.independentFromProject`,
    ),
    notProjectContributor: booleanAt(
      item.notProjectContributor,
      `${label}.notProjectContributor`,
    ),
    noConflictOfInterest: booleanAt(
      item.noConflictOfInterest,
      `${label}.noConflictOfInterest`,
    ),
  };
  if (
    !normalized.isHumanAdjudicator
    || !normalized.independentFromProject
    || !normalized.notProjectContributor
    || !normalized.noConflictOfInterest
  ) {
    fail(
      'CLOSEOUT_ADJUDICATOR_INELIGIBLE',
      `${label} must declare a human, independent, conflict-free adjudicator.`,
    );
  }
  return normalized;
}

function validateReview(value, label) {
  const item = exactKeys(
    value,
    [
      'startedAtUtc',
      'endedAtUtc',
      'signatureUtc',
      'reviewReference',
      'signatureMethod',
      'signatureVerificationReference',
    ],
    label,
  );
  const started = utcAt(item.startedAtUtc, `${label}.startedAtUtc`);
  const ended = utcAt(item.endedAtUtc, `${label}.endedAtUtc`);
  const signed = utcAt(item.signatureUtc, `${label}.signatureUtc`);
  if (ended.epoch <= started.epoch || signed.epoch < ended.epoch) {
    fail(
      'CLOSEOUT_TIME_ORDER_INVALID',
      `${label} must have start < end <= signature time.`,
    );
  }
  const signatureMethod = nonPlaceholderString(
    item.signatureMethod,
    `${label}.signatureMethod`,
  );
  if (!ALLOWED_SIGNATURE_METHODS.includes(signatureMethod)) {
    fail(
      'CLOSEOUT_SIGNATURE_METHOD_INVALID',
      `${label}.signatureMethod is unsupported.`,
    );
  }
  return {
    startedAtUtc: started.text,
    endedAtUtc: ended.text,
    signatureUtc: signed.text,
    reviewReference: nonPlaceholderString(
      item.reviewReference,
      `${label}.reviewReference`,
    ),
    signatureMethod,
    signatureVerificationReference: nonPlaceholderString(
      item.signatureVerificationReference,
      `${label}.signatureVerificationReference`,
    ),
  };
}

function validateGateDecisions(value, lane, technicalByGate) {
  if (!Array.isArray(value)) {
    fail(
      'CLOSEOUT_GATE_SET_INVALID',
      `lanes.${lane}.gateDecisions must be an array.`,
    );
  }
  const expected = LANE_GATE_IDS[lane];
  const normalized = value.map((candidate, index) => {
    const label = `lanes.${lane}.gateDecisions[${index}]`;
    const item = exactKeys(
      candidate,
      [
        'gateId',
        'contentDecision',
        'authenticityDecision',
        'evidenceReference',
        'rationale',
      ],
      label,
    );
    const gateId = nonPlaceholderString(item.gateId, `${label}.gateId`);
    const contentDecision = nonPlaceholderString(
      item.contentDecision,
      `${label}.contentDecision`,
    );
    const authenticityDecision = nonPlaceholderString(
      item.authenticityDecision,
      `${label}.authenticityDecision`,
    );
    if (
      !CONTENT_DECISIONS.includes(contentDecision)
      || !AUTHENTICITY_DECISIONS.includes(authenticityDecision)
    ) {
      fail(
        'CLOSEOUT_GATE_DECISION_INVALID',
        `${label} contains an unsupported decision.`,
      );
    }
    return {
      gateId,
      technicalDecision: technicalByGate[gateId],
      contentDecision,
      authenticityDecision,
      evidenceReference: nonPlaceholderString(
        item.evidenceReference,
        `${label}.evidenceReference`,
      ),
      rationale: nonPlaceholderString(item.rationale, `${label}.rationale`),
    };
  });
  const actual = normalized.map((item) => item.gateId).sort();
  if (
    new Set(actual).size !== actual.length
    || JSON.stringify(actual) !== JSON.stringify([...expected].sort())
  ) {
    fail(
      'CLOSEOUT_GATE_SET_INVALID',
      `${lane} gate IDs must be exactly ${expected.join(', ')}.`,
    );
  }
  return normalized.sort(
    (left, right) =>
      EXTERNAL_GATE_IDS.indexOf(left.gateId)
      - EXTERNAL_GATE_IDS.indexOf(right.gateId),
  );
}

function deriveClosureDisposition(decision) {
  if (
    decision.technicalDecision === 'FAIL'
    || decision.contentDecision === 'FAIL'
    || decision.authenticityDecision === 'FAILED'
  ) {
    return 'FAIL';
  }
  if (
    decision.technicalDecision === 'PASS'
    && decision.contentDecision === 'PASS'
    && decision.authenticityDecision === 'VERIFIED'
  ) {
    return 'HUMAN_ADJUDICATED_PASS';
  }
  return 'REMAINS_OPEN';
}

function validateLane(
  lane,
  value,
  root,
  releaseSha256,
) {
  const item = exactKeys(
    value,
    [
      'evidenceRecord',
      'humanAudit',
      'signedAudit',
      'adjudicator',
      'review',
      'gateDecisions',
    ],
    `lanes.${lane}`,
  );
  const evidenceRecord = resolveContainedFile(
    root,
    item.evidenceRecord,
    `lanes.${lane}.evidenceRecord`,
  );
  const humanAudit = resolveContainedFile(
    root,
    item.humanAudit,
    `lanes.${lane}.humanAudit`,
  );
  const signedAudit = resolveContainedFile(
    root,
    item.signedAudit,
    `lanes.${lane}.signedAudit`,
  );
  if (
    new Set([
      evidenceRecord.absolutePath,
      humanAudit.absolutePath,
      signedAudit.absolutePath,
    ]).size !== 3
  ) {
    fail(
      'CLOSEOUT_DUPLICATE_ARTIFACT',
      `${lane} evidence, audit, and signed audit must be distinct files.`,
    );
  }
  const record = readJson(evidenceRecord.absolutePath, `${lane} evidence record`);
  assertLaneBoundary(lane, record);
  const platformBinding =
    lane === 'platform'
      ? platformSourceRecordReleaseBinding(
          record,
          evidenceRecord,
          realpathSync(root),
        )
      : null;
  const boundReleaseSha256 =
    lane === 'scientific'
      ? scientificReleaseSha256(record)
      : lane === 'platform'
        ? platformBinding.releaseSha256
        : usabilityReleaseSha256(record);
  if (boundReleaseSha256 !== releaseSha256) {
    fail(
      'CLOSEOUT_RELEASE_MISMATCH',
      `${lane} record does not bind the adjudicated release bytes.`,
    );
  }
  const technicalByGate = technicalDecisions(lane, record);
  const adjudicator = validateAdjudicator(
    item.adjudicator,
    `lanes.${lane}.adjudicator`,
  );
  const review = validateReview(item.review, `lanes.${lane}.review`);
  const gateDispositions = validateGateDecisions(
    item.gateDecisions,
    lane,
    technicalByGate,
  ).map((decision) => ({
    ...decision,
    closureDisposition: deriveClosureDisposition(decision),
  }));
  return {
    lane,
    locks: {
      evidenceRecord: publicLock(evidenceRecord),
      humanAudit: publicLock(humanAudit),
      signedAudit: publicLock(signedAudit),
      ...(platformBinding
        ? { sourceRecords: platformBinding.sourceFiles }
        : {}),
    },
    boundReleaseSha256,
    adjudicator,
    review,
    gateDispositions,
  };
}

export function createExternalEvidenceAdjudicationRecord({ inputPath }) {
  if (!inputPath) {
    fail('CLOSEOUT_ARGUMENT_MISSING', 'inputPath is required.');
  }
  const absoluteInput = path.resolve(inputPath);
  if (!existsSync(absoluteInput) || !statSync(absoluteInput).isFile()) {
    fail('CLOSEOUT_FILE_MISSING', `Input is missing: ${absoluteInput}.`);
  }
  const root = path.dirname(realpathSync(absoluteInput));
  const input = readJson(absoluteInput, 'adjudication input');
  exactKeys(
    input,
    [
      'schemaVersion',
      'adjudicationId',
      'release',
      'acceptanceCriteria',
      'lanes',
    ],
    'input',
  );
  if (input.schemaVersion !== EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_SCHEMA) {
    fail(
      'CLOSEOUT_INPUT_SCHEMA_MISMATCH',
      `Expected ${EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_SCHEMA}.`,
    );
  }
  const adjudicationId = nonPlaceholderString(
    input.adjudicationId,
    'input.adjudicationId',
  );
  if (!ID_PATTERN.test(adjudicationId)) {
    fail(
      'CLOSEOUT_ID_INVALID',
      'input.adjudicationId contains unsupported characters.',
    );
  }
  const release = resolveContainedFile(root, input.release, 'input.release');
  const acceptanceCriteria = resolveContainedFile(
    root,
    input.acceptanceCriteria,
    'input.acceptanceCriteria',
  );
  const lanesInput = exactKeys(
    input.lanes,
    ['scientific', 'platform', 'usability'],
    'input.lanes',
  );
  const lanes = ['scientific', 'platform', 'usability'].map((lane) =>
    validateLane(lane, lanesInput[lane], root, release.sha256),
  );
  const primaryLaneLocks = lanes.flatMap((lane) => [
    lane.locks.evidenceRecord,
    lane.locks.humanAudit,
    lane.locks.signedAudit,
  ]);
  if (
    new Set(primaryLaneLocks.map((lock) => lock.path)).size
      !== primaryLaneLocks.length
  ) {
    fail(
      'CLOSEOUT_DUPLICATE_ARTIFACT',
      'Every lane evidence record, human audit, and signed audit must be a distinct file.',
    );
  }
  const humanAuditLocks = lanes.flatMap((lane) => [
    lane.locks.humanAudit,
    lane.locks.signedAudit,
  ]);
  if (
    new Set(humanAuditLocks.map((lock) => lock.sha256)).size
      !== humanAuditLocks.length
  ) {
    fail(
      'CLOSEOUT_DUPLICATE_ARTIFACT',
      'Every lane human-audit and signed-audit artifact must have distinct bytes.',
    );
  }
  const gateDispositions = lanes
    .flatMap((lane) =>
      lane.gateDispositions.map((gate) => ({
        gateId: gate.gateId,
        lane: lane.lane,
        technicalDecision: gate.technicalDecision,
        contentDecision: gate.contentDecision,
        authenticityDecision: gate.authenticityDecision,
        evidenceReference: gate.evidenceReference,
        rationale: gate.rationale,
        closureDisposition: gate.closureDisposition,
      })),
    )
    .sort(
      (left, right) =>
        EXTERNAL_GATE_IDS.indexOf(left.gateId)
        - EXTERNAL_GATE_IDS.indexOf(right.gateId),
    );
  if (
    JSON.stringify(gateDispositions.map((gate) => gate.gateId))
    !== JSON.stringify(EXTERNAL_GATE_IDS)
  ) {
    fail(
      'CLOSEOUT_GATE_SET_INVALID',
      'The combined adjudication must contain exactly the eight external gates.',
    );
  }
  const dispositionCounts = Object.fromEntries(
    ['HUMAN_ADJUDICATED_PASS', 'FAIL', 'REMAINS_OPEN'].map((status) => [
      status,
      gateDispositions.filter(
        (gate) => gate.closureDisposition === status,
      ).length,
    ]),
  );
  const allEightHumanAdjudicatedPass =
    dispositionCounts.HUMAN_ADJUDICATED_PASS === EXTERNAL_GATE_IDS.length;
  const recordState =
    dispositionCounts.FAIL > 0
      ? 'STRUCTURALLY_VALIDATED_EXTERNAL_EVIDENCE_FAILURE_RECORDED'
      : allEightHumanAdjudicatedPass
        ? 'STRUCTURALLY_VALIDATED_ALL_EIGHT_HUMAN_ADJUDICATED_PASS_AWAITING_GATE_APPLICATION'
        : 'STRUCTURALLY_VALIDATED_EXTERNAL_EVIDENCE_REMAINS_OPEN';
  return {
    schemaVersion: EXTERNAL_EVIDENCE_ADJUDICATION_RECORD_SCHEMA,
    adjudicationId,
    recordState,
    locks: {
      sourceInput: {
        path: path.basename(absoluteInput),
        sha256: sha256File(absoluteInput),
        bytes: statSync(absoluteInput).size,
      },
      release: publicLock(release),
      acceptanceCriteria: publicLock(acceptanceCriteria),
    },
    lanes,
    gateDispositions,
    summary: {
      gateCount: gateDispositions.length,
      dispositionCounts,
      allEightHumanAdjudicatedPass,
    },
    softwareAuthenticatedIdentity: false,
    acceptanceGatesAutomaticallyApplied: false,
    validatedMvp: false,
    boundary:
      'This recorder verifies retained bytes, declared adjudicator structure, decision consistency, and release binding. VERIFIED is a signed human adjudication claim, not software authentication. This record never edits acceptance status, closes a known issue, authenticates a person or signature, or declares a validated MVP.',
  };
}

export function serializeExternalEvidenceAdjudicationRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writeExternalEvidenceAdjudicationRecord({
  inputPath,
  outputPath,
  assertAllPass = false,
}) {
  if (!outputPath) {
    fail('CLOSEOUT_ARGUMENT_MISSING', 'outputPath is required.');
  }
  const record = createExternalEvidenceAdjudicationRecord({ inputPath });
  if (assertAllPass && !record.summary.allEightHumanAdjudicatedPass) {
    fail(
      'CLOSEOUT_ASSERT_ALL_PASS_FAILED',
      'All eight external gates are not HUMAN_ADJUDICATED_PASS.',
    );
  }
  const output = path.resolve(outputPath);
  if (path.extname(output).toLowerCase() !== '.json') {
    fail('CLOSEOUT_OUTPUT_INVALID', 'Output path must use .json.');
  }
  const protectedPaths = new Set([
    realpathSync(path.resolve(inputPath)),
    ...[
      record.locks.release,
      record.locks.acceptanceCriteria,
      ...record.lanes.flatMap((lane) =>
        Object.values(lane.locks).flatMap((value) =>
          Array.isArray(value) ? value : [value],
        ),
      ),
    ].map((lock) =>
      realpathSync(
        path.resolve(
          path.dirname(realpathSync(path.resolve(inputPath))),
          ...lock.path.split('/'),
        ),
      ),
    ),
  ]);
  if (
    protectedPaths.has(output)
    || (existsSync(output) && protectedPaths.has(realpathSync(output)))
  ) {
    fail(
      'CLOSEOUT_OUTPUT_COLLISION',
      'Output must not overwrite input evidence.',
    );
  }
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    writeFileSync(
      temporary,
      serializeExternalEvidenceAdjudicationRecord(record),
      'utf8',
    );
    rmSync(output, { force: true });
    renameSync(temporary, output);
  } catch (error) {
    rmSync(temporary, { force: true });
    if (error instanceof ExternalEvidenceAdjudicationError) throw error;
    fail(
      'CLOSEOUT_OUTPUT_WRITE_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }
  return record;
}

function parseArguments(argv) {
  const options = {
    assertAllPass: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--assert-all-pass') {
      options.assertAllPass = true;
    } else if (argument === '--input' || argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        fail(
          'CLOSEOUT_ARGUMENT_MISSING',
          `${argument} requires a path.`,
        );
      }
      options[argument.slice(2) + 'Path'] = value;
      index += 1;
    } else {
      fail('CLOSEOUT_ARGUMENT_UNKNOWN', `Unknown argument: ${argument}.`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/adjudicate-external-evidence.mjs \\
  --input <completed-adjudication-input.json> \\
  --output <external-evidence-adjudication-record.json> \\
  [--assert-all-pass]

TECHNICAL_OK means only that bytes and the declared human adjudication are
structurally consistent. Identity is not software-authenticated, acceptance
gates are not automatically applied, and validatedMvp remains false.`;
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    if (!options.inputPath || !options.outputPath) {
      fail(
        'CLOSEOUT_ARGUMENT_MISSING',
        'Both --input and --output are required.',
      );
    }
    const record = writeExternalEvidenceAdjudicationRecord(options);
    console.log(
      `TECHNICAL_OK EXTERNAL_EVIDENCE_ADJUDICATION_RECORDED `
        + `output=${path.resolve(options.outputPath)} `
        + `humanAdjudicatedPass=${record.summary.dispositionCounts.HUMAN_ADJUDICATED_PASS} `
        + `fail=${record.summary.dispositionCounts.FAIL} `
        + `remainsOpen=${record.summary.dispositionCounts.REMAINS_OPEN} `
        + 'softwareAuthenticatedIdentity=false '
        + 'acceptanceGatesAutomaticallyApplied=false validatedMvp=false',
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCli();
