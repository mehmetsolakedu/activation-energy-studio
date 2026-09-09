export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
}

interface EaChartProps {
  series: ChartSeries[];
  xLabel?: string;
  yLabel?: string;
}

const WIDTH = 820;
const HEIGHT = 360;
const PAD = { top: 24, right: 24, bottom: 52, left: 68 };

function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toExponential(1);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function EaChart({
  series,
  xLabel,
  yLabel,
}: EaChartProps) {
  const resolvedXLabel = xLabel ?? 'Conversion, α';
  const resolvedYLabel = yLabel ?? 'Apparent Ea (kJ mol⁻¹)';
  const allPoints = series.flatMap((item) => item.points).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (allPoints.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <strong>
            {'No results to plot yet'}
          </strong>
          {'When a valid analysis is complete, the methods’ Ea(α) profiles will be compared here.'}
        </div>
      </div>
    );
  }

  const xMin = Math.min(...allPoints.map((point) => point.x));
  const xMax = Math.max(...allPoints.map((point) => point.x));
  const rawYMin = Math.min(...allPoints.map((point) => point.y));
  const rawYMax = Math.max(...allPoints.map((point) => point.y));
  const yMargin = Math.max((rawYMax - rawYMin) * 0.1, 2);
  const yMin = rawYMin - yMargin;
  const yMax = rawYMax + yMargin;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const sx = (value: number) => PAD.left + ((value - xMin) / Math.max(xMax - xMin, Number.EPSILON)) * plotWidth;
  const sy = (value: number) => PAD.top + (1 - (value - yMin) / Math.max(yMax - yMin, Number.EPSILON)) * plotHeight;

  return (
    <div
      className="chart-frame"
      role="img"
      aria-label={'Apparent activation-energy profile by method'}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} fill="#fbfcf8" />

        {ticks(yMin, yMax).map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={sy(tick)}
              y2={sy(tick)}
              stroke="#dde3dc"
              strokeWidth="1"
            />
            <text x={PAD.left - 10} y={sy(tick) + 4} textAnchor="end" fill="#65716b" fontSize="12">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {ticks(xMin, xMax).map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={sx(tick)}
              x2={sx(tick)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="#eef1ed"
              strokeWidth="1"
            />
            <text x={sx(tick)} y={HEIGHT - PAD.bottom + 22} textAnchor="middle" fill="#65716b" fontSize="12">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {series.map((item) => {
          const sorted = [...item.points].sort((a, b) => a.x - b.x);
          const d = sorted.map((point, index) => `${index === 0 ? 'M' : 'L'} ${sx(point.x)} ${sy(point.y)}`).join(' ');
          return (
            <g key={item.name}>
              <path d={d} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinejoin="round" />
              {sorted.map((point) => (
                <circle
                  key={`${item.name}-${point.x}`}
                  cx={sx(point.x)}
                  cy={sy(point.y)}
                  r="3.2"
                  fill="#ffffff"
                  stroke={item.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        <text x={PAD.left + plotWidth / 2} y={HEIGHT - 9} textAnchor="middle" fill="#3e4b45" fontSize="13">
          {resolvedXLabel}
        </text>
        <text
          x="16"
          y={PAD.top + plotHeight / 2}
          textAnchor="middle"
          fill="#3e4b45"
          fontSize="13"
          transform={`rotate(-90 16 ${PAD.top + plotHeight / 2})`}
        >
          {resolvedYLabel}
        </text>
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.45rem' }}>
        {series.map((item) => (
          <span key={item.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#52605a', fontSize: '0.78rem' }}>
            <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
