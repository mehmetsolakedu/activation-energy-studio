export class PlatformEvidenceValidationError extends Error {
  readonly code: string;
}

export interface PlatformEvidenceRecord {
  schemaVersion: 'activation-energy-studio/platform-evidence-record/v1';
  runId: string;
  recordStatus: 'VALIDATED_RETAINED_ARTIFACT_SET';
  claimBoundary: {
    scope: string;
    acPlat01: 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW';
    acPlat02: 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON';
    statement: string;
  };
  protocolObservation: {
    networkCapture: { externalRequestAttempts: number };
  };
  scientificReport: {
    canonicalSha256: string;
    comparatorCompatible: true;
  };
  [key: string]: unknown;
}

export function createPlatformEvidenceRecord(
  manifestPath: string,
  options?: { projectRoot?: string },
): PlatformEvidenceRecord;

export function serializePlatformEvidenceRecord(record: PlatformEvidenceRecord): string;

export function writePlatformEvidenceRecord(
  manifestPath: string,
  outputPath: string,
  options?: { projectRoot?: string },
): PlatformEvidenceRecord;

export function main(argumentsList?: string[]): number;
