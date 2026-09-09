export interface ReportStageLabelInput {
  readonly explicitLabel?: string;
  readonly stageWindow?: {
    readonly startCelsius: number;
    readonly endCelsius: number;
  };
  readonly commonAlphaRange?: readonly [number, number];
  readonly hasSuppliedAlpha: boolean;
}

function finiteRange(range: readonly [number, number] | undefined): range is readonly [number, number] {
  return Boolean(
    range
    && Number.isFinite(range[0])
    && Number.isFinite(range[1])
    && range[0] >= 0
    && range[1] <= 1
    && range[0] < range[1],
  );
}

export function resolveReportStageLabel({
  explicitLabel,
  stageWindow,
  commonAlphaRange,
  hasSuppliedAlpha,
}: ReportStageLabelInput): string | undefined {
  const normalizedExplicitLabel = explicitLabel?.trim();
  if (normalizedExplicitLabel) return normalizedExplicitLabel;

  if (
    stageWindow
    && Number.isFinite(stageWindow.startCelsius)
    && Number.isFinite(stageWindow.endCelsius)
    && stageWindow.startCelsius < stageWindow.endCelsius
  ) {
    return `${stageWindow.startCelsius.toFixed(1)}-${stageWindow.endCelsius.toFixed(1)} °C`;
  }

  if (hasSuppliedAlpha && finiteRange(commonAlphaRange)) {
    return `supplied-alpha ${commonAlphaRange[0].toFixed(2)}-${commonAlphaRange[1].toFixed(2)} window`;
  }

  return undefined;
}
