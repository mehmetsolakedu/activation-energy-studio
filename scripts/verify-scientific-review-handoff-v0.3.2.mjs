#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_SCHEMA =
  'activation-energy-studio/independent-scientific-review-package/v1';
const REVIEW_STATE = 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW';
const RELEASE_VERSION = '0.3.2';
const RELEASE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const RELEASE_MANIFEST_SHA256 =
  '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c';
const RELEASE_CHECKSUM_SHA256 =
  '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0';
const REPORT_SCHEMA_SHA256 =
  'ac385a67563e643481265880c5703f5b3caec0ba2199cf15539fa1b32ebf3d3a';
const CANDIDATE_FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const ACCEPTANCE_CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const PROJECT_DEFAULT = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/scientific-review/Activation-Energy-Studio-Scientific-Review-Handoff-v0.3.2',
);
const PACKAGE_MANIFEST_NAME = 'PACKAGE_MANIFEST.json';
const PACKAGE_MANIFEST_SIDECAR_NAME = 'PACKAGE_MANIFEST.sha256';

function fail(code, message) {
  throw new Error(`${code} ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function portable(value, label) {
  if (
    typeof value !== 'string'
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail('SCIENTIFIC_REVIEW_UNSAFE_PATH', label);
  }
  return value;
}

function resolveIn(root, relative, label) {
  const safe = portable(relative, label);
  const resolved = path.resolve(root, ...safe.split('/'));
  const relation = path.relative(root, resolved);
  if (relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('SCIENTIFIC_REVIEW_PATH_ESCAPE', label);
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    fail('SCIENTIFIC_REVIEW_FILE_MISSING', `${label}: ${safe}`);
  }
  return resolved;
}

function listFiles(root, prefix = '') {
  const directory = prefix ? path.join(root, ...prefix.split('/')) : root;
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...listFiles(root, relative));
    else if (entry.isFile()) result.push(relative);
    else fail('SCIENTIFIC_REVIEW_UNSUPPORTED_ENTRY', relative);
  }
  return result.sort();
}

function expectedDecisionIds() {
  const surfaces = ['UI', 'PDF', 'CSV', 'JSON'];
  return [
    ...surfaces.flatMap((surface) =>
      Array.from(
        { length: 7 },
        (_value, index) =>
          `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
      ),
    ),
    ...Array.from(
      { length: 7 },
      (_value, index) => `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}

function entryByRole(manifest, role) {
  const matches = manifest.artifacts.filter((entry) => entry.role === role);
  if (matches.length !== 1) {
    fail('SCIENTIFIC_REVIEW_ROLE_CARDINALITY', `${role}: ${matches.length}`);
  }
  return matches[0];
}

function verifyUnsignedTemplate(root, manifestSha256) {
  const file = resolveIn(
    root,
    'SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json',
    'structured review template',
  );
  const input = JSON.parse(readFileSync(file, 'utf8'));
  if (input.schema !== 'activation-energy-studio/scientific-review-input/v1') {
    fail('SCIENTIFIC_REVIEW_INPUT_SCHEMA_MISMATCH', String(input.schema));
  }
  if (
    input.locks?.releaseSha256 !== RELEASE_SHA256
    || input.locks?.releaseManifestSha256 !== RELEASE_MANIFEST_SHA256
    || input.locks?.packageManifestSha256
      !== '[COPY_FROM_PACKAGE_MANIFEST_SHA256]'
  ) {
    fail('SCIENTIFIC_REVIEW_INPUT_LOCK_MISMATCH', manifestSha256);
  }
  const expectedIds = expectedDecisionIds();
  const actualIds = input.decisions?.map(({ id }) => id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    fail('SCIENTIFIC_REVIEW_INPUT_DECISION_SET_MISMATCH', String(actualIds?.length));
  }
  if (input.decisions.some(({ decision }) => decision !== 'NOT_REVIEWED')) {
    fail('SCIENTIFIC_REVIEW_INPUT_PREPOPULATED_DECISION', 'Decision is not NOT_REVIEWED.');
  }
  if (
    input.verdict?.gateDispositions?.['AC-SCI-03'] !== 'NOT_REVIEWED'
    || input.verdict?.gateDispositions?.['AC-VAL-05'] !== 'NOT_REVIEWED'
    || input.verdict?.overallVerdict !== 'NOT_REVIEWED'
  ) {
    fail('SCIENTIFIC_REVIEW_INPUT_PREPOPULATED_VERDICT', 'Verdict is not unsigned.');
  }
  const declarations = Object.values(input.reviewer?.declarations ?? {});
  if (declarations.length !== 11 || declarations.some((value) => value !== null)) {
    fail('SCIENTIFIC_REVIEW_INPUT_PREPOPULATED_IDENTITY', 'Declarations are not null.');
  }
}

export function verifyPackage(packageRoot) {
  const root = path.resolve(packageRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    fail('SCIENTIFIC_REVIEW_PACKAGE_MISSING', root);
  }
  const manifestFile = resolveIn(root, PACKAGE_MANIFEST_NAME, 'package manifest');
  const sidecarFile = resolveIn(
    root,
    PACKAGE_MANIFEST_SIDECAR_NAME,
    'package manifest sidecar',
  );
  const manifestBytes = readFileSync(manifestFile);
  const manifestSha256 = sha256(manifestBytes);
  if (
    readFileSync(sidecarFile, 'utf8')
      !== `${manifestSha256}  ${PACKAGE_MANIFEST_NAME}\n`
  ) {
    fail('SCIENTIFIC_REVIEW_PACKAGE_SIDECAR_MISMATCH', PACKAGE_MANIFEST_SIDECAR_NAME);
  }
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.schema !== PACKAGE_SCHEMA
    || manifest.packageVersion !== RELEASE_VERSION
    || manifest.reviewState !== REVIEW_STATE
    || manifest.externalEvidenceComplete !== false
    || manifest.technicalReadiness !== 'READY_FOR_ELIGIBLE_EXTERNAL_REVIEW'
  ) {
    fail('SCIENTIFIC_REVIEW_PACKAGE_STATE_MISMATCH', String(manifest.reviewState));
  }
  if (
    manifest.acceptanceGates?.['AC-SCI-03']
      !== 'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW'
    || manifest.acceptanceGates?.['AC-VAL-05']
      !== 'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW'
    || manifest.checklist?.totalRequiredDecisions !== 35
  ) {
    fail('SCIENTIFIC_REVIEW_GATE_STATE_MISMATCH', JSON.stringify(manifest.acceptanceGates));
  }
  const expectedLocks = {
    sha256: RELEASE_SHA256,
    releaseManifestSha256: RELEASE_MANIFEST_SHA256,
    checksumIndexSha256: RELEASE_CHECKSUM_SHA256,
    reportSchemaSha256: REPORT_SCHEMA_SHA256,
    candidateFreezeSha256: CANDIDATE_FREEZE_SHA256,
    acceptanceCriteriaSha256: ACCEPTANCE_CRITERIA_SHA256,
  };
  for (const [field, expected] of Object.entries(expectedLocks)) {
    if (manifest.lockedRelease?.[field] !== expected) {
      fail('SCIENTIFIC_REVIEW_RELEASE_LOCK_MISMATCH', field);
    }
  }
  if (manifest.reviewerEligibility?.aiAgentMaySign !== false) {
    fail('SCIENTIFIC_REVIEW_AI_SIGNOFF_BOUNDARY_MISSING', 'aiAgentMaySign');
  }
  const entries = [...manifest.artifacts, ...manifest.generatedFiles];
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const relative = portable(entry.packagePath, `entry ${index + 1}`);
    if (seen.has(relative)) fail('SCIENTIFIC_REVIEW_DUPLICATE_PACKAGE_PATH', relative);
    seen.add(relative);
    const file = resolveIn(root, relative, `entry ${index + 1}`);
    const bytes = readFileSync(file);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
      fail('SCIENTIFIC_REVIEW_ENTRY_INTEGRITY_MISMATCH', relative);
    }
  }
  const expectedFiles = [
    PACKAGE_MANIFEST_NAME,
    PACKAGE_MANIFEST_SIDECAR_NAME,
    ...seen,
  ].sort();
  const actualFiles = listFiles(root);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail(
      'SCIENTIFIC_REVIEW_PACKAGE_FILE_SET_MISMATCH',
      `expected=${expectedFiles.length} actual=${actualFiles.length}`,
    );
  }
  const roles = new Map([
    ['release_html', RELEASE_SHA256],
    ['release_evidence_manifest', RELEASE_MANIFEST_SHA256],
    ['release_checksum_index', RELEASE_CHECKSUM_SHA256],
    ['project_report_schema', REPORT_SCHEMA_SHA256],
    ['candidate_freeze', CANDIDATE_FREEZE_SHA256],
    ['external_gate_acceptance_criteria', ACCEPTANCE_CRITERIA_SHA256],
  ]);
  for (const [role, expected] of roles) {
    if (entryByRole(manifest, role).sha256 !== expected) {
      fail('SCIENTIFIC_REVIEW_ROLE_HASH_MISMATCH', role);
    }
  }
  const freezeEntry = entryByRole(manifest, 'candidate_freeze');
  const freeze = JSON.parse(
    readFileSync(resolveIn(root, freezeEntry.packagePath, 'candidate freeze'), 'utf8'),
  );
  if (
    freeze.candidate?.sha256 !== RELEASE_SHA256
    || freeze.integrityPolicy?.selfSignedExternalEvidenceAllowed !== false
    || freeze.integrityPolicy?.historicalEvidenceRelabelingAllowed !== false
  ) {
    fail('SCIENTIFIC_REVIEW_FREEZE_BOUNDARY_MISMATCH', freezeEntry.packagePath);
  }
  const scientificGates = freeze.externalGateBaseline
    ?.filter(({ lane }) => lane === 'independent-scientific-review')
    .map(({ id, status }) => `${id}:${status}`)
    .sort();
  if (
    JSON.stringify(scientificGates)
      !== JSON.stringify(['AC-SCI-03:EXTERNAL_OPEN', 'AC-VAL-05:EXTERNAL_OPEN'])
  ) {
    fail('SCIENTIFIC_REVIEW_FREEZE_GATE_MISMATCH', JSON.stringify(scientificGates));
  }
  verifyUnsignedTemplate(root, manifestSha256);
  const verdict = readFileSync(
    resolveIn(root, 'INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md', 'verdict template'),
    'utf8',
  );
  if (!verdict.includes('UNSIGNED TEMPLATE') || !verdict.includes('NOT_REVIEWED')) {
    fail('SCIENTIFIC_REVIEW_VERDICT_TEMPLATE_STATE_MISMATCH', 'Template is not unsigned.');
  }
  if (
    manifest.artifacts.some(({ packagePath }) =>
      /(?:^|\/)(?:observed-review|signed)(?:\/|$)/u.test(packagePath),
    )
  ) {
    fail('SCIENTIFIC_REVIEW_OBSERVED_EVIDENCE_EMBEDDED', 'Observed evidence must be external.');
  }
  return {
    packageRoot: root,
    manifestSha256,
    fileCount: actualFiles.length,
    artifactCount: manifest.artifacts.length,
    reviewState: manifest.reviewState,
    externalEvidenceComplete: false,
  };
}

function parseArguments(argv) {
  const embeddedPackage = existsSync(path.join(SCRIPT_DIRECTORY, PACKAGE_MANIFEST_NAME));
  const options = { packageRoot: embeddedPackage ? SCRIPT_DIRECTORY : PROJECT_DEFAULT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--package') {
      if (!argv[index + 1]) fail('SCIENTIFIC_REVIEW_ARGUMENT_MISSING', '--package');
      options.packageRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      fail('SCIENTIFIC_REVIEW_UNKNOWN_ARGUMENT', argument);
    }
  }
  return options;
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write('Usage: node VERIFY_PACKAGE.mjs [--package <directory>]\n');
      return;
    }
    const result = verifyPackage(options.packageRoot);
    process.stdout.write(
      `TECHNICAL_OK SCIENTIFIC_REVIEW_PACKAGE_VERIFIED version=${RELEASE_VERSION} `
      + `files=${result.fileCount} artifacts=${result.artifactCount} `
      + `manifestSha256=${result.manifestSha256} reviewState=${result.reviewState} `
      + 'externalEvidenceComplete=false\n',
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
