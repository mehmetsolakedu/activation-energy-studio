export interface ScientificDifference {
  path: string;
  left: unknown;
  right: unknown;
}

export function canonicalizeScientificReport(report: unknown): unknown;
export function canonicalScientificJson(report: unknown): string;
export function scientificReportHash(report: unknown): string;
export function firstDifference(
  left: unknown,
  right: unknown,
  path?: string,
): ScientificDifference | undefined;
