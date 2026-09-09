#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildUsabilityFixtureBundle as buildV031FixtureBundle } from './generate-usability-fixtures.mjs';

export const UX_V032_FIXTURE_SCHEMA =
  'activation-energy-studio/usability-fixtures/v1';
export const UX_V032_STUDY_VERSION = 'UX-v0.3.2';
export const UX_V032_ROOT = 'evidence/usability/v0.3.2';
export const UX_V032_FIXTURE_MANIFEST_PATH =
  `${UX_V032_ROOT}/UX_FIXTURE_MANIFEST.json`;
export const UX_V032_FIXTURE_DIRECTORY = `${UX_V032_ROOT}/study_bundle`;

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const RELEASE_PATH =
  'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html';
const CANDIDATE_FREEZE_PATH =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json';
const ACCEPTANCE_CRITERIA_PATH =
  'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md';
const LEGACY_MANIFEST_PATH =
  'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readRequired(projectRoot, relativePath) {
  return readFileSync(path.resolve(projectRoot, relativePath));
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function assertCandidateFreeze(freeze) {
  if (
    freeze.schemaVersion !==
      'activation-energy-studio/external-validation-candidate-freeze/v1' ||
    freeze.releaseVersion !== '0.3.2' ||
    freeze.status !== 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS'
  ) {
    throw new Error('The v0.3.2 candidate freeze is not active and hash-locked.');
  }
  if (
    freeze.candidate?.path !== RELEASE_PATH ||
    !/^[a-f0-9]{64}$/.test(freeze.candidate?.sha256 ?? '')
  ) {
    throw new Error('The candidate freeze does not identify the expected v0.3.2 HTML.');
  }
  const uxGates = (freeze.externalGateBaseline ?? [])
    .filter((gate) => /^AC-UX-0[1-4]$/.test(gate.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    uxGates.length !== 4 ||
    uxGates.some(
      (gate, index) =>
        gate.id !== `AC-UX-0${index + 1}` ||
        gate.lane !== 'observed-usability' ||
        gate.status !== 'EXTERNAL_OPEN',
    )
  ) {
    throw new Error('The candidate freeze must keep AC-UX-01 through AC-UX-04 EXTERNAL_OPEN.');
  }
  if (
    freeze.integrityPolicy?.syntheticHumanOrDeviceEvidenceAllowed !== false ||
    freeze.integrityPolicy?.historicalEvidenceRelabelingAllowed !== false ||
    freeze.integrityPolicy?.releaseDirectoryMutationAllowed !== false
  ) {
    throw new Error('The candidate freeze integrity policy is not fail-closed.');
  }
}

export function buildUsabilityV032FixtureBundle(
  projectRoot = DEFAULT_PROJECT_ROOT,
) {
  const v031 = buildV031FixtureBundle(projectRoot);
  const legacyManifestBytes = readRequired(projectRoot, LEGACY_MANIFEST_PATH);
  const legacyManifest = parseJson(legacyManifestBytes, 'v0.3.1 fixture manifest');
  if (legacyManifest.studyVersion !== 'UX-v0.3.1') {
    throw new Error('Historical usability fixture manifest no longer identifies UX-v0.3.1.');
  }

  const release = readRequired(projectRoot, RELEASE_PATH);
  const freezeBytes = readRequired(projectRoot, CANDIDATE_FREEZE_PATH);
  const freeze = parseJson(freezeBytes, 'v0.3.2 candidate freeze');
  const acceptanceCriteria = readRequired(projectRoot, ACCEPTANCE_CRITERIA_PATH);
  assertCandidateFreeze(freeze);
  if (
    release.byteLength !== freeze.candidate.bytes ||
    sha256(release) !== freeze.candidate.sha256
  ) {
    throw new Error('The current v0.3.2 release HTML does not match the candidate freeze.');
  }
  const criteriaLock = freeze.boundArtifacts?.find(
    (artifact) => artifact.role === 'external-gate-acceptance-criteria',
  );
  if (
    criteriaLock?.path !== ACCEPTANCE_CRITERIA_PATH ||
    criteriaLock.bytes !== acceptanceCriteria.byteLength ||
    criteriaLock.sha256 !== sha256(acceptanceCriteria)
  ) {
    throw new Error('External gate acceptance criteria do not match the candidate freeze.');
  }

  const files = new Map();
  const fixtures = v031.manifest.fixtures.map((fixture) => {
    const content = v031.files.get(fixture.path);
    if (content === undefined) {
      throw new Error(`Historical generator did not produce ${fixture.path}.`);
    }
    const fileName = path.basename(fixture.path);
    const projectPath = `${UX_V032_FIXTURE_DIRECTORY}/${fileName}`;
    files.set(projectPath, content);
    const bytes = Buffer.byteLength(content);
    const digest = sha256(content);
    if (bytes !== fixture.bytes || digest !== fixture.sha256) {
      throw new Error(`Historical fixture lock mismatch for ${fixture.id}.`);
    }
    return {
      ...fixture,
      path: `study_bundle/${fileName}`,
    };
  });

  const manifest = {
    schemaVersion: UX_V032_FIXTURE_SCHEMA,
    studyVersion: UX_V032_STUDY_VERSION,
    generator: 'scripts/generate-usability-fixtures-v0.3.2.mjs',
    source: v031.manifest.source,
    release: {
      path: RELEASE_PATH,
      bytes: release.byteLength,
      sha256: sha256(release),
    },
    candidateFreeze: {
      path: CANDIDATE_FREEZE_PATH,
      bytes: freezeBytes.byteLength,
      sha256: sha256(freezeBytes),
    },
    acceptanceCriteria: {
      path: ACCEPTANCE_CRITERIA_PATH,
      bytes: acceptanceCriteria.byteLength,
      sha256: sha256(acceptanceCriteria),
    },
    fixtureDesignLineage: {
      path: LEGACY_MANIFEST_PATH,
      bytes: legacyManifestBytes.byteLength,
      sha256: sha256(legacyManifestBytes),
      reusePolicy:
        'The eleven synthetic study stimuli are byte-identical to the historical v0.3.1 fixtures; their expected behavior is rechecked against the frozen v0.3.2 candidate and no v0.3.1 evidence is relabeled.',
    },
    fixedContext: v031.manifest.fixedContext,
    fixtures,
    gateIds: ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
    boundary:
      'Generated and target-code-checked fixtures prepare the v0.3.2 study. They are synthetic task inputs, not participant observations, and they close no external usability gate.',
  };
  files.set(
    UX_V032_FIXTURE_MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { files, manifest };
}

export function writeUsabilityV032FixtureBundle(
  projectRoot = DEFAULT_PROJECT_ROOT,
) {
  const bundle = buildUsabilityV032FixtureBundle(projectRoot);
  for (const [relativePath, content] of bundle.files) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  return bundle;
}

export function checkUsabilityV032FixtureBundle(
  projectRoot = DEFAULT_PROJECT_ROOT,
) {
  const bundle = buildUsabilityV032FixtureBundle(projectRoot);
  const stale = [];
  for (const [relativePath, expected] of bundle.files) {
    let actual;
    try {
      actual = readFileSync(path.resolve(projectRoot, relativePath));
    } catch {
      stale.push(`${relativePath}: missing`);
      continue;
    }
    const expectedBytes = Buffer.isBuffer(expected)
      ? expected
      : Buffer.from(expected, 'utf8');
    if (!actual.equals(expectedBytes)) stale.push(`${relativePath}: byte mismatch`);
  }
  if (stale.length > 0) {
    throw new Error(`v0.3.2 usability fixture bundle is stale:\n${stale.join('\n')}`);
  }
  return bundle;
}

function main(args) {
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--check')) {
    throw new Error(
      'Usage: node scripts/generate-usability-fixtures-v0.3.2.mjs [--check]',
    );
  }
  if (args[0] === '--check') {
    const { manifest } = checkUsabilityV032FixtureBundle();
    console.log(
      `TECHNICAL_OK UX_V032_FIXTURE_BUNDLE_CURRENT fixtures=${manifest.fixtures.length} candidateSha256=${manifest.release.sha256} externalEvidenceComplete=false`,
    );
    return;
  }
  const { manifest } = writeUsabilityV032FixtureBundle();
  console.log(
    `WROTE UX_V032_FIXTURE_BUNDLE fixtures=${manifest.fixtures.length} candidateSha256=${manifest.release.sha256} externalEvidenceComplete=false`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
