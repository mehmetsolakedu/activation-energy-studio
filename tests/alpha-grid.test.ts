import { describe, expect, it } from 'vitest';

import { MAX_ALPHA_GRID_POINTS, resolveAlphaGrid } from '../src/alphaGrid';

describe('explicit alpha-grid contract', () => {
  it('builds the full Paper010 grid deterministically with dot or comma decimals', () => {
    const dot = resolveAlphaGrid('0.05', '0.80', '0.05');
    const comma = resolveAlphaGrid('0,05', '0,80', '0,05');

    expect(dot).toEqual({
      status: 'valid',
      values: [
        0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4,
        0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
      ],
    });
    expect(comma).toEqual(dot);
  });

  it.each([
    ['', '0.80', '0.05', 'ALPHA_GRID_REQUIRED'],
    ['.05', '0.80', '0.05', 'ALPHA_GRID_INVALID_NUMBER'],
    ['0', '0.80', '0.05', 'ALPHA_GRID_OUT_OF_RANGE'],
    ['0.85', '0.80', '0.05', 'ALPHA_GRID_REVERSED'],
    ['0.05', '0.80', '0.07', 'ALPHA_GRID_UNALIGNED'],
  ])('fails closed for start=%s end=%s step=%s', (start, end, step, code) => {
    expect(resolveAlphaGrid(start, end, step)).toMatchObject({
      status: 'invalid',
      code,
    });
  });

  it('bounds excessively dense grids', () => {
    const result = resolveAlphaGrid('0.001', '0.999', '0.001');
    expect(result).toMatchObject({
      status: 'invalid',
      code: 'ALPHA_GRID_TOO_DENSE',
    });
    expect(MAX_ALPHA_GRID_POINTS).toBe(99);
  });
});
