import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_FREEZE_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
);

const REQUIRED_GATE_IDS = [
  'AC-SCI-03',
  'AC-VAL-05',
  'AC-PLAT-01',
  'AC-PLAT-02',
  'AC-UX-01',
  'AC-UX-02',
  'AC-UX-03',
  'AC-UX-04',
];

const REQUIRED_ARTIFACT_ROLES = [
  'release-html',
  'release-manifest',
  'release-checksums',
  'report-schema',
  'remediation-report',
  'remediation-gate-results',
  'external-gate-acceptance-criteria',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveBoundPath(projectRoot, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'Artifact path is required.');
  assert(!path.isAbsolute(relativePath), `Artifact path must be relative: ${relativePath}`);
  const resolved = path.resolve(projectRoot, relativePath);
  assert(
    resolved.startsWith(`${projectRoot}${path.sep}`),
    `Artifact path escapes the project root: ${relativePath}`,
  );
  return resolved;
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyExternalCandidateFreeze({
  projectRoot = PROJECT_ROOT,
  freezePath = DEFAULT_FREEZE_PATH,
} = {}) {
  const freeze = JSON.parse(await readFile(freezePath, 'utf8'));

  assert(
    freeze.schemaVersion === 'activation-energy-studio/external-validation-candidate-freeze/v1',
    'Unexpected candidate-freeze schema version.',
  );
  assert(freeze.releaseVersion === '0.3.2', 'Candidate freeze must bind release v0.3.2.');
  assert(
    freeze.status === 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS',
    'Candidate freeze must remain in the external-validation-in-progress state.',
  );
  assert(
    freeze.integrityPolicy?.releaseDirectoryMutationAllowed === false,
    'Release-directory mutation must be prohibited.',
  );
  assert(
    freeze.integrityPolicy?.selfSignedExternalEvidenceAllowed === false
      && freeze.integrityPolicy?.syntheticHumanOrDeviceEvidenceAllowed === false
      && freeze.integrityPolicy?.historicalEvidenceRelabelingAllowed === false,
    'External-evidence anti-fabrication policies must remain fail-closed.',
  );

  const roles = freeze.boundArtifacts?.map((artifact) => artifact.role) ?? [];
  assert(
    JSON.stringify(roles) === JSON.stringify(REQUIRED_ARTIFACT_ROLES),
    'Bound artifact roles or ordering changed.',
  );

  const verifiedArtifacts = [];
  for (const artifact of freeze.boundArtifacts) {
    assert(/^[a-f0-9]{64}$/.test(artifact.sha256), `Invalid SHA-256 for ${artifact.path}.`);
    const absolutePath = resolveBoundPath(projectRoot, artifact.path);
    const fileStat = await stat(absolutePath);
    const digest = await sha256(absolutePath);
    assert(fileStat.isFile(), `Bound path is not a file: ${artifact.path}`);
    assert(fileStat.size === artifact.bytes, `Byte-size mismatch: ${artifact.path}`);
    assert(digest === artifact.sha256, `SHA-256 mismatch: ${artifact.path}`);
    verifiedArtifacts.push({ ...artifact });
  }

  const candidateArtifact = verifiedArtifacts.find((artifact) => artifact.role === 'release-html');
  assert(
    freeze.candidate?.path === candidateArtifact.path
      && freeze.candidate?.bytes === candidateArtifact.bytes
      && freeze.candidate?.sha256 === candidateArtifact.sha256,
    'Candidate summary does not match the bound release HTML.',
  );

  const gates = freeze.externalGateBaseline ?? [];
  assert(
    JSON.stringify(gates.map((gate) => gate.id)) === JSON.stringify(REQUIRED_GATE_IDS),
    'External gate identifiers or ordering changed.',
  );
  assert(
    gates.every((gate) => gate.status === 'EXTERNAL_OPEN'),
    'The baseline freeze cannot claim an external gate is closed.',
  );

  return {
    releaseVersion: freeze.releaseVersion,
    status: freeze.status,
    candidateSha256: freeze.candidate.sha256,
    artifactCount: verifiedArtifacts.length,
    externalOpenGateCount: gates.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyExternalCandidateFreeze()
    .then((result) => {
      console.log(`PASS EXTERNAL_CANDIDATE_FREEZE v${result.releaseVersion}`);
      console.log(`CANDIDATE_SHA256 ${result.candidateSha256}`);
      console.log(`BOUND_ARTIFACTS ${result.artifactCount}`);
      console.log(`EXTERNAL_OPEN_GATES ${result.externalOpenGateCount}`);
    })
    .catch((error) => {
      console.error(`FAIL EXTERNAL_CANDIDATE_FREEZE ${error.message}`);
      process.exitCode = 1;
    });
}
