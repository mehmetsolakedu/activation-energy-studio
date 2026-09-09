import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOLO_CLOSEOUT_REASON,
  SOLO_CLOSEOUT_SCHEMA,
  SOLO_CLOSEOUT_VERDICT,
  SoloCloseoutError,
  assertSoloDecisionBoundary,
} from '../scripts/generate-v0.3.2-solo-closeout.mjs';

function validDecision() {
  return {
    schemaVersion: SOLO_CLOSEOUT_SCHEMA,
    verdict: SOLO_CLOSEOUT_VERDICT,
    reasonCode: SOLO_CLOSEOUT_REASON,
    projectStatus: 'CLOSED_WITH_BOUNDED_CLAIMS',
    artifactRole: 'RESEARCH_PREVIEW',
    openRequiredWork: [],
    evidencePolicy: {
      externalEvidenceSubstitutionAllowed: false,
      sameHostSimulationCountsAsCrossPlatform: false,
      automatedInteractionCountsAsHumanUsability: false,
      selfAssessmentCountsAsIndependentReview: false,
    },
    requiredCriteria: Array.from({ length: 9 }, (_, index) => ({
      id: `SC-${index + 1}`,
      status: 'PASS',
    })),
    externalValidation: {
      gates: Array.from({ length: 8 }, (_, index) => ({
        externalGate: `AC-${index + 1}`,
        externalStatus: 'EXTERNAL_OPEN',
        blockingForSoloResearchPreview: false,
        substitutedByLocalEvidence: false,
      })),
    },
    claimsNotEstablished: {
      independentScientificValidation: true,
      crossPlatformCompatibility: true,
      observedHumanUsability: true,
      validatedMvp: true,
    },
    packageChangeRequired: false,
  };
}

function expectBoundaryFailure(mutator) {
  const decision = structuredClone(validDecision());
  mutator(decision);
  assert.throws(
    () => assertSoloDecisionBoundary(decision),
    (error) => error instanceof SoloCloseoutError
      && error.code === 'SOLO_CLOSEOUT_DECISION_BOUNDARY_INVALID',
  );
}

test('solo closeout permits a bounded Research Preview while every external gate stays open', () => {
  assert.equal(assertSoloDecisionBoundary(validDecision()), true);
});

test('solo closeout rejects simulation relabelled as cross-platform, human, or independent evidence', () => {
  for (const key of [
    'externalEvidenceSubstitutionAllowed',
    'sameHostSimulationCountsAsCrossPlatform',
    'automatedInteractionCountsAsHumanUsability',
    'selfAssessmentCountsAsIndependentReview',
  ]) {
    expectBoundaryFailure((decision) => { decision.evidencePolicy[key] = true; });
  }
});

test('solo closeout rejects any external gate closure or required unfinished work', () => {
  expectBoundaryFailure((decision) => {
    decision.externalValidation.gates[0].externalStatus = 'PASS';
  });
  expectBoundaryFailure((decision) => {
    decision.externalValidation.gates[0].substitutedByLocalEvidence = true;
  });
  expectBoundaryFailure((decision) => {
    decision.openRequiredWork.push('Find another reviewer');
  });
});

test('solo closeout rejects missing criteria and inflated validation claims', () => {
  expectBoundaryFailure((decision) => { decision.requiredCriteria[0].status = 'UNKNOWN'; });
  expectBoundaryFailure((decision) => {
    decision.claimsNotEstablished.crossPlatformCompatibility = false;
  });
  expectBoundaryFailure((decision) => { decision.artifactRole = 'VALIDATED_MVP'; });
});

