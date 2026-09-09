import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CRITERIA_PATH = path.join(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/EXTERNAL_GATE_ACCEPTANCE_CRITERIA.md',
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

test('v0.3.2 external criteria retain all eight gates and exact candidate identity', async () => {
  const text = await readFile(CRITERIA_PATH, 'utf8');

  assert.match(text, /Activation Energy Studio v0\.3\.2 External-Gate Acceptance Criteria/);
  assert.match(
    text,
    /4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8/,
  );

  for (const gateId of EXPECTED_GATE_IDS) {
    assert.equal(
      text.match(new RegExp(`### ${gateId.replaceAll('-', '\\-')} —`, 'g'))?.length,
      1,
      `${gateId} must have exactly one operational criterion.`,
    );
  }

  assert.match(text, /Historical\s+v0\.2\.0 or v0\.3\.1 evidence[\s\S]*cannot close a v0\.3\.2 gate/);
});

test('scientific, platform, and usability thresholds cannot be silently relaxed', async () => {
  const text = await readFile(CRITERIA_PATH, 'utf8');

  assert.match(text, /all 28 prespecified/);
  assert.match(text, /all seven prespecified cases/);
  assert.match(text, /Runtime external-network request count must be zero/);
  assert.match(text, /Windows 11/);
  assert.match(text, /supported macOS release/);
  assert.match(text, /Ubuntu 22\.04 or later/);
  assert.match(text, /Five valid participants are required/);
  assert.match(text, /5\/5 correct PDFs/);
  assert.match(text, /no greater than 12/);
  assert.match(text, /no participant above 15/);
  assert.match(text, /all 25\s+participant-case combinations/);
  assert.match(text, /90% of the 75 total rubric dimensions/);
  assert.match(text, /no refusal case below 80%/);
  assert.match(text, /A 4\/5 result is\s+FAIL/);
  assert.match(text, /8\/8 cells/);
});

test('tooling, self-attestation, and package mutation remain non-closing conditions', async () => {
  const text = await readFile(CRITERIA_PATH, 'utf8');

  assert.match(text, /self-attestation by\s+the implementation agent cannot close an external gate/);
  assert.match(text, /Collection tooling and technically valid templates alone do not\s+change this state/);
  assert.match(text, /requires a separately versioned v0\.3\.3 candidate/);
});
