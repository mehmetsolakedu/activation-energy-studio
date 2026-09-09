import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const REGISTER_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/INITIAL_GAP_REGISTER.json',
);

const EXPECTED_GATE_IDS = [
  'AC-SCI-03',
  'AC-VAL-05',
  'AC-PLAT-01',
  'AC-PLAT-02',
  'AC-UX-01',
  'AC-UX-02',
  'AC-UX-03',
  'AC-UX-04',
];

test('the v0.3.2 initial gap register remains fail-closed', async () => {
  const register = JSON.parse(await readFile(REGISTER_PATH, 'utf8'));
  const freezeBytes = await readFile(path.join(PROJECT_ROOT, register.candidateFreeze.path));
  const freezeDigest = createHash('sha256').update(freezeBytes).digest('hex');

  assert.equal(register.releaseVersion, '0.3.2');
  assert.equal(freezeDigest, register.candidateFreeze.sha256);
  assert.deepEqual(register.gates.map((gate) => gate.id), EXPECTED_GATE_IDS);
  assert.ok(register.gates.every((gate) => gate.status === 'EXTERNAL_OPEN'));
  assert.ok(register.gates.every((gate) => gate.missing.length > 0));
  assert.deepEqual(register.summary, {
    gateCount: 8,
    passCount: 0,
    failCount: 0,
    externalOpenCount: 8,
    technicalCollectionReadiness: 'IN_PROGRESS',
    releaseAuthorization: 'NO_GO_EXTERNAL_EVIDENCE_INCOMPLETE',
  });
});
