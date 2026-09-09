import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyExternalCandidateFreeze } from '../scripts/verify-v0.3.2-external-candidate.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const FREEZE_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
);
const FREEZE_CHECKSUM_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
);

test('the v0.3.2 external-validation candidate remains byte-locked and external-open', async () => {
  const result = await verifyExternalCandidateFreeze();

  assert.deepEqual(result, {
    releaseVersion: '0.3.2',
    status: 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS',
    candidateSha256: '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8',
    artifactCount: 7,
    externalOpenGateCount: 8,
  });
});

test('the candidate-freeze sidecar binds the dispatch record itself', async () => {
  const bytes = await readFile(FREEZE_PATH);
  const sidecar = (await readFile(FREEZE_CHECKSUM_PATH, 'utf8')).trim();
  const digest = createHash('sha256').update(bytes).digest('hex');

  assert.equal(sidecar, `${digest}  CANDIDATE_FREEZE.json`);
});

test('the verifier rejects a relabelled external PASS without evidence', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'aes-v032-freeze-test-'));
  const modifiedFreezePath = path.join(temporaryDirectory, 'CANDIDATE_FREEZE.json');

  try {
    const freeze = JSON.parse(await readFile(FREEZE_PATH, 'utf8'));
    freeze.externalGateBaseline[0].status = 'PASS';
    await writeFile(modifiedFreezePath, `${JSON.stringify(freeze, null, 2)}\n`);

    await assert.rejects(
      verifyExternalCandidateFreeze({ projectRoot: PROJECT_ROOT, freezePath: modifiedFreezePath }),
      /cannot claim an external gate is closed/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
