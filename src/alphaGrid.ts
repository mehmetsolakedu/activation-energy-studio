export const MAX_ALPHA_GRID_POINTS = 99;

export type AlphaGridResolution =
  | {
      readonly status: 'valid';
      readonly values: readonly number[];
    }
  | {
      readonly status: 'invalid';
      readonly code:
        | 'ALPHA_GRID_REQUIRED'
        | 'ALPHA_GRID_INVALID_NUMBER'
        | 'ALPHA_GRID_OUT_OF_RANGE'
        | 'ALPHA_GRID_REVERSED'
        | 'ALPHA_GRID_UNALIGNED'
        | 'ALPHA_GRID_TOO_DENSE';
      readonly message: string;
    };

function parseDecimalFraction(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^(?:0(?:[.,]\d+)?|1(?:[.,]0+)?)$/u.test(normalized)) return undefined;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundedAlpha(value: number): number {
  return Number(value.toFixed(12));
}

export function resolveAlphaGrid(
  startInput: string,
  endInput: string,
  stepInput: string,
): AlphaGridResolution {
  if ([startInput, endInput, stepInput].some((value) => value.trim() === '')) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_REQUIRED',
      message: 'Enter the alpha-grid start, end, and step together.',
    };
  }

  const start = parseDecimalFraction(startInput);
  const end = parseDecimalFraction(endInput);
  const step = parseDecimalFraction(stepInput);
  if (start === undefined || end === undefined || step === undefined) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_INVALID_NUMBER',
      message: 'Use explicit decimal fractions such as 0.05 for the alpha grid.',
    };
  }
  if (start <= 0 || start >= 1 || end <= 0 || end >= 1 || step <= 0 || step >= 1) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_OUT_OF_RANGE',
      message: 'The alpha-grid start, end, and step must be between 0 and 1.',
    };
  }
  if (start > end) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_REVERSED',
      message: 'The alpha-grid start cannot be greater than its end.',
    };
  }

  const rawIntervals = (end - start) / step;
  const intervalCount = Math.round(rawIntervals);
  if (Math.abs(rawIntervals - intervalCount) > 1e-9) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_UNALIGNED',
      message: 'The alpha-grid start-to-end interval must be exactly divisible by the selected step.',
    };
  }

  const pointCount = intervalCount + 1;
  if (pointCount > MAX_ALPHA_GRID_POINTS) {
    return {
      status: 'invalid',
      code: 'ALPHA_GRID_TOO_DENSE',
      message: `A single analysis can use at most ${MAX_ALPHA_GRID_POINTS} alpha points.`,
    };
  }

  const values = Array.from(
    { length: pointCount },
    (_, index) => roundedAlpha(start + (index * step)),
  );
  values[values.length - 1] = roundedAlpha(end);
  return { status: 'valid', values };
}
