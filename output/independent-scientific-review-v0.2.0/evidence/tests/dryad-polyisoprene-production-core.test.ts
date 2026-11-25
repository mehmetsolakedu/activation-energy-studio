import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  GAS_CONSTANT_J_PER_MOL_K,
  type IsoConversionalMethod,
  type ThermalRun,
} from '../src/core';

const FIXTURE_ROOT = resolve('tests/fixtures/real/dryad-polyisoprene');
const SOURCE_ROOT = resolve(FIXTURE_ROOT, 'source/lpi-01');
const ALPHAS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;
const RATES = [2, 5, 10, 15] as const;
const ORACLE_GAS_CONSTANT = 8.3142;

interface SourcePoint {
  sourceRow: number;
  temperatureC: number;
  value: number;
}

interface OracleMethod {
  meanActivationEnergyKJPerMol: string;
  paperTable4MeanKJPerMol: string;
  publicationValueIsHardOracle: boolean;
  records: Array<{
    alpha: string;
    activationEnergyKJPerMol: string;
    regression: {
      n: number;
      slope: string;
      rSquared: string;
    };
  }>;
}

interface ExpectedOutput {
  classification: string;
  methods: Record<'FWO' | 'KAS' | 'FRIEDMAN', OracleMethod>;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseInstrumentExport(fileName: string): {
  bytes: Buffer;
  points: SourcePoint[];
} {
  const bytes = readFileSync(resolve(SOURCE_ROOT, fileName));
  expect(bytes.subarray(-2).toString('hex')).toBe('0d0a');
  const lines = bytes.toString('latin1').split('\r\n');
  expect(lines.at(-1)).toBe('');
  lines.pop();
  expect(lines[0]).toMatch(/^Filename:\t/);
  expect(lines[1]).toBe('');
  expect(lines[2]?.split('\t')[0]).toBe('Temperature (°C)');
  const points = lines.slice(3).map((line, index) => {
    const cells = line.split('\t');
    expect(cells).toHaveLength(2);
    const temperatureC = Number(cells[0]);
    const value = Number(cells[1]);
    expect(Number.isFinite(temperatureC)).toBe(true);
    expect(Number.isFinite(value)).toBe(true);
    return { sourceRow: index + 4, temperatureC, value };
  });
  return { bytes, points };
}

function projectedRun(rate: (typeof RATES)[number]): ThermalRun {
  const stem = `33L_${rate}'C`;
  const weight = parseInstrumentExport(`${stem} Weight (%).txt`).points;
  const derivative = parseInstrumentExport(
    `${stem} Derivative Weight (%).txt`,
  ).points;
  expect(derivative).toHaveLength(weight.length);
  derivative.forEach((point, index) => {
    expect(point.temperatureC).toBe(weight[index]?.temperatureC);
  });

  const initialWeight = weight[0]!.value;
  const finalWeight = weight.at(-1)!.value;
  const denominator = initialWeight - finalWeight;
  expect(denominator).toBeGreaterThan(0);

  const points = ALPHAS.map((alpha) => {
    const targetWeight = initialWeight - alpha * denominator;
    const crossing = weight.findIndex((left, index) => {
      const right = weight[index + 1];
      return Boolean(
        right
        && left.temperatureC >= 250
        && left.value >= targetWeight
        && right.value <= targetWeight,
      );
    });
    expect(crossing).toBeGreaterThanOrEqual(0);
    const left = weight[crossing]!;
    const right = weight[crossing + 1]!;
    const fraction = (targetWeight - left.value) / (right.value - left.value);
    const temperatureC =
      left.temperatureC + fraction * (right.temperatureC - left.temperatureC);
    const derivativeValue =
      derivative[crossing]!.value
      + fraction * (derivative[crossing + 1]!.value - derivative[crossing]!.value);
    const dAlphaDtPerMinute = -derivativeValue / denominator;
    expect(dAlphaDtPerMinute).toBeGreaterThan(0);
    return {
      temperature: temperatureC + 273.15,
      alpha,
      dAlphaDtPerMinute,
    };
  });

  return {
    id: `dryad-lpi01-${rate}Kmin`,
    heatingRate: rate,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    points,
    sampleId: 'LPI-01',
    atmosphere: 'N2',
    stage: 'first-downward-crossing-left-T>=250C',
  };
}

describe('Dryad LPI-01 raw traces through the production scientific core', () => {
  it('locks all eight extracted source bytes used by the split Weight/DTG route', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(FIXTURE_ROOT, 'manifest.json'), 'utf8'),
    ) as {
      files: Array<{ path: string; bytes: number; sha256: string }>;
    };
    for (const rate of RATES) {
      for (const suffix of ['Weight (%)', 'Derivative Weight (%)']) {
        const relative = `source/lpi-01/33L_${rate}'C ${suffix}.txt`;
        const lock = manifest.files.find(({ path }) => path === relative);
        expect(lock, relative).toBeDefined();
        const bytes = readFileSync(resolve(FIXTURE_ROOT, relative));
        expect(bytes.byteLength, relative).toBe(lock?.bytes);
        expect(sha256(bytes), relative).toBe(lock?.sha256);
      }
    }
  });

  it('matches the independent Decimal slopes, R² and gas-constant-adjusted Ea values', () => {
    const expected = JSON.parse(
      readFileSync(resolve(FIXTURE_ROOT, 'expected-output.json'), 'utf8'),
    ) as ExpectedOutput;
    expect(expected.classification).toBe('gold-candidate');

    const analysis = analyzeActivationEnergy(RATES.map(projectedRun), {
      alphaValues: [...ALPHAS],
      methods: ['FWO', 'KAS', 'FRIEDMAN'],
      includeKissinger: false,
    });
    expect(analysis.refusals).toEqual([]);
    expect(analysis.preparedRuns).toHaveLength(4);
    expect(
      analysis.preparedRuns.every(({ derivativeSource }) => derivativeSource === 'provided'),
    ).toBe(true);

    for (const methodName of ['FWO', 'KAS', 'FRIEDMAN'] as const) {
      const actual = analysis.methods.find(({ method }) => method === methodName);
      const reference = expected.methods[methodName];
      expect(actual?.status).toBe('success');
      expect(actual?.estimates).toHaveLength(ALPHAS.length);
      actual?.estimates.forEach((estimate, index) => {
        const target = reference.records[index]!;
        expect(estimate.alpha).toBe(Number(target.alpha));
        expect(estimate.regression.n).toBe(target.regression.n);
        expect(estimate.regression.slope).toBeCloseTo(
          Number(target.regression.slope),
          5,
        );
        expect(estimate.regression.r2).toBeCloseTo(
          Number(target.regression.rSquared),
          10,
        );
        const targetForCoreConstant =
          Number(target.activationEnergyKJPerMol)
          * GAS_CONSTANT_J_PER_MOL_K
          / ORACLE_GAS_CONSTANT;
        expect(estimate.activationEnergyKJPerMol).toBeCloseTo(
          targetForCoreConstant,
          7,
        );
      });

      const actualMean = actual!.estimates.reduce(
        (sum, estimate) => sum + estimate.activationEnergyKJPerMol,
        0,
      ) / actual!.estimates.length;
      const targetMeanForCoreConstant =
        Number(reference.meanActivationEnergyKJPerMol)
        * GAS_CONSTANT_J_PER_MOL_K
        / ORACLE_GAS_CONSTANT;
      expect(actualMean).toBeCloseTo(targetMeanForCoreConstant, 7);
      expect(reference.publicationValueIsHardOracle).toBe(false);
      expect(Number(reference.paperTable4MeanKJPerMol)).not.toBeCloseTo(
        actualMean,
        1,
      );
    }

    const methods = analysis.methods.map(({ method }) => method);
    expect(methods).toEqual(
      ['FWO', 'KAS', 'FRIEDMAN'] satisfies IsoConversionalMethod[],
    );
  });
});
