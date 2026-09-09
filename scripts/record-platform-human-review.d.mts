export class PlatformHumanReviewValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export const PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA:
  'activation-energy-studio/platform-human-review-input/v1';
export const PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA:
  'activation-energy-studio/platform-human-review-record/v1';
export const PLATFORM_HUMAN_REVIEW_RECORD_STATE:
  'STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT';
export const PLATFORM_HUMAN_REVIEW_DECISION_IDS: readonly [
  'HAR_NETWORK',
  'SCREENSHOT_UI',
  'PDF_VISUAL_QA',
  'JSON_CSV_PDF_CONSISTENCY',
  'RUNNER_OS_ARCH_IDENTITY',
  'DEVIATIONS',
];

export interface PlatformHumanReviewRecord {
  schemaVersion: typeof PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA;
  reviewId: string;
  recordState: typeof PLATFORM_HUMAN_REVIEW_RECORD_STATE;
  reviewerMatrixDisposition: 'PASS' | 'FAIL';
  eligibleForHumanGateDisposition: boolean;
  acceptanceGateStatus: 'NOT_AUTOMATICALLY_APPLIED';
  authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE';
  matrixIntegrity: {
    status: 'TECHNICALLY_VERIFIED';
    matrix: {
      path: string;
      fileName: string;
      sizeBytes: number;
      sha256: string;
    };
    sourceRecords: Array<{
      path: string;
      fileName: string;
      sizeBytes: number;
      sha256: string;
    }>;
  };
  gateDispositionBoundary: {
    acPlat01: 'RECORDED_HUMAN_DISPOSITION_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT';
    acPlat02: 'RECORDED_HUMAN_DISPOSITION_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT';
    statement: string;
  };
  platforms: Array<{
    osFamily: 'macos' | 'windows11' | 'ubuntu';
    runId: string;
    reviewerDisposition: 'PASS' | 'FAIL';
    runProvenance: {
      workflowPreflight: {
        schema: 'activation-energy-studio/hosted-workflow-preflight/v1';
        claimStatus:
          'WORKFLOW_STARTED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE';
        startedAtUtc: string;
        declaredTarget: Record<string, string>;
        evidenceBoundary: Record<string, unknown>;
      };
      uploadReceipt: {
        provider: 'GitHub Actions';
        artifactId: string;
        artifactName: string;
        artifactUrl: string;
        artifactDigest: string;
        capturedAtUtc: string;
        claimBoundary:
          'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE';
      };
      [key: string]: unknown;
    };
    decisions: Array<{
      id: (typeof PLATFORM_HUMAN_REVIEW_DECISION_IDS)[number];
      reviewStatus: 'REVIEWED';
      decision: 'PASS' | 'FAIL';
      reviewedEvidenceSha256: string[];
      comment: string;
    }>;
  }>;
  retainedArtifacts: Array<{
    path: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  sourceInput: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  [key: string]: unknown;
}

export function createPlatformHumanReviewRecord(options: {
  inputPath: string;
}): PlatformHumanReviewRecord;

export function serializePlatformHumanReviewRecord(
  record: PlatformHumanReviewRecord,
): string;

export function writePlatformHumanReviewRecord(options: {
  inputPath: string;
  outputPath: string;
}): PlatformHumanReviewRecord;

export function main(argv?: string[]): number;
export const PLATFORM_HUMAN_REVIEW_SCRIPT_PATH: string;
