import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import readXlsxFile from 'read-excel-file/node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  projectRoot,
  'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx',
);
const outputPath = path.join(
  projectRoot,
  'tests/fixtures/real/paper010_rh_t_alpha_beta.csv',
);
const expectedSourceSha256 = 'd24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57';
const heatingRates = [5, 10, 20];
const alphaTargets = Array.from({ length: 16 }, (_, index) => 0.05 * (index + 1));

const sourceBytes = await fs.readFile(sourcePath);
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error(`Source hash mismatch: expected ${expectedSourceSha256}, received ${sourceSha256}`);
}

const sheets = await readXlsxFile(sourcePath);
const sourceSheet = sheets.find((sheet) => sheet.sheet === 'Fig.2.');
if (!sourceSheet) throw new Error('Required worksheet "Fig.2." was not found.');

function firstCrossingTemperature(curve, targetAlpha) {
  for (let index = 1; index < curve.length; index += 1) {
    const left = curve[index - 1];
    const right = curve[index];
    if (left.alpha <= targetAlpha && targetAlpha <= right.alpha && left.alpha !== right.alpha) {
      const fraction = (targetAlpha - left.alpha) / (right.alpha - left.alpha);
      return left.temperatureCelsius
        + fraction * (right.temperatureCelsius - left.temperatureCelsius);
    }
  }
  throw new Error(`No first crossing was found for alpha=${targetAlpha}.`);
}

function interpolateMinusDtg(dtgCurve, temperatureCelsius) {
  for (let index = 1; index < dtgCurve.length; index += 1) {
    const left = dtgCurve[index - 1];
    const right = dtgCurve[index];
    if (
      left.temperatureCelsius <= temperatureCelsius
      && temperatureCelsius <= right.temperatureCelsius
    ) {
      const fraction = (
        temperatureCelsius - left.temperatureCelsius
      ) / (
        right.temperatureCelsius - left.temperatureCelsius
      );
      return left.minusDtgPercentPerMinute
        + fraction * (
          right.minusDtgPercentPerMinute
          - left.minusDtgPercentPerMinute
        );
    }
  }
  throw new Error(
    `No -DTG interpolation bracket was found for ${temperatureCelsius} °C.`,
  );
}

const outputRows = [];
const derivativeValues = [];
for (let runIndex = 0; runIndex < heatingRates.length; runIndex += 1) {
  const temperatureColumn = runIndex * 2;
  const massColumn = temperatureColumn + 1;
  const dtgTemperatureColumn = 6 + runIndex * 2;
  const minusDtgColumn = dtgTemperatureColumn + 1;
  const curve = sourceSheet.data
    .slice(3)
    .map((row) => ({
      temperatureCelsius: Number(row[temperatureColumn]),
      massPercent: Number(row[massColumn]),
    }))
    .filter((point) => (
      Number.isFinite(point.temperatureCelsius)
      && point.temperatureCelsius > 0
      && Number.isFinite(point.massPercent)
    ))
    .map((point) => ({
      ...point,
      alpha: 1 - point.massPercent / 100,
    }));
  const dtgCurve = sourceSheet.data
    .slice(3)
    .map((row) => ({
      temperatureCelsius: Number(row[dtgTemperatureColumn]),
      minusDtgPercentPerMinute: Number(row[minusDtgColumn]),
    }))
    .filter((point) => (
      Number.isFinite(point.temperatureCelsius)
      && point.temperatureCelsius > 0
      && Number.isFinite(point.minusDtgPercentPerMinute)
    ));

  if (
    curve.length !== dtgCurve.length
    || curve.some(
      (point, index) =>
        point.temperatureCelsius
        !== dtgCurve[index]?.temperatureCelsius,
    )
  ) {
    throw new Error(
      `TG and -DTG temperature grids differ at ${heatingRates[runIndex]} K/min.`,
    );
  }

  for (const alpha of alphaTargets) {
    const temperatureCelsius = Number(
      firstCrossingTemperature(curve, alpha).toFixed(9),
    );
    const dAlphaDtPerMinute = Number(
      (
        interpolateMinusDtg(dtgCurve, temperatureCelsius)
        / 100
      ).toFixed(12),
    );
    if (!(dAlphaDtPerMinute > 0)) {
      throw new Error(
        `Friedman requires positive dAlpha/dt at alpha=${alpha} and `
        + `${heatingRates[runIndex]} K/min.`,
      );
    }
    derivativeValues.push(dAlphaDtPerMinute);
    outputRows.push([
      temperatureCelsius.toFixed(9),
      alpha.toFixed(2),
      dAlphaDtPerMinute.toFixed(12),
      (100 * (1 - alpha)).toFixed(2),
      String(heatingRates[runIndex]),
      `paper010-rh-${heatingRates[runIndex]}`,
      'Rhubarb (RH)',
      'Simulated air (N2:O2=4:1)',
    ]);
  }
}

const header = [
  'Temperature [°C]',
  'Alpha [0-1]',
  'dAlpha/dt [1/min]',
  'Mass percent [%]',
  'Heating rate [K/min]',
  'Run',
  'Sample',
  'Atmosphere',
];
const csv = `${[header, ...outputRows].map((row) => row.join(',')).join('\n')}\n`;
await fs.writeFile(outputPath, csv, 'utf8');

const outputSha256 = createHash('sha256').update(csv).digest('hex');
console.log(JSON.stringify({
  sourcePath,
  sourceSha256,
  outputPath,
  outputSha256,
  rows: outputRows.length,
  alphaRange: [alphaTargets[0], alphaTargets.at(-1)],
  heatingRates,
  derivativeSource: 'Fig.2. RH -DTG columns G:H, I:J, K:L; dAlpha/dt=(-DTG)/100',
  dAlphaDtPerMinuteRange: [
    Math.min(...derivativeValues),
    Math.max(...derivativeValues),
  ],
}));
