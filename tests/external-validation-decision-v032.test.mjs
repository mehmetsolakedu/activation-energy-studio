import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  buildExternalValidationDecision,
  serializeExternalValidationDecision,
} from '../scripts/generate-v0.3.2-external-validation-decision.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

test('the current v0.3.2 decision is a publishable Research Preview with optional external gates open', async () => {
  const record = await buildExternalValidationDecision();

  assert.equal(record.technicalCollectionReadiness.overall, 'PASS');
  assert.equal(record.gates.length, 8);
  assert.ok(record.gates.every((gate) => gate.status === 'EXTERNAL_OPEN'));
  assert.deepEqual(record.summary, {
    gateCount: 8,
    passCount: 0,
    failCount: 0,
    externalOpenCount: 8,
    externalEvidenceComplete: false,
    currentDecision: 'EXTERNAL_OPEN',
    reasonCode: 'OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED',
    soloScopePublicationDecision:
      'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
    candidateDisposition: 'FROZEN_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
    externalLanesRequiredForProjectClosure: false,
    packageChangeRequired: false,
  });
  assert.deepEqual(record.soloScopeResearchPreview, {
    publicationDecision: 'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
    publicationClass: 'SOLO_RESEARCH_PREVIEW',
    externalLanesRequiredForProjectClosure: false,
    simulationAcceptedAsExternalEvidence: false,
    claimsNotEstablished: [
      'independent scientific approval',
      'cross-platform compatibility',
      'observed usability',
      'validated-MVP status',
    ],
  });
  assert.ok(
    record.optionalExternalEvidenceLanes.every(
      (lane) => lane.state === 'EXTERNAL_OPEN' && lane.requiredForProjectClosure === false,
    ),
  );
  const serialized = serializeExternalValidationDecision(record);
  assert.match(serialized, /publishable as a solo-scope Research Preview/);
  assert.match(serialized, /no simulation or local substitute may close them/);
});

test('the decision generator rejects a relabelled scientific PASS', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/.tmp-decision-'),
  );
  const sourcePath = path.join(
    PROJECT_ROOT,
    'output/v0.3.2-external-validation/scientific-review/SCIENTIFIC_REVIEW_STATUS.json',
  );
  const modifiedPath = path.join(temporaryDirectory, 'SCIENTIFIC_REVIEW_STATUS.json');

  try {
    const status = JSON.parse(await readFile(sourcePath, 'utf8'));
    status.gateStatus['AC-SCI-03'] = 'PASS';
    status.externalEvidenceComplete = true;
    await writeFile(modifiedPath, `${JSON.stringify(status, null, 2)}\n`);

    await assert.rejects(
      buildExternalValidationDecision({
        statusPaths: {
          scientific: path.relative(PROJECT_ROOT, modifiedPath),
          platform:
            'output/v0.3.2-external-validation/platform/PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
          usability: 'evidence/usability/v0.3.2/USABILITY_LANE_STATUS.json',
        },
      }),
      /cannot claim an external gate is closed/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
