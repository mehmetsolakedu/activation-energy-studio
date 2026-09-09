import type { KissingerPeak, ThermalPoint, ThermalRun } from './core';
import type { BatchIngestionResult, NormalizedThermalRecord } from './io';

export interface StageWindow {
  startCelsius: number;
  endCelsius: number;
}

export interface AdapterDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  runId?: string;
}

export interface ThermalRunBuildResult {
  runs: ThermalRun[];
  kissingerPeaks: KissingerPeak[];
  diagnostics: AdapterDiagnostic[];
}

export type StageBoundaryMethod = 'source-row' | 'linear-interpolation';

export interface StageBoundaryResolution {
  record: NormalizedThermalRecord;
  method: StageBoundaryMethod;
  sourceRows: number[];
}

export type StageWindowRecordResolution =
  | {
      status: 'ok';
      records: NormalizedThermalRecord[];
      start: StageBoundaryResolution;
      end: StageBoundaryResolution;
    }
  | {
      status: 'error';
      code:
        | 'INVALID_STAGE_WINDOW'
        | 'STAGE_WINDOW_NOT_BRACKETED'
        | 'TEMPERATURE_NOT_INCREASING';
      message: string;
    };

type MassQuantity = 'massMg' | 'massPercent';

const TEMPERATURE_MATCH_TOLERANCE_K = 1e-9;

function massQuantity(records: readonly NormalizedThermalRecord[]): MassQuantity | undefined {
  if (records.every((record) => record.massMg !== undefined)) return 'massMg';
  if (records.every((record) => record.massPercent !== undefined)) return 'massPercent';
  return undefined;
}

function massValue(
  record: NormalizedThermalRecord,
  quantity: MassQuantity,
): number | undefined {
  return record[quantity];
}

function interpolateOptional(
  left: number | undefined,
  right: number | undefined,
  fraction: number,
): number | undefined {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  return (left as number) + fraction * ((right as number) - (left as number));
}

function boundaryAtTemperature(
  records: readonly NormalizedThermalRecord[],
  targetTemperatureK: number,
): StageBoundaryResolution | undefined {
  const exact = records.find(
    (record) =>
      Math.abs(record.temperatureK - targetTemperatureK)
      <= TEMPERATURE_MATCH_TOLERANCE_K,
  );
  if (exact) {
    return {
      record: exact,
      method: 'source-row',
      sourceRows: [exact.provenance.sourceRow],
    };
  }

  for (let index = 0; index < records.length - 1; index += 1) {
    const left = records[index];
    const right = records[index + 1];
    if (
      left.temperatureK < targetTemperatureK
      && targetTemperatureK < right.temperatureK
    ) {
      const fraction =
        (targetTemperatureK - left.temperatureK)
        / (right.temperatureK - left.temperatureK);
      return {
        record: {
          temperatureK: targetTemperatureK,
          temperatureKind: left.temperatureKind,
          ...(interpolateOptional(left.timeSeconds, right.timeSeconds, fraction) === undefined
            ? {}
            : {
                timeSeconds: interpolateOptional(
                  left.timeSeconds,
                  right.timeSeconds,
                  fraction,
                ),
              }),
          ...(interpolateOptional(left.massMg, right.massMg, fraction) === undefined
            ? {}
            : { massMg: interpolateOptional(left.massMg, right.massMg, fraction) }),
          ...(interpolateOptional(left.massPercent, right.massPercent, fraction) === undefined
            ? {}
            : {
                massPercent: interpolateOptional(
                  left.massPercent,
                  right.massPercent,
                  fraction,
                ),
              }),
          ...(interpolateOptional(left.alpha, right.alpha, fraction) === undefined
            ? {}
            : { alpha: interpolateOptional(left.alpha, right.alpha, fraction) }),
          ...(interpolateOptional(
            left.dAlphaDtPerMinute,
            right.dAlphaDtPerMinute,
            fraction,
          ) === undefined
            ? {}
            : {
                dAlphaDtPerMinute: interpolateOptional(
                  left.dAlphaDtPerMinute,
                  right.dAlphaDtPerMinute,
                  fraction,
                ),
              }),
          ...(left.dAlphaDtSource !== undefined
            && left.dAlphaDtSource === right.dAlphaDtSource
            ? { dAlphaDtSource: left.dAlphaDtSource }
            : {}),
          ...(interpolateOptional(
            left.heatingRateKPerMin,
            right.heatingRateKPerMin,
            fraction,
          ) === undefined
            ? {}
            : {
                heatingRateKPerMin: interpolateOptional(
                  left.heatingRateKPerMin,
                  right.heatingRateKPerMin,
                  fraction,
                ),
              }),
          runId: left.runId,
          ...(left.sample ? { sample: left.sample } : {}),
          ...(left.atmosphere ? { atmosphere: left.atmosphere } : {}),
          ...(left.stage ? { stage: left.stage } : {}),
          provenance: left.provenance,
        },
        method: 'linear-interpolation',
        sourceRows: [left.provenance.sourceRow, right.provenance.sourceRow],
      };
    }
  }
  return undefined;
}

export function resolveStageWindowRecords(
  records: readonly NormalizedThermalRecord[],
  stageWindow: StageWindow,
): StageWindowRecordResolution {
  if (
    !Number.isFinite(stageWindow.startCelsius)
    || !Number.isFinite(stageWindow.endCelsius)
    || stageWindow.startCelsius >= stageWindow.endCelsius
  ) {
    return {
      status: 'error',
      code: 'INVALID_STAGE_WINDOW',
      message:
        'The stage window must contain finite values, and its start temperature must be lower than its end temperature.',
    };
  }
  if (
    records.length < 2
    || records.some((record, index) =>
      !Number.isFinite(record.temperatureK)
      || (index > 0 && record.temperatureK <= records[index - 1].temperatureK))
  ) {
    return {
      status: 'error',
      code: 'TEMPERATURE_NOT_INCREASING',
      message:
        'Stage boundaries can be resolved only for runs whose temperature is strictly increasing in acquisition order.',
    };
  }

  const startK = stageWindow.startCelsius + 273.15;
  const endK = stageWindow.endCelsius + 273.15;
  const start = boundaryAtTemperature(records, startK);
  const end = boundaryAtTemperature(records, endK);
  if (!start || !end) {
    return {
      status: 'error',
      code: 'STAGE_WINDOW_NOT_BRACKETED',
      message:
        'Both boundaries of the selected stage window must be bracketed by measured points; extrapolation and silent clipping are not permitted.',
    };
  }

  const interior = records.filter(
    (record) =>
      record.temperatureK > startK + TEMPERATURE_MATCH_TOLERANCE_K
      && record.temperatureK < endK - TEMPERATURE_MATCH_TOLERANCE_K,
  );
  return {
    status: 'ok',
    records: [start.record, ...interior, end.record],
    start,
    end,
  };
}

function uniqueFinite(values: (number | undefined)[]): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))];
}

function uniqueNonEmpty(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function normalizedStage(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function stageWindowLabel(stageWindow: StageWindow | undefined): string | undefined {
  return stageWindow
    ? `${stageWindow.startCelsius.toFixed(1)}-${stageWindow.endCelsius.toFixed(1)} °C`
    : undefined;
}

export function buildThermalRuns(
  ingestion: BatchIngestionResult,
  stageWindow?: StageWindow,
  stageLabel?: string,
): ThermalRunBuildResult {
  if (ingestion.status !== 'ready') {
    return {
      runs: [],
      kissingerPeaks: [],
      diagnostics: [
        {
          severity: 'error',
          code: 'INGESTION_NOT_READY',
          message: 'Scientific analysis cannot start until column-mapping and file errors are resolved.',
        },
      ],
    };
  }
  if (
    stageWindow
    && (
      !Number.isFinite(stageWindow.startCelsius)
      || !Number.isFinite(stageWindow.endCelsius)
      || stageWindow.startCelsius >= stageWindow.endCelsius
    )
  ) {
    return {
      runs: [],
      kissingerPeaks: [],
      diagnostics: [{
        severity: 'error',
        code: 'INVALID_STAGE_WINDOW',
        message:
          'The stage window must contain finite values, and its start temperature must be lower than its end temperature.',
      }],
    };
  }

  const diagnostics: AdapterDiagnostic[] = [];
  const explicitStage = normalizedStage(stageLabel);
  const selectedWindowStage = stageWindowLabel(stageWindow);
  const peakSamples = uniqueNonEmpty(ingestion.tables.betaTp.map((row) => row.sample));
  const peakAtmospheres = uniqueNonEmpty(
    ingestion.tables.betaTp.map((row) => row.atmosphere),
  );
  const peakStages = uniqueNonEmpty(
    ingestion.tables.betaTp.map((row) => row.stage),
  );
  const peakStageMissing = ingestion.tables.betaTp.some(
    (row) => normalizedStage(row.stage) === undefined,
  );
  const peakStageConflictsWithExplicit = Boolean(
    explicitStage
    && peakStages.some((stage) => stage.trim() !== explicitStage),
  );
  const peakStage =
    explicitStage
    ?? (
      peakStages.length === 1 && (!peakStageMissing || selectedWindowStage)
        ? peakStages[0].trim()
        : undefined
    )
    ?? selectedWindowStage;
  const peakStageUnresolved =
    ingestion.tables.betaTp.length > 0
    && (
      peakStages.length > 1
      || peakStageConflictsWithExplicit
      || peakStage === undefined
    );
  const peakContextConflict =
    peakSamples.length > 1
    || peakAtmospheres.length > 1
    || peakStageConflictsWithExplicit;
  if (peakContextConflict) {
    diagnostics.push({
      severity: 'error',
      code: 'INCONSISTENT_CONTEXT',
      message:
        'The beta–Tp rows contain multiple sample, atmosphere, or reaction-stage contexts and must be split into separate analyses.',
    });
  }
  if (peakStageUnresolved && !peakStageConflictsWithExplicit) {
    diagnostics.push({
      severity: 'error',
      code: 'AMBIGUOUS_STAGE',
      message:
        'For Kissinger analysis, every beta–Tp row must be assigned explicitly to the same physical reaction stage.',
    });
  }

  const peakRowsByRun = new Map<string, typeof ingestion.tables.betaTp>();
  for (const row of ingestion.tables.betaTp) {
    const rows = peakRowsByRun.get(row.runId) ?? [];
    rows.push(row);
    peakRowsByRun.set(row.runId, rows);
  }
  const kissingerPeaks: KissingerPeak[] = [];
  if (!peakContextConflict && !peakStageUnresolved) {
    for (const [runId, rows] of peakRowsByRun) {
      if (rows.length !== 1) {
        diagnostics.push({
          severity: 'error',
          code: 'AMBIGUOUS_STAGE',
          message: `${runId}: multiple peak candidates cannot be merged automatically into one physical reaction stage.`,
          runId,
        });
        continue;
      }
      const row = rows[0];
      kissingerPeaks.push({
        runId,
        heatingRateKPerMinute: row.heatingRateKPerMin,
        peakTemperatureK: row.peakTemperatureK,
        ...(row.peakAmbiguous === undefined ? {} : { ambiguous: row.peakAmbiguous }),
        ...(row.peakResolved === undefined ? {} : { peakResolved: row.peakResolved }),
        ...(row.peakQuality === undefined ? {} : { peakQuality: row.peakQuality }),
        ...(row.peakSourceSignal === undefined
          ? {}
          : { sourceSignal: row.peakSourceSignal }),
        ...(row.peakAnalystConfirmed === undefined
          ? {}
          : { analystConfirmed: row.peakAnalystConfirmed }),
        stage: peakStage,
      });
    }
  }

  const grouped = new Map<string, NormalizedThermalRecord[]>();
  for (const record of ingestion.records.filter(
    ({ temperatureKind }) => temperatureKind === 'sample',
  )) {
    const records = grouped.get(record.runId) ?? [];
    records.push(record);
    grouped.set(record.runId, records);
  }

  const runs: ThermalRun[] = [];

  for (const [runId, rawRecords] of grouped.entries()) {
    const samples = uniqueNonEmpty(rawRecords.map((record) => record.sample));
    const atmospheres = uniqueNonEmpty(rawRecords.map((record) => record.atmosphere));
    const stages = uniqueNonEmpty(rawRecords.map((record) => record.stage));
    const stageMissing = rawRecords.some(
      (record) => normalizedStage(record.stage) === undefined,
    );
    const stageConflictsWithExplicit = Boolean(
      explicitStage
      && stages.some((stage) => stage.trim() !== explicitStage),
    );
    const assignedStage =
      explicitStage
      ?? (
        stages.length === 1 && (!stageMissing || selectedWindowStage)
          ? stages[0].trim()
          : undefined
      )
      ?? selectedWindowStage;
    if (samples.length > 1 || atmospheres.length > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'INCONSISTENT_CONTEXT',
        message: `${runId}: multiple sample or atmosphere contexts were found within the same run.`,
        runId,
      });
      continue;
    }
    if (stages.length > 1 || stageConflictsWithExplicit) {
      diagnostics.push({
        severity: 'error',
        code: 'INCONSISTENT_CONTEXT',
        message: `${runId}: multiple reaction-stage contexts were found within the same run.`,
        runId,
      });
      continue;
    }
    const rates = uniqueFinite(rawRecords.map((record) => record.heatingRateKPerMin));
    if (rates.length !== 1) {
      diagnostics.push({
        severity: 'error',
        code: rates.length === 0 ? 'HEATING_RATE_MISSING' : 'HEATING_RATE_CONFLICT',
        message:
          rates.length === 0
            ? `${runId}: no heating rate was found.`
            : `${runId}: multiple heating rates were found within the same run.`,
        runId,
      });
      continue;
    }

    const hasWideProjectionProvenance = rawRecords.some(
      (record) => record.provenance.sourceRows !== undefined,
    );
    const hasIncompleteWideProjectionDerivative = hasWideProjectionProvenance
      && rawRecords.some((record) => (
        !Number.isFinite(record.dAlphaDtPerMinute)
        || (
          record.dAlphaDtSource !== 'provided'
          && record.dAlphaDtSource !== 'temperature'
        )
        || (record.provenance.derivativeSourceRows?.length ?? 0) === 0
      ));
    if (hasIncompleteWideProjectionDerivative) {
      diagnostics.push({
        severity: 'error',
        code: 'WIDE_PROJECTED_DERIVATIVE_MISSING',
        message:
          `${runId}: projected wide-series rows require a complete finite derivative series with explicit derivative source-row provenance; recomputing after target-alpha projection is forbidden.`,
        runId,
      });
      continue;
    }

    // Preserve acquisition order. The scientific core must see and refuse a
    // permuted/non-increasing run instead of having the adapter silently repair it.
    let records = rawRecords.filter((record) => record.temperatureKind === 'sample');
    let resolvedStageWindow: Extract<StageWindowRecordResolution, { status: 'ok' }> | undefined;

    if (stageWindow) {
      const resolution = resolveStageWindowRecords(records, stageWindow);
      if (resolution.status === 'error') {
        diagnostics.push({
          severity: 'error',
          code: resolution.code,
          message: `${runId}: ${resolution.message}`,
          runId,
        });
        continue;
      }
      resolvedStageWindow = resolution;
      records = resolution.records;
    }

    if (records.length < 3) {
      diagnostics.push({
        severity: 'error',
        code: 'INSUFFICIENT_STAGE_POINTS',
        message: `${runId}: the selected stage window must contain at least three data points.`,
        runId,
      });
      continue;
    }

    const hasCompleteAlpha = records.every((record) => record.alpha !== undefined);
    const resolvedMassQuantity = massQuantity(records);
    const hasCompleteMass = resolvedMassQuantity !== undefined;
    const hasMassInEveryRow = records.every(
      (record) => record.massMg !== undefined || record.massPercent !== undefined,
    );
    if (!hasCompleteAlpha && hasMassInEveryRow && !resolvedMassQuantity) {
      diagnostics.push({
        severity: 'error',
        code: 'INCONSISTENT_MASS_QUANTITY',
        message:
          `${runId}: massMg and massPercent values cannot be combined as one mass signal within the same run.`,
        runId,
      });
      continue;
    }
    if (
      assignedStage === undefined
      && !(!hasCompleteAlpha && hasCompleteMass && !stageWindow)
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'AMBIGUOUS_STAGE',
        message:
          `${runId}: the reaction stage is not specified. Provide a stage column, stage label, or temperature window.`,
        runId,
      });
      continue;
    }
    const points: ThermalPoint[] = records.map((record) => ({
      temperature: record.temperatureK,
      ...(record.timeSeconds === undefined ? {} : { time: record.timeSeconds / 60 }),
      ...(resolvedMassQuantity === undefined
        ? {}
        : { mass: massValue(record, resolvedMassQuantity) }),
      ...(record.alpha === undefined ? {} : { alpha: record.alpha }),
      ...(record.dAlphaDtPerMinute === undefined
        ? {}
        : {
            dAlphaDtPerMinute: record.dAlphaDtPerMinute,
            ...(record.dAlphaDtSource === undefined
              ? {}
              : { dAlphaDtSource: record.dAlphaDtSource }),
          }),
    }));

    let massReference: ThermalRun['massReference'];
    if (!hasCompleteAlpha && hasCompleteMass) {
      if (!stageWindow) {
        diagnostics.push({
          severity: 'error',
          code: 'STAGE_WINDOW_REQUIRED',
          message: `${runId}: explicitly select the reaction-stage start and end temperatures before calculating alpha from raw mass.`,
          runId,
        });
      } else {
        if (!resolvedStageWindow || !resolvedMassQuantity) {
          diagnostics.push({
            severity: 'error',
            code: 'STAGE_WINDOW_NOT_BRACKETED',
            message: `${runId}: the stage-specific mass anchors could not be resolved safely.`,
            runId,
          });
          continue;
        }
        massReference = {
          initialMass: massValue(
            resolvedStageWindow.start.record,
            resolvedMassQuantity,
          ) as number,
          finalMass: massValue(
            resolvedStageWindow.end.record,
            resolvedMassQuantity,
          ) as number,
        };
      }
    }

    const peakCandidates = peakRowsByRun.get(runId) ?? [];
    const peak = peakCandidates.length === 1 ? peakCandidates[0] : undefined;
    const peakAmbiguous = peakCandidates.length > 1 || peak?.peakAmbiguous === true;
    if (
      peakAmbiguous
      && !diagnostics.some(
        (diagnostic) => diagnostic.code === 'AMBIGUOUS_STAGE' && diagnostic.runId === runId,
      )
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'AMBIGUOUS_STAGE',
        message: `${runId}: multiple peak candidates cannot be merged automatically into one physical reaction stage.`,
        runId,
      });
    }
    if (
      peak
      && (
        peak.heatingRateKPerMin !== rates[0]
        || (peak.sample && samples[0] && peak.sample !== samples[0])
        || (peak.atmosphere && atmospheres[0] && peak.atmosphere !== atmospheres[0])
      )
    ) {
      diagnostics.push({
        severity: 'error',
        code:
          peak.heatingRateKPerMin !== rates[0]
            ? 'HEATING_RATE_CONFLICT'
            : 'INCONSISTENT_CONTEXT',
        message: `${runId}: the beta–Tp row and curve rows do not share the same heating rate or experimental context.`,
        runId,
      });
    }
    const first = records[0];
    runs.push({
      id: runId,
      heatingRate: rates[0],
      heatingRateUnit: 'K/min',
      temperatureUnit: 'K',
      timeUnit: 'min',
      points,
      ...(massReference ? { massReference } : {}),
      ...(peak ? { peakTemperature: peak.peakTemperatureK } : {}),
      ...(peakAmbiguous ? { peakAmbiguous: true } : {}),
      ...(peak?.peakResolved === undefined ? {} : { peakResolved: peak.peakResolved }),
      ...(peak?.peakQuality === undefined ? {} : { peakQuality: peak.peakQuality }),
      ...(peak?.peakSourceSignal === undefined
        ? {}
        : { peakSourceSignal: peak.peakSourceSignal }),
      ...(peak?.peakAnalystConfirmed === undefined
        ? {}
        : { peakAnalystConfirmed: peak.peakAnalystConfirmed }),
      ...(first.sample ? { sampleId: first.sample } : {}),
      ...(first.atmosphere ? { atmosphere: first.atmosphere } : {}),
      ...(assignedStage ? { stage: assignedStage } : {}),
    });
  }

  return { runs, kissingerPeaks, diagnostics };
}
