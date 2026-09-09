import Ajv from 'ajv';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import {
  REAL_EXAMPLES,
  buildLicensedExampleProvenance,
} from '../src/examples/catalog';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';
import {
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  hashFile,
  serializeProjectReport,
  sourceFileIdFromSha256,
} from '../src/report';
import projectReportSchema from '../src/report/project-report.schema.json';
import syntheticCsv from '../examples/synthetic_kas_150.csv?raw';

function duplicateNamedRunFiles(): File[] {
  const [header, ...rows] = syntheticCsv.trim().split(/\r\n|\n|\r/);
  const runIds = ['beta-5', 'beta-10', 'beta-20', 'beta-40'];
  return runIds.map((runId) => new File(
    [[header, ...rows.filter((row) => row.split(',')[4] === runId)].join('\n')],
    'run.csv',
    { type: 'text/csv', lastModified: 0 },
  ));
}

async function duplicateNamedReport(sourceFileCount = 4) {
  const files = duplicateNamedRunFiles();
  const ingestion = await ingestThermalFiles(files);
  expect(ingestion.status).toBe('ready');
  const adapted = buildThermalRuns(ingestion, undefined, 'alpha 0.10-0.90');
  expect(adapted.diagnostics).toEqual([]);
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: [0.5],
    methods: ['KAS'],
    includeKissinger: false,
  });
  expect(analysis.status).toBe('success');
  const sourceFiles = await Promise.all(files.map(hashFile));
  const report = createProjectReport(
    analysis,
    {
      projectName: 'Duplicate filename identity regression',
      sample: 'synthetic-kas',
      process: 'thermal decomposition',
      stage: 'alpha 0.10-0.90',
      atmosphere: 'N2',
      sourceFiles: sourceFiles.slice(0, sourceFileCount),
    },
    {
      ingestion,
      analysisConfiguration: {
        alphaGrid: [0.5],
        methods: ['KAS'],
        includeKissinger: false,
        minR2Warning: 0.98,
      },
    },
  );
  return { ingestion, report, sourceFiles };
}

describe('v0.3.2 export provenance remediation', () => {
  it('binds same-named, different-byte files to immutable hash identities in every source-row reference', async () => {
    const { ingestion, report, sourceFiles } = await duplicateNamedReport();
    const expectedIds = sourceFiles.map(({ sha256 }) => sourceFileIdFromSha256(sha256));

    expect(new Set(expectedIds).size).toBe(4);
    expect(ingestion.files.map(({ source }) => source.sourceFileId)).toEqual(expectedIds);
    ingestion.files.forEach((file, index) => {
      expect(file.records.length).toBeGreaterThan(0);
      expect(
        file.records.every(({ provenance }) =>
          provenance.sourceFileId === expectedIds[index]),
      ).toBe(true);
    });
    expect(report.context.sourceFiles.map(({ sourceFileId }) => sourceFileId)).toEqual(expectedIds);
    expect(report.traceability.gaps).toEqual([]);
    const sourceRows = report.traceability.observationLinks.flatMap(({ sourceRows }) => sourceRows);
    expect(sourceRows).toHaveLength(4);
    expect(new Set(sourceRows.map(({ sourceFileId }) => sourceFileId))).toEqual(
      new Set(expectedIds),
    );
    expect(sourceRows.every(({ fileName }) => fileName === 'run.csv')).toBe(true);
  });

  it('emits explicit traceability gaps when a source-row identity cannot be bound to a hash', async () => {
    const { report } = await duplicateNamedReport(3);
    expect(report.traceability.gaps).toContainEqual(expect.objectContaining({
      code: 'SOURCE_FILE_IDENTITY_UNAVAILABLE',
    }));
    expect(
      report.traceability.observationLinks.some(({ sourceRows }) =>
        sourceRows.some(({ sourceFileId }) => sourceFileId === null)),
    ).toBe(true);
  });

  it('refuses a caller-supplied sourceFileId that is not derived from its SHA-256', async () => {
    const { report: base } = await duplicateNamedReport();
    const first = base.context.sourceFiles[0];
    expect(() => createProjectReport(base.analysis, {
      ...base.context,
      sourceFiles: [{
        ...first,
        sourceFileId: `sha256:${'f'.repeat(64)}`,
      }],
    })).toThrow(/Source file identity mismatch/u);
  });

  it.each(REAL_EXAMPLES)(
    'serializes the complete licensed-source boundary for $id',
    async (definition) => {
      const { report: base } = await duplicateNamedReport();
      const report = createProjectReport(base.analysis, {
        ...base.context,
        projectName: definition.project,
        licensedSourceProvenance: buildLicensedExampleProvenance(definition),
      });
      const json = JSON.parse(serializeProjectReport(report));
      const provenance = json.context.licensedSourceProvenance;

      expect(provenance).toMatchObject({
        kind: 'licensed-example',
        exampleId: definition.id,
        citation: {
          label: definition.citation.label,
          doi: definition.citation.doi,
          url: definition.citation.url,
        },
        license: {
          identifier: definition.license.spdx,
          name: definition.license.name,
          url: definition.license.url,
          scope: definition.license.scope,
        },
        sourceType: definition.sourceDetails.sourceType,
        printedPrecision: definition.sourceDetails.printedPrecision,
        rounding: definition.sourceDetails.rounding,
        separateDatasetLicense: {
          exists: definition.license.separateDatasetLicense !== null,
          identifier: definition.license.separateDatasetLicense,
          scope: definition.sourceDetails.separateDatasetLicenseScope,
        },
      });
      expect(provenance.extractionSteps).toEqual(definition.sourceDetails.extractionSteps);
      expect(provenance.transformationSteps).toEqual(
        definition.sourceDetails.transformationSteps,
      );
      expect(provenance.claimLimits).toEqual([
        definition.boundary,
        ...definition.sourceDetails.claimLimits,
      ]);
    },
  );

  it('exports the complete licensed-example source boundary to JSON, CSV, and PDF', async () => {
    const definition = REAL_EXAMPLES.find(({ id }) => id === 'paper063-kissinger-beta-tp');
    expect(definition).toBeDefined();
    const licensedSourceProvenance = buildLicensedExampleProvenance(definition!);
    const { report: base } = await duplicateNamedReport();
    const report = createProjectReport(base.analysis, {
      ...base.context,
      projectName: definition!.project,
      licensedSourceProvenance,
    });

    expect(report.context.licensedSourceProvenance).toMatchObject({
      kind: 'licensed-example',
      citation: {
        doi: '10.3390/ma13245595',
        url: 'https://doi.org/10.3390/ma13245595',
      },
      license: {
        identifier: 'CC-BY-4.0',
        scope: expect.stringContaining('five beta'),
      },
      sourceType: 'article-figure-transcription',
      printedPrecision: expect.stringContaining('1 K'),
      rounding: expect.stringContaining('rounded'),
      separateDatasetLicense: {
        exists: false,
        identifier: null,
      },
      extractionSteps: expect.arrayContaining([expect.stringContaining('Figure 1')]),
      transformationSteps: expect.arrayContaining([expect.stringContaining('transcribed')]),
      claimLimits: expect.arrayContaining([expect.stringContaining('Kissinger')]),
    });

    const validate = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(
      projectReportSchema,
    );
    expect(validate(JSON.parse(serializeProjectReport(report))), JSON.stringify(validate.errors)).toBe(true);

    const parsed = Papa.parse<Record<string, string>>(createResultsCsv(report), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0]).toMatchObject({
      sourceProvenanceKind: 'licensed-example',
      sourceCitationDoi: '10.3390/ma13245595',
      sourceLicenseIdentifier: 'CC-BY-4.0',
      sourceType: 'article-figure-transcription',
      separateDatasetLicenseExists: 'false',
    });
    expect(parsed.data[0].sourceExtractionSteps).toContain('Figure 1');
    expect(parsed.data[0].sourceTransformationSteps).toContain('transcribed');
    expect(parsed.data[0].sourcePrintedPrecision).toContain('1 K');
    expect(parsed.data[0].sourceRounding).toContain('rounded');
    expect(parsed.data[0].sourceClaimLimits).toContain('Kissinger');

    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const text = binary.replace(/\\([()\\])/g, '$1');
    for (const marker of [
      'Licensed source provenance',
      '10.3390/ma13245595',
      'CC-BY-4.0',
      'article-figure-transcription',
      'Printed precision: 1 K',
      'Separate dataset license: no',
      'Figure 1',
      'Kissinger',
    ]) {
      expect(text, marker).toContain(marker);
    }
  });
});
