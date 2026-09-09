import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  buildExternalValidationDispatch,
  renderExternalValidationReport,
  serializeDispatchIndex,
} from '../scripts/generate-v0.3.2-external-validation-dispatch.mjs';
import {
  buildExternalValidationDecision,
  serializeExternalValidationDecision,
} from '../scripts/generate-v0.3.2-external-validation-decision.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

test('dispatch reports a publishable Research Preview with all optional external gates open', async () => {
  const dispatch = await buildExternalValidationDispatch();

  assert.deepEqual(dispatch.currentDecision, {
    decision: 'EXTERNAL_OPEN',
    reasonCode: 'OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED',
    soloScopePublicationDecision:
      'PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
    candidateDisposition: 'FROZEN_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS',
    externalEvidenceComplete: false,
    externalLanesRequiredForProjectClosure: false,
    packageChangeRequired: false,
  });
  assert.deepEqual(dispatch.gateSummary, {
    gateCount: 8,
    externalOpenCount: 8,
    passCount: 0,
    failCount: 0,
    status: '8_OF_8_EXTERNAL_OPEN',
  });
  assert.equal(dispatch.technicalCollectionReadiness.scope, 'COLLECTION_INFRASTRUCTURE_ONLY');
  assert.equal(dispatch.technicalCollectionReadiness.externalValidationEstablished, false);
  assert.equal(dispatch.gates.length, 8);
  assert.ok(dispatch.gates.every((gate) => gate.status === 'EXTERNAL_OPEN'));

  assert.deepEqual(dispatch.optionalFutureExternalEvidence.scientific.requiredDecisionCounts, {
    claimBoundary: 28,
    crossMethodInterpretation: 7,
    total: 35,
  });
  assert.deepEqual(dispatch.optionalFutureExternalEvidence.platform.targetOperatingSystems, [
    'Windows 11',
    'supported macOS',
    'Ubuntu 22.04 or later',
  ]);
  assert.equal(dispatch.optionalFutureExternalEvidence.usability.requiredParticipantCount, 5);
  assert.equal(
    dispatch.optionalFutureExternalEvidence.usability.requiredParticipantCaseCombinations,
    25,
  );
  assert.equal(dispatch.optionalFutureExternalEvidence.usability.requiredWarningSurfaceCells, 8);

  const report = renderExternalValidationReport(dispatch);
  assert.match(report, /EXTERNAL_OPEN \/[\s\S]*OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED/);
  assert.match(report, /PUBLISHABLE_RESEARCH_PREVIEW_READY_WITH_DECLARED_LIMITATIONS/);
  assert.match(report, /All eight gates[\s\S]*`EXTERNAL_OPEN`/);
  assert.match(report, /three external lanes are optional future work/);
  assert.match(report, /simulation cannot[\s\S]*substitute for genuine external evidence/);
  assert.match(report, /`packageChangeRequired=false`/);
  assert.equal(serializeDispatchIndex(dispatch), serializeDispatchIndex(dispatch));
});

test('canonical dispatch index and report are deterministic and current', async () => {
  const dispatch = await buildExternalValidationDispatch();
  const [currentIndex, currentReport] = await Promise.all([
    readFile(
      path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/DISPATCH_INDEX.json'),
      'utf8',
    ),
    readFile(
      path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/EXTERNAL_VALIDATION_REPORT.md'),
      'utf8',
    ),
  ]);

  assert.equal(currentIndex, serializeDispatchIndex(dispatch));
  assert.equal(currentReport, renderExternalValidationReport(dispatch));
});

test('dispatch fails closed when CURRENT_RELEASE_DECISION.json is altered', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/.tmp-dispatch-decision-'),
  );
  const modifiedPath = path.join(temporaryDirectory, 'CURRENT_RELEASE_DECISION.json');

  try {
    const decision = JSON.parse(
      await readFile(
        path.join(
          PROJECT_ROOT,
          'output/v0.3.2-external-validation/CURRENT_RELEASE_DECISION.json',
        ),
        'utf8',
      ),
    );
    decision.summary.packageChangeRequired = true;
    await writeFile(modifiedPath, `${JSON.stringify(decision, null, 2)}\n`);

    await assert.rejects(
      buildExternalValidationDispatch({
        inputPaths: { decision: path.relative(PROJECT_ROOT, modifiedPath) },
      }),
      /stale, altered, or not bound/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('dispatch rejects a lane status with a false package hash', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/.tmp-dispatch-platform-'),
  );
  const modifiedPath = path.join(temporaryDirectory, 'PLATFORM_EXTERNAL_EVIDENCE_STATUS.json');

  try {
    const platform = JSON.parse(
      await readFile(
        path.join(
          PROJECT_ROOT,
          'output/v0.3.2-external-validation/platform/PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
        ),
        'utf8',
      ),
    );
    platform.packageArtifacts[0].sha256 = '0'.repeat(64);
    await writeFile(modifiedPath, `${JSON.stringify(platform, null, 2)}\n`);

    await assert.rejects(
      buildExternalValidationDispatch({
        inputPaths: { platform: path.relative(PROJECT_ROOT, modifiedPath) },
      }),
      /SHA-256 mismatch/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('dispatch rejects a claimed readiness state containing a failed platform check', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(PROJECT_ROOT, 'output/v0.3.2-external-validation/.tmp-dispatch-readiness-'),
  );
  const platformPath = path.join(temporaryDirectory, 'PLATFORM_EXTERNAL_EVIDENCE_STATUS.json');
  const decisionPath = path.join(temporaryDirectory, 'CURRENT_RELEASE_DECISION.json');

  try {
    const platform = JSON.parse(
      await readFile(
        path.join(
          PROJECT_ROOT,
          'output/v0.3.2-external-validation/platform/PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
        ),
        'utf8',
      ),
    );
    platform.technicalReadiness.checks[0].status = 'FAIL';
    await writeFile(platformPath, `${JSON.stringify(platform, null, 2)}\n`);

    const relativePlatformPath = path.relative(PROJECT_ROOT, platformPath);
    const rebuiltDecision = await buildExternalValidationDecision({
      statusPaths: {
        scientific:
          'output/v0.3.2-external-validation/scientific-review/SCIENTIFIC_REVIEW_STATUS.json',
        platform: relativePlatformPath,
        usability: 'evidence/usability/v0.3.2/USABILITY_LANE_STATUS.json',
      },
    });
    await writeFile(decisionPath, serializeExternalValidationDecision(rebuiltDecision));

    await assert.rejects(
      buildExternalValidationDispatch({
        inputPaths: {
          platform: relativePlatformPath,
          decision: path.relative(PROJECT_ROOT, decisionPath),
        },
      }),
      /Platform collection-readiness contract is not satisfied/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
