import { useMemo } from 'react';

import type { NormalizedThermalRecord } from '../io';

interface CurvePreviewProps {
  records: readonly NormalizedThermalRecord[];
  stageStart: string;
  stageEnd: string;
  onStageStartChange: (value: string) => void;
  onStageEndChange: (value: string) => void;
}

interface PlotPoint {
  x: number;
  signal: number;
  derivative?: number;
}

interface PlotRun {
  id: string;
  label: string;
  points: PlotPoint[];
  signalKind: 'massPercent' | 'mass' | 'alpha';
}

export interface StageSuggestion {
  startCelsius: number;
  endCelsius: number;
  source: 'alpha-crossings' | 'signal-change';
}

const WIDTH = 920;
const HEIGHT = 380;
const PAD = { top: 24, right: 72, bottom: 54, left: 68 };
const COLORS = ['#087f72', '#2e5f92', '#9f6518', '#8b416d', '#66766e', '#b34d34'];

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function valueAtTemperature(
  records: readonly NormalizedThermalRecord[],
  temperatureCelsius: number,
  field: 'massMg' | 'massPercent',
): number | undefined {
  const targetK = temperatureCelsius + 273.15;
  const exact = records.find((record) => Math.abs(record.temperatureK - targetK) <= 1e-9);
  if (exact && finite(exact[field])) return exact[field];
  for (let index = 0; index < records.length - 1; index += 1) {
    const left = records[index];
    const right = records[index + 1];
    if (
      left.temperatureK < targetK
      && targetK < right.temperatureK
      && finite(left[field])
      && finite(right[field])
    ) {
      const fraction = (targetK - left.temperatureK) / (right.temperatureK - left.temperatureK);
      return (left[field] as number) + fraction * ((right[field] as number) - (left[field] as number));
    }
  }
  return undefined;
}

function crossingTemperature(
  points: readonly PlotPoint[],
  target: number,
): number | undefined {
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (
      left.signal <= target
      && target <= right.signal
      && right.signal > left.signal
    ) {
      const fraction = (target - left.signal) / (right.signal - left.signal);
      return left.x + fraction * (right.x - left.x);
    }
  }
  return undefined;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function suggestReactionStage(
  records: readonly NormalizedThermalRecord[],
): StageSuggestion | undefined {
  const grouped = new Map<string, NormalizedThermalRecord[]>();
  for (const record of records) {
    const bucket = grouped.get(record.runId);
    if (bucket) bucket.push(record);
    else grouped.set(record.runId, [record]);
  }

  const alphaStarts: number[] = [];
  const alphaEnds: number[] = [];
  const signalStarts: number[] = [];
  const signalEnds: number[] = [];
  for (const runRecords of grouped.values()) {
    const ordered = [...runRecords].sort((left, right) => left.temperatureK - right.temperatureK);
    const alphaPoints = ordered
      .filter((record) => finite(record.alpha))
      .map((record) => ({
        x: record.temperatureK - 273.15,
        signal: record.alpha as number,
      }));
    const alphaStart = crossingTemperature(alphaPoints, 0.05);
    const alphaEnd = crossingTemperature(alphaPoints, 0.95);
    if (finite(alphaStart) && finite(alphaEnd) && alphaStart < alphaEnd) {
      alphaStarts.push(alphaStart);
      alphaEnds.push(alphaEnd);
      continue;
    }

    const quantity = ordered.every((record) => finite(record.massPercent))
      ? 'massPercent'
      : ordered.every((record) => finite(record.massMg))
        ? 'massMg'
        : undefined;
    if (!quantity) continue;
    const first = ordered[0][quantity] as number;
    const last = ordered.at(-1)?.[quantity] as number;
    const loss = first - last;
    if (!Number.isFinite(loss) || loss <= 0) continue;
    const normalized = ordered.map((record) => ({
      x: record.temperatureK - 273.15,
      signal: (first - (record[quantity] as number)) / loss,
    }));
    const start = crossingTemperature(normalized, 0.05);
    const end = crossingTemperature(normalized, 0.95);
    if (finite(start) && finite(end) && start < end) {
      signalStarts.push(start);
      signalEnds.push(end);
    }
  }

  if (alphaStarts.length > 0 && alphaEnds.length > 0) {
    return {
      startCelsius: median(alphaStarts),
      endCelsius: median(alphaEnds),
      source: 'alpha-crossings',
    };
  }
  if (signalStarts.length > 0 && signalEnds.length > 0) {
    return {
      startCelsius: median(signalStarts),
      endCelsius: median(signalEnds),
      source: 'signal-change',
    };
  }
  return undefined;
}

function buildRuns(records: readonly NormalizedThermalRecord[]): PlotRun[] {
  const grouped = new Map<string, NormalizedThermalRecord[]>();
  for (const record of records) {
    const bucket = grouped.get(record.runId);
    if (bucket) bucket.push(record);
    else grouped.set(record.runId, [record]);
  }
  return [...grouped.entries()].flatMap(([id, runRecords]) => {
    const ordered = [...runRecords].sort((left, right) => left.temperatureK - right.temperatureK);
    const signalKind = ordered.some((record) => finite(record.massPercent))
      ? 'massPercent'
      : ordered.some((record) => finite(record.massMg))
        ? 'mass'
        : ordered.some((record) => finite(record.alpha))
          ? 'alpha'
          : undefined;
    if (!signalKind) return [];
    const rawValues = ordered.map((record) => (
      signalKind === 'massPercent'
        ? record.massPercent
        : signalKind === 'mass'
          ? record.massMg
          : record.alpha
    )).filter(finite);
    if (rawValues.length < 2) return [];
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const span = Math.max(max - min, Number.EPSILON);
    const maxPoints = 850;
    const stride = Math.max(1, Math.ceil(ordered.length / maxPoints));
    const points = ordered
      .filter((_, index) => index % stride === 0 || index === ordered.length - 1)
      .flatMap((record) => {
        const raw = signalKind === 'massPercent'
          ? record.massPercent
          : signalKind === 'mass'
            ? record.massMg
            : record.alpha;
        if (!finite(raw)) return [];
        return [{
          x: record.temperatureK - 273.15,
          signal: (raw - min) / span,
          ...(finite(record.dAlphaDtPerMinute)
            ? { derivative: record.dAlphaDtPerMinute }
            : {}),
        }];
      });
    return [{
      id,
      label: `${id}${finite(ordered[0]?.heatingRateKPerMin) ? ` · ${ordered[0].heatingRateKPerMin} K/min` : ''}`,
      points,
      signalKind,
    }];
  });
}

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

export function CurvePreview({
  records,
  stageStart,
  stageEnd,
  onStageStartChange,
  onStageEndChange,
}: CurvePreviewProps) {
  const runs = useMemo(() => buildRuns(records), [records]);
  const suggestion = useMemo(() => suggestReactionStage(records), [records]);
  const temperatures = runs.flatMap((run) => run.points.map((point) => point.x));
  if (runs.length === 0 || temperatures.length < 2) return null;

  const minX = Math.min(...temperatures);
  const maxX = Math.max(...temperatures);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const sx = (value: number) => PAD.left + ((value - minX) / Math.max(maxX - minX, Number.EPSILON)) * plotWidth;
  const sy = (value: number) => PAD.top + (1 - value) * plotHeight;
  const start = numberOrUndefined(stageStart);
  const end = numberOrUndefined(stageEnd);
  const visualStart = start ?? suggestion?.startCelsius;
  const visualEnd = end ?? suggestion?.endCelsius;
  const derivatives = runs.flatMap((run) => run.points.map((point) => point.derivative).filter(finite));
  const derivativeMax = Math.max(...derivatives.map((value) => Math.abs(value)), Number.EPSILON);
  const hasDerivative = derivatives.length > 0;

  const anchors = runs.flatMap((run) => {
    if (!finite(start) || !finite(end)) return [];
    const source = records
      .filter((record) => record.runId === run.id)
      .sort((left, right) => left.temperatureK - right.temperatureK);
    const field = run.signalKind === 'massPercent'
      ? 'massPercent'
      : run.signalKind === 'mass'
        ? 'massMg'
        : undefined;
    if (!field) return [];
    const m0 = valueAtTemperature(source, start, field);
    const mf = valueAtTemperature(source, end, field);
    return finite(m0) && finite(mf) ? [{ id: run.id, m0, mf, field }] : [];
  });

  const signalLabel = runs.every((run) => run.signalKind === 'alpha')
    ? 'α'
    : runs.some((run) => run.signalKind === 'massPercent')
      ? 'TG / mass (%)'
      : 'TG / mass';

  return (
    <section className="curve-preview" data-testid="curve-preview" aria-labelledby="curve-preview-title">
      <div className="curve-preview-heading">
        <div>
          <span>This is what the software found</span>
          <h3 id="curve-preview-title">Raw curve and reaction stage</h3>
          <p>Solid lines show the TG/alpha signal; dashed lines show supplied dα/dt. The grey stage is a suggestion only.</p>
        </div>
        <span className="preview-source-pill">
          {suggestion ? 'Automatic suggestion · not applied' : 'No automatic stage found'}
        </span>
      </div>

      <div className="curve-chart" role="img" aria-label="TG and DTG curve preview">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          <rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} fill="#fbfcf9" />
          {finite(visualStart) && finite(visualEnd) && visualStart < visualEnd && (
            <rect
              x={sx(Math.max(minX, visualStart))}
              y={PAD.top}
              width={Math.max(0, sx(Math.min(maxX, visualEnd)) - sx(Math.max(minX, visualStart)))}
              height={plotHeight}
              fill={finite(start) && finite(end) ? '#d9efe9' : '#e7e9e5'}
              opacity="0.8"
            />
          )}
          {ticks(minX, maxX).map((tick) => (
            <g key={tick}>
              <line x1={sx(tick)} x2={sx(tick)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#e4e8e3" />
              <text x={sx(tick)} y={HEIGHT - PAD.bottom + 21} textAnchor="middle" fill="#63716a" fontSize="12">
                {tick.toFixed(0)}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={sy(tick)} y2={sy(tick)} stroke="#e4e8e3" />
              <text x={PAD.left - 10} y={sy(tick) + 4} textAnchor="end" fill="#63716a" fontSize="12">
                {(tick * 100).toFixed(0)}
              </text>
            </g>
          ))}
          {runs.map((run, index) => {
            const color = COLORS[index % COLORS.length];
            const primaryPath = run.points
              .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${sx(point.x)} ${sy(point.signal)}`)
              .join(' ');
            const derivativePath = run.points
              .filter((point) => finite(point.derivative))
              .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${sx(point.x)} ${sy(0.5 + (point.derivative as number) / derivativeMax / 2)}`)
              .join(' ');
            return (
              <g key={run.id}>
                <path d={primaryPath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {derivativePath && (
                  <path d={derivativePath} fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="5 4" opacity="0.72" />
                )}
              </g>
            );
          })}
          {finite(start) && (
            <line x1={sx(start)} x2={sx(start)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#087f72" strokeWidth="2.2" />
          )}
          {finite(end) && (
            <line x1={sx(end)} x2={sx(end)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#087f72" strokeWidth="2.2" />
          )}
          <text x={PAD.left + plotWidth / 2} y={HEIGHT - 10} textAnchor="middle" fill="#35463e" fontSize="13">
            Temperature (°C)
          </text>
          <text x="17" y={PAD.top + plotHeight / 2} textAnchor="middle" fill="#35463e" fontSize="13" transform={`rotate(-90 17 ${PAD.top + plotHeight / 2})`}>
            {signalLabel} · scaled %
          </text>
          {hasDerivative && (
            <text x={WIDTH - 10} y={PAD.top + 12} textAnchor="end" fill="#63716a" fontSize="11">
              dashed: supplied dα/dt
            </text>
          )}
        </svg>
      </div>

      <div className="curve-legend">
        {runs.map((run, index) => (
          <span key={run.id}><i style={{ background: COLORS[index % COLORS.length] }} />{run.label}</span>
        ))}
      </div>

      <div className="stage-adjuster">
        <div className="stage-adjuster-copy">
          <strong>Confirm the stage boundaries</strong>
          <span>Sliders and numeric fields edit the same decision. Changes invalidate the analysis and are retained in the report.</span>
        </div>
        <div className="stage-sliders">
          <label>
            Start slider
            <input
              data-testid="stage-start-slider"
              type="range"
              min={minX}
              max={maxX}
              step="0.1"
              value={Math.min(maxX, Math.max(minX, start ?? suggestion?.startCelsius ?? minX))}
              onChange={(event) => onStageStartChange(Number(event.target.value).toFixed(1))}
            />
          </label>
          <label>
            End slider
            <input
              data-testid="stage-end-slider"
              type="range"
              min={minX}
              max={maxX}
              step="0.1"
              value={Math.min(maxX, Math.max(minX, end ?? suggestion?.endCelsius ?? maxX))}
              onChange={(event) => onStageEndChange(Number(event.target.value).toFixed(1))}
            />
          </label>
        </div>
        {suggestion && (
          <div className="stage-suggestion-actions">
            <button
              className="ghost-button"
              data-testid="accept-stage-suggestion"
              onClick={() => {
                onStageStartChange(suggestion.startCelsius.toFixed(1));
                onStageEndChange(suggestion.endCelsius.toFixed(1));
              }}
              type="button"
            >
              {`Use suggestion (${suggestion.startCelsius.toFixed(1)}–${suggestion.endCelsius.toFixed(1)} °C)`}
            </button>
            {finite(start) && finite(end) && (
              <button
                className="ghost-button"
                data-testid="clear-stage-selection"
                onClick={() => {
                  onStageStartChange('');
                  onStageEndChange('');
                }}
                type="button"
              >
                Undo selection
              </button>
            )}
          </div>
        )}
      </div>

      <div className="anchor-summary" data-testid="anchor-summary">
        <div>
          <span>m0</span>
          <strong>
            {anchors.length > 0
              ? anchors.map(({ id, m0 }) => `${id}: ${m0.toFixed(4)}`).join(' · ')
              : 'Calculated after the stage start is selected'}
          </strong>
        </div>
        <div>
          <span>mf</span>
          <strong>
            {anchors.length > 0
              ? anchors.map(({ id, mf }) => `${id}: ${mf.toFixed(4)}`).join(' · ')
              : 'Calculated after the stage end is selected'}
          </strong>
        </div>
        <p>
          For mass input, conversion is calculated per run as α=(m0−m)/(m0−mf). Moving the boundaries changes the m0/mf anchors; no smoothing or baseline is applied.
        </p>
      </div>
    </section>
  );
}
