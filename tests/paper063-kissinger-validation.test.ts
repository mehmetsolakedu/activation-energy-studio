import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import expected from './fixtures/real/paper063/expected-output.json';
import peaksCsv from './fixtures/real/paper063/paper063_kissinger_peaks.csv?raw';
import provenance from './fixtures/real/paper063/provenance.json';
import { calculateKissinger } from '../src/core';

interface PeakRow {
  readonly runId: string;
  readonly heatingRateKPerMinute: number;
  readonly peakTemperatureK: number;
  readonly stage: string;
  readonly peakResolved: true;
  readonly peakQuality: 'clear-interior';
  readonly sourceSignal: 'external-beta-tp-table';
  readonly analystConfirmed: true;
  readonly ambiguous: boolean;
}

const FILE_HASHES = {
  fixture: 'ab52fa64e40a18a522f96d711d75d6c3994624b4beea033f505bda1e1edcccee',
  provenance: '9b4ebd48fd295ab70de9a412509ca5eb7ef0d4b8cea7112d53e35d4747ed1e36',
  expectedOutput: 'e7cb2664953b4080008a760eb3d604b81d6f474a27c01cb32dbb21c8994defb7',
} as const;

const fixturePath = path.resolve(
  'tests/fixtures/real/paper063/paper063_kissinger_peaks.csv',
);
const provenancePath = path.resolve(
  'tests/fixtures/real/paper063/provenance.json',
);
const expectedOutputPath = path.resolve(
  'tests/fixtures/real/paper063/expected-output.json',
);

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parsePeakRows(csv: string): readonly PeakRow[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/u);
  expect(header).toBe(
    'runId,heatingRateKPerMinute,peakTemperatureK,stage,peakResolved,peakQuality,peakSourceSignal,peakAnalystConfirmed,ambiguous',
  );
  return lines.map((line) => {
    const [
      runId,
      beta,
      temperature,
      stage,
      peakResolved,
      peakQuality,
      sourceSignal,
      analystConfirmed,
      ambiguous,
    ] = line.split(',');
    if (
      !runId
      || !beta
      || !temperature
      || !stage
      || peakResolved !== 'true'
      || peakQuality !== 'clear-interior'
      || sourceSignal !== 'external-beta-tp-table'
      || analystConfirmed !== 'true'
      || !['true', 'false'].includes(ambiguous ?? '')
    ) {
      throw new Error(`Invalid Paper 063 fixture row: ${line}`);
    }
    return {
      runId,
      heatingRateKPerMinute: Number(beta),
      peakTemperatureK: Number(temperature),
      stage,
      peakResolved: true,
      peakQuality: 'clear-interior',
      sourceSignal: 'external-beta-tp-table',
      analystConfirmed: true,
      ambiguous: ambiguous === 'true',
    };
  });
}

function independentKissingerOracle(rows: readonly PeakRow[]) {
  const x = rows.map(({ peakTemperatureK }) => 1 / peakTemperatureK);
  const y = rows.map(
    ({ heatingRateKPerMinute, peakTemperatureK }) =>
      Math.log(heatingRateKPerMinute / peakTemperatureK ** 2),
  );
  const n = rows.length;
  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;
  const sxx = x.reduce(
    (sum, value) => sum + (value - meanX) ** 2,
    0,
  );
  const sxy = x.reduce(
    (sum, value, index) =>
      sum + (value - meanX) * ((y[index] as number) - meanY),
    0,
  );
  const syy = y.reduce(
    (sum, value) => sum + (value - meanY) ** 2,
    0,
  );
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const fitted = x.map((value) => intercept + slope * value);
  const residuals = y.map(
    (value, index) => value - (fitted[index] as number),
  );
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const rSquared = 1 - sse / syy;
  const gasConstantJPerMolK = Number(expected.formula.gasConstantJPerMolK);
  return {
    nBeta: n,
    residualDegreesOfFreedom: n - 2,
    x,
    y,
    slope,
    intercept,
    fitted,
    residuals,
    sse,
    rSquared,
    activationEnergyKJPerMol:
      (-slope * gasConstantJPerMolK) / 1000,
  };
}

function expectWithin(
  actual: number,
  expectedValue: number | string,
  tolerance: number,
  label: string,
): void {
  expect(
    Math.abs(actual - Number(expectedValue)),
    `${label}: actual=${actual}, expected=${expectedValue}`,
  ).toBeLessThanOrEqual(tolerance);
}

describe('Paper 063 publication-derived Kissinger validation', () => {
  it('locks the fixture boundary, provenance, and expected output', () => {
    expect(sha256(fixturePath)).toBe(FILE_HASHES.fixture);
    expect(sha256(provenancePath)).toBe(FILE_HASHES.provenance);
    expect(sha256(expectedOutputPath)).toBe(FILE_HASHES.expectedOutput);

    expect(provenance.classification).toBe('publication-derived-peak-table');
    expect(provenance.isRawCurveData).toBe(false);
    expect(provenance.validationScope).toBe(
      'standalone Kissinger implementation validation only',
    );
    expect(provenance.paper.doi).toBe('10.3390/ma13245595');
    expect(provenance.source.sha256).toBe(
      '53ede19afffd9194d7c0800227646dacdb8256af652b01bd2579c8199402c9f2',
    );
    expect(provenance.source.articleLicense.spdx).toBe('CC-BY-4.0');
    expect(provenance.source.separateDatasetLicense).toBeNull();
    expect(provenance.scientificBoundaries.join(' ')).toMatch(
      /not instrument-exported TGA or DTG curves/u,
    );
  });

  it('matches an independent oracle through the production Kissinger path', () => {
    const rows = parsePeakRows(peaksCsv);
    expect(rows.map((row) => row.heatingRateKPerMinute)).toEqual([
      5, 20, 40, 60, 80,
    ]);
    expect(rows.map((row) => row.peakTemperatureK)).toEqual([
      681, 707, 721, 731, 737,
    ]);
    expect(new Set(rows.map((row) => row.stage))).toEqual(
      new Set(['XPS_primary_pyrolysis']),
    );
    expect(rows.every((row) => !row.ambiguous)).toBe(true);

    const oracle = independentKissingerOracle(rows);
    const reference = expected.independentOracle;
    const tolerances = expected.comparisonTolerances;

    expect(oracle.nBeta).toBe(reference.nBeta);
    expect(oracle.residualDegreesOfFreedom).toBe(
      reference.residualDegreesOfFreedom,
    );
    expectWithin(
      oracle.activationEnergyKJPerMol,
      reference.activationEnergyKJPerMol,
      tolerances.activationEnergyAbsKJPerMol,
      'independent oracle Ea',
    );
    expectWithin(
      oracle.slope,
      reference.slopeK,
      tolerances.slopeAbsK,
      'independent oracle slope',
    );
    expectWithin(
      oracle.intercept,
      reference.intercept,
      tolerances.interceptAbs,
      'independent oracle intercept',
    );
    expectWithin(
      oracle.rSquared,
      reference.rSquared,
      tolerances.rSquaredAbs,
      'independent oracle R2',
    );
    expectWithin(
      oracle.sse,
      reference.sse,
      tolerances.sseAbs,
      'independent oracle SSE',
    );

    const result = calculateKissinger(rows);
    expect(result.status).toBe('success');
    expect(result.formulaId).toBe('kissinger_peak_ln_v1');
    expect(result.resultType).toBe('peak');
    expect(result.alpha).toBeNull();
    expect(result.refusals).toEqual([]);
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expected.expectedDiagnosticCodes,
    );
    expect(result.activationEnergyKJPerMol).toBeDefined();
    expect(result.regression).toBeDefined();

    const regression = result.regression!;
    expect(regression.n).toBe(5);
    expect(regression.rawObservationCount).toBe(5);
    expect(regression.residualDegreesOfFreedom).toBe(3);
    expect(regression.inputAggregation).toBe('none');
    expectWithin(
      result.activationEnergyKJPerMol!,
      oracle.activationEnergyKJPerMol,
      tolerances.activationEnergyAbsKJPerMol,
      'production Ea',
    );
    expectWithin(
      regression.slope,
      oracle.slope,
      tolerances.slopeAbsK,
      'production slope',
    );
    expectWithin(
      regression.r2,
      oracle.rSquared,
      tolerances.rSquaredAbs,
      'production R2',
    );
    expectWithin(
      regression.sse,
      oracle.sse,
      tolerances.sseAbs,
      'production SSE',
    );
    regression.x.forEach((value, index) => {
      expectWithin(
        value,
        oracle.x[index] as number,
        tolerances.transformedAbs,
        `production x[${index}]`,
      );
      expectWithin(
        regression.y[index] as number,
        oracle.y[index] as number,
        tolerances.transformedAbs,
        `production y[${index}]`,
      );
    });
  });
});
