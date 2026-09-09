import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import {
  REAL_EXAMPLE_ALPHA_GRIDS,
  buildLicensedExampleProvenance,
  createRealExampleSession,
} from '../src/examples/catalog';
import { analyzeActivationEnergy, type ThermalRun } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';
import {
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  hashFile,
  serializeProjectReport,
  type ReproducibleProjectReport,
  type ScientificResultRow,
} from '../src/report';

const GENERATED_AT = '2026-09-09T00:00:00.000Z';
const AUDIT_OUTPUT_DIRECTORY = process.env.AES_EXPORT_AUDIT_ROOT
  ?? resolve(process.cwd(), '..', 'artifacts', 'export-consistency');
const WRITE_AUDIT_ARTIFACTS = process.env.WRITE_EXPORT_CONSISTENCY_AUDIT === '1';

const numericResultFields = [
  'alpha',
  'activationEnergyKJPerMol',
  'confidence95LowerKJPerMol',
  'confidence95UpperKJPerMol',
  'n',
  'rawObservationCount',
  'residualDegreesOfFreedom',
  'r2',
  'slope',
  'slopeStandardError',
] as const satisfies readonly (keyof ScientificResultRow)[];

const stringResultFields = [
  'resultId',
  'quantity',
  'claimBoundary',
  'confidenceBoundary',
  'sample',
  'process',
  'stage',
  'atmosphere',
  'method',
  'resultType',
  'formulaId',
  'regressionInputAggregation',
  'status',
  'disposition',
] as const satisfies readonly (keyof ScientificResultRow)[];

interface AuditEvidence {
  status: 'PASS';
  generatedAt: typeof GENERATED_AT;
  representativeFixture: string;
  primary: {
    resultRows: number;
    observationLinks: number;
    resultLinks: number;
    exclusions: number;
    warningCodes: string[];
    refusalCodes: string[];
    traceabilityGapCodes: string[];
    sourceFiles: Array<{
      name: string;
      sizeBytes: number;
      sha256: string;
    }>;
  };
  comparisons: Record<string, number>;
  pdf: {
    pages: number | null;
    requiredHumanReadableFields: string[];
    note: string;
  };
  refusal: {
    status: string;
    methodCount: number;
    resultRows: number;
    csvDataRows: number;
    pdfPages: number;
    refusalCodes: string[];
    forbiddenNumericPayloadPaths: string[];
  };
  sha256: Record<string, string>;
}

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function pdfToTextPath(): string {
  const configured = process.env.AES_PDFTOTEXT_PATH;
  const candidates = [
    configured,
    '/opt/homebrew/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    resolve(
      homedir(),
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext',
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      'pdftotext is required for the export-consistency audit; set AES_PDFTOTEXT_PATH.',
    );
  }
  return resolved;
}

function pdfInfoPath(): string {
  const configured = process.env.AES_PDFINFO_PATH;
  const candidates = [
    configured,
    '/opt/homebrew/bin/pdfinfo',
    '/usr/local/bin/pdfinfo',
    resolve(
      homedir(),
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdfinfo',
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error('pdfinfo is required for the export-consistency audit; set AES_PDFINFO_PATH.');
  }
  return resolved;
}

function pdfPageCount(path: string): number {
  const metadata = execFileSync(pdfInfoPath(), [path], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const pages = /^Pages:\s+(\d+)\s*$/mu.exec(metadata)?.[1];
  if (!pages) throw new Error(`pdfinfo did not report a page count for ${path}.`);
  return Number(pages);
}

async function createPaper010Report(): Promise<ReproducibleProjectReport> {
  const session = createRealExampleSession('paper010-supplied-dalpha-dt');
  const ingestion = await ingestThermalFiles(session.files, session.options);
  if (ingestion.status !== 'ready') {
    throw new Error(`Paper010 ingestion failed: ${JSON.stringify(ingestion.diagnostics)}`);
  }
  const adapted = buildThermalRuns(ingestion);
  if (adapted.diagnostics.some(({ severity }) => severity === 'error')) {
    throw new Error(`Paper010 adaptation failed: ${JSON.stringify(adapted.diagnostics)}`);
  }
  const stages = [...new Set(adapted.runs.map(({ stage }) => stage).filter(Boolean))];
  if (stages.length !== 1) {
    throw new Error(`Paper010 must resolve exactly one stage; received ${JSON.stringify(stages)}.`);
  }
  const alphaGrid = [...REAL_EXAMPLE_ALPHA_GRIDS['paper010-supplied-dalpha-dt']];
  const methods = ['FRIEDMAN'] as const;
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: alphaGrid,
    methods,
    includeKissinger: false,
    minR2Warning: 0.98,
  });
  if (analysis.status === 'refused') {
    throw new Error(`Paper010 analysis refused: ${JSON.stringify(analysis.refusals)}`);
  }
  const sourceFiles = await Promise.all(session.files.map(hashFile));
  const firstRecord = ingestion.records[0];
  const report = createProjectReport(
    analysis,
    {
      projectName: session.definition.project,
      process: session.definition.process,
      sample: firstRecord?.sample,
      atmosphere: firstRecord?.atmosphere,
      stage: stages[0],
      analystNote:
        'Deterministic export-consistency audit of the embedded Paper010 licensed example.',
      sourceFiles,
      licensedSourceProvenance: buildLicensedExampleProvenance(session.definition),
    },
    {
      ingestion,
      ingestionOptions: session.options,
      analysisConfiguration: {
        alphaGrid,
        methods,
        includeKissinger: false,
        minR2Warning: 0.98,
      },
    },
  );
  report.generatedAt = GENERATED_AT;
  return report;
}

function createNonpositiveEaReport(): ReproducibleProjectReport {
  const heatingRates = [5, 10, 20, 40] as const;
  const temperaturesK = [610, 590, 570, 550] as const;
  const runs: ThermalRun[] = heatingRates.map((heatingRate, index) => {
    const temperature = temperaturesK[index];
    return {
      id: `nonpositive-ea-${heatingRate}`,
      heatingRate,
      heatingRateUnit: 'K/min',
      temperatureUnit: 'K',
      sampleId: 'nonpositive-Ea audit fixture',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        {
          temperature: temperature - 5,
          alpha: 0.4,
          dAlphaDtPerMinute: heatingRate * 0.8,
        },
        { temperature, alpha: 0.5, dAlphaDtPerMinute: heatingRate },
        {
          temperature: temperature + 5,
          alpha: 0.6,
          dAlphaDtPerMinute: heatingRate * 1.2,
        },
      ],
    };
  });
  const methods = ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'] as const;
  const analysis = analyzeActivationEnergy(runs, {
    alphaValues: [0.5],
    methods,
    includeKissinger: false,
  });
  const report = createProjectReport(
    analysis,
    {
      projectName: 'Nonpositive apparent-Ea refusal serialization audit',
      sample: 'nonpositive-Ea audit fixture',
      process: 'adversarial regression direction',
      stage: 'main',
      atmosphere: 'N2',
      sourceFiles: [],
    },
    {
      analysisConfiguration: {
        alphaGrid: [0.5],
        methods,
        includeKissinger: false,
      },
    },
  );
  report.generatedAt = GENERATED_AT;
  return report;
}

function parseCsv(csv: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  expect(parsed.errors).toEqual([]);
  return parsed.data;
}

function parseNullableNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`CSV numeric cell is not finite: ${value}`);
  return parsed;
}

function compareJsonAndCsv(
  report: ReproducibleProjectReport,
  csvRows: readonly Record<string, string>[],
): Record<string, number> {
  expect(csvRows).toHaveLength(report.results.length);
  let numericCells = 0;
  let scalarCells = 0;
  let sourceFilePayloads = 0;
  let inputTablePayloads = 0;
  let preprocessingPayloads = 0;
  let diagnosticCodePayloads = 0;
  let includedObservationPayloads = 0;
  let regressionGroupPayloads = 0;
  let exclusionPayloads = 0;
  let observationTracePayloads = 0;
  let traceabilityGapPayloads = 0;

  for (const [index, result] of report.results.entries()) {
    const csvRow = csvRows[index];
    expect(csvRow).toBeDefined();
    for (const field of numericResultFields) {
      expect(parseNullableNumber(csvRow[field])).toBe(result[field]);
      numericCells += 1;
    }
    for (const field of stringResultFields) {
      expect(csvRow[field]).toBe(result[field] ?? '');
      scalarCells += 1;
    }
    expect(csvRow.schemaVersion).toBe(report.schemaVersion);
    expect(csvRow.applicationVersion).toBe(report.application.version);
    scalarCells += 2;

    expect(JSON.parse(csvRow.sourceFilesJson)).toEqual(report.context.sourceFiles);
    sourceFilePayloads += 1;
    expect(JSON.parse(csvRow.inputTablesJson)).toEqual(report.reproducibility.inputTables);
    inputTablePayloads += 1;
    expect(JSON.parse(csvRow.preprocessingJson)).toEqual(report.reproducibility.preprocessing);
    preprocessingPayloads += 1;
    expect(JSON.parse(csvRow.analysisWarningCodesJson)).toEqual(
      report.analysis.warnings.map(({ code }) => code),
    );
    expect(JSON.parse(csvRow.analysisRefusalCodesJson)).toEqual(
      report.analysis.refusals.map(({ code }) => code),
    );
    diagnosticCodePayloads += 2;

    const resultTrace = report.traceability.resultLinks.find(
      ({ resultId }) => resultId === result.resultId,
    );
    expect(resultTrace).toBeDefined();
    const observationTrace = report.traceability.observationLinks.filter(({ observationId }) =>
      resultTrace!.includedObservationIds.includes(observationId));
    expect(JSON.parse(csvRow.includedObservationIdsJson)).toEqual(
      resultTrace!.includedObservationIds,
    );
    includedObservationPayloads += 1;
    expect(JSON.parse(csvRow.regressionInputGroupIdsJson)).toEqual(
      resultTrace!.regressionInputGroupIds,
    );
    regressionGroupPayloads += 1;
    expect(JSON.parse(csvRow.exclusionsJson)).toEqual(resultTrace!.exclusions);
    exclusionPayloads += 1;
    expect(JSON.parse(csvRow.observationTraceJson)).toEqual(observationTrace);
    observationTracePayloads += 1;
    expect(JSON.parse(csvRow.traceabilityGapsJson)).toEqual(report.traceability.gaps);
    traceabilityGapPayloads += 1;
  }

  return {
    resultRows: report.results.length,
    numericCells,
    scalarCells,
    sourceFilePayloads,
    inputTablePayloads,
    preprocessingPayloads,
    diagnosticCodePayloads,
    includedObservationPayloads,
    regressionGroupPayloads,
    exclusionPayloads,
    observationTracePayloads,
    traceabilityGapPayloads,
  };
}

function findForbiddenNumericPayloads(value: unknown): string[] {
  const forbidden = /(?:^|\.)(?:activationEnergyKJPerMol|candidateActivationEnergyKJPerMol|Ea|slopeStandardError|slopeConfidence95|confidence95LowerKJPerMol|confidence95UpperKJPerMol)$/u;
  const found: string[] = [];
  function visit(current: unknown, path: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (current === null || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'number' && forbidden.test(childPath)) found.push(childPath);
      visit(child, childPath);
    }
  }
  visit(value, '');
  return found;
}

function assertPdfHumanReadable(
  report: ReproducibleProjectReport,
  pdfText: string,
): string[] {
  const firstResult = report.results[0];
  const firstTrace = report.traceability.resultLinks[0];
  const firstObservation = report.traceability.observationLinks[0];
  if (!firstResult || !firstTrace || !firstObservation) {
    throw new Error('Representative report is missing result lineage required by the PDF audit.');
  }
  const normalized = pdfText.replace(/\s+/gu, ' ').trim();
  const compact = pdfText.replace(/\s+/gu, '');
  const requirements = [
    'Activation Energy Studio',
    report.context.projectName,
    report.schemaVersion,
    report.context.licensedSourceProvenance?.exampleId ?? '',
    report.context.licensedSourceProvenance?.citation.doi ?? '',
    report.context.sourceFiles[0]?.name ?? '',
    firstResult.formulaId,
    firstResult.resultId,
    firstTrace.regressionInputGroupIds[0] ?? '',
    firstObservation.observationId,
    firstObservation.runId,
    firstResult.activationEnergyKJPerMol?.toFixed(2) ?? '',
    report.traceability.gaps.length === 0
      ? 'Traceability gaps: none'
      : report.traceability.gaps[0].code,
    'Local browser; no data upload',
  ].filter(Boolean);
  for (const required of requirements) {
    expect(
      normalized.includes(required) || compact.includes(required.replace(/\s+/gu, '')),
      `PDF text is missing required human-readable field: ${required}`,
    ).toBe(true);
  }
  for (const source of report.context.sourceFiles) {
    expect(compact).toContain(source.sha256);
  }
  return requirements;
}

function markdownEvidence(evidence: AuditEvidence): string {
  const hashes = Object.entries(evidence.sha256)
    .map(([name, digest]) => `- \`${name}\`: \`${digest}\``)
    .join('\n');
  const comparisons = Object.entries(evidence.comparisons)
    .map(([name, count]) => `- ${name}: ${count}`)
    .join('\n');
  return `# Export Consistency Report\n\n`
    + `Decision: **${evidence.status}**\n\n`
    + `Fixture: \`${evidence.representativeFixture}\` (embedded licensed Paper010 data).\n\n`
    + `The production report builders emitted JSON, CSV, and PDF from the same deterministic report object. JSON and CSV were compared losslessly for every result scalar and every requested provenance/lineage payload. The PDF was checked only as a human-readable rendering; it is not represented as a lossless machine schema.\n\n`
    + `## Scope and counts\n\n`
    + `- Result rows: ${evidence.primary.resultRows}\n`
    + `- Result links: ${evidence.primary.resultLinks}\n`
    + `- Observation links: ${evidence.primary.observationLinks}\n`
    + `- Exclusions: ${evidence.primary.exclusions}\n`
    + `- Warning codes: ${evidence.primary.warningCodes.join(', ') || 'none'}\n`
    + `- Refusal codes: ${evidence.primary.refusalCodes.join(', ') || 'none'}\n`
    + `- Traceability gaps: ${evidence.primary.traceabilityGapCodes.join(', ') || 'none'}\n\n`
    + `## Machine comparisons\n\n${comparisons}\n\n`
    + `## Refused nonpositive-Ea serialization\n\n`
    + `The adversarial four-method analysis ended with status \`${evidence.refusal.status}\`, emitted ${evidence.refusal.resultRows} result rows and ${evidence.refusal.csvDataRows} CSV data rows, and exposed no numeric activation-energy, standard-error, or confidence-interval payload at any JSON path. The refusal codes were: ${evidence.refusal.refusalCodes.join(', ')}.\n\n`
    + `## PDF boundary\n\n${evidence.pdf.note}\n\n`
    + `## SHA-256\n\n${hashes}\n`;
}

describe('v0.4.0 JSON/CSV/PDF export consistency audit', () => {
  it('matches every Paper010 numerical and lineage field and fails closed for nonpositive Ea', async () => {
    const report = await createPaper010Report();
    const reportAgain = await createPaper010Report();
    const json = serializeProjectReport(report);
    const jsonAgain = serializeProjectReport(reportAgain);
    const csv = createResultsCsv(report);
    const csvAgain = createResultsCsv(reportAgain);
    const pdfBytes = new Uint8Array(await createPdfReport(report).arrayBuffer());
    const pdfBytesAgain = new Uint8Array(await createPdfReport(reportAgain).arrayBuffer());

    expect(jsonAgain).toBe(json);
    expect(csvAgain).toBe(csv);
    expect(pdfBytesAgain).toEqual(pdfBytes);
    expect(JSON.parse(json)).toEqual(report);
    expect(report.results).toHaveLength(16);
    expect(report.traceability.resultLinks).toHaveLength(report.results.length);
    expect(report.traceability.observationLinks).toHaveLength(48);
    expect(report.traceability.gaps).toEqual([]);

    const csvRows = parseCsv(csv);
    const comparisons = compareJsonAndCsv(report, csvRows);

    const refusedReport = createNonpositiveEaReport();
    const refusedJson = serializeProjectReport(refusedReport);
    const refusedCsv = createResultsCsv(refusedReport);
    const refusedPdfBytes = new Uint8Array(
      await createPdfReport(refusedReport).arrayBuffer(),
    );
    const forbiddenNumericPayloadPaths = findForbiddenNumericPayloads(
      JSON.parse(refusedJson),
    );
    expect(refusedReport.analysis.status).toBe('refused');
    expect(refusedReport.analysis.methods).toHaveLength(4);
    expect(refusedReport.analysis.methods.every(({ status }) => status === 'refused')).toBe(true);
    expect(refusedReport.results).toEqual([]);
    expect(refusedReport.traceability.resultLinks).toEqual([]);
    expect(refusedReport.traceability.observationLinks).toEqual([]);
    expect(parseCsv(refusedCsv)).toEqual([]);
    expect(forbiddenNumericPayloadPaths).toEqual([]);
    const refusedSerializedAnalysis = JSON.stringify(refusedReport.analysis);
    expect(refusedSerializedAnalysis).not.toContain('activationEnergyKJPerMol');
    expect(refusedSerializedAnalysis).not.toContain('candidateActivationEnergyKJPerMol');
    expect(refusedSerializedAnalysis).not.toContain('slopeStandardError');
    expect(refusedSerializedAnalysis).not.toContain('slopeConfidence95');

    if (!WRITE_AUDIT_ARTIFACTS) return;
    await mkdir(AUDIT_OUTPUT_DIRECTORY, { recursive: true });
    const paths = {
      primaryJson: resolve(AUDIT_OUTPUT_DIRECTORY, 'paper010-export-consistency.json'),
      primaryCsv: resolve(AUDIT_OUTPUT_DIRECTORY, 'paper010-export-consistency-results.csv'),
      primaryPdf: resolve(AUDIT_OUTPUT_DIRECTORY, 'paper010-export-consistency-report.pdf'),
      primaryText: resolve(AUDIT_OUTPUT_DIRECTORY, 'paper010-export-consistency-report.txt'),
      refusalJson: resolve(AUDIT_OUTPUT_DIRECTORY, 'nonpositive-ea-refusal.json'),
      refusalCsv: resolve(AUDIT_OUTPUT_DIRECTORY, 'nonpositive-ea-refusal-results.csv'),
      refusalPdf: resolve(AUDIT_OUTPUT_DIRECTORY, 'nonpositive-ea-refusal-report.pdf'),
      refusalText: resolve(AUDIT_OUTPUT_DIRECTORY, 'nonpositive-ea-refusal-report.txt'),
      verificationLog: resolve(AUDIT_OUTPUT_DIRECTORY, 'verification.log'),
    };
    await Promise.all([
      writeFile(paths.primaryJson, `${json}\n`),
      writeFile(paths.primaryCsv, csv),
      writeFile(paths.primaryPdf, pdfBytes),
      writeFile(paths.refusalJson, `${refusedJson}\n`),
      writeFile(paths.refusalCsv, refusedCsv),
      writeFile(paths.refusalPdf, refusedPdfBytes),
    ]);
    const pdftotext = pdfToTextPath();
    const primaryPdfText = execFileSync(pdftotext, ['-layout', paths.primaryPdf, '-'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const refusalPdfText = execFileSync(pdftotext, ['-layout', paths.refusalPdf, '-'], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    await Promise.all([
      writeFile(paths.primaryText, primaryPdfText),
      writeFile(paths.refusalText, refusalPdfText),
    ]);
    const requiredHumanReadableFields = assertPdfHumanReadable(report, primaryPdfText);
    expect(refusalPdfText).toContain('No numeric result was produced.');
    expect(refusalPdfText).toContain('NONPOSITIVE_APPARENT_EA');
    expect(refusalPdfText).not.toMatch(/-91\.83|-96\.61|-105\.76|-106\.23/u);
    const primaryPdfPages = pdfPageCount(paths.primaryPdf);
    const refusalPdfPages = pdfPageCount(paths.refusalPdf);
    const verificationLog = [
      'PASS v0.4.0 export-consistency audit',
      `fixture=paper010-supplied-dalpha-dt`,
      `resultRows=${report.results.length}`,
      `resultLinks=${report.traceability.resultLinks.length}`,
      `observationLinks=${report.traceability.observationLinks.length}`,
      `traceabilityGaps=${report.traceability.gaps.length}`,
      `jsonCsvNumericCells=${comparisons.numericCells}`,
      `jsonCsvLineageRows=${comparisons.observationTracePayloads}`,
      `pdfPages=${primaryPdfPages}`,
      `pdfRequiredFields=${requiredHumanReadableFields.length}`,
      `refusalStatus=${refusedReport.analysis.status}`,
      `refusalMethods=${refusedReport.analysis.methods.length}`,
      `refusalResultRows=${refusedReport.results.length}`,
      `refusalCsvDataRows=${parseCsv(refusedCsv).length}`,
      `refusalForbiddenNumericPayloads=${forbiddenNumericPayloadPaths.length}`,
      `refusalPdfPages=${refusalPdfPages}`,
      '',
    ].join('\n');
    await writeFile(paths.verificationLog, verificationLog);

    const sourceArtifacts = [
      ['primaryJson', paths.primaryJson, `${json}\n`],
      ['primaryCsv', paths.primaryCsv, csv],
      ['primaryPdf', paths.primaryPdf, pdfBytes],
      ['primaryText', paths.primaryText, primaryPdfText],
      ['refusalJson', paths.refusalJson, `${refusedJson}\n`],
      ['refusalCsv', paths.refusalCsv, refusedCsv],
      ['refusalPdf', paths.refusalPdf, refusedPdfBytes],
      ['refusalText', paths.refusalText, refusalPdfText],
      ['verificationLog', paths.verificationLog, verificationLog],
    ] as const;
    const sourcePayloads = Object.fromEntries(
      sourceArtifacts.map(([name, , payload]) => [name, sha256(payload)]),
    );
    const evidence: AuditEvidence = {
      status: 'PASS',
      generatedAt: GENERATED_AT,
      representativeFixture: 'paper010-supplied-dalpha-dt',
      primary: {
        resultRows: report.results.length,
        observationLinks: report.traceability.observationLinks.length,
        resultLinks: report.traceability.resultLinks.length,
        exclusions: report.traceability.resultLinks.reduce(
          (count, result) => count + result.exclusions.length,
          0,
        ),
        warningCodes: report.analysis.warnings.map(({ code }) => code),
        refusalCodes: report.analysis.refusals.map(({ code }) => code),
        traceabilityGapCodes: report.traceability.gaps.map(({ code }) => code),
        sourceFiles: report.context.sourceFiles.map(({ name, sizeBytes, sha256 }) => ({
          name,
          sizeBytes,
          sha256,
        })),
      },
      comparisons,
      pdf: {
        pages: primaryPdfPages,
        requiredHumanReadableFields,
        note:
          'PDF text extraction confirmed report identity, version/schema, licensed-source identity, DOI, source filename and SHA-256, formula/result/observation/group/run lineage, a representative displayed Ea value, traceability-gap status, and local-processing statement. PDF is intentionally treated as a human-readable view rather than a lossless machine schema.',
      },
      refusal: {
        status: refusedReport.analysis.status,
        methodCount: refusedReport.analysis.methods.length,
        resultRows: refusedReport.results.length,
        csvDataRows: parseCsv(refusedCsv).length,
        pdfPages: refusalPdfPages,
        refusalCodes: [...new Set(refusedReport.analysis.refusals.map(({ code }) => code))],
        forbiddenNumericPayloadPaths,
      },
      sha256: sourcePayloads,
    };
    const evidenceJsonPath = resolve(AUDIT_OUTPUT_DIRECTORY, 'EXPORT_CONSISTENCY_REPORT.json');
    const evidenceMarkdownPath = resolve(AUDIT_OUTPUT_DIRECTORY, 'EXPORT_CONSISTENCY_REPORT.md');
    const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`;
    const evidenceMarkdown = markdownEvidence(evidence);
    await Promise.all([
      writeFile(evidenceJsonPath, evidenceJson),
      writeFile(evidenceMarkdownPath, evidenceMarkdown),
    ]);
    const sums = [
      ...sourceArtifacts.map(([name, path]) => {
        const digest = sourcePayloads[name];
        const filename = path.split('/').at(-1);
        return `${digest}  ${filename}`;
      }),
      `${sha256(evidenceJson)}  EXPORT_CONSISTENCY_REPORT.json`,
      `${sha256(evidenceMarkdown)}  EXPORT_CONSISTENCY_REPORT.md`,
    ].join('\n');
    await writeFile(resolve(AUDIT_OUTPUT_DIRECTORY, 'SHA256SUMS.txt'), `${sums}\n`);
  });
});
