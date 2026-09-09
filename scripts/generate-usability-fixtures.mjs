#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const UX_FIXTURE_SCHEMA = 'activation-energy-studio/usability-fixtures/v1';
export const UX_STUDY_VERSION = 'UX-v0.3.1';
export const UX_FIXTURE_MANIFEST_PATH = 'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json';
export const UX_FIXTURE_DIRECTORY = 'evidence/usability/v0.3.1/study_bundle';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const SOURCE_PATH = 'examples/synthetic_kas_150.csv';
const RELEASE_PATH = 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseSimpleDelimited(text, delimiter = ',') {
  const rows = text.trimEnd().split(/\r?\n/).map((line) => line.split(delimiter));
  if (rows.length < 2) throw new Error('Source fixture must contain a header and data rows.');
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) {
    throw new Error('Quoted or ragged source rows are not supported by this locked generator.');
  }
  return rows;
}

function serializeRows(rows, delimiter = ',') {
  return `${rows.map((row) => row.join(delimiter)).join('\n')}\n`;
}

function sourceColumns(header) {
  const byName = Object.fromEntries(header.map((name, index) => [name, index]));
  const required = [
    'Temperature [°C]',
    'Alpha [0-1]',
    'Mass percent [%]',
    'Heating rate [K/min]',
    'Run',
    'Sample',
    'Atmosphere',
  ];
  for (const name of required) {
    if (byName[name] === undefined) throw new Error(`Missing locked source column: ${name}`);
  }
  return byName;
}

function cloneRows(rows) {
  return rows.map((row) => [...row]);
}

function fixturePath(fileName) {
  return `${UX_FIXTURE_DIRECTORY}/${fileName}`;
}

export function buildUsabilityFixtureBundle(projectRoot = DEFAULT_PROJECT_ROOT) {
  const source = readFileSync(path.resolve(projectRoot, SOURCE_PATH));
  const release = readFileSync(path.resolve(projectRoot, RELEASE_PATH));
  const sourceText = source.toString('utf8');
  const parsed = parseSimpleDelimited(sourceText);
  const header = parsed[0];
  const data = parsed.slice(1);
  const column = sourceColumns(header);
  const files = new Map();

  const putCsv = (fileName, rows) => files.set(fixturePath(fileName), serializeRows(rows));

  const ux01Keep = [
    column['Temperature [°C]'],
    column['Mass percent [%]'],
    column['Heating rate [K/min]'],
    column.Run,
    column.Sample,
    column.Atmosphere,
  ];
  const ux01Rows = [];
  for (const beta of ['5', '10', '20', '40']) {
    const runRows = data.filter(
      (row) => row[column['Heating rate [K/min]']] === beta,
    );
    const context = runRows[0];
    if (!context) throw new Error(`UX01 source is missing beta=${beta}.`);
    ux01Rows.push([
      '300.000000',
      '100.00',
      beta,
      context[column.Run],
      context[column.Sample],
      context[column.Atmosphere],
    ]);
    ux01Rows.push(...runRows.map((row) => ux01Keep.map((index) => row[index])));
    ux01Rows.push([
      '380.000000',
      '0.00',
      beta,
      context[column.Run],
      context[column.Sample],
      context[column.Atmosphere],
    ]);
  }
  putCsv('UX01_four_run_mass_ambiguous.csv', [
    ['Temperature', 'Mass percent', 'Heating rate', 'Run', 'Sample', 'Atmosphere'],
    ...ux01Rows,
  ]);

  putCsv('R1_two_rates.csv', [
    [...header],
    ...data.filter((row) => ['5', '10'].includes(row[column['Heating rate [K/min]']])),
  ]);

  const r2Alpha = {
    5: ['.10', '.20', '.30'],
    10: ['.40', '.50', '.60'],
    20: ['.70', '.80', '.90'],
    40: ['.80', '.90', '.95'],
  };
  const r2Rows = [];
  for (const beta of ['5', '10', '20', '40']) {
    const selected = data
      .filter((row) => row[column['Heating rate [K/min]']] === beta)
      .slice(0, 3)
      .map((row, index) => {
        const next = [...row];
        next[column['Alpha [0-1]']] = r2Alpha[beta][index];
        return next;
      });
    if (selected.length !== 3) throw new Error(`Expected three source rows for beta=${beta}.`);
    r2Rows.push(...selected);
  }
  putCsv('R2_no_common_alpha.csv', [[...header], ...r2Rows]);

  const r3Rows = cloneRows(data);
  const r3Target = r3Rows.find((row) =>
    row[column['Heating rate [K/min]']] === '40' && row[column['Alpha [0-1]']] === '0.60');
  if (!r3Target) throw new Error('Could not locate the locked R3 beta=40, alpha=0.60 cell.');
  r3Target[column['Alpha [0-1]']] = '.45';
  putCsv('R3_nonmonotonic_alpha.csv', [[...header], ...r3Rows]);

  const r4Rows = cloneRows(data);
  for (const row of r4Rows) {
    if (row[column['Heating rate [K/min]']] === '40') row[column.Sample] = 'synthetic-other';
  }
  putCsv('R4_context_conflict.csv', [[...header], ...r4Rows]);

  const r5Rows = [];
  for (const beta of ['5', '10', '20', '40']) {
    const runRows = data.filter((row) => row[column['Heating rate [K/min]']] === beta);
    r5Rows.push(...runRows.map((row, index) => [...row, String(index)]));
  }
  putCsv('R5_nonlinear_time.csv', [[...header, 'Time [min]'], ...r5Rows]);

  files.set(
    fixturePath('C1_peaks.tsv'),
    [
      'beta [K/min]\tTp [K]\trun\tsample\tatmosphere',
      '5\t589.582119\tbeta-5\tsynthetic-kas\tN2',
      '10\t602.381849\tbeta-10\tsynthetic-kas\tN2',
      '20\t615.731123\tbeta-20\tsynthetic-kas\tN2',
      '40\t629.665286\tbeta-40\tsynthetic-kas\tN2',
      '',
    ].join('\n'),
  );

  putCsv('W1_three_rates.csv', [
    [...header],
    ...data.filter((row) => ['5', '10', '20'].includes(row[column['Heating rate [K/min]']])),
  ]);
  files.set(fixturePath('W2_synthetic_kas_150.csv'), sourceText.endsWith('\n') ? sourceText : `${sourceText}\n`);

  const w3Centers = { 5: 600, 10: 700, 20: 620, 40: 760 };
  const w3Rows = [];
  for (const beta of ['5', '10', '20', '40']) {
    const center = w3Centers[beta];
    for (const [alpha, offset] of [['.4', -5], ['.5', 0], ['.6', 5]]) {
      w3Rows.push([
        String(center + offset),
        alpha,
        beta,
        `noisy-${beta}`,
        'synthetic-noisy',
        'N2',
      ]);
    }
  }
  putCsv('W3_low_r2.csv', [
    ['Temperature [K]', 'Alpha [0-1]', 'Heating rate [K/min]', 'Run', 'Sample', 'Atmosphere'],
    ...w3Rows,
  ]);

  const w4Offset = { 5: 0, 10: 5, 20: 15, 40: 35 };
  const w4Rows = cloneRows(data);
  for (const row of w4Rows) {
    if (Number(row[column['Alpha [0-1]']]) >= 0.6) {
      const beta = row[column['Heating rate [K/min]']];
      row[column['Temperature [°C]']] = (
        Number(row[column['Temperature [°C]']]) + w4Offset[beta]
      ).toFixed(6);
    }
  }
  putCsv('W4_multistep.csv', [[...header], ...w4Rows]);

  const definitions = [
    ['UX01', 'UX01_four_run_mass_ambiguous.csv', 'guided_mapping', null],
    ['R1', 'R1_two_rates.csv', 'refusal', 'INSUFFICIENT_DISTINCT_HEATING_RATES'],
    ['R2', 'R2_no_common_alpha.csv', 'refusal', 'NO_COMMON_ALPHA_RANGE'],
    ['R3', 'R3_nonmonotonic_alpha.csv', 'refusal', 'NON_MONOTONIC_ALPHA'],
    ['R4', 'R4_context_conflict.csv', 'refusal', 'INCONSISTENT_CONTEXT'],
    ['R5', 'R5_nonlinear_time.csv', 'refusal', 'NONLINEAR_HEATING_UNSUPPORTED'],
    ['C1', 'C1_peaks.tsv', 'paired_result_types', null],
    ['W1', 'W1_three_rates.csv', 'warning', 'LIMITED_HEATING_RATES'],
    ['W2', 'W2_synthetic_kas_150.csv', 'warning', 'NUMERICAL_DERIVATIVE'],
    ['W3', 'W3_low_r2.csv', 'warning', 'LOW_R2'],
    ['W4', 'W4_multistep.csv', 'warning', 'MULTISTEP_EA_VARIATION'],
  ];

  const fixtureEntries = definitions.map(([id, fileName, expectedKind, expectedCode]) => {
    const projectPath = fixturePath(fileName);
    const content = files.get(projectPath);
    if (content === undefined) throw new Error(`Missing generated fixture: ${projectPath}`);
    return {
      id,
      path: projectPath,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
      expected: {
        kind: expectedKind,
        ...(expectedCode === null ? {} : { code: expectedCode }),
      },
    };
  });

  const manifest = {
    schemaVersion: UX_FIXTURE_SCHEMA,
    studyVersion: UX_STUDY_VERSION,
    generator: 'scripts/generate-usability-fixtures.mjs',
    source: {
      path: SOURCE_PATH,
      bytes: source.byteLength,
      sha256: sha256(source),
      experimental: false,
    },
    release: {
      path: RELEASE_PATH,
      bytes: release.byteLength,
      sha256: sha256(release),
    },
    fixedContext: {
      projectName: 'UX01 Four Run',
      process: 'synthetic mass loss',
      sample: 'synthetic-kas',
      atmosphere: 'N2',
      stageCelsius: [300, 380],
    },
    fixtures: fixtureEntries,
    boundary: 'Generated and target-code checked fixtures prepare the study; they are not participant evidence and close no human usability gate.',
  };
  files.set(UX_FIXTURE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return { files, manifest };
}

export function writeUsabilityFixtureBundle(projectRoot = DEFAULT_PROJECT_ROOT) {
  const bundle = buildUsabilityFixtureBundle(projectRoot);
  for (const [relativePath, content] of bundle.files) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  return bundle;
}

export function checkUsabilityFixtureBundle(projectRoot = DEFAULT_PROJECT_ROOT) {
  const bundle = buildUsabilityFixtureBundle(projectRoot);
  const stale = [];
  for (const [relativePath, expected] of bundle.files) {
    let actual;
    try {
      actual = readFileSync(path.resolve(projectRoot, relativePath), 'utf8');
    } catch {
      stale.push(`${relativePath}: missing`);
      continue;
    }
    if (actual !== expected) stale.push(`${relativePath}: byte mismatch`);
  }
  if (stale.length > 0) {
    throw new Error(`Usability fixture bundle is stale:\n${stale.join('\n')}`);
  }
  return bundle;
}

function main(args) {
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/generate-usability-fixtures.mjs [--check]');
  }
  if (args[0] === '--check') {
    const { manifest } = checkUsabilityFixtureBundle();
    console.log(`PASS UX_FIXTURE_BUNDLE_CURRENT fixtures=${manifest.fixtures.length}`);
    return;
  }
  const { manifest } = writeUsabilityFixtureBundle();
  console.log(`WROTE UX_FIXTURE_BUNDLE fixtures=${manifest.fixtures.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
