#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const KIT_NAME =
  'Activation-Energy-Studio-Observed-Usability-Handoff-v0.3.2';
const PROJECT_KIT_ROOT = resolve(PROJECT_ROOT, 'output', KIT_NAME);
const EXPECTED_CANDIDATE_SHA256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';
const EXPECTED_CANDIDATE_BYTES = 2_503_952;
const EXPECTED_FREEZE_SHA256 =
  '52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758';
const EXPECTED_CRITERIA_SHA256 =
  '7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54';
const EXPECTED_FIXTURE_MANIFEST_SHA256 =
  '14f2e715578886139c63637300e3daa5ef544ff4a83226783ef0877159cd8e99';
const EXPECTED_GATE_IDS = ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function confined(root, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    fail(`${label} path must be a non-empty string.`);
  }
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/')) {
    fail(`${label} path escapes the kit root.`);
  }
  return path;
}

function walk(root, current = root) {
  const result = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    const rel = relative(root, path).split(sep).join('/');
    if (entry.isSymbolicLink()) fail(`Symbolic links are forbidden in the kit: ${rel}`);
    if (entry.isDirectory()) result.push(...walk(root, path));
    else if (entry.isFile()) result.push(rel);
    else fail(`Unsupported filesystem entry in kit: ${rel}`);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function resolveDefaultKitRoot() {
  if (existsSync(resolve(SCRIPT_DIRECTORY, 'BUNDLE_MANIFEST.json'))) {
    return SCRIPT_DIRECTORY;
  }
  return PROJECT_KIT_ROOT;
}

function parseArgs(argv) {
  let kitRoot = resolveDefaultKitRoot();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--kit-root') fail(`Unknown argument: ${argv[index]}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('--kit-root requires a path.');
    kitRoot = resolve(value);
    index += 1;
  }
  return { kitRoot };
}

function verifySidecar(kitRoot, manifestBytes) {
  const expected = `${sha256(manifestBytes)}  BUNDLE_MANIFEST.json\n`;
  const actual = readFileSync(resolve(kitRoot, 'BUNDLE_MANIFEST.sha256'), 'utf8');
  if (actual !== expected) fail('BUNDLE_MANIFEST.sha256 mismatch.');
}

function verifyCandidateFreeze(kitRoot) {
  const path = resolve(kitRoot, 'locks/CANDIDATE_FREEZE.json');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== EXPECTED_FREEZE_SHA256) {
    fail('Package candidate-freeze bytes do not match the locked v0.3.2 freeze.');
  }
  const sidecar = readFileSync(
    resolve(kitRoot, 'locks/CANDIDATE_FREEZE.sha256'),
    'utf8',
  );
  if (sidecar !== `${EXPECTED_FREEZE_SHA256}  CANDIDATE_FREEZE.json\n`) {
    fail('Package candidate-freeze sidecar is invalid.');
  }
  const freeze = readJson(path, 'candidate freeze');
  if (
    freeze.releaseVersion !== '0.3.2' ||
    freeze.status !== 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS' ||
    freeze.candidate?.sha256 !== EXPECTED_CANDIDATE_SHA256 ||
    freeze.candidate?.bytes !== EXPECTED_CANDIDATE_BYTES
  ) {
    fail('Candidate-freeze identity or status is invalid.');
  }
  const criteria = freeze.boundArtifacts?.find(
    (artifact) => artifact.role === 'external-gate-acceptance-criteria',
  );
  if (criteria?.sha256 !== EXPECTED_CRITERIA_SHA256) {
    fail('Candidate freeze does not bind the expected acceptance criteria.');
  }
  const gates = (freeze.externalGateBaseline ?? [])
    .filter((gate) => EXPECTED_GATE_IDS.includes(gate.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    gates.length !== 4 ||
    gates.some(
      (gate, index) =>
        gate.id !== EXPECTED_GATE_IDS[index] ||
        gate.status !== 'EXTERNAL_OPEN' ||
        gate.lane !== 'observed-usability',
    )
  ) {
    fail('Candidate freeze does not keep all usability gates EXTERNAL_OPEN.');
  }
}

function verifyFixtures(kitRoot, manifest) {
  const descriptor = manifest.fixtureManifest;
  const manifestPath = confined(kitRoot, descriptor.path, 'fixtureManifest');
  const bytes = readFileSync(manifestPath);
  if (
    bytes.byteLength !== descriptor.bytes ||
    sha256(bytes) !== descriptor.sha256 ||
    descriptor.sha256 !== EXPECTED_FIXTURE_MANIFEST_SHA256
  ) {
    fail('Frozen fixture manifest does not match the bundle manifest.');
  }
  const fixtures = readJson(manifestPath, 'fixture manifest');
  if (
    fixtures.schemaVersion !== 'activation-energy-studio/usability-fixtures/v1' ||
    fixtures.studyVersion !== 'UX-v0.3.2' ||
    fixtures.release?.sha256 !== EXPECTED_CANDIDATE_SHA256 ||
    fixtures.candidateFreeze?.sha256 !== EXPECTED_FREEZE_SHA256 ||
    fixtures.acceptanceCriteria?.sha256 !== EXPECTED_CRITERIA_SHA256 ||
    fixtures.fixtures?.length !== 11 ||
    fixtures.boundary?.includes('not participant') !== true
  ) {
    fail('Frozen fixture manifest identity, locks, count, or boundary is invalid.');
  }
  for (const fixture of fixtures.fixtures) {
    const path = confined(
      dirname(manifestPath),
      fixture.path,
      `fixture ${fixture.id}`,
    );
    const fixtureBytes = readFileSync(path);
    if (
      fixtureBytes.byteLength !== fixture.bytes ||
      sha256(fixtureBytes) !== fixture.sha256
    ) {
      fail(`Fixture ${fixture.id} hash or byte count mismatch.`);
    }
  }
}

function verifyNotRunState(kitRoot, manifest) {
  const status = readJson(resolve(kitRoot, 'STUDY_STATUS.json'), 'study status');
  if (
    status.schemaVersion !==
      'activation-energy-studio/usability-study-readiness/v1' ||
    status.releaseVersion !== '0.3.2' ||
    status.technicalReadiness !== 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN' ||
    status.participantCount !== 0 ||
    status.humanEvidenceAuditStatus !== 'NOT_PERFORMED' ||
    status.externalEvidenceComplete !== false ||
    status.candidateSha256 !== EXPECTED_CANDIDATE_SHA256 ||
    status.gates?.some?.((gate) => gate.status !== 'EXTERNAL_OPEN') ||
    status.gates?.map?.((gate) => gate.id).join(',') !== EXPECTED_GATE_IDS.join(',')
  ) {
    fail('STUDY_STATUS.json must remain a zero-participant, external-open readiness record.');
  }
  const template = readJson(
    resolve(kitRoot, 'study-input.template.json'),
    'study-input template',
  );
  if (
    template.executionState !== 'NOT_RUN_TEMPLATE' ||
    template.evidenceOrigin !== 'not-collected' ||
    template.participantRecords?.length !== 5 ||
    template.coordinator?.humanEvidenceAudit?.status !== 'NOT_PERFORMED' ||
    template.coordinator?.acceptanceGateApplied !== false
  ) {
    fail('Study-input template contains an executable or evidence-complete claim.');
  }
  const participantTemplates = walk(resolve(kitRoot, 'participants')).filter(
    (path) => path.endsWith('.template.json'),
  );
  if (participantTemplates.length !== 5) {
    fail('Package must contain exactly five non-evidence participant templates.');
  }
  if (
    manifest.participantCount !== 0 ||
    manifest.externalEvidenceComplete !== false ||
    manifest.technicalReadiness !== 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN'
  ) {
    fail('Bundle manifest overstates observed-usability evidence.');
  }
}

export function verifyUsabilityV032StudyKit(kitRoot = resolveDefaultKitRoot()) {
  const root = resolve(kitRoot);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    fail(`Usability study kit directory is missing: ${root}`);
  }
  const manifestPath = resolve(root, 'BUNDLE_MANIFEST.json');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = readJson(manifestPath, 'bundle manifest');
  if (
    manifest.schemaVersion !==
      'activation-energy-studio/observed-usability-study-kit/v1' ||
    manifest.kit?.name !== KIT_NAME ||
    manifest.kit?.releaseVersion !== '0.3.2' ||
    manifest.candidate?.sha256 !== EXPECTED_CANDIDATE_SHA256 ||
    manifest.candidate?.bytes !== EXPECTED_CANDIDATE_BYTES ||
    manifest.candidateFreeze?.sha256 !== EXPECTED_FREEZE_SHA256 ||
    manifest.acceptanceCriteria?.sha256 !== EXPECTED_CRITERIA_SHA256 ||
    manifest.fixtureManifest?.sha256 !== EXPECTED_FIXTURE_MANIFEST_SHA256 ||
    manifest.gateIds?.join(',') !== EXPECTED_GATE_IDS.join(',')
  ) {
    fail('Bundle manifest identity or lock set is invalid.');
  }
  verifySidecar(root, manifestBytes);

  const declaredPaths = new Set();
  for (const [index, entry] of (manifest.files ?? []).entries()) {
    if (declaredPaths.has(entry.path)) fail(`Duplicate bundle file entry ${entry.path}.`);
    declaredPaths.add(entry.path);
    const path = confined(root, entry.path, `manifest.files[${index}]`);
    const bytes = readFileSync(path);
    if (
      bytes.byteLength !== entry.bytes ||
      sha256(bytes) !== entry.sha256 ||
      !/^[a-z0-9_]+$/.test(entry.role ?? '')
    ) {
      fail(`Bundle file mismatch or invalid role: ${entry.path}.`);
    }
  }
  const actualPaths = walk(root);
  const expectedPaths = [...declaredPaths, 'BUNDLE_MANIFEST.json', 'BUNDLE_MANIFEST.sha256']
    .sort((a, b) => a.localeCompare(b));
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    fail('Kit contains missing, undeclared, or extra files.');
  }

  const candidatePath = resolve(
    root,
    'build/Activation-Energy-Studio-v0.3.2.html',
  );
  const candidateBytes = readFileSync(candidatePath);
  if (
    candidateBytes.byteLength !== EXPECTED_CANDIDATE_BYTES ||
    sha256(candidateBytes) !== EXPECTED_CANDIDATE_SHA256
  ) {
    fail('Packaged candidate HTML does not match the v0.3.2 freeze.');
  }
  const criteriaBytes = readFileSync(
    resolve(root, 'locks/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md'),
  );
  if (sha256(criteriaBytes) !== EXPECTED_CRITERIA_SHA256) {
    fail('Packaged acceptance criteria mismatch.');
  }
  verifyCandidateFreeze(root);
  verifyFixtures(root, manifest);
  verifyNotRunState(root, manifest);

  return {
    schemaVersion: manifest.schemaVersion,
    kitRoot: root,
    bundleManifestSha256: sha256(manifestBytes),
    payloadFileCount: manifest.files.length,
    candidateSha256: EXPECTED_CANDIDATE_SHA256,
    fixtureManifestSha256: manifest.fixtureManifest.sha256,
    participantCount: 0,
    technicalReadiness: 'READY_FOR_OBSERVED_SESSIONS_NOT_RUN',
    externalEvidenceComplete: false,
  };
}

function runCli() {
  const result = verifyUsabilityV032StudyKit(parseArgs(process.argv.slice(2)).kitRoot);
  console.log(
    `TECHNICAL_OK UX_V032_STUDY_KIT_CURRENT files=${result.payloadFileCount} candidateSha256=${result.candidateSha256} fixtureManifestSha256=${result.fixtureManifestSha256} participantCount=0 technicalReadiness=${result.technicalReadiness} externalEvidenceComplete=false`,
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
      `FAIL UX_V032_STUDY_KIT ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
