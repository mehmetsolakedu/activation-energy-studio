#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const P0_EVIDENCE_MAP_SCHEMA =
  'activation-energy-studio/p0-evidence-map/v1';
export const P0_EVIDENCE_LEDGER_SCHEMA =
  'activation-energy-studio/p0-evidence-ledger/v1';
export const P0_EVIDENCE_MAP_PATH =
  'evidence/governance/P0_EVIDENCE_MAP.v0.2.0.json';
export const P0_EVIDENCE_LEDGER_PATH =
  'evidence/governance/P0_EVIDENCE_LEDGER.v0.2.0.json';
export const P0_LEDGER_STATE =
  'TECHNICAL_EVIDENCE_LEDGER_VALID_WITH_EIGHT_EXTERNAL_GATES_OPEN';
export const EXTERNAL_OPEN_IDS = Object.freeze([
  'AC-SCI-03',
  'AC-VAL-05',
  'AC-PLAT-01',
  'AC-PLAT-02',
  'AC-UX-01',
  'AC-UX-02',
  'AC-UX-03',
  'AC-UX-04',
]);

const DEFAULT_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CRITERION_ID_PATTERN = /^AC-[A-Z]+-\d{2}$/u;
const PLACEHOLDER_PATTERN =
  /\b(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER)\b|<[^>]+>|\[[^\]]+\]/iu;
const BINDING_PATHS = Object.freeze({
  acceptanceCriteria: '02_ACCEPTANCE_CRITERIA.md',
  currentValidationStatus: 'CURRENT_VALIDATION_STATUS.md',
  releaseHtml: 'release/Activation-Energy-Studio-v0.2.0.html',
  releaseManifest: 'release/MANIFEST.v0.2.0.json',
  mappingSpec: P0_EVIDENCE_MAP_PATH,
});
const EXTERNAL_OUTCOME =
  'TECHNICAL_PRECONDITION_PASS_EXTERNAL_EVIDENCE_MISSING';
const CLAIM_BOUNDARY = Object.freeze({
  technicalEvidenceLedgerOnly: true,
  externalGatesClosed: false,
  externalOpenIds: EXTERNAL_OPEN_IDS,
  statement:
    'PROVEN means the current status row is PASS and hash-bound technical evidence exists. EXTERNAL_OPEN preserves PARTIAL or NOT TESTED and cannot be promoted by this ledger.',
});

export class P0EvidenceLedgerError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'P0EvidenceLedgerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new P0EvidenceLedgerError(code, message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('P0_LEDGER_INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(object(value, label)).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(
      'P0_LEDGER_UNEXPECTED_FIELDS',
      `${label} keys differ: expected ${wanted.join(', ')}, found ${actual.join(', ')}.`,
    );
  }
}

function string(value, label) {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length === 0
    || PLACEHOLDER_PATTERN.test(value)
  ) {
    fail('P0_LEDGER_PLACEHOLDER', `${label} must be a non-placeholder string.`);
  }
  return value;
}

function portableRelativePath(value, label) {
  const text = string(value, label);
  if (
    text.includes('\\')
    || path.posix.isAbsolute(text)
    || text.split('/').some((part) => ['', '.', '..'].includes(part))
  ) {
    fail(
      'P0_LEDGER_PATH_TRAVERSAL',
      `${label} must be a portable project-relative path without dot segments.`,
    );
  }
  return text;
}

function readProjectFile(projectRoot, relativePath, label) {
  const portable = portableRelativePath(relativePath, label);
  const canonicalRoot = realpathSync(path.resolve(projectRoot));
  const absolute = path.resolve(canonicalRoot, ...portable.split('/'));
  const relative = path.relative(canonicalRoot, absolute);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail('P0_LEDGER_PATH_TRAVERSAL', `${label} escapes the project root.`);
  }
  if (!existsSync(absolute)) {
    fail('P0_LEDGER_EVIDENCE_MISSING', `${label} is missing: ${portable}.`);
  }
  if (lstatSync(absolute).isSymbolicLink()) {
    fail('P0_LEDGER_SYMLINK', `${label} must not be a symlink: ${portable}.`);
  }
  if (!statSync(absolute).isFile()) {
    fail('P0_LEDGER_EVIDENCE_NOT_FILE', `${label} is not a regular file: ${portable}.`);
  }
  if (realpathSync(absolute) !== absolute) {
    fail('P0_LEDGER_SYMLINK', `${label} resolves through a symlink: ${portable}.`);
  }
  const bytes = readFileSync(absolute);
  return {
    absolute,
    bytes,
    binding: { path: portable, bytes: bytes.length, sha256: sha256(bytes) },
  };
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail('P0_LEDGER_JSON_INVALID', `${label}: ${String(error)}.`);
  }
}

function parseAcceptanceIds(bytes) {
  const ids = [
    ...bytes.toString('utf8').matchAll(/\bAC-[A-Z]+-\d{2}\b/gu),
  ].map((match) => match[0]);
  const unique = [...new Set(ids)].sort(compareCodeUnits);
  if (unique.length !== 72) {
    fail(
      'P0_LEDGER_ACCEPTANCE_COUNT',
      `02_ACCEPTANCE_CRITERIA.md has ${unique.length}, not 72, unique criterion IDs.`,
    );
  }
  return unique;
}

function parseStatusRows(bytes) {
  const rows = [
    ...bytes
      .toString('utf8')
      .matchAll(/^\|\s*(AC-[A-Z]+-\d{2})\s*\|\s*(PASS|PARTIAL|NOT TESTED)\s*\|/gmu),
  ].map((match) => ({ id: match[1], status: match[2] }));
  if (rows.length !== 72) {
    fail('P0_LEDGER_STATUS_COUNT', `Current status has ${rows.length}, not 72, P0 rows.`);
  }
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    fail('P0_LEDGER_DUPLICATE_ID', 'Current status contains duplicate P0 IDs.');
  }
  return rows;
}

function validateCommand(value, label) {
  const command = string(value, label);
  if (
    !command.startsWith('npm ')
    || /(?:[;&|><]|\$\(|`|\r|\n)/u.test(command)
  ) {
    fail('P0_LEDGER_VERIFIER_COMMAND', `${label} is not a safe explicit npm command.`);
  }
  return command;
}

function validateMap(spec, acceptanceIds, statusRows) {
  exactKeys(spec, [
    'schemaVersion',
    'version',
    'expectedCriterionCount',
    'expectedDispositionCounts',
    'expectedExternalOpenIds',
    'groups',
    'overrides',
  ], 'mapping spec');
  if (spec.schemaVersion !== P0_EVIDENCE_MAP_SCHEMA || spec.version !== '0.2.0') {
    fail('P0_LEDGER_MAP_SCHEMA', 'Mapping spec schema/version is not supported.');
  }
  if (spec.expectedCriterionCount !== 72) {
    fail('P0_LEDGER_MAP_COUNT', 'Mapping spec must declare exactly 72 criteria.');
  }
  exactKeys(
    spec.expectedDispositionCounts,
    ['PROVEN', 'EXTERNAL_OPEN'],
    'expectedDispositionCounts',
  );
  if (
    spec.expectedDispositionCounts.PROVEN !== 64
    || spec.expectedDispositionCounts.EXTERNAL_OPEN !== 8
  ) {
    fail('P0_LEDGER_STATUS_INFLATION', 'Expected disposition counts must remain 64/8.');
  }
  if (
    !Array.isArray(spec.expectedExternalOpenIds)
    || JSON.stringify(spec.expectedExternalOpenIds) !== JSON.stringify(EXTERNAL_OPEN_IDS)
  ) {
    fail('P0_LEDGER_STATUS_INFLATION', 'Expected external-open IDs were altered.');
  }
  if (!Array.isArray(spec.groups) || spec.groups.length === 0) {
    fail('P0_LEDGER_MAP_GROUPS', 'Mapping spec groups must be a non-empty array.');
  }
  const mapped = new Map();
  const groupNames = new Set();
  for (const [groupIndex, rawGroup] of spec.groups.entries()) {
    const group = object(rawGroup, `groups[${groupIndex}]`);
    exactKeys(
      group,
      ['name', 'ids', 'evidencePath', 'verifierCommand', 'observedOutcome'],
      `groups[${groupIndex}]`,
    );
    const name = string(group.name, `groups[${groupIndex}].name`);
    if (groupNames.has(name)) {
      fail('P0_LEDGER_DUPLICATE_GROUP', `Duplicate group name: ${name}.`);
    }
    groupNames.add(name);
    if (!Array.isArray(group.ids) || group.ids.length === 0) {
      fail('P0_LEDGER_MAP_GROUPS', `${name}.ids must be non-empty.`);
    }
    const defaults = {
      evidencePath: portableRelativePath(group.evidencePath, `${name}.evidencePath`),
      verifierCommand: validateCommand(group.verifierCommand, `${name}.verifierCommand`),
      observedOutcome: string(group.observedOutcome, `${name}.observedOutcome`),
    };
    for (const id of group.ids) {
      if (typeof id !== 'string' || !CRITERION_ID_PATTERN.test(id)) {
        fail('P0_LEDGER_INVALID_ID', `${name} contains invalid criterion ID ${String(id)}.`);
      }
      if (mapped.has(id)) {
        fail('P0_LEDGER_DUPLICATE_ID', `Mapping spec repeats ${id}.`);
      }
      if (id.split('-')[1] !== name) {
        fail('P0_LEDGER_GROUP_MISMATCH', `${id} is in the wrong mapping group.`);
      }
      mapped.set(id, defaults);
    }
  }
  const mappedIds = [...mapped.keys()].sort(compareCodeUnits);
  if (JSON.stringify(mappedIds) !== JSON.stringify(acceptanceIds)) {
    fail('P0_LEDGER_MISSING_ID', 'Mapping IDs differ from the 72 acceptance IDs.');
  }
  exactKeys(spec.overrides, EXTERNAL_OPEN_IDS, 'overrides');
  for (const id of EXTERNAL_OPEN_IDS) {
    const override = object(spec.overrides[id], `overrides.${id}`);
    exactKeys(
      override,
      ['evidencePath', 'verifierCommand', 'observedOutcome'],
      `overrides.${id}`,
    );
    mapped.set(id, {
      evidencePath: portableRelativePath(
        override.evidencePath,
        `overrides.${id}.evidencePath`,
      ),
      verifierCommand: validateCommand(
        override.verifierCommand,
        `overrides.${id}.verifierCommand`,
      ),
      observedOutcome: string(
        override.observedOutcome,
        `overrides.${id}.observedOutcome`,
      ),
    });
  }

  const statusExternal = statusRows
    .filter((row) => row.status !== 'PASS')
    .map((row) => row.id);
  if (JSON.stringify(statusExternal) !== JSON.stringify(EXTERNAL_OPEN_IDS)) {
    fail(
      'P0_LEDGER_STATUS_INFLATION',
      'PARTIAL/NOT TESTED IDs differ from the locked eight external-open gates.',
    );
  }
  return mapped;
}

function validateReleaseBinding(projectRoot, manifestFile, releaseFile) {
  const manifest = parseJson(manifestFile.bytes, 'release manifest');
  if (
    manifest.release?.artifact !== releaseFile.binding.path
    || manifest.release?.bytes !== releaseFile.binding.bytes
    || manifest.release?.sha256 !== releaseFile.binding.sha256
  ) {
    fail(
      'P0_LEDGER_RELEASE_MISMATCH',
      'Release manifest does not bind the exact release HTML.',
    );
  }
  const current = readProjectFile(projectRoot, manifest.release.artifact, 'manifest release artifact');
  if (JSON.stringify(current.binding) !== JSON.stringify(releaseFile.binding)) {
    fail('P0_LEDGER_RELEASE_MISMATCH', 'Manifest release path resolves inconsistently.');
  }
}

export function buildP0EvidenceLedger(
  projectRoot = DEFAULT_PROJECT_ROOT,
  mapRelativePath = P0_EVIDENCE_MAP_PATH,
) {
  const root = realpathSync(path.resolve(projectRoot));
  const bindingFiles = Object.fromEntries(
    Object.entries({ ...BINDING_PATHS, mappingSpec: mapRelativePath }).map(
      ([name, relativePath]) => [name, readProjectFile(root, relativePath, name)],
    ),
  );
  validateReleaseBinding(
    root,
    bindingFiles.releaseManifest,
    bindingFiles.releaseHtml,
  );
  const acceptanceIds = parseAcceptanceIds(bindingFiles.acceptanceCriteria.bytes);
  const statusRows = parseStatusRows(bindingFiles.currentValidationStatus.bytes);
  const statusIds = [...statusRows.map((row) => row.id)].sort(compareCodeUnits);
  if (JSON.stringify(statusIds) !== JSON.stringify(acceptanceIds)) {
    fail('P0_LEDGER_MISSING_ID', 'Acceptance and current-status criterion sets differ.');
  }
  const spec = parseJson(bindingFiles.mappingSpec.bytes, 'mapping spec');
  const mappings = validateMap(spec, acceptanceIds, statusRows);
  const evidenceCache = new Map();
  const criteria = statusRows.map(({ id, status }) => {
    const mapping = mappings.get(id);
    if (!evidenceCache.has(mapping.evidencePath)) {
      evidenceCache.set(
        mapping.evidencePath,
        readProjectFile(root, mapping.evidencePath, `${id} evidence`).binding,
      );
    }
    const external = status !== 'PASS';
    if (!external && mapping.observedOutcome !== 'PASS') {
      fail('P0_LEDGER_OUTCOME_MISMATCH', `${id} PASS requires observedOutcome PASS.`);
    }
    if (external && mapping.observedOutcome !== EXTERNAL_OUTCOME) {
      fail(
        'P0_LEDGER_STATUS_INFLATION',
        `${id} must retain the external-evidence-missing outcome.`,
      );
    }
    return {
      id,
      sourceStatus: status,
      disposition: external ? 'EXTERNAL_OPEN' : 'PROVEN',
      evidence: evidenceCache.get(mapping.evidencePath),
      verification: {
        command: mapping.verifierCommand,
        observedOutcome: mapping.observedOutcome,
      },
      externalRequirement: external
        ? 'EXTERNAL_EVIDENCE_REQUIRED_TO_CLOSE_GATE'
        : null,
    };
  });
  const provenCount = criteria.filter((item) => item.disposition === 'PROVEN').length;
  const externalOpenCount = criteria.length - provenCount;
  if (provenCount !== 64 || externalOpenCount !== 8) {
    fail('P0_LEDGER_STATUS_INFLATION', 'Ledger disposition count is not 64/8.');
  }
  const evidenceFiles = [...evidenceCache.values()].sort((left, right) =>
    compareCodeUnits(left.path, right.path));
  const evidenceSetSha256 = sha256(
    Buffer.from(
      evidenceFiles
        .map((item) => `${item.path}\0${item.bytes}\0${item.sha256}`)
        .join('\n'),
      'utf8',
    ),
  );
  return {
    schemaVersion: P0_EVIDENCE_LEDGER_SCHEMA,
    version: '0.2.0',
    recordStatus: P0_LEDGER_STATE,
    bindings: Object.fromEntries(
      Object.entries(bindingFiles).map(([name, file]) => [name, file.binding]),
    ),
    summary: {
      criterionCount: criteria.length,
      provenCount,
      externalOpenCount,
      evidenceFileCount: evidenceFiles.length,
      evidenceSetSha256,
    },
    claimBoundary: {
      ...CLAIM_BOUNDARY,
      externalOpenIds: [...EXTERNAL_OPEN_IDS],
    },
    criteria,
  };
}

export function serializeP0EvidenceLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function validateHashBinding(projectRoot, binding, label) {
  exactKeys(binding, ['path', 'bytes', 'sha256'], label);
  if (
    typeof binding.sha256 !== 'string'
    || !SHA256_PATTERN.test(binding.sha256)
    || !Number.isSafeInteger(binding.bytes)
    || binding.bytes < 0
  ) {
    fail('P0_LEDGER_HASH_INVALID', `${label} has invalid bytes/SHA-256.`);
  }
  const current = readProjectFile(projectRoot, binding.path, label).binding;
  if (JSON.stringify(binding) !== JSON.stringify(current)) {
    fail('P0_LEDGER_STALE_HASH', `${label} does not bind current file bytes.`);
  }
}

function validateRetainedLedgerStructure(projectRoot, ledger) {
  exactKeys(ledger, [
    'schemaVersion',
    'version',
    'recordStatus',
    'bindings',
    'summary',
    'claimBoundary',
    'criteria',
  ], 'ledger');
  if (
    ledger.schemaVersion !== P0_EVIDENCE_LEDGER_SCHEMA
    || ledger.version !== '0.2.0'
    || ledger.recordStatus !== P0_LEDGER_STATE
  ) {
    fail('P0_LEDGER_SCHEMA', 'Ledger schema/version/state is not supported.');
  }
  exactKeys(ledger.bindings, Object.keys(BINDING_PATHS), 'ledger.bindings');
  for (const [name, binding] of Object.entries(ledger.bindings)) {
    validateHashBinding(projectRoot, binding, `bindings.${name}`);
  }
  exactKeys(
    ledger.summary,
    [
      'criterionCount',
      'provenCount',
      'externalOpenCount',
      'evidenceFileCount',
      'evidenceSetSha256',
    ],
    'ledger.summary',
  );
  if (
    ledger.summary.criterionCount !== 72
    || ledger.summary.provenCount !== 64
    || ledger.summary.externalOpenCount !== 8
    || !SHA256_PATTERN.test(ledger.summary.evidenceSetSha256)
  ) {
    fail('P0_LEDGER_STATUS_INFLATION', 'Ledger summary must remain 72/64/8.');
  }
  exactKeys(ledger.claimBoundary, Object.keys(CLAIM_BOUNDARY), 'ledger.claimBoundary');
  if (JSON.stringify(ledger.claimBoundary) !== JSON.stringify({
    ...CLAIM_BOUNDARY,
    externalOpenIds: [...EXTERNAL_OPEN_IDS],
  })) {
    fail('P0_LEDGER_STATUS_INFLATION', 'Ledger claim boundary was altered.');
  }
  if (!Array.isArray(ledger.criteria) || ledger.criteria.length !== 72) {
    fail('P0_LEDGER_MISSING_ID', 'Ledger must contain exactly 72 criteria.');
  }
  const ids = new Set();
  for (const [index, entry] of ledger.criteria.entries()) {
    const label = `criteria[${index}]`;
    exactKeys(entry, [
      'id',
      'sourceStatus',
      'disposition',
      'evidence',
      'verification',
      'externalRequirement',
    ], label);
    if (!CRITERION_ID_PATTERN.test(entry.id)) {
      fail('P0_LEDGER_INVALID_ID', `${label}.id is invalid.`);
    }
    if (ids.has(entry.id)) {
      fail('P0_LEDGER_DUPLICATE_ID', `Ledger repeats ${entry.id}.`);
    }
    ids.add(entry.id);
    if (!['PASS', 'PARTIAL', 'NOT TESTED'].includes(entry.sourceStatus)) {
      fail('P0_LEDGER_STATUS_INVALID', `${entry.id} sourceStatus is invalid.`);
    }
    const external = EXTERNAL_OPEN_IDS.includes(entry.id);
    if (
      (!external
        && (
          entry.sourceStatus !== 'PASS'
          || entry.disposition !== 'PROVEN'
          || entry.verification?.observedOutcome !== 'PASS'
          || entry.externalRequirement !== null
        ))
      || (external
        && (
          entry.sourceStatus === 'PASS'
          || entry.disposition !== 'EXTERNAL_OPEN'
          || entry.verification?.observedOutcome !== EXTERNAL_OUTCOME
          || entry.externalRequirement !== 'EXTERNAL_EVIDENCE_REQUIRED_TO_CLOSE_GATE'
        ))
    ) {
      fail('P0_LEDGER_STATUS_INFLATION', `${entry.id} status/disposition is inflated.`);
    }
    validateHashBinding(projectRoot, entry.evidence, `${entry.id}.evidence`);
    exactKeys(entry.verification, ['command', 'observedOutcome'], `${entry.id}.verification`);
    validateCommand(entry.verification.command, `${entry.id}.verification.command`);
    string(entry.verification.observedOutcome, `${entry.id}.verification.observedOutcome`);
  }
}

export function verifyP0EvidenceLedger({
  projectRoot = DEFAULT_PROJECT_ROOT,
  ledgerPath = P0_EVIDENCE_LEDGER_PATH,
  mapRelativePath = P0_EVIDENCE_MAP_PATH,
} = {}) {
  const root = realpathSync(path.resolve(projectRoot));
  const absoluteLedger = path.isAbsolute(ledgerPath)
    ? ledgerPath
    : path.resolve(root, ...portableRelativePath(ledgerPath, 'ledgerPath').split('/'));
  if (!existsSync(absoluteLedger) || lstatSync(absoluteLedger).isSymbolicLink()) {
    fail('P0_LEDGER_SYMLINK', 'Ledger must exist and must not be a symlink.');
  }
  const retainedBytes = readFileSync(absoluteLedger);
  const retained = parseJson(retainedBytes, 'ledger');
  validateRetainedLedgerStructure(root, retained);
  const expectedBytes = Buffer.from(
    serializeP0EvidenceLedger(buildP0EvidenceLedger(root, mapRelativePath)),
    'utf8',
  );
  if (!retainedBytes.equals(expectedBytes)) {
    fail(
      'P0_LEDGER_STALE',
      'Ledger content or byte formatting differs from current deterministic evidence.',
    );
  }
  return retained;
}

export function writeP0EvidenceLedger({
  projectRoot = DEFAULT_PROJECT_ROOT,
  ledgerPath = P0_EVIDENCE_LEDGER_PATH,
  mapRelativePath = P0_EVIDENCE_MAP_PATH,
} = {}) {
  const root = realpathSync(path.resolve(projectRoot));
  const portable = portableRelativePath(ledgerPath, 'ledgerPath');
  const output = path.resolve(root, ...portable.split('/'));
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) {
    fail('P0_LEDGER_SYMLINK', 'Ledger output must not be a symlink.');
  }
  const ledger = buildP0EvidenceLedger(root, mapRelativePath);
  writeFileSync(output, serializeP0EvidenceLedger(ledger), 'utf8');
  return ledger;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/p0-evidence-ledger.mjs --write [--project-root DIR] [--output RELATIVE_PATH] [--map RELATIVE_PATH]',
    '  node scripts/p0-evidence-ledger.mjs --check [--project-root DIR] [--output RELATIVE_PATH] [--map RELATIVE_PATH]',
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    projectRoot: DEFAULT_PROJECT_ROOT,
    ledgerPath: P0_EVIDENCE_LEDGER_PATH,
    mapRelativePath: P0_EVIDENCE_MAP_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') parsed.mode = 'write';
    else if (argument === '--check') parsed.mode = 'check';
    else if (argument === '--help') parsed.help = true;
    else if (['--project-root', '--output', '--map'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) fail('P0_LEDGER_USAGE', `${argument} requires a value.`);
      index += 1;
      if (argument === '--project-root') parsed.projectRoot = value;
      if (argument === '--output') parsed.ledgerPath = value;
      if (argument === '--map') parsed.mapRelativePath = value;
    } else fail('P0_LEDGER_USAGE', `Unknown argument: ${argument}.`);
  }
  return parsed;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  if (parsed.mode === 'write') {
    const ledger = writeP0EvidenceLedger(parsed);
    console.log(
      `WROTE P0_EVIDENCE_LEDGER ${ledger.summary.criterionCount} criteria ${ledger.summary.provenCount} proven ${ledger.summary.externalOpenCount} external-open`,
    );
    return;
  }
  if (parsed.mode === 'check') {
    const ledger = verifyP0EvidenceLedger(parsed);
    console.log(
      `PASS P0_EVIDENCE_LEDGER_CURRENT ${ledger.summary.provenCount}/${ledger.summary.criterionCount} proven; ${ledger.summary.externalOpenCount} external-open`,
    );
    return;
  }
  fail('P0_LEDGER_USAGE', usage());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
