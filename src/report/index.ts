import { jsPDF } from 'jspdf';

import type {
  ActivationEnergyAnalysis,
  Diagnostic,
} from '../core/types';
import {
  APPARENT_EA_CLAIM_BOUNDARY,
  REGRESSION_CI_CLAIM_BOUNDARY,
  REPORT_SCHEMA_VERSION,
  buildReportReproducibility,
  buildReportTraceability,
  buildScientificBoundary,
  buildScientificResultRows,
  type ObservationTrace,
  type ReportGenerationInput,
  type ReportReproducibility,
  type ReportTraceability,
  type ScientificResultRow,
} from './audit';
import {
  scientificDispositionLabel,
  type ScientificDisposition,
} from '../product/disposition';
import {
  hashSourceFile,
  sourceFileIdFromSha256,
} from '../sourceFileIdentity';

export { sourceFileIdFromSha256 } from '../sourceFileIdentity';

export {
  APPARENT_EA_CLAIM_BOUNDARY,
  CORE_MATH_VERSION,
  FORMULA_SET_VERSION,
  REPORT_SCHEMA_VERSION,
  REPORT_VOLATILE_FIELDS,
  REGRESSION_CI_CLAIM_BOUNDARY,
  buildReportReproducibility,
  buildReportTraceability,
  buildScientificBoundary,
  buildScientificResultRows,
} from './audit';
export { resolveReportStageLabel, type ReportStageLabelInput } from './stage';
export type {
  ObservationTrace,
  ReportAnalysisConfiguration,
  ReportGenerationInput,
  ReportSourceFileIdentity,
  ReportReproducibility,
  ReportTraceability,
  ReportWideSeriesDefinition,
  ReportWideSeriesFileAudit,
  ResultTrace,
  ScientificResultRow,
  SourceRowReference,
} from './audit';

export const APP_VERSION = '0.3.2';

export type LicensedSourceType =
  | 'deposited-raw-instrument-data'
  | 'official-supplement-derived-table'
  | 'article-figure-transcription';

export interface LicensedSourceProvenance {
  readonly kind: 'licensed-example';
  readonly exampleId: string;
  readonly citation: {
    readonly label: string;
    readonly doi: string;
    readonly url: string;
  };
  readonly license: {
    readonly identifier: string;
    readonly name: string;
    readonly url: string;
    readonly scope: string;
  };
  readonly sourceType: LicensedSourceType;
  readonly extractionSteps: readonly string[];
  readonly transformationSteps: readonly string[];
  readonly printedPrecision: string;
  readonly rounding: string;
  readonly separateDatasetLicense: {
    readonly exists: boolean;
    readonly identifier: string | null;
    readonly scope: string;
  };
  readonly claimLimits: readonly string[];
}

export interface SourceFileTraceInput {
  readonly name: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly sourceFileId?: string;
}

export interface SourceFileTrace {
  readonly sourceFileId: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface AnalysisContextInput {
  projectName: string;
  sample?: string;
  process?: string;
  atmosphere?: string;
  stage?: string;
  analystNote?: string;
  sourceFiles: readonly SourceFileTraceInput[];
  licensedSourceProvenance?: LicensedSourceProvenance | null;
}

export interface AnalysisContext
  extends Omit<AnalysisContextInput, 'sourceFiles' | 'licensedSourceProvenance'> {
  sourceFiles: SourceFileTrace[];
  licensedSourceProvenance: LicensedSourceProvenance | null;
}

export interface ReproducibleProjectReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  application: {
    name: 'Activation Energy Studio';
    version: string;
    calculationLocation: 'local-browser';
  };
  generatedAt: string;
  context: AnalysisContext;
  scientificBoundary: ReturnType<typeof buildScientificBoundary>;
  reproducibility: ReportReproducibility;
  analysis: ActivationEnergyAnalysis;
  results: ScientificResultRow[];
  traceability: ReportTraceability;
}

type FlatResultRow = ScientificResultRow;

export function flattenResults(
  analysis: ActivationEnergyAnalysis,
  context: Pick<AnalysisContext, 'sample' | 'process' | 'stage' | 'atmosphere'> = {},
  configuration?: ReportGenerationInput['analysisConfiguration'],
): FlatResultRow[] {
  return buildScientificResultRows(analysis, context, configuration);
}

export function createProjectReport(
  analysis: ActivationEnergyAnalysis,
  context: AnalysisContextInput,
  generationInput?: ReportGenerationInput,
): ReproducibleProjectReport {
  const normalizedContext: AnalysisContext = {
    ...context,
    sourceFiles: context.sourceFiles.map(normalizeSourceFileTrace),
    licensedSourceProvenance: context.licensedSourceProvenance ?? null,
  };
  const identityBoundGenerationInput: ReportGenerationInput | undefined =
    generationInput || normalizedContext.sourceFiles.length > 0
      ? {
          ...generationInput,
          sourceFiles: normalizedContext.sourceFiles,
        }
      : undefined;
  const results = buildScientificResultRows(
    analysis,
    normalizedContext,
    generationInput?.analysisConfiguration,
  );
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    application: {
      name: 'Activation Energy Studio',
      version: APP_VERSION,
      calculationLocation: 'local-browser',
    },
    generatedAt: new Date().toISOString(),
    context: normalizedContext,
    scientificBoundary: buildScientificBoundary(analysis, normalizedContext),
    reproducibility: buildReportReproducibility(analysis, identityBoundGenerationInput),
    analysis,
    results,
    traceability: buildReportTraceability(analysis, results, identityBoundGenerationInput),
  };
}

function normalizeSourceFileTrace(file: SourceFileTraceInput): SourceFileTrace {
  const sourceFileId = sourceFileIdFromSha256(file.sha256);
  if (file.sourceFileId !== undefined && file.sourceFileId !== sourceFileId) {
    throw new Error(
      `Source file identity mismatch for ${file.name}: ${file.sourceFileId} is not bound to SHA-256 ${file.sha256}.`,
    );
  }
  return {
    sourceFileId,
    name: file.name,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256.toLowerCase(),
  };
}

export function serializeProjectReport(report: ReproducibleProjectReport): string {
  return JSON.stringify(report, null, 2);
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const rawText = String(value);
  // Spreadsheet applications can execute text cells beginning with these
  // characters as formulas. Preserve genuine numeric values, but make every
  // string field inert even when an attacker hides the marker behind leading
  // whitespace or control characters.
  const text = typeof value === 'string'
    && /^[\u0000-\u0020\u007f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*[=+@-]/u.test(value)
      ? `'${value}`
      : rawText;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createResultsCsv(
  reportOrAnalysis: ReproducibleProjectReport | ActivationEnergyAnalysis,
): string {
  const report =
    'schemaVersion' in reportOrAnalysis
      ? reportOrAnalysis
      : createProjectReport(reportOrAnalysis, {
          projectName: 'not-specified',
          sourceFiles: [],
        });
  const headers = [
    'schemaVersion',
    'applicationVersion',
    'sourceProvenanceKind',
    'sourceExampleId',
    'sourceCitationLabel',
    'sourceCitationDoi',
    'sourceCitationUrl',
    'sourceLicenseIdentifier',
    'sourceLicenseName',
    'sourceLicenseUrl',
    'sourceLicenseScope',
    'sourceType',
    'sourceExtractionSteps',
    'sourceTransformationSteps',
    'sourcePrintedPrecision',
    'sourceRounding',
    'separateDatasetLicenseExists',
    'separateDatasetLicenseIdentifier',
    'separateDatasetLicenseScope',
    'sourceClaimLimits',
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
    'alpha',
    'activationEnergyKJPerMol',
    'confidence95LowerKJPerMol',
    'confidence95UpperKJPerMol',
    'n',
    'rawObservationCount',
    'residualDegreesOfFreedom',
    'regressionInputAggregation',
    'r2',
    'slope',
    'slopeStandardError',
    'status',
    'disposition',
  ] as const;
  const lines = [headers.join(',')];
  const provenance = report.context.licensedSourceProvenance;
  for (const row of report.results) {
    const csvRow: Record<(typeof headers)[number], string | number | boolean | null> = {
      schemaVersion: report.schemaVersion,
      applicationVersion: report.application.version,
      sourceProvenanceKind: provenance?.kind ?? null,
      sourceExampleId: provenance?.exampleId ?? null,
      sourceCitationLabel: provenance?.citation.label ?? null,
      sourceCitationDoi: provenance?.citation.doi ?? null,
      sourceCitationUrl: provenance?.citation.url ?? null,
      sourceLicenseIdentifier: provenance?.license.identifier ?? null,
      sourceLicenseName: provenance?.license.name ?? null,
      sourceLicenseUrl: provenance?.license.url ?? null,
      sourceLicenseScope: provenance?.license.scope ?? null,
      sourceType: provenance?.sourceType ?? null,
      sourceExtractionSteps: provenance?.extractionSteps.join(' | ') ?? null,
      sourceTransformationSteps: provenance?.transformationSteps.join(' | ') ?? null,
      sourcePrintedPrecision: provenance?.printedPrecision ?? null,
      sourceRounding: provenance?.rounding ?? null,
      separateDatasetLicenseExists: provenance?.separateDatasetLicense.exists ?? null,
      separateDatasetLicenseIdentifier:
        provenance?.separateDatasetLicense.identifier ?? null,
      separateDatasetLicenseScope: provenance?.separateDatasetLicense.scope ?? null,
      sourceClaimLimits: provenance?.claimLimits.join(' | ') ?? null,
      ...row,
    };
    lines.push(headers.map((header) => csvCell(csvRow[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function pdfSafe(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replaceAll('\u00a0', ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replaceAll('\u2026', '...')
    .replaceAll('α', 'alpha')
    .replaceAll('β', 'beta')
    .replaceAll('Δ', 'delta')
    .replaceAll('≥', '>=')
    .replaceAll('≤', '<=')
    .replaceAll('°', ' deg ')
    .replaceAll('×', ' x ')
    .replaceAll('²', '^2')
    .replaceAll('⁻¹', '^-1')
    .replaceAll('\u015f', 's')
    .replaceAll('\u015e', 'S')
    .replaceAll('\u011f', 'g')
    .replaceAll('\u011e', 'G')
    .replaceAll('\u0131', 'i')
    .replaceAll('\u0130', 'I')
    .replaceAll('\u00e7', 'c')
    .replaceAll('\u00c7', 'C')
    .replaceAll('\u00f6', 'o')
    .replaceAll('\u00d6', 'O')
    .replaceAll('\u00fc', 'u')
    .replaceAll('\u00dc', 'U');
}

type PdfColor = readonly [number, number, number];

interface PdfLayout {
  readonly doc: jsPDF;
  y: number;
}

interface TableColumn {
  readonly label: string;
  readonly width: number;
  readonly align?: 'left' | 'center' | 'right';
}

const PDF_LAYOUT = {
  marginLeft: 14,
  marginRight: 14,
  contentTop: 17,
  contentBottom: 279,
  footerRuleY: 284,
  footerTextY: 290,
} as const;

const PDF_COLORS = {
  navy: [21, 43, 58] as PdfColor,
  teal: [0, 126, 115] as PdfColor,
  tealLight: [229, 245, 242] as PdfColor,
  ink: [31, 43, 51] as PdfColor,
  muted: [92, 105, 113] as PdfColor,
  border: [216, 225, 229] as PdfColor,
  panel: [246, 249, 250] as PdfColor,
  white: [255, 255, 255] as PdfColor,
  red: [169, 48, 48] as PdfColor,
  redLight: [252, 238, 238] as PdfColor,
  amber: [158, 99, 0] as PdfColor,
  amberLight: [255, 246, 224] as PdfColor,
} as const;

const PDF_METHOD_COLORS: Readonly<Record<string, PdfColor>> = {
  FWO: [0, 126, 115],
  KAS: [38, 91, 145],
  STARINK: [172, 96, 15],
  FRIEDMAN: [142, 54, 104],
  KISSINGER: [92, 105, 113],
};

const RESULTS_COLUMNS: readonly TableColumn[] = [
  { label: 'Method', width: 18, align: 'left' },
  { label: 'alpha / peak', width: 15, align: 'center' },
  { label: 'Ea (kJ/mol)', width: 20, align: 'right' },
  { label: '95% CI (kJ/mol)', width: 31, align: 'center' },
  { label: 'n beta/raw/df', width: 16, align: 'center' },
  { label: 'R^2', width: 16, align: 'right' },
  { label: 'Computation', width: 22, align: 'left' },
  { label: 'Scientific disposition', width: 44, align: 'left' },
] as const;

function setTextColor(doc: jsPDF, color: PdfColor): void {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: PdfColor): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: PdfColor): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function lineHeightMm(fontSize: number, multiplier = 1.18): number {
  return fontSize * 0.352778 * multiplier;
}

function hardWrapPdfLine(doc: jsPDF, value: string, width: number): string[] {
  if (value === '' || doc.getTextWidth(value) <= width) return [value];
  const remainingCharacters = Array.from(value);
  const lines: string[] = [];
  while (remainingCharacters.length > 0) {
    let lower = 1;
    let upper = remainingCharacters.length;
    let fittingLength = 0;
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const candidate = remainingCharacters.slice(0, middle).join('');
      if (doc.getTextWidth(candidate) <= width) {
        fittingLength = middle;
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }
    // A positive layout width should always fit at least one glyph. Keeping
    // this floor guarantees progress for unusual fonts or malformed metrics.
    const consumed = Math.max(1, fittingLength);
    lines.push(remainingCharacters.splice(0, consumed).join(''));
  }
  return lines;
}

export function wrapPdfText(doc: jsPDF, value: string, width: number): string[] {
  const lines = doc.splitTextToSize(pdfSafe(value), width) as string[];
  const boundedLines = (lines.length > 0 ? lines : [''])
    .flatMap((line) => hardWrapPdfLine(doc, line, width));
  return boundedLines.length > 0 ? boundedLines : [''];
}

const splitText = wrapPdfText;

function drawContinuationHeader(layout: PdfLayout, label: string): void {
  const { doc } = layout;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text(pdfSafe(label).toUpperCase(), PDF_LAYOUT.marginLeft, layout.y);
  layout.y += 3;
  setDrawColor(doc, PDF_COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(PDF_LAYOUT.marginLeft, layout.y, 210 - PDF_LAYOUT.marginRight, layout.y);
  layout.y += 5;
}

function nextPage(layout: PdfLayout, continuationLabel?: string): void {
  layout.doc.addPage();
  layout.y = PDF_LAYOUT.contentTop;
  if (continuationLabel) drawContinuationHeader(layout, continuationLabel);
}

function ensureSpace(layout: PdfLayout, height: number, continuationLabel?: string): boolean {
  if (layout.y + height <= PDF_LAYOUT.contentBottom) return false;
  nextPage(layout, continuationLabel);
  return true;
}

function drawSectionTitle(layout: PdfLayout, title: string): void {
  ensureSpace(layout, 10, title);
  const { doc } = layout;
  setFillColor(doc, PDF_COLORS.teal);
  doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y - 3.8, 2.1, 6.2, 0.6, 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, PDF_COLORS.navy);
  doc.text(pdfSafe(title), PDF_LAYOUT.marginLeft + 5, layout.y + 0.5);
  layout.y += 8;
}

function drawKpiCards(
  layout: PdfLayout,
  entries: readonly { label: string; value: string; color: PdfColor }[],
): void {
  const gap = 3;
  const width = (182 - gap * (entries.length - 1)) / entries.length;
  const height = 18;
  ensureSpace(layout, height, 'Analysis summary');
  entries.forEach((entry, index) => {
    const x = PDF_LAYOUT.marginLeft + index * (width + gap);
    setFillColor(layout.doc, PDF_COLORS.panel);
    setDrawColor(layout.doc, PDF_COLORS.border);
    layout.doc.setLineWidth(0.25);
    layout.doc.roundedRect(x, layout.y, width, height, 1.4, 1.4, 'FD');
    layout.doc.setFont('helvetica', 'bold');
    layout.doc.setFontSize(6.6);
    setTextColor(layout.doc, PDF_COLORS.muted);
    layout.doc.text(pdfSafe(entry.label).toUpperCase(), x + 3, layout.y + 5);
    layout.doc.setFontSize(12);
    setTextColor(layout.doc, entry.color);
    const value = splitText(layout.doc, entry.value, width - 6).slice(0, 2);
    layout.doc.text(value, x + 3, layout.y + 11.5, { lineHeightFactor: 1.05 });
  });
  layout.y += height + 6;
}

function compactLines(
  doc: jsPDF,
  lines: string[],
  maximum: number,
  width: number,
): string[] {
  if (lines.length <= maximum) return lines;
  const shortened = lines.slice(0, maximum);
  const suffix = '...';
  const last = Array.from((shortened[maximum - 1] ?? '').replace(/\s*\.{0,3}$/, ''));
  while (last.length > 0 && doc.getTextWidth(`${last.join('')}${suffix}`) > width) {
    last.pop();
  }
  shortened[maximum - 1] = `${last.join('')}${suffix}`;
  return shortened;
}

function drawSummaryGrid(
  layout: PdfLayout,
  items: readonly { label: string; value: string }[],
): void {
  const gap = 5;
  const cellWidth = (182 - gap) / 2;
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    const prepared = pair.map((item) => {
      layout.doc.setFont('helvetica', 'normal');
      layout.doc.setFontSize(8.2);
      const width = cellWidth - 6;
      const lines = compactLines(layout.doc, splitText(layout.doc, item.value, width), 5, width);
      return { ...item, lines };
    });
    const valueLineHeight = lineHeightMm(8.2, 1.12);
    const rowHeight = Math.max(
      15,
      ...prepared.map((item) => 8 + item.lines.length * valueLineHeight),
    );
    ensureSpace(layout, rowHeight + 3, 'Analysis summary - continued');
    prepared.forEach((item, pairIndex) => {
      const x = PDF_LAYOUT.marginLeft + pairIndex * (cellWidth + gap);
      setFillColor(layout.doc, PDF_COLORS.panel);
      layout.doc.roundedRect(x, layout.y, cellWidth, rowHeight, 1.2, 1.2, 'F');
      layout.doc.setFont('helvetica', 'bold');
      layout.doc.setFontSize(6.7);
      setTextColor(layout.doc, PDF_COLORS.muted);
      layout.doc.text(pdfSafe(item.label).toUpperCase(), x + 3, layout.y + 4.5);
      layout.doc.setFont('helvetica', 'normal');
      layout.doc.setFontSize(8.2);
      setTextColor(layout.doc, PDF_COLORS.ink);
      layout.doc.text(item.lines, x + 3, layout.y + 9.1, { lineHeightFactor: 1.12 });
    });
    layout.y += rowHeight + 3;
  }
  layout.y += 2;
}

function formatResultNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function pdfEnumLabel(value: string): string {
  if (
    value === 'REPORTABLE'
    || value === 'REPORTABLE_WITH_CAUTION'
    || value === 'CALCULATED_UNRELIABLE'
    || value === 'CALCULATION_REJECTED'
  ) {
    return scientificDispositionLabel(value as ScientificDisposition);
  }
  return value.replaceAll('_', ' ').toUpperCase();
}

function resultCells(row: FlatResultRow): string[] {
  const confidence =
    row.confidence95LowerKJPerMol === null || row.confidence95UpperKJPerMol === null
      ? '-'
      : `${row.confidence95LowerKJPerMol.toFixed(2)} - ${row.confidence95UpperKJPerMol.toFixed(2)}`;
  return [
    row.method,
    row.alpha === null ? 'peak' : row.alpha.toFixed(3),
    formatResultNumber(row.activationEnergyKJPerMol, 2),
    confidence,
    row.n === null ||
    row.rawObservationCount === null ||
    row.residualDegreesOfFreedom === null
      ? '-'
      : `${row.n}/${row.rawObservationCount}/${row.residualDegreesOfFreedom}`,
    formatResultNumber(row.r2, 5),
    pdfEnumLabel(row.status),
    pdfEnumLabel(row.disposition),
  ];
}

function drawTableHeader(layout: PdfLayout): void {
  const { doc } = layout;
  const height = 10;
  setFillColor(doc, PDF_COLORS.navy);
  doc.rect(PDF_LAYOUT.marginLeft, layout.y, 182, height, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  setTextColor(doc, PDF_COLORS.white);
  let x = PDF_LAYOUT.marginLeft;
  for (const column of RESULTS_COLUMNS) {
    const lines = splitText(doc, column.label, column.width - 3);
    const textX = column.align === 'right' ? x + column.width - 2 : column.align === 'center' ? x + column.width / 2 : x + 2;
    doc.text(lines, textX, layout.y + 4.1, {
      align: column.align ?? 'left',
      lineHeightFactor: 1.05,
    });
    x += column.width;
  }
  layout.y += height;
}

function drawResultsTable(layout: PdfLayout, rows: readonly FlatResultRow[]): void {
  drawSectionTitle(layout, 'Isoconversional results');
  if (rows.length === 0) {
    ensureSpace(layout, 14, 'Results');
    setFillColor(layout.doc, PDF_COLORS.amberLight);
    layout.doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y, 182, 11, 1.2, 1.2, 'F');
    layout.doc.setFont('helvetica', 'normal');
    layout.doc.setFontSize(8.5);
    setTextColor(layout.doc, PDF_COLORS.amber);
    layout.doc.text('No numeric result was produced.', PDF_LAYOUT.marginLeft + 4, layout.y + 7);
    layout.y += 16;
    return;
  }

  ensureSpace(layout, 17, 'Results');
  writeWrappedText(
    layout,
    'n beta is the number of equal-weight distinct-heating-rate inputs; raw is the retained run/peak count; df is n beta - 2. Same-beta replicates are averaged on the physical scale before transformation and do not increase residual degrees of freedom.',
    {
      fontSize: 7.2,
      color: PDF_COLORS.muted,
      continuationLabel: 'Results - continued',
      gapAfter: 2,
    },
  );
  drawTableHeader(layout);
  rows.forEach((row, rowIndex) => {
    const cells = resultCells(row);
    layout.doc.setFont('helvetica', 'normal');
    layout.doc.setFontSize(7.4);
    const prepared = cells.map((cell, index) => splitText(layout.doc, cell, RESULTS_COLUMNS[index].width - 4));
    const lineHeight = lineHeightMm(7.4, 1.12);
    const rowHeight = Math.max(7.2, 3.2 + Math.max(...prepared.map((lines) => lines.length)) * lineHeight);

    if (layout.y + rowHeight > PDF_LAYOUT.contentBottom) {
      nextPage(layout, 'Results - continued');
      drawTableHeader(layout);
    }

    const rowTop = layout.y;
    if (rowIndex % 2 === 1) {
      setFillColor(layout.doc, PDF_COLORS.panel);
      layout.doc.rect(PDF_LAYOUT.marginLeft, rowTop, 182, rowHeight, 'F');
    }
    setDrawColor(layout.doc, PDF_COLORS.border);
    layout.doc.setLineWidth(0.18);
    layout.doc.line(PDF_LAYOUT.marginLeft, rowTop + rowHeight, 196, rowTop + rowHeight);
    let x = PDF_LAYOUT.marginLeft;
    prepared.forEach((lines, index) => {
      const column = RESULTS_COLUMNS[index];
      const textX = column.align === 'right' ? x + column.width - 2 : column.align === 'center' ? x + column.width / 2 : x + 2;
      setTextColor(layout.doc, PDF_COLORS.ink);
      lines.forEach((line, lineIndex) => {
        layout.doc.text(line, textX, rowTop + 3.2 + lineIndex * lineHeight, {
          align: column.align ?? 'left',
        });
      });
      x += column.width;
    });
    layout.y += rowHeight;
  });
  layout.y += 6;
}

interface PlotBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface NumericRange {
  readonly minimum: number;
  readonly maximum: number;
}

function paddedRange(values: readonly number[], fraction = 0.08): NumericRange {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * fraction, 1e-6);
    return { minimum: minimum - padding, maximum: maximum + padding };
  }
  const padding = (maximum - minimum) * fraction;
  return { minimum: minimum - padding, maximum: maximum + padding };
}

function plotX(value: number, range: NumericRange, bounds: PlotBounds): number {
  return bounds.x + ((value - range.minimum) / (range.maximum - range.minimum)) * bounds.width;
}

function plotY(value: number, range: NumericRange, bounds: PlotBounds): number {
  return bounds.y + bounds.height - ((value - range.minimum) / (range.maximum - range.minimum)) * bounds.height;
}

function formatAxisTick(value: number): string {
  const absolute = Math.abs(value);
  if (absolute > 0 && (absolute < 0.01 || absolute >= 10_000)) return value.toExponential(2);
  if (absolute < 1) return value.toFixed(3);
  if (absolute < 100) return value.toFixed(1);
  if (absolute < 1_000) return value.toFixed(1);
  return value.toFixed(0);
}

function drawAxes(
  doc: jsPDF,
  bounds: PlotBounds,
  xRange: NumericRange,
  yRange: NumericRange,
  xLabel: string,
  yLabel: string,
): void {
  const tickCount = 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setTextColor(doc, PDF_COLORS.muted);
  setDrawColor(doc, PDF_COLORS.border);
  doc.setLineWidth(0.18);
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const fraction = tick / tickCount;
    const x = bounds.x + bounds.width * fraction;
    const y = bounds.y + bounds.height * fraction;
    doc.line(x, bounds.y, x, bounds.y + bounds.height);
    doc.line(bounds.x, y, bounds.x + bounds.width, y);
    const xValue = xRange.minimum + (xRange.maximum - xRange.minimum) * fraction;
    const yValue = yRange.maximum - (yRange.maximum - yRange.minimum) * fraction;
    doc.text(formatAxisTick(xValue), x, bounds.y + bounds.height + 3.2, { align: 'center' });
    doc.text(formatAxisTick(yValue), bounds.x - 2, y + 1.1, { align: 'right' });
  }
  setDrawColor(doc, PDF_COLORS.ink);
  doc.setLineWidth(0.35);
  doc.line(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
  doc.line(bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  setTextColor(doc, PDF_COLORS.ink);
  doc.text(pdfSafe(xLabel), bounds.x + bounds.width / 2, bounds.y + bounds.height + 7.2, {
    align: 'center',
  });
  doc.text(pdfSafe(yLabel), bounds.x - 11.2, bounds.y + bounds.height / 2, {
    align: 'center',
    angle: 90,
  });
}

function drawEaCurve(layout: PdfLayout, rows: readonly ScientificResultRow[]): void {
  const points = rows.filter(
    (row) =>
      row.resultType === 'isoconversional' &&
      row.alpha !== null &&
      row.activationEnergyKJPerMol !== null &&
      Number.isFinite(row.alpha) &&
      Number.isFinite(row.activationEnergyKJPerMol),
  );
  if (points.length === 0) {
    ensureSpace(layout, 28);
    drawSectionTitle(layout, 'Apparent Ea(alpha) curve');
    writeWrappedText(layout, 'No isoconversional numeric result is available for an Ea(alpha) curve.', {
      color: PDF_COLORS.muted,
      gapAfter: 5,
    });
    return;
  }

  const panelHeight = 82;
  ensureSpace(layout, panelHeight + 15);
  drawSectionTitle(layout, 'Apparent Ea(alpha) curve');
  const panelTop = layout.y;
  setFillColor(layout.doc, PDF_COLORS.panel);
  setDrawColor(layout.doc, PDF_COLORS.border);
  layout.doc.setLineWidth(0.25);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, panelTop, 182, panelHeight, 1.4, 1.4, 'FD');
  const bounds: PlotBounds = {
    x: PDF_LAYOUT.marginLeft + 22,
    y: panelTop + 13,
    width: 150,
    height: 50,
  };
  const xRange = paddedRange(points.map((point) => point.alpha as number), 0.03);
  const yRange = paddedRange(points.map((point) => point.activationEnergyKJPerMol as number));
  drawAxes(layout.doc, bounds, xRange, yRange, 'alpha (fraction)', 'Apparent Ea (kJ/mol)');

  const methods = [...new Set(points.map((point) => point.method))];
  let legendX = bounds.x;
  methods.forEach((method) => {
    const color = PDF_METHOD_COLORS[method] ?? PDF_COLORS.navy;
    setFillColor(layout.doc, color);
    layout.doc.circle(legendX, panelTop + 7, 1.15, 'F');
    layout.doc.setFont('helvetica', 'bold');
    layout.doc.setFontSize(6.5);
    setTextColor(layout.doc, PDF_COLORS.ink);
    layout.doc.text(method, legendX + 2.6, panelTop + 8.1);
    legendX += 10 + method.length * 1.6;
  });

  for (const method of methods) {
    const series = points
      .filter((point) => point.method === method)
      .sort((left, right) => (left.alpha as number) - (right.alpha as number));
    const color = PDF_METHOD_COLORS[method] ?? PDF_COLORS.navy;
    setDrawColor(layout.doc, color);
    setFillColor(layout.doc, color);
    layout.doc.setLineWidth(0.55);
    series.forEach((point, index) => {
      const x = plotX(point.alpha as number, xRange, bounds);
      const y = plotY(point.activationEnergyKJPerMol as number, yRange, bounds);
      if (index > 0) {
        const previous = series[index - 1];
        layout.doc.line(
          plotX(previous.alpha as number, xRange, bounds),
          plotY(previous.activationEnergyKJPerMol as number, yRange, bounds),
          x,
          y,
        );
      }
      layout.doc.circle(x, y, 0.9, 'FD');
    });
  }
  layout.doc.setFont('helvetica', 'italic');
  layout.doc.setFontSize(6.2);
  setTextColor(layout.doc, PDF_COLORS.muted);
  layout.doc.text(
    'Kissinger peak results are intentionally excluded from the Ea(alpha) curve.',
    PDF_LAYOUT.marginLeft + 91,
    panelTop + 78,
    { align: 'center' },
  );
  layout.y += panelHeight + 6;
}

function chooseRegressionResult(
  rows: readonly ScientificResultRow[],
  observations: readonly ObservationTrace[],
): ScientificResultRow | undefined {
  return rows
    .filter(
      (row) =>
        row.resultType === 'isoconversional' &&
        observations.filter((observation) => observation.resultId === row.resultId).length >= 3,
    )
    .sort((left, right) => {
      const leftMethod = left.method === 'KAS' ? 0 : 1;
      const rightMethod = right.method === 'KAS' ? 0 : 1;
      if (leftMethod !== rightMethod) return leftMethod - rightMethod;
      return Math.abs((left.alpha ?? 0.5) - 0.5) - Math.abs((right.alpha ?? 0.5) - 0.5);
    })[0];
}

function drawRegressionPanel(
  doc: jsPDF,
  bounds: PlotBounds,
  observations: readonly ObservationTrace[],
  mode: 'fit' | 'residual',
): void {
  const xRange = paddedRange(observations.map((observation) => observation.x), 0.05);
  const yValues =
    mode === 'fit'
      ? observations.flatMap((observation) => [observation.y, observation.predictedY])
      : [...observations.map((observation) => observation.residual), 0];
  const yRange = paddedRange(yValues, 0.12);
  drawAxes(
    doc,
    bounds,
    xRange,
    yRange,
    'x = 1/T (K^-1)',
    mode === 'fit' ? 'Transformed y' : 'Residual (y - fitted)',
  );

  if (mode === 'fit') {
    const ordered = [...observations].sort((left, right) => left.x - right.x);
    setDrawColor(doc, PDF_COLORS.teal);
    doc.setLineWidth(0.55);
    ordered.slice(1).forEach((observation, index) => {
      const previous = ordered[index];
      doc.line(
        plotX(previous.x, xRange, bounds),
        plotY(previous.predictedY, yRange, bounds),
        plotX(observation.x, xRange, bounds),
        plotY(observation.predictedY, yRange, bounds),
      );
    });
  } else if (yRange.minimum <= 0 && yRange.maximum >= 0) {
    setDrawColor(doc, PDF_COLORS.muted);
    doc.setLineDashPattern([1.2, 1.2], 0);
    const zeroY = plotY(0, yRange, bounds);
    doc.line(bounds.x, zeroY, bounds.x + bounds.width, zeroY);
    doc.setLineDashPattern([], 0);
  }

  setFillColor(doc, PDF_COLORS.navy);
  setDrawColor(doc, PDF_COLORS.white);
  observations.forEach((observation) => {
    const y = mode === 'fit' ? observation.y : observation.residual;
    doc.circle(plotX(observation.x, xRange, bounds), plotY(y, yRange, bounds), 1.05, 'FD');
  });
}

function drawRegressionDiagnostic(layout: PdfLayout, report: ReproducibleProjectReport): void {
  const result = chooseRegressionResult(report.results, report.traceability.observationLinks);
  if (!result) {
    ensureSpace(layout, 28);
    drawSectionTitle(layout, 'Regression diagnostic');
    writeWrappedText(layout, 'No isoconversional regression with at least three observations is available.', {
      color: PDF_COLORS.muted,
      gapAfter: 5,
    });
    return;
  }
  const observations = report.traceability.observationLinks.filter(
    (observation) => observation.resultId === result.resultId,
  );
  const panelHeight = 83;
  ensureSpace(layout, panelHeight + 15);
  drawSectionTitle(layout, 'Regression diagnostic');
  const panelTop = layout.y;
  setFillColor(layout.doc, PDF_COLORS.panel);
  setDrawColor(layout.doc, PDF_COLORS.border);
  layout.doc.setLineWidth(0.25);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, panelTop, 182, panelHeight, 1.4, 1.4, 'FD');
  layout.doc.setFont('helvetica', 'bold');
  layout.doc.setFontSize(7.4);
  setTextColor(layout.doc, PDF_COLORS.navy);
  layout.doc.text(
    `${result.method} | alpha=${result.alpha?.toFixed(3)} | formula=${pdfSafe(result.formulaId)}`,
    PDF_LAYOUT.marginLeft + 4,
    panelTop + 6,
  );
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(6.2);
  setTextColor(layout.doc, PDF_COLORS.muted);
  layout.doc.text('Observed transformed points and fitted OLS line', PDF_LAYOUT.marginLeft + 19, panelTop + 11);
  layout.doc.text('Residuals (y - fitted)', PDF_LAYOUT.marginLeft + 111, panelTop + 11);
  drawRegressionPanel(
    layout.doc,
    { x: PDF_LAYOUT.marginLeft + 18, y: panelTop + 15, width: 62, height: 48 },
    observations,
    'fit',
  );
  drawRegressionPanel(
    layout.doc,
    { x: PDF_LAYOUT.marginLeft + 110, y: panelTop + 15, width: 62, height: 48 },
    observations,
    'residual',
  );
  layout.doc.setFont('helvetica', 'italic');
  layout.doc.setFontSize(6.2);
  setTextColor(layout.doc, PDF_COLORS.muted);
  const [scopeStatement, exclusionStatement] = REGRESSION_CI_CLAIM_BOUNDARY.split('; ');
  layout.doc.text(
    [`${scopeStatement};`, exclusionStatement],
    PDF_LAYOUT.marginLeft + 91,
    panelTop + 76,
    { align: 'center', lineHeightFactor: 1.12 },
  );
  layout.y += panelHeight + 6;
}

function drawKissingerSection(layout: PdfLayout, rows: readonly ScientificResultRow[]): void {
  const result = rows.find((row) => row.resultType === 'peak');
  if (!result) {
    ensureSpace(layout, 28);
    drawSectionTitle(layout, 'Kissinger peak analysis (separate result)');
    writeWrappedText(layout, 'No eligible beta-Tp peak result was produced.', {
      color: PDF_COLORS.muted,
      gapAfter: 5,
    });
    return;
  }
  ensureSpace(layout, 48);
  drawSectionTitle(layout, 'Kissinger peak analysis (separate result)');
  setFillColor(layout.doc, PDF_COLORS.panel);
  setDrawColor(layout.doc, PDF_COLORS.border);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y, 182, 31, 1.4, 1.4, 'FD');
  const confidence =
    result.confidence95LowerKJPerMol === null || result.confidence95UpperKJPerMol === null
      ? 'not available'
      : `${result.confidence95LowerKJPerMol.toFixed(2)} - ${result.confidence95UpperKJPerMol.toFixed(2)} kJ/mol`;
  layout.doc.setFont('helvetica', 'bold');
  layout.doc.setFontSize(10);
  setTextColor(layout.doc, PDF_COLORS.navy);
  layout.doc.text(
    `Apparent peak Ea: ${formatResultNumber(result.activationEnergyKJPerMol, 2)} kJ/mol`,
    PDF_LAYOUT.marginLeft + 4,
    layout.y + 7,
  );
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(7.1);
  setTextColor(layout.doc, PDF_COLORS.ink);
  layout.doc.text(
    `95% regression CI: ${confidence} | n beta/raw=${result.n ?? '-'}/${result.rawObservationCount ?? '-'} | df=${result.residualDegreesOfFreedom ?? '-'} | R^2=${formatResultNumber(result.r2, 5)}`,
    PDF_LAYOUT.marginLeft + 4,
    layout.y + 13,
  );
  layout.doc.text(
    `Formula: ${pdfSafe(result.formulaId)} | resultType=peak | alpha=null`,
    PDF_LAYOUT.marginLeft + 4,
    layout.y + 18.5,
  );
  layout.doc.text(
    `Computation: ${pdfEnumLabel(result.status)} | Scientific disposition: ${pdfEnumLabel(result.disposition)}`,
    PDF_LAYOUT.marginLeft + 4,
    layout.y + 23,
  );
  layout.doc.setFont('helvetica', 'italic');
  setTextColor(layout.doc, PDF_COLORS.muted);
  layout.doc.text(
    'Peak-based Kissinger Ea is not an Ea(alpha) point and is not pooled with isoconversional results.',
    PDF_LAYOUT.marginLeft + 4,
    layout.y + 28.5,
  );
  layout.y += 40;
}

function drawInputAndPreprocessing(
  layout: PdfLayout,
  report: ReproducibleProjectReport,
): void {
  ensureSpace(layout, 38);
  drawSectionTitle(layout, 'Input units and preprocessing');
  const units = report.reproducibility.canonicalUnits;
  writeWrappedText(
    layout,
    `Canonical units: temperature=${units.temperature}; heating rate=${units.heatingRate}; time=${units.time}; alpha=${units.alpha}; derivative=${units.derivative}; apparent Ea=${units.activationEnergy}.`,
    {
      continuationLabel: 'Input units and preprocessing - continued',
      gapAfter: 2,
    },
  );
  const configuration = report.reproducibility.configuration;
  writeWrappedText(
    layout,
    `Preprocessing configuration: temperature ordering=${report.reproducibility.preprocessing.temperatureOrdering}; alpha interpolation=${report.reproducibility.preprocessing.alphaInterpolation}; smoothing=${report.reproducibility.preprocessing.smoothing}; stage window=${configuration.stageWindowCelsius?.join(' to ') ?? 'not applied'} deg C; min R^2 warning=${configuration.minR2Warning}.`,
    {
      continuationLabel: 'Input units and preprocessing - continued',
      gapAfter: 2,
    },
  );
  const derivativeSummary = report.reproducibility.preprocessing.derivativeSources
    .map((entry) => `${entry.runId}:${entry.source}`)
    .join(', ');
  writeWrappedText(layout, `Derivative source by run: ${derivativeSummary || 'not recorded'}.`, {
    continuationLabel: 'Input units and preprocessing - continued',
    gapAfter: 2,
  });
  const normalizationSummary = report.reproducibility.preprocessing.massNormalization
    .map(
      (entry) =>
        `${entry.runId}:${entry.alphaSource}/${entry.sourceQuantity} (m0=${entry.initialValue ?? 'n/a'}, mf=${entry.finalValue ?? 'n/a'}; start=${entry.initialAnchor ? `${entry.initialAnchor.method}@rows ${entry.initialAnchor.sourceRows.join('+')}` : 'n/a'}; end=${entry.finalAnchor ? `${entry.finalAnchor.method}@rows ${entry.finalAnchor.sourceRows.join('+')}` : 'n/a'})`,
    )
    .join('; ');
  writeWrappedText(layout, `Alpha source / mass references: ${normalizationSummary || 'not recorded'}.`, {
    continuationLabel: 'Input units and preprocessing - continued',
    gapAfter: 2,
  });
  const wideFiles = report.reproducibility.preprocessing.wideSeriesFiles;
  if (wideFiles.length === 0) {
    writeWrappedText(layout, 'Wide-series audit: none (long-table ingestion).', {
      continuationLabel: 'Input units and preprocessing - continued',
      gapAfter: 2,
    });
  }
  for (const wide of wideFiles) {
    const excluded = wide.excludedPopulatedColumns
      .map((column) => `${column.sourceHeader || `column ${column.columnIndex + 1}`}(${column.populatedRowCount})`)
      .join(', ');
    writeWrappedText(
      layout,
      `Wide-series audit: ${wide.source.fileName}${wide.source.sheetName ? ` / sheet ${wide.source.sheetName}` : ''}; header source row=${wide.headerSourceRow}; alpha grid=${wide.alphaGrid.join(', ')}; raw/projected=${wide.rawObservationCount}/${wide.projectedPointCount}; scope confirmed=${wide.scopeConfirmed}; excluded populated columns=${excluded || 'none'}.`,
      {
        fontSize: 7.4,
        color: PDF_COLORS.muted,
        continuationLabel: 'Input units and preprocessing - continued',
        gapAfter: 1.2,
      },
    );
    for (const series of wide.series) {
      const branch = wide.branches.find((candidate) => candidate.seriesId === series.seriesId);
      const reference = series.signal.alphaReference
        ? `; references=${series.signal.alphaReference.initialValue}->${series.signal.alphaReference.finalValue}`
        : '';
      const derivative = series.derivative
        ? `${series.derivative.semantic}[${series.derivative.unit}]; canonical dAlpha/dt: ${series.derivative.canonicalConversionFormula}`
        : 'not mapped';
      const pointRows = wide.points.filter((point) => point.seriesId === series.seriesId);
      const derivativePointCount = pointRows.filter(
        (point) => point.derivativeSourceRows.length > 0,
      ).length;
      writeWrappedText(
        layout,
        `Series ${series.seriesId} / run ${series.runId}: manual heating rate=${series.heatingRate.value} ${series.heatingRate.unit} (${series.heatingRate.canonicalKPerMinute} K/min); context=${series.context.sample} | ${series.context.atmosphere} | ${series.context.stage}; signal=${series.signal.kind}[${series.signal.unit}]${reference}; derivative=${derivative}; branch source rows=${branch ? `${branch.startSourceRow}-${branch.endSourceRow}` : 'n/a'}; projected row links=${pointRows.length} primary/${derivativePointCount} derivative.`,
        {
          fontSize: 7.2,
          color: PDF_COLORS.muted,
          continuationLabel: 'Input units and preprocessing - continued',
          gapAfter: 1.2,
        },
      );
    }
  }
  for (const table of report.reproducibility.inputTables) {
    const mappings = table.mappings
      .map(
        (mapping) =>
          `${mapping.sourceHeader}[${mapping.sourceUnit ?? '?'}] -> ${mapping.role}[${mapping.canonicalUnit ?? 'metadata'}]`,
      )
      .join('; ');
    writeWrappedText(
      layout,
      `Input table ${table.fileName}${table.sheetName ? ` / sheet ${table.sheetName}` : ''}: ${mappings || 'no mappings recorded'}.`,
      {
        fontSize: 7.4,
        color: PDF_COLORS.muted,
        continuationLabel: 'Input units and preprocessing - continued',
        gapAfter: 1.2,
      },
    );
  }
  layout.y += 2;
}

interface WrappedTextOptions {
  readonly x?: number;
  readonly width?: number;
  readonly fontSize?: number;
  readonly fontStyle?: 'normal' | 'bold' | 'italic';
  readonly color?: PdfColor;
  readonly gapAfter?: number;
  readonly continuationLabel?: string;
}

function writeWrappedText(layout: PdfLayout, value: string, options: WrappedTextOptions = {}): void {
  const x = options.x ?? PDF_LAYOUT.marginLeft;
  const width = options.width ?? 182;
  const fontSize = options.fontSize ?? 8.2;
  const lineHeight = lineHeightMm(fontSize, 1.18);
  layout.doc.setFont('helvetica', options.fontStyle ?? 'normal');
  layout.doc.setFontSize(fontSize);
  setTextColor(layout.doc, options.color ?? PDF_COLORS.ink);
  const lines = splitText(layout.doc, value, width);
  if (lines.length > 1) {
    // Keep short paragraphs together and avoid a one-line continuation.
    ensureSpace(
      layout,
      Math.min(lines.length, 3) * lineHeight + 0.8,
      options.continuationLabel,
    );
  }
  for (const line of lines) {
    ensureSpace(layout, lineHeight + 0.8, options.continuationLabel);
    layout.doc.text(line, x, layout.y);
    layout.y += lineHeight;
  }
  layout.y += options.gapAfter ?? 1.5;
}

function drawEligibilitySummary(
  layout: PdfLayout,
  report: ReproducibleProjectReport,
): void {
  drawSectionTitle(layout, 'Eligibility');
  const eligibility = report.analysis.eligibility;
  const commonAlphaRange = eligibility.commonAlphaRange
    ? eligibility.commonAlphaRange.map((value) => value.toFixed(3)).join(' - ')
    : 'not established';
  writeWrappedText(
    layout,
    `Eligibility decision: ${eligibility.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} | distinct heating rates=${eligibility.distinctHeatingRates} | common alpha range=${commonAlphaRange} | refusals=${eligibility.refusals.length} | warnings=${eligibility.warnings.length}.`,
    {
      continuationLabel: 'Eligibility - continued',
      gapAfter: 2,
    },
  );
  writeWrappedText(layout, 'Method eligibility / retained results:', {
    fontStyle: 'bold',
    continuationLabel: 'Eligibility - continued',
    gapAfter: 1,
  });
  const methodLines = report.analysis.methods.map(
    (method) =>
      `${method.method}: status=${method.status} | retained isoconversional results=${method.estimates.length} | refusals=${method.refusals.length} | warnings=${method.warnings.length}.`,
  );
  if (report.analysis.kissinger) {
    const kissinger = report.analysis.kissinger;
    const retainedPeakResult =
      kissinger.regression && kissinger.activationEnergyKJPerMol !== undefined ? 1 : 0;
    methodLines.push(
      `KISSINGER: status=${kissinger.status} | retained peak results=${retainedPeakResult} | refusals=${kissinger.refusals.length} | warnings=${kissinger.warnings.length}.`,
    );
  }
  if (methodLines.length === 0) {
    methodLines.push('No method result was retained.');
  }
  for (const line of methodLines) {
    writeWrappedText(layout, line, {
      fontSize: 7.4,
      color: PDF_COLORS.muted,
      continuationLabel: 'Eligibility - continued',
      gapAfter: 0.8,
    });
  }
  layout.y += 2;
}

function diagnosticMetadata(diagnostic: Diagnostic): string | null {
  const parts: string[] = [];
  if (diagnostic.method) parts.push(`method=${diagnostic.method}`);
  if (diagnostic.alpha !== undefined) parts.push(`alpha=${diagnostic.alpha}`);
  if (diagnostic.runIds?.length) parts.push(`runs=${diagnostic.runIds.join(', ')}`);
  if (diagnostic.details) {
    const details = Object.entries(diagnostic.details).map(([key, value]) => `${key}=${String(value)}`);
    parts.push(...details);
  }
  return parts.length > 0 ? parts.join(' | ') : null;
}

export interface DiagnosticPresentationGroup {
  readonly code: Diagnostic['code'];
  readonly severity: Diagnostic['severity'];
  readonly occurrences: number;
  readonly representative: Diagnostic;
  readonly methods: readonly string[];
  readonly alphas: readonly number[];
  readonly runIds: readonly string[];
  readonly distinctMessages: number;
}

export function groupDiagnosticsForPresentation(
  diagnostics: readonly Diagnostic[],
): DiagnosticPresentationGroup[] {
  const buckets = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.severity}\u0000${diagnostic.code}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(diagnostic);
    else buckets.set(key, [diagnostic]);
  }

  return [...buckets.values()].map((items) => ({
    code: items[0].code,
    severity: items[0].severity,
    occurrences: items.length,
    representative: items[0],
    methods: [
      ...new Set(
        items
          .map(({ method }) => method)
          .filter((method): method is NonNullable<Diagnostic['method']> =>
            Boolean(method),
          ),
      ),
    ],
    alphas: [
      ...new Set(
        items
          .map(({ alpha }) => alpha)
          .filter((alpha): alpha is number => alpha !== undefined),
      ),
    ].sort((left, right) => left - right),
    runIds: [...new Set(items.flatMap(({ runIds }) => runIds ?? []))],
    distinctMessages: new Set(items.map(({ message }) => message)).size,
  }));
}

function diagnosticGroupMetadata(
  group: DiagnosticPresentationGroup,
): string | null {
  if (group.occurrences === 1) {
    return diagnosticMetadata(group.representative);
  }

  const parts = [`records=${group.occurrences}`];
  if (group.methods.length > 0) parts.push(`methods=${group.methods.join(', ')}`);
  if (group.alphas.length > 0) {
    if (group.alphas.length <= 6) {
      parts.push(`alpha=${group.alphas.join(', ')}`);
    } else {
      parts.push(
        `alphaRange=${group.alphas[0]}-${group.alphas.at(-1)}`,
        `alphaLevels=${group.alphas.length}`,
      );
    }
  }
  if (group.runIds.length > 0) {
    parts.push(
      group.runIds.length <= 8
        ? `runs=${group.runIds.join(', ')}`
        : `uniqueRuns=${group.runIds.length}`,
    );
  }
  return parts.join(' | ');
}

function drawDiagnosticGroup(
  layout: PdfLayout,
  title: string,
  diagnostics: readonly Diagnostic[],
  color: PdfColor,
  lightColor: PdfColor,
): void {
  const groups = groupDiagnosticsForPresentation(diagnostics);
  const countLabel =
    groups.length === diagnostics.length
      ? `${diagnostics.length}`
      : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} / ${diagnostics.length} records`;
  ensureSpace(layout, 11, 'Diagnostics - continued');
  setFillColor(layout.doc, lightColor);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y, 182, 8, 1.1, 1.1, 'F');
  layout.doc.setFont('helvetica', 'bold');
  layout.doc.setFontSize(8.2);
  setTextColor(layout.doc, color);
  layout.doc.text(`${pdfSafe(title)} (${countLabel})`, PDF_LAYOUT.marginLeft + 3, layout.y + 5.3);
  layout.y += 11;

  if (groups.length === 0) {
    writeWrappedText(layout, 'None recorded.', {
      x: PDF_LAYOUT.marginLeft + 3,
      width: 176,
      color: PDF_COLORS.muted,
      continuationLabel: 'Diagnostics - continued',
      gapAfter: 4,
    });
    return;
  }

  groups.forEach((group, index) => {
    const message =
      group.distinctMessages === 1
        ? group.representative.message
        : `Multiple related findings were recorded. Representative: ${group.representative.message}`;
    writeWrappedText(layout, `${index + 1}. [${group.code}] ${message}`, {
      x: PDF_LAYOUT.marginLeft + 3,
      width: 176,
      fontSize: 8.2,
      continuationLabel: 'Diagnostics - continued',
      gapAfter: 0.8,
    });
    const metadata = diagnosticGroupMetadata(group);
    if (metadata) {
      writeWrappedText(layout, metadata, {
        x: PDF_LAYOUT.marginLeft + 8,
        width: 171,
        fontSize: 7.1,
        color: PDF_COLORS.muted,
        continuationLabel: 'Diagnostics - continued',
        gapAfter: 2.5,
      });
    } else {
      layout.y += 1.7;
    }
  });
  layout.y += 2;
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return `${sizeBytes} bytes`;
  if (sizeBytes < 1024) return `${sizeBytes} bytes`;
  if (sizeBytes < 1024 ** 2) return `${(sizeBytes / 1024).toFixed(1)} KiB (${sizeBytes} bytes)`;
  return `${(sizeBytes / 1024 ** 2).toFixed(2)} MiB (${sizeBytes} bytes)`;
}

function drawSourceFile(layout: PdfLayout, file: SourceFileTrace, index: number): void {
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(8.2);
  const nameLines = splitText(layout.doc, `${index + 1}. ${file.name}`, 174);
  layout.doc.setFont('courier', 'normal');
  layout.doc.setFontSize(6.8);
  const hashLines = splitText(layout.doc, `SHA-256 ${file.sha256}`, 174);
  const height = 9 + nameLines.length * lineHeightMm(8.2, 1.12) + hashLines.length * lineHeightMm(6.8, 1.12);
  ensureSpace(layout, height + 3, 'Traceability - source files continued');

  setFillColor(layout.doc, PDF_COLORS.panel);
  setDrawColor(layout.doc, PDF_COLORS.border);
  layout.doc.setLineWidth(0.22);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y, 182, height, 1.2, 1.2, 'FD');
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(8.2);
  setTextColor(layout.doc, PDF_COLORS.ink);
  layout.doc.text(nameLines, PDF_LAYOUT.marginLeft + 4, layout.y + 5, { lineHeightFactor: 1.12 });
  const sizeY = layout.y + 5 + nameLines.length * lineHeightMm(8.2, 1.12) + 1;
  layout.doc.setFontSize(7.1);
  setTextColor(layout.doc, PDF_COLORS.muted);
  layout.doc.text(formatFileSize(file.sizeBytes), PDF_LAYOUT.marginLeft + 4, sizeY);
  layout.doc.setFont('courier', 'normal');
  layout.doc.setFontSize(6.8);
  layout.doc.text(hashLines, PDF_LAYOUT.marginLeft + 4, sizeY + 3.8, { lineHeightFactor: 1.12 });
  layout.y += height + 3;
}

function drawLicensedSourceProvenance(
  layout: PdfLayout,
  provenance: LicensedSourceProvenance,
): void {
  drawSectionTitle(layout, 'Licensed source provenance');
  const lines = [
    `Example identifier: ${provenance.exampleId}`,
    `Citation: ${provenance.citation.label}`,
    `DOI: ${provenance.citation.doi}`,
    `Citation URL: ${provenance.citation.url}`,
    `License: ${provenance.license.identifier} - ${provenance.license.name}`,
    `License URL: ${provenance.license.url}`,
    `License scope: ${provenance.license.scope}`,
    `Source type: ${provenance.sourceType}`,
    `Printed precision: ${provenance.printedPrecision}`,
    `Rounding: ${provenance.rounding}`,
    `Separate dataset license: ${provenance.separateDatasetLicense.exists ? 'yes' : 'no'}`,
    `Separate dataset license identifier: ${provenance.separateDatasetLicense.identifier ?? 'none'}`,
    `Separate dataset license boundary: ${provenance.separateDatasetLicense.scope}`,
  ];
  lines.forEach((line) => writeWrappedText(layout, line, {
    fontSize: 7.7,
    continuationLabel: 'Licensed source provenance - continued',
    gapAfter: 0.8,
  }));
  const groups = [
    ['Extraction steps', provenance.extractionSteps],
    ['Transformation steps', provenance.transformationSteps],
    ['Claim limits', provenance.claimLimits],
  ] as const;
  groups.forEach(([label, entries]) => {
    writeWrappedText(layout, `${label}:`, {
      fontSize: 8,
      fontStyle: 'bold',
      continuationLabel: 'Licensed source provenance - continued',
      gapAfter: 0.5,
    });
    entries.forEach((entry, index) => writeWrappedText(layout, `${index + 1}. ${entry}`, {
      x: PDF_LAYOUT.marginLeft + 4,
      width: 178,
      fontSize: 7.5,
      continuationLabel: 'Licensed source provenance - continued',
      gapAfter: 0.7,
    }));
  });
  layout.y += 2;
}

function drawBoundaryCallout(layout: PdfLayout): void {
  const boundary = `Scientific boundary: ${APPARENT_EA_CLAIM_BOUNDARY}`;
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(8.1);
  const lines = splitText(layout.doc, boundary, 174);
  const height = 8 + lines.length * lineHeightMm(8.1, 1.18);
  ensureSpace(layout, height, 'Interpretation boundary');
  setFillColor(layout.doc, PDF_COLORS.tealLight);
  setDrawColor(layout.doc, PDF_COLORS.teal);
  layout.doc.setLineWidth(0.3);
  layout.doc.roundedRect(PDF_LAYOUT.marginLeft, layout.y, 182, height, 1.5, 1.5, 'FD');
  setFillColor(layout.doc, PDF_COLORS.teal);
  layout.doc.rect(PDF_LAYOUT.marginLeft, layout.y, 2.2, height, 'F');
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(8.1);
  setTextColor(layout.doc, PDF_COLORS.navy);
  layout.doc.text(lines, PDF_LAYOUT.marginLeft + 5, layout.y + 5.5, { lineHeightFactor: 1.18 });
  layout.y += height + 3;
}

function drawFooters(doc: jsPDF, report: ReproducibleProjectReport): void {
  const totalPages = doc.getNumberOfPages();
  const generated = pdfSafe(report.generatedAt).replace('T', ' ').replace('Z', ' UTC');
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    setDrawColor(doc, PDF_COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(PDF_LAYOUT.marginLeft, PDF_LAYOUT.footerRuleY, 210 - PDF_LAYOUT.marginRight, PDF_LAYOUT.footerRuleY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    setTextColor(doc, PDF_COLORS.muted);
    doc.text(`Activation Energy Studio ${report.application.version}`, PDF_LAYOUT.marginLeft, PDF_LAYOUT.footerTextY);
    doc.text(`Generated ${generated}`, 105, PDF_LAYOUT.footerTextY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    setTextColor(doc, PDF_COLORS.navy);
    doc.text(`Page ${page} / ${totalPages}`, 210 - PDF_LAYOUT.marginRight, PDF_LAYOUT.footerTextY, {
      align: 'right',
    });
  }
}

function deterministicPdfFileId(report: ReproducibleProjectReport): string {
  const serialized = JSON.stringify(report);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds
    .map((seed) => {
      let hash = seed >>> 0;
      for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('')
    .toUpperCase();
}

export function createPdfReport(report: ReproducibleProjectReport): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false });
  doc.setFileId(deterministicPdfFileId(report));
  doc.setProperties({
    title: `${report.context.projectName} - Activation Energy Report`,
    subject: 'Evidence-grounded apparent activation-energy analysis',
    author: 'Activation Energy Studio',
    creator: `Activation Energy Studio ${report.application.version}`,
  });
  doc.setCreationDate(new Date(report.generatedAt));
  const rows = report.results;

  setFillColor(doc, PDF_COLORS.navy);
  doc.rect(0, 0, 210, 31, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setTextColor(doc, PDF_COLORS.white);
  doc.text('Activation Energy Studio', PDF_LAYOUT.marginLeft, 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.text('Reproducible apparent activation-energy report', PDF_LAYOUT.marginLeft, 22);
  setFillColor(doc, PDF_COLORS.teal);
  doc.roundedRect(163, 10, 33, 10, 1.8, 1.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setTextColor(doc, PDF_COLORS.white);
  doc.text('LOCAL / OFFLINE', 179.5, 16.3, { align: 'center' });

  const layout: PdfLayout = { doc, y: 39 };
  const statusColor =
    report.analysis.status === 'success'
      ? PDF_COLORS.teal
      : report.analysis.status === 'refused'
        ? PDF_COLORS.red
        : PDF_COLORS.amber;
  drawKpiCards(layout, [
    { label: 'Analysis status', value: report.analysis.status.toUpperCase(), color: statusColor },
    { label: 'Numeric results', value: String(rows.length), color: PDF_COLORS.navy },
    {
      label: 'Heating rates',
      value: String(report.analysis.eligibility.distinctHeatingRates),
      color: PDF_COLORS.navy,
    },
  ]);

  drawSectionTitle(layout, 'Analysis summary');
  const methodNames = [
    ...report.analysis.methods.map((method) => method.method),
    ...(report.analysis.kissinger ? ['KISSINGER'] : []),
  ];
  drawSummaryGrid(layout, [
    { label: 'Project', value: report.context.projectName },
    { label: 'Generated', value: report.generatedAt },
    { label: 'Sample', value: report.context.sample ?? 'Not specified' },
    { label: 'Process', value: report.context.process ?? 'Not specified' },
    { label: 'Atmosphere', value: report.context.atmosphere ?? 'Not specified' },
    { label: 'Stage', value: report.context.stage ?? 'Not specified' },
    {
      label: 'Common alpha range',
      value: report.analysis.eligibility.commonAlphaRange?.join(' - ') ?? 'Not established',
    },
    { label: 'Methods represented', value: methodNames.join(', ') || 'None' },
    {
      label: 'Software',
      value: `${report.application.name} ${report.application.version}`,
    },
    { label: 'Computation', value: 'Offline in the local browser' },
  ]);

  drawEligibilitySummary(layout, report);

  drawResultsTable(
    layout,
    rows.filter((row) => row.resultType === 'isoconversional'),
  );
  drawEaCurve(layout, rows);
  drawRegressionDiagnostic(layout, report);
  drawKissingerSection(layout, rows);
  drawInputAndPreprocessing(layout, report);

  drawSectionTitle(layout, 'Diagnostics');
  drawDiagnosticGroup(
    layout,
    'Refusals',
    report.analysis.refusals,
    PDF_COLORS.red,
    PDF_COLORS.redLight,
  );
  drawDiagnosticGroup(
    layout,
    'Warnings',
    report.analysis.warnings,
    PDF_COLORS.amber,
    PDF_COLORS.amberLight,
  );

  if (report.context.analystNote) {
    drawSectionTitle(layout, 'Analyst note');
    writeWrappedText(layout, report.context.analystNote, {
      continuationLabel: 'Analyst note - continued',
      gapAfter: 5,
    });
  }

  if (report.context.licensedSourceProvenance) {
    drawLicensedSourceProvenance(layout, report.context.licensedSourceProvenance);
  }

  drawSectionTitle(layout, 'Traceability');
  const formulaLines = [
    ...report.analysis.methods.map(
      (method) => `${method.method}: ${method.formulaId} (${method.status})`,
    ),
    ...(report.analysis.kissinger
      ? [
          `KISSINGER: ${report.analysis.kissinger.formulaId} (${report.analysis.kissinger.status})`,
        ]
      : []),
  ];
  writeWrappedText(layout, `Schema: ${report.schemaVersion}`, {
    fontSize: 7.7,
    color: PDF_COLORS.muted,
    continuationLabel: 'Traceability - continued',
    gapAfter: 0.8,
  });
  writeWrappedText(
    layout,
    `Gas constant: ${report.analysis.constants.gasConstantJPerMolK} J mol^-1 K^-1`,
    {
      fontSize: 7.7,
      color: PDF_COLORS.muted,
      continuationLabel: 'Traceability - continued',
      gapAfter: 2.5,
    },
  );
  writeWrappedText(layout, 'Formula identifiers:', {
    fontSize: 8.2,
    fontStyle: 'bold',
    continuationLabel: 'Traceability - continued',
    gapAfter: 1,
  });
  if (formulaLines.length === 0) {
    writeWrappedText(layout, 'No method formula was executed.', {
      x: PDF_LAYOUT.marginLeft + 4,
      width: 178,
      color: PDF_COLORS.muted,
      continuationLabel: 'Traceability - continued',
      gapAfter: 3,
    });
  } else {
    formulaLines.forEach((line) =>
      writeWrappedText(layout, `- ${line}`, {
        x: PDF_LAYOUT.marginLeft + 4,
        width: 178,
        fontSize: 7.7,
        continuationLabel: 'Traceability - continued',
        gapAfter: 0.7,
      }),
    );
    layout.y += 2;
  }

  writeWrappedText(layout, `Source files (${report.context.sourceFiles.length}):`, {
    fontSize: 8.2,
    fontStyle: 'bold',
    continuationLabel: 'Traceability - source files',
    gapAfter: 1.5,
  });
  if (report.context.sourceFiles.length === 0) {
    writeWrappedText(layout, 'No source file trace was recorded.', {
      x: PDF_LAYOUT.marginLeft + 4,
      width: 178,
      color: PDF_COLORS.muted,
      continuationLabel: 'Traceability - source files',
      gapAfter: 4,
    });
  } else {
    report.context.sourceFiles.forEach((file, index) => drawSourceFile(layout, file, index));
  }
  drawBoundaryCallout(layout);
  drawFooters(doc, report);

  return doc.output('blob');
}

export async function hashFile(file: File): Promise<SourceFileTrace> {
  const { sourceFileId, sha256 } = await hashSourceFile(file);
  return {
    sourceFileId,
    name: file.name,
    sizeBytes: file.size,
    sha256,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers start reading the object URL after the click handler returns.
  // A delayed cleanup avoids revoking it before the download stream is opened.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}
