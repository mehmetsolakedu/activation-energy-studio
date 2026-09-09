#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const FIXTURE_ROOT = path.resolve(
  PROJECT_ROOT,
  'tests/fixtures/real/nr-cels',
);
const OUTPUT_ROOT = path.resolve(
  PROJECT_ROOT,
  'evidence/validation/nr-cels',
);
const EXPECTED = JSON.parse(readFileSync(
  path.resolve(FIXTURE_ROOT, 'oracle/expected-output.json'),
  'utf8',
));
const MANUAL = JSON.parse(readFileSync(
  path.resolve(FIXTURE_ROOT, 'manual/nr-cels-adjudication.json'),
  'utf8',
));

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function compact(value, digits = 9) {
  return Number(value).toFixed(digits).replace(/\.?0+$/u, '');
}

function sourceManifestCsv() {
  const rows = [
    ['path', 'role', 'bytes', 'sha256', 'semantic_note'],
  ];
  for (const archive of EXPECTED.source.archiveAudit.archives) {
    rows.push([
      `source/${archive.path}`,
      'pinned_official_zenodo_v1_archive',
      archive.bytes,
      archive.sha256,
      `${archive.entryCount} entries; ${archive.uncompressedBytes} uncompressed bytes`,
    ]);
  }
  for (const curve of EXPECTED.source.curveAudits) {
    rows.push([
      `source/${curve.path}`,
      'exact_official_archive_member_composite_curve',
      curve.bytes,
      curve.sha256,
      `NR-CELS ${curve.sample}; ${curve.rate} K/min; TG column ${curve.tgIndex + 1}; dTG column ${curve.dtgIndex + 1}; ${curve.dataRowCount} rows`,
    ]);
  }
  for (const kinetic of EXPECTED.source.allKineticFiles) {
    rows.push([
      `source/${kinetic.path}`,
      'exact_official_archive_member_kinetic_export',
      kinetic.bytes,
      kinetic.sha256,
      kinetic.file,
    ]);
  }
  return csv(rows);
}

function summaryCsv() {
  const rows = [[
    'sample',
    'method',
    'alpha_count',
    'mean_ea_kj_mol',
    'deposited_mean_ea_kj_mol',
    'mean_delta_kj_mol',
    'mae_kj_mol',
    'rmse_kj_mol',
    'maximum_absolute_delta_kj_mol',
    'maximum_absolute_delta_alpha',
    'mean_r_squared',
  ]];
  for (const [sample, sampleResult] of Object.entries(EXPECTED.samples)) {
    for (const [method, methodResult] of Object.entries(sampleResult.methods)) {
      const summary = methodResult.summary;
      rows.push([
        `NR-CELS ${sample}`,
        method,
        summary.alphaCount,
        summary.meanActivationEnergyKJPerMol,
        summary.meanPublishedActivationEnergyKJPerMol,
        summary.meanDeltaVsPublishedKJPerMol,
        summary.meanAbsoluteDeltaVsPublishedKJPerMol,
        summary.rmseVsPublishedKJPerMol,
        summary.maximumAbsoluteDeltaVsPublishedKJPerMol,
        summary.maximumAbsoluteDeltaAlpha,
        summary.meanRSquared,
      ]);
    }
  }
  return csv(rows);
}

function allAlphaCsv() {
  const rows = [[
    'sample',
    'method',
    'alpha',
    'independent_ea_kj_mol',
    'deposited_kinetics_neo_ea_kj_mol',
    'deposited_error_kj_mol',
    'delta_kj_mol',
    'absolute_delta_kj_mol',
    'regression_n',
    'regression_r_squared',
  ]];
  for (const [sample, sampleResult] of Object.entries(EXPECTED.samples)) {
    for (const [method, methodResult] of Object.entries(sampleResult.methods)) {
      for (const record of methodResult.records) {
        rows.push([
          `NR-CELS ${sample}`,
          method,
          record.alpha,
          record.activationEnergyKJPerMol,
          record.publishedActivationEnergyKJPerMol,
          record.publishedErrorKJPerMol,
          record.deltaVsPublishedKJPerMol,
          record.absoluteDeltaVsPublishedKJPerMol,
          record.regression.n,
          record.regression.rSquared,
        ]);
      }
    }
  }
  return csv(rows);
}

function markdownReport() {
  const summaryRows = [];
  for (const [sample, sampleResult] of Object.entries(EXPECTED.samples)) {
    for (const [method, methodResult] of Object.entries(sampleResult.methods)) {
      const summary = methodResult.summary;
      summaryRows.push(
        `| NR-CELS ${sample} | ${method} | ${compact(summary.meanActivationEnergyKJPerMol, 6)} | ${compact(summary.meanPublishedActivationEnergyKJPerMol, 6)} | ${compact(summary.rmseVsPublishedKJPerMol, 6)} | ${compact(summary.maximumAbsoluteDeltaVsPublishedKJPerMol, 6)} at α=${summary.maximumAbsoluteDeltaAlpha} |`,
      );
    }
  }
  return `# NR–CELS validation lane

## Decision

The pinned Zenodo v1 sources and the two declared independent Friedman reconstructions are accepted as reproducibility evidence. Exact Kinetics Neo raw-pipeline parity is quarantined because the author project and preprocessing settings were not deposited.

Production acceptance uses the public wide-series path with TG as \`massPercent\`, explicit 100 and minimum-observed-TG anchors, and signed deposited dTG as semantic \`massChangeRate\`. The production test compares all 91 α values for all three samples against \`DEPOSITED_DTG\`: Ea within 2×10⁻⁹ kJ/mol, slope within 2×10⁻⁷ K, intercept within 2×10⁻¹⁰, R² within 2×10⁻¹², and n exactly six. No monotonic repair or numerical-derivative fallback participates in this accepted path.

## Pinned source

- Version DOI: [10.5281/zenodo.16939440](https://doi.org/10.5281/zenodo.16939440)
- Version record: [Zenodo 16939440](https://zenodo.org/records/16939440)
- Article DOI: [10.1016/j.ecmx.2025.101513](https://doi.org/10.1016/j.ecmx.2025.101513)
- License: CC BY 4.0
- Retained scope: 18 composite curves at 2, 4, 6, 8, 10, and 20 K/min; nine kinetic exports
- Intentionally excluded from this lane: the single-rate CEL and CELS archive members

The concept DOI \`10.5281/zenodo.16939439\` is a provenance trap: it currently resolves to later record 18176373, which contains the article but not the two raw-data archives. Reproduction must pin version record 16939440.

## Independent recipes

1. \`DEPOSITED_DTG\`: initial TG = 100%; final TG = minimum observed TG independently per curve; first downward target-mass crossing; linear temperature and deposited-dTG interpolation; dα/dt = −dTG/(100−minimum TG).
2. \`TG_LOCAL_LINEAR_7\`: the same conversion and crossing policy, but dTG/dt is an OLS slope of TG versus time in a seven-row window centred on the right crossing row.

Both use T(K)=T(°C)+273.15, R=8.31446261815324 J mol⁻¹ K⁻¹, and unweighted OLS of ln(dα/dt) versus 1/T across six rates. Decimal precision is 50.

## Quantitative comparison

| Sample | Method | Independent mean Ea | Deposited mean Ea | RMSE | Maximum absolute delta |
|---|---:|---:|---:|---:|---:|
${summaryRows.join('\n')}

The largest deviations occur at low conversion and are consistent with undisclosed baseline, smoothing, endpoint, and interpolation choices. Deposited Kinetics Neo values remain diagnostic targets, not hard raw-pipeline oracles.

The prospective deposited-series RMSE bounds are 4 kJ/mol for NR-CELS 30 and 10 kJ/mol for NR-CELS 45 and 55. The locked values are below those bounds; these are comparison summaries, not evidence that the unpublished Kinetics Neo pipeline has been reproduced exactly.

## Manual adjudication

- NR-CELS 45: the article/table maximum 334.986 kJ/mol conflicts with the deposited-series maximum 334.968 kJ/mol at α=0.68.
- NR-CELS 30 model A→B: reaction order n is 2.175 in the paper and 2.176 in the deposited model export.
- Dataset title says 30–50 phr, while the article and files are 30, 45, and 55 phr.
- “Raw” curve exports are already blank-subtracted and are partly smoothed; TG and dTG column positions vary by file.

## Reproduction

\`\`\`sh
node scripts/run-nr-cels-friedman-oracle.mjs --check
node scripts/generate-nr-cels-validation-evidence.mjs --check
node --test tests/nr-cels-source-integrity.test.mjs
node --test tests/nr-cels-oracle-reproducibility.test.mjs
npx vitest run tests/nr-cels-wide-production-oracle.test.ts
\`\`\`

Any source byte, archive member, header semantic, recipe, expected output, manual adjudication, or evidence change requires a written scientific reason and a fresh audit.
`;
}

const outputs = new Map([
  ['source_file_manifest.csv', sourceManifestCsv()],
  ['friedman_reconstruction_summary.csv', summaryCsv()],
  ['friedman_all_alpha_comparison.csv', allAlphaCsv()],
  ['NR_CELS_VALIDATION.md', markdownReport()],
]);

export function generateNrCelsValidationEvidence({ check = false } = {}) {
  const mismatches = [];
  for (const [name, content] of outputs) {
    const file = path.resolve(OUTPUT_ROOT, name);
    if (check) {
      let actual;
      try {
        actual = readFileSync(file, 'utf8');
      } catch {
        actual = undefined;
      }
      if (actual !== content) mismatches.push(name);
    } else {
      writeFileSync(file, content, 'utf8');
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `NR_CELS_VALIDATION_EVIDENCE_MISMATCH: ${mismatches.join(', ')}`,
    );
  }
  return [...outputs.keys()];
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry)
    && pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isMainModule()) {
  const check = process.argv.includes('--check');
  const write = process.argv.includes('--write');
  if (check === write) {
    process.stderr.write('Use exactly one of --write or --check.\n');
    process.exitCode = 2;
  } else {
    try {
      generateNrCelsValidationEvidence({ check });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
