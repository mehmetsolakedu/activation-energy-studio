import { describe, expect, it } from 'vitest';

import manual from './fixtures/real/oak/manual/alpha-0.50-hand-check.json';
import reference from './fixtures/real/oak/expected-output.json';

function expectNear(
  actual: string | number,
  expected: string | number,
  tolerance: number,
): void {
  expect(Math.abs(Number(actual) - Number(expected))).toBeLessThanOrEqual(
    tolerance,
  );
}

describe('Oak alpha=0.50 independent manual adjudication', () => {
  it('matches the locked Decimal oracle without accepting publication values as the oracle', () => {
    expect(manual).toMatchObject({
      schema: 'activation-energy-studio/manual-regression-check/v1',
      independence: {
        calculator: 'GNU bc 7.0.3',
        importsApplicationSource: false,
        importsDecimalOracle: false,
        sourceRowsCopiedDirectlyFromLockedCsv: true,
      },
      manualVerdict: {
        standardEquationsInternallyConsistent: true,
        correctCelsiusToKelvinOffset: '273.15',
        authorKelvinColumnOffset: '273.00',
        publicationKASAcceptedAsHardOracle: false,
        publicationFriedmanAcceptedAsHardOracle: false,
      },
    });

    const oracleAlpha = reference.observationsByAlpha.find(
      ({ alpha }) => alpha === '0.5',
    );
    expect(oracleAlpha).toBeDefined();
    expect(manual.interpolatedObservations).toHaveLength(4);
    manual.interpolatedObservations.forEach((observation, index) => {
      const expected = oracleAlpha!.rates[index];
      expect(observation.heatingRateKPerMin)
        .toBe(Number(expected.heatingRateKPerMin));
      expectNear(observation.fraction, expected.interpolationFraction, 1e-14);
      expectNear(observation.temperatureK, expected.temperatureK, 1e-12);
      expectNear(
        observation.dAlphaDtPerMinute,
        expected.dAlphaDtPerMinute,
        1e-14,
      );
      expectNear(observation.x, 1 / Number(expected.temperatureK), 1e-15);
      expect(manual.rawRows[index].sourceRows).toEqual(expected.sourceRows);
    });

    for (const method of ['FWO', 'KAS', 'FRIEDMAN'] as const) {
      const expected = reference.methods[method].records.find(
        ({ alpha }) => alpha === '0.5',
      );
      expect(expected).toBeDefined();
      expectNear(
        manual.results[method].slopeK,
        expected!.regression.slope,
        1e-8,
      );
      expectNear(
        manual.results[method].intercept,
        expected!.regression.intercept,
        1e-11,
      );
      expectNear(
        manual.results[method].rSquared,
        expected!.regression.rSquared,
        1e-14,
      );
      expectNear(
        manual.results[method].activationEnergyKJPerMol,
        expected!.activationEnergyKJPerMol,
        1e-10,
      );
    }
  });
});
