import { useEffect, useMemo, useRef, useState } from 'react';

import { resolveAlphaGrid } from './alphaGrid';
import {
  analyzeActivationEnergy,
  type ActivationEnergyAnalysis,
  type IsoConversionalMethod,
} from './core';
import {
  ingestThermalFiles,
  type BatchIngestionResult,
  type IngestionOptions,
} from './io';
import { buildThermalRuns, type AdapterDiagnostic, type StageWindow } from './integration';
import {
  REGRESSION_CI_CLAIM_BOUNDARY,
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  downloadBlob,
  downloadText,
  flattenResults,
  hashFile,
  resolveReportStageLabel,
  serializeProjectReport,
} from './report';
import { DiagnosticsList, type DisplayDiagnostic } from './components/DiagnosticsList';
import { EaChart, type ChartSeries } from './components/EaChart';
import { CurvePreview } from './components/CurvePreview';
import { MappingWizard } from './components/MappingWizard';
import { PlatformSelfTestPanel } from './components/PlatformSelfTestPanel';
import { PublishingPanel } from './components/PublishingPanel';
import { ResearchSummary } from './components/ResearchSummary';
import { ScientificResultsTable } from './components/ScientificResultsTable';
import { diagnosticMessage } from './diagnostics/en';
import {
  REAL_EXAMPLES,
  buildLicensedExampleProvenance,
  createRealExampleSession,
  type RealExampleId,
} from './examples/catalog';
import { suggestDeviceProfile } from './io/deviceProfiles';
import {
  assessScientificDisposition,
  publicationDecisionNote,
  scientificDispositionLabel,
  type ScientificDispositionAssessment,
  type ScientificDisposition,
} from './product/disposition';
import syntheticKasExample from '../examples/synthetic_kas_150.csv?raw';

const METHOD_COLORS: Record<string, string> = {
  FWO: '#075f4e',
  KAS: '#285b8d',
  STARINK: '#9a5b12',
  FRIEDMAN: '#8d3a69',
};

const METHOD_EXPLANATIONS = [
  { name: 'FWO/OFW', key: 'FWO', detail: 'Fixed alpha, multiple rates; Doyle approximation' },
  { name: 'KAS', key: 'KAS', detail: 'Fixed alpha, multiple rates; integral method' },
  { name: 'Starink', key: 'STARINK', detail: 'Fixed alpha; improved integral approximation' },
  { name: 'Friedman', key: 'FRIEDMAN', detail: 'Differential method when derivative quality is adequate' },
  { name: 'Kissinger', key: 'KISSINGER', detail: 'Separate peak result only with explicit beta–Tp data' },
];

const DEFAULT_PROJECT_NAME = 'New activation-energy analysis';
const DEFAULT_ALPHA_START = '0.10';
const DEFAULT_ALPHA_END = '0.90';
const DEFAULT_ALPHA_STEP = '0.10';
const DEFAULT_MIN_R2_WARNING = '0.98';
const DEFAULT_METHODS: readonly IsoConversionalMethod[] = [
  'FWO',
  'KAS',
  'STARINK',
  'FRIEDMAN',
];

type ExperienceMode = 'simple' | 'expert';

interface CommittedDatasetRevision {
  revision: number;
  mappingRevision: number;
  exampleId: RealExampleId | null;
  files: readonly File[];
  ingestion: BatchIngestionResult;
  mappingOptions: readonly IngestionOptions[];
}

function dispositionLabel(disposition: ScientificDisposition | undefined): string {
  if (!disposition) return 'Waiting';
  return scientificDispositionLabel(disposition);
}

function dispositionTone(
  disposition: ScientificDisposition | undefined,
): 'ok' | 'warning' | 'error' {
  if (disposition === 'REPORTABLE') return 'ok';
  if (disposition === 'REPORTABLE_WITH_CAUTION' || !disposition) return 'warning';
  return 'error';
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function numeric(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sameNumericGrid(
  left: readonly number[] | undefined,
  right: readonly number[],
): boolean {
  return left !== undefined
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

type StageWindowInput =
  | { status: 'absent' }
  | { status: 'valid'; value: StageWindow }
  | { status: 'invalid'; message: string };

function resolveStageWindowInput(
  start: string,
  end: string,
): StageWindowInput {
  const hasStart = start.trim() !== '';
  const hasEnd = end.trim() !== '';
  if (!hasStart && !hasEnd) return { status: 'absent' };
  if (!hasStart || !hasEnd) {
    return {
      status: 'invalid',
      message: 'Enter both the start and end temperatures for the stage window.',
    };
  }
  const startCelsius = numeric(start);
  const endCelsius = numeric(end);
  if (
    startCelsius === undefined
    || endCelsius === undefined
    || startCelsius >= endCelsius
  ) {
    return {
      status: 'invalid',
      message: 'Stage start and end must be finite numbers, with start lower than end.',
    };
  }
  return { status: 'valid', value: { startCelsius, endCelsius } };
}

function ingestionDiagnostics(
  batch: BatchIngestionResult | null,
): DisplayDiagnostic[] {
  if (!batch) return [];
  return batch.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnosticMessage(diagnostic.code, diagnostic.message),
    severity: diagnostic.severity === 'error' ? 'error' : diagnostic.severity,
  }));
}

function adapterDiagnostics(
  items: AdapterDiagnostic[],
): DisplayDiagnostic[] {
  return items.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnosticMessage(diagnostic.code, diagnostic.message),
    severity: diagnostic.severity,
  }));
}

function analysisDiagnostics(
  analysis: ActivationEnergyAnalysis | null,
): DisplayDiagnostic[] {
  if (!analysis) return [];
  return [
    ...analysis.refusals.map((item) => ({
      code: item.code,
      message: diagnosticMessage(item.code, item.message),
      severity: 'error' as const,
    })),
    ...analysis.warnings.map((item) => ({
      code: item.code,
      message: diagnosticMessage(item.code, item.message),
      severity: 'warning' as const,
    })),
  ];
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const asyncOperationRevision = useRef(0);
  const mappingEditRevision = useRef(0);
  const reportInputRevision = useRef(0);
  const datasetInputOrigin = useRef<
    'empty' | 'custom-upload' | 'synthetic-example' | 'licensed-example'
  >('empty');
  const committedDataset = useRef<CommittedDatasetRevision | null>(null);
  const analysisDatasetRevision = useRef<number | null>(null);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('simple');
  const [activeExampleId, setActiveExampleId] = useState<RealExampleId | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [ingestion, setIngestion] = useState<BatchIngestionResult | null>(null);
  const [mappingOptions, setMappingOptions] = useState<IngestionOptions[]>([]);
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [analysis, setAnalysis] = useState<ActivationEnergyAnalysis | null>(null);
  const [analysisStage, setAnalysisStage] = useState<string | null>(null);
  const [analysisAttempted, setAnalysisAttempted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [processName, setProcessName] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [stageStart, setStageStart] = useState('');
  const [stageEnd, setStageEnd] = useState('');
  const [alphaStart, setAlphaStart] = useState(DEFAULT_ALPHA_START);
  const [alphaEnd, setAlphaEnd] = useState(DEFAULT_ALPHA_END);
  const [alphaStep, setAlphaStep] = useState(DEFAULT_ALPHA_STEP);
  const [selectedMethods, setSelectedMethods] = useState<IsoConversionalMethod[]>([
    ...DEFAULT_METHODS,
  ]);
  const [includeKissinger, setIncludeKissinger] = useState(true);
  const [minR2Warning, setMinR2Warning] = useState(DEFAULT_MIN_R2_WARNING);
  const [interpretationConfirmed, setInterpretationConfirmed] = useState(false);
  const [adapterIssues, setAdapterIssues] = useState<AdapterDiagnostic[]>([]);
  const [selectionIssues, setSelectionIssues] = useState<DisplayDiagnostic[]>([]);
  const [committedDatasetRevision, setCommittedDatasetRevision] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = 'Activation Energy Studio · Research Preview';
  }, []);

  const stageWindowInput = useMemo(
    () => resolveStageWindowInput(stageStart, stageEnd),
    [stageEnd, stageStart],
  );
  const stageWindow =
    stageWindowInput.status === 'valid' ? stageWindowInput.value : undefined;
  const configuredStage = useMemo(
    () => resolveReportStageLabel({
      explicitLabel: stageLabel,
      stageWindow,
      hasSuppliedAlpha: false,
    }),
    [stageLabel, stageWindow],
  );

  const alphaGrid = useMemo(
    () => resolveAlphaGrid(alphaStart, alphaEnd, alphaStep),
    [alphaEnd, alphaStart, alphaStep],
  );
  const minR2Value = numeric(minR2Warning);
  const minR2Valid =
    minR2Value !== undefined
    && minR2Value >= 0
    && minR2Value <= 1;
  const wideProjectionStale = useMemo(() => {
    if (alphaGrid.status !== 'valid' || ingestion?.status !== 'ready') return false;
    return mappingOptions.some((options) => (
      options.layout === 'wide-series'
      && (options.wideSeries?.length ?? 0) > 0
      && !sameNumericGrid(options.wideAlphaGrid, alphaGrid.values)
    ));
  }, [alphaGrid, ingestion?.status, mappingOptions]);

  const workflowDiagnostics = useMemo(
    () => [
      ...selectionIssues,
      ...ingestionDiagnostics(ingestion),
      ...adapterDiagnostics(adapterIssues),
    ],
    [adapterIssues, ingestion, selectionIssues],
  );

  const resultDiagnostics = useMemo(
    () => analysisDiagnostics(analysis),
    [analysis],
  );

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!analysis) return [];
    return analysis.methods
      .filter((method) => method.estimates.length > 0)
      .map((method) => ({
        name: method.method,
        color: METHOD_COLORS[method.method] ?? '#334155',
        points: method.estimates.map((estimate) => ({
          x: estimate.alpha,
          y: estimate.activationEnergyKJPerMol,
        })),
      }));
  }, [analysis]);

  const isoconversionalPointCount = analysis?.methods.reduce(
    (count, method) => count + method.estimates.length,
    0,
  ) ?? 0;
  const scientificDisposition = useMemo(
    () => (
      analysis && alphaGrid.status === 'valid' && minR2Valid
        ? assessScientificDisposition(analysis, {
            alphaGrid: alphaGrid.values,
            minimumReportableR2: minR2Value,
          })
        : null
    ),
    [alphaGrid, analysis, minR2Valid, minR2Value],
  );
  const visibleResultRows = useMemo(() => {
    if (!analysis) return [];
    return flattenResults(
      analysis,
      {},
      {
        ...(alphaGrid.status === 'valid' ? { alphaGrid: alphaGrid.values } : {}),
        ...(minR2Valid ? { minR2Warning: minR2Value } : {}),
      },
    );
  }, [alphaGrid, analysis, minR2Valid, minR2Value]);
  const kissingerEa = analysis?.kissinger?.activationEnergyKJPerMol;
  const sampleContext = [...new Set(
    (ingestion?.records ?? []).map(({ sample }) => sample).filter((value): value is string => Boolean(value)),
  )];
  const atmosphereContext = [...new Set(
    (ingestion?.records ?? []).map(({ atmosphere }) => atmosphere).filter((value): value is string => Boolean(value)),
  )];
  const stageContext = [...new Set([
    ...(ingestion?.records ?? []).map(({ stage }) => stage),
    ...(ingestion?.tables.betaTp ?? []).map(({ stage }) => stage),
  ].filter((value): value is string => Boolean(value?.trim())))];
  const runIds = [...new Set((ingestion?.records ?? []).map(({ runId }) => runId))];
  const heatingRates = [...new Set(
    (ingestion?.records ?? [])
      .map(({ heatingRateKPerMin }) => heatingRateKPerMin)
      .filter((value): value is number => Number.isFinite(value)),
  )].sort((left, right) => left - right);
  const hasSuppliedDerivative = (ingestion?.records ?? [])
    .some(({ dAlphaDtPerMinute }) => Number.isFinite(dAlphaDtPerMinute));
  const hasDirectAlpha = (ingestion?.records ?? [])
    .some(({ alpha }) => Number.isFinite(alpha));
  const hasMassSignal = (ingestion?.records ?? [])
    .some(({ massMg, massPercent }) => Number.isFinite(massMg) || Number.isFinite(massPercent));
  const requiresStageWindow = hasMassSignal && !hasDirectAlpha;
  const stageIdentityReady =
    stageContext.length === 1
    || stageLabel.trim().length > 0
    || stageWindowInput.status === 'valid';
  const interpretationReady =
    ingestion?.status === 'ready'
    && committedDatasetRevision !== null
    && !mappingDirty
    && alphaGrid.status === 'valid'
    && minR2Valid
    && stageWindowInput.status !== 'invalid'
    && stageIdentityReady
    && (!requiresStageWindow || stageWindowInput.status === 'valid');
  const deviceProfileSuggestions = useMemo(
    () => (ingestion?.files ?? []).map((file) => ({
      fileName: file.source.fileName,
      suggestion: suggestDeviceProfile(file),
    })),
    [ingestion],
  );

  function invalidateCommittedDataset(): void {
    committedDataset.current = null;
    setCommittedDatasetRevision(null);
  }

  function advanceReportInputRevision(): void {
    reportInputRevision.current += 1;
  }

  function resetDatasetSpecificInputs(): void {
    setProjectName(DEFAULT_PROJECT_NAME);
    setProcessName('');
    setStageLabel('');
    setStageStart('');
    setStageEnd('');
    setAlphaStart(DEFAULT_ALPHA_START);
    setAlphaEnd(DEFAULT_ALPHA_END);
    setAlphaStep(DEFAULT_ALPHA_STEP);
    setSelectedMethods([...DEFAULT_METHODS]);
    setIncludeKissinger(true);
    setMinR2Warning(DEFAULT_MIN_R2_WARNING);
  }

  function beginAsyncOperation(): number {
    const revision = asyncOperationRevision.current + 1;
    asyncOperationRevision.current = revision;
    setIsBusy(true);
    return revision;
  }

  function finishAsyncOperation(revision: number): void {
    if (asyncOperationRevision.current === revision) setIsBusy(false);
  }

  function commitDatasetRevision(
    revision: number,
    exampleId: RealExampleId | null,
    nextFiles: readonly File[],
    nextIngestion: BatchIngestionResult,
    nextMappingOptions: readonly IngestionOptions[],
  ): void {
    const snapshot: CommittedDatasetRevision = {
      revision,
      mappingRevision: mappingEditRevision.current,
      exampleId,
      files: [...nextFiles],
      ingestion: nextIngestion,
      mappingOptions: [...nextMappingOptions],
    };
    committedDataset.current = snapshot;
    setIngestion(nextIngestion);
    setCommittedDatasetRevision(revision);
  }

  async function acceptFiles(
    nextFiles: File[],
    source: 'custom-upload' | 'synthetic-example' = 'custom-upload',
  ) {
    const operationRevision = asyncOperationRevision.current + 1;
    asyncOperationRevision.current = operationRevision;
    mappingEditRevision.current += 1;
    advanceReportInputRevision();
    invalidateCommittedDataset();
    analysisDatasetRevision.current = null;
    if (source === 'custom-upload') {
      const followsExample =
        datasetInputOrigin.current === 'synthetic-example'
        || datasetInputOrigin.current === 'licensed-example';
      setActiveExampleId(null);
      if (followsExample) resetDatasetSpecificInputs();
    }
    const supported = nextFiles.filter((file) => /\.(csv|tsv|txt|xlsx)$/i.test(file.name));
    const unsupported = nextFiles.filter((file) => !/\.(csv|tsv|txt|xlsx)$/i.test(file.name));
    if (unsupported.length > 0) {
      datasetInputOrigin.current = 'empty';
      setFiles([]);
      setMappingOptions([]);
      setMappingEditorOpen(false);
      setMappingDirty(false);
      setIngestion(null);
      setAnalysis(null);
      setAnalysisStage(null);
      setAnalysisAttempted(false);
      setInterpretationConfirmed(false);
      setAdapterIssues([]);
      setIsBusy(false);
      setSelectionIssues([{
        code: 'unsupported_file_type',
        severity: 'error',
        message: `${diagnosticMessage('unsupported_file_type', 'Unsupported file type.')} File: ${unsupported.map(({ name }) => name).join(', ')}`,
      }]);
      return;
    }
    setSelectionIssues([]);
    datasetInputOrigin.current = source;
    setActiveExampleId(null);
    setFiles(supported);
    const emptyOptions = supported.map(() => ({}));
    setMappingOptions(emptyOptions);
    setMappingEditorOpen(false);
    setMappingDirty(false);
    setAnalysis(null);
    setAnalysisStage(null);
    setAnalysisAttempted(false);
    setInterpretationConfirmed(false);
    setAdapterIssues([]);
    setIngestion(null);
    if (supported.length === 0) {
      setIsBusy(false);
      return;
    }
    setIsBusy(true);
    try {
      const nextIngestion = await ingestThermalFiles(supported, emptyOptions);
      if (asyncOperationRevision.current !== operationRevision) return;
      commitDatasetRevision(operationRevision, null, supported, nextIngestion, emptyOptions);
    } finally {
      finishAsyncOperation(operationRevision);
    }
  }

  function loadSyntheticExample() {
    advanceReportInputRevision();
    resetDatasetSpecificInputs();
    setActiveExampleId(null);
    setProjectName('Synthetic KAS 150 kJ/mol example');
    setProcessName('synthetic thermal decomposition');
    setStageLabel('synthetic single-stage decomposition');
    setStageStart('');
    setStageEnd('');
    void acceptFiles([
      new File([syntheticKasExample], 'synthetic-kas-150.csv', {
        type: 'text/csv',
        lastModified: 0,
      }),
    ], 'synthetic-example');
  }

  async function loadRealExample(id: RealExampleId) {
    const session = createRealExampleSession(id);
    const { definition } = session;
    const operationRevision = beginAsyncOperation();
    mappingEditRevision.current += 1;
    advanceReportInputRevision();
    invalidateCommittedDataset();
    analysisDatasetRevision.current = null;
    resetDatasetSpecificInputs();
    datasetInputOrigin.current = 'licensed-example';
    setActiveExampleId(id);
    setProjectName(definition.project);
    setProcessName(definition.process);
    // The embedded rows/options already carry the source-locked stage label.
    // Do not overwrite it with the more readable catalogue description.
    setStageLabel('');
    setStageStart('');
    setStageEnd('');
    if (
      definition.alphaStart !== null
      && definition.alphaEnd !== null
      && definition.alphaStep !== null
    ) {
      setAlphaStart(definition.alphaStart.toFixed(2));
      setAlphaEnd(definition.alphaEnd.toFixed(2));
      setAlphaStep(definition.alphaStep.toFixed(2));
    }
    setSelectedMethods(
      definition.methods.filter(
        (method): method is IsoConversionalMethod => method !== 'KISSINGER',
      ),
    );
    setIncludeKissinger(definition.methods.includes('KISSINGER'));
    setFiles(session.files);
    setMappingOptions(session.options);
    setMappingEditorOpen(false);
    setMappingDirty(false);
    setIngestion(null);
    setAnalysis(null);
    setAnalysisStage(null);
    setAnalysisAttempted(false);
    setInterpretationConfirmed(false);
    setAdapterIssues([]);
    setSelectionIssues([]);
    try {
      const nextIngestion = await ingestThermalFiles(session.files, session.options);
      if (asyncOperationRevision.current !== operationRevision) return;
      commitDatasetRevision(
        operationRevision,
        id,
        session.files,
        nextIngestion,
        session.options,
      );
    } finally {
      finishAsyncOperation(operationRevision);
    }
  }

  function updateMappingOptions(fileIndex: number, options: IngestionOptions) {
    mappingEditRevision.current += 1;
    invalidateCommittedDataset();
    setMappingOptions((current) => {
      const next = [...current];
      next[fileIndex] = options;
      return next;
    });
    setMappingDirty(true);
    setInterpretationConfirmed(false);
    invalidateConfiguredAnalysis();
  }

  async function applyMapping() {
    if (files.length === 0) return;
    const hasWideSeries = mappingOptions.some((options) => options.layout === 'wide-series');
    if (hasWideSeries && alphaGrid.status !== 'valid') {
      setSelectionIssues([{
        code: alphaGrid.code,
        severity: 'error',
        message: `${alphaGrid.message} The wide-series projection cannot be refreshed without a valid alpha grid.`,
      }]);
      return;
    }
    const appliedOptions = mappingOptions.map((options) => (
      options.layout === 'wide-series' && alphaGrid.status === 'valid'
        ? { ...options, wideAlphaGrid: [...alphaGrid.values] }
        : options
    ));
    const submittedFiles = [...files];
    const submittedMappingRevision = mappingEditRevision.current;
    const operationRevision = beginAsyncOperation();
    invalidateCommittedDataset();
    setMappingOptions(appliedOptions);
    setAnalysis(null);
    analysisDatasetRevision.current = null;
    setAnalysisStage(null);
    setAnalysisAttempted(false);
    setAdapterIssues([]);
    setSelectionIssues([]);
    try {
      const nextIngestion = await ingestThermalFiles(submittedFiles, appliedOptions);
      if (
        asyncOperationRevision.current !== operationRevision
        || mappingEditRevision.current !== submittedMappingRevision
      ) return;
      commitDatasetRevision(
        operationRevision,
        activeExampleId,
        submittedFiles,
        nextIngestion,
        appliedOptions,
      );
      setMappingEditorOpen(false);
      setMappingDirty(false);
      setInterpretationConfirmed(false);
    } finally {
      finishAsyncOperation(operationRevision);
    }
  }

  function runAnalysis() {
    const dataset = committedDataset.current;
    if (
      !ingestion
      || !dataset
      || dataset.revision !== committedDatasetRevision
      || dataset.ingestion !== ingestion
      || mappingDirty
      || !interpretationConfirmed
    ) return;
    analysisDatasetRevision.current = null;
    setAnalysisAttempted(true);
    if (stageWindowInput.status === 'invalid') {
      setAnalysis(null);
      setAnalysisStage(null);
      setAdapterIssues([{
        severity: 'error',
        code: 'INVALID_STAGE_WINDOW',
        message: stageWindowInput.message,
      }]);
      return;
    }
    if (alphaGrid.status !== 'valid') {
      setAnalysis(null);
      setAnalysisStage(null);
      setSelectionIssues([{
        code: alphaGrid.code,
        severity: 'error',
        message: alphaGrid.message,
      }]);
      return;
    }
    const hasConfiguredKissinger =
      includeKissinger && ingestion.tables.betaTp.length >= 3;
    if (
      !minR2Valid
      || (selectedMethods.length === 0 && !hasConfiguredKissinger)
    ) {
      setAnalysis(null);
      setAnalysisStage(null);
      setSelectionIssues([{
        code: !minR2Valid ? 'INVALID_R2_THRESHOLD' : 'NO_METHOD_SELECTED',
        severity: 'error',
        message: !minR2Valid
          ? 'The R² warning threshold must be a finite number between 0 and 1.'
          : 'Select at least one isoconversional method or load a Kissinger-only table.',
      }]);
      return;
    }
    if (wideProjectionStale) {
      setAnalysis(null);
      setAnalysisStage(null);
      setSelectionIssues([{
        code: 'WIDE_ALPHA_GRID_STALE',
        severity: 'error',
        message:
          'Wide-series records were generated with the previous alpha grid. Re-read the projection with the current grid before calculating.',
      }]);
      return;
    }
    setSelectionIssues((current) => current.filter(
      ({ code }) => (
        !String(code).startsWith('ALPHA_GRID_')
        && code !== 'WIDE_ALPHA_GRID_STALE'
      ),
    ));
    const adapted = buildThermalRuns(ingestion, stageWindow, configuredStage);
    setAdapterIssues(adapted.diagnostics);
    const hasAdapterError = adapted.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error',
    );
    if (
      hasAdapterError
      || (adapted.runs.length === 0 && adapted.kissingerPeaks.length === 0)
    ) {
      setAnalysis(null);
      setAnalysisStage(null);
      return;
    }
    const nextAnalysis = analyzeActivationEnergy(adapted.runs, {
        alphaValues: alphaGrid.values,
        methods:
          adapted.runs.length === 0
            ? []
            : selectedMethods,
        includeKissinger: includeKissinger && adapted.kissingerPeaks.length >= 3,
        kissingerPeaks: adapted.kissingerPeaks,
        minR2Warning: minR2Value,
      });
    const boundStages = [
      ...adapted.runs.map((run) => run.stage?.trim()),
      ...adapted.kissingerPeaks.map((peak) => peak.stage?.trim()),
    ].filter((stage): stage is string => Boolean(stage));
    const uniqueBoundStages = [...new Set(boundStages)];
    setAnalysis(nextAnalysis);
    analysisDatasetRevision.current = dataset.revision;
    setAnalysisStage(uniqueBoundStages.length === 1 ? uniqueBoundStages[0] : null);
  }

  function invalidateConfiguredAnalysis() {
    advanceReportInputRevision();
    analysisDatasetRevision.current = null;
    setAnalysis(null);
    setAnalysisStage(null);
    setAnalysisAttempted(false);
    setInterpretationConfirmed(false);
    setSelectionIssues((current) => current.filter(
      ({ code }) => (
        !String(code).startsWith('ALPHA_GRID_')
        && code !== 'WIDE_ALPHA_GRID_STALE'
      ),
    ));
  }

  function clearFiles() {
    asyncOperationRevision.current += 1;
    mappingEditRevision.current += 1;
    advanceReportInputRevision();
    invalidateCommittedDataset();
    analysisDatasetRevision.current = null;
    setActiveExampleId(null);
    datasetInputOrigin.current = 'empty';
    setFiles([]);
    setIngestion(null);
    setMappingOptions([]);
    setMappingEditorOpen(false);
    setMappingDirty(false);
    setAnalysis(null);
    setAnalysisStage(null);
    setAnalysisAttempted(false);
    setInterpretationConfirmed(false);
    setAdapterIssues([]);
    setSelectionIssues([]);
    resetDatasetSpecificInputs();
    setIsBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function exportReport(kind: 'json' | 'csv' | 'pdf') {
    const dataset = committedDataset.current;
    if (
      mappingDirty
      || !interpretationConfirmed
      || !analysis
      || !analysisStage
      || !dataset
      || dataset.revision !== committedDatasetRevision
      || dataset.mappingRevision !== mappingEditRevision.current
      || analysisDatasetRevision.current !== dataset.revision
      || alphaGrid.status !== 'valid'
      || !minR2Valid
    ) return;
    const operationRevision = beginAsyncOperation();
    const exportMappingRevision = mappingEditRevision.current;
    const exportReportInputRevision = reportInputRevision.current;
    const exportSnapshot = {
      analysis,
      analysisStage,
      projectName,
      processName,
      scientificDisposition,
      stageWindow: stageWindow ? { ...stageWindow } : undefined,
      alphaGrid: [...alphaGrid.values],
      selectedMethods: [...selectedMethods],
      includeKissinger,
      minR2Warning: minR2Value,
    } as const;
    try {
      const traces = await Promise.all(dataset.files.map(hashFile));
      if (
        asyncOperationRevision.current !== operationRevision
        || committedDataset.current !== dataset
        || mappingEditRevision.current !== exportMappingRevision
        || analysisDatasetRevision.current !== dataset.revision
      ) return;
      if (reportInputRevision.current !== exportReportInputRevision) {
        setSelectionIssues((current) => [
          ...current.filter(({ code }) => code !== 'EXPORT_INPUTS_CHANGED'),
          {
            code: 'EXPORT_INPUTS_CHANGED',
            severity: 'warning',
            message:
              'The export was cancelled because report metadata or scientific settings changed while source files were being hashed. Review the current values and export again.',
          },
        ]);
        return;
      }
      const firstRecord = dataset.ingestion.records[0];
      const licensedExample = dataset.exampleId
        ? REAL_EXAMPLES.find(({ id }) => id === dataset.exampleId)
        : undefined;
      const report = createProjectReport(exportSnapshot.analysis, {
        projectName: exportSnapshot.projectName,
        process: exportSnapshot.processName || undefined,
        sample: firstRecord?.sample,
        atmosphere: firstRecord?.atmosphere,
        stage: exportSnapshot.analysisStage,
        analystNote: exportSnapshot.scientificDisposition
          ? publicationDecisionNote(exportSnapshot.scientificDisposition)
          : undefined,
        sourceFiles: traces,
        licensedSourceProvenance: licensedExample
          ? buildLicensedExampleProvenance(licensedExample)
          : undefined,
      }, {
        ingestion: dataset.ingestion,
        ingestionOptions: dataset.mappingOptions,
        stageWindow: exportSnapshot.stageWindow,
        analysisConfiguration: {
          alphaGrid: exportSnapshot.alphaGrid,
          methods: exportSnapshot.selectedMethods,
          includeKissinger:
            exportSnapshot.includeKissinger && dataset.ingestion.tables.betaTp.length >= 3,
          minR2Warning: exportSnapshot.minR2Warning,
        },
      });
      const stem = exportSnapshot.projectName.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'activation-energy';
      if (kind === 'json') {
        downloadText(serializeProjectReport(report), `${stem}.json`, 'application/json;charset=utf-8');
      } else if (kind === 'csv') {
        downloadText(createResultsCsv(report), `${stem}-results.csv`, 'text/csv;charset=utf-8');
      } else {
        downloadBlob(createPdfReport(report), `${stem}-report.pdf`);
      }
    } finally {
      finishAsyncOperation(operationRevision);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">Ea</div>
          <div className="brand-copy">
            <strong>Activation Energy Studio</strong>
            <span>
              {'v0.3.2 · research preview'}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="segmented-control" aria-label={'Experience mode'}>
            <button
              aria-pressed={experienceMode === 'simple'}
              className={experienceMode === 'simple' ? 'active' : ''}
              data-testid="simple-mode"
              onClick={() => setExperienceMode('simple')}
              type="button"
            >
              {'Simple mode'}
            </button>
            <button
              aria-pressed={experienceMode === 'expert'}
              className={experienceMode === 'expert' ? 'active' : ''}
              data-testid="expert-mode"
              onClick={() => setExperienceMode('expert')}
              type="button"
            >
              {'Expert mode'}
            </button>
          </div>
          <div className="privacy-pill">
            <span className="privacy-dot" />
            <span>{'Offline · your data stays local'}</span>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <p className="eyebrow">
              {'Three main steps · assumptions stay visible · one offline HTML'}
            </p>
            <h1>
              {'Upload the data. '}
              <em>{'Know what can be reported.'}</em>
            </h1>
            <p className="hero-copy">
              {'The software first shows how it understood the file. Only after you confirm the mapping, stage, and anchors does it carry scientifically bounded results into the report.'}
            </p>
          </div>
          <aside className="hero-note">
            <strong>{'Research preview boundary'}</strong>
            <p>
              {'Ea is apparent and conditional, not a universal material constant or proof of mechanism. Kissinger peak Ea cannot replace Ea(α).'}
            </p>
          </aside>
        </section>

        <nav className="workflow-rail" aria-label={'Three-step workflow'}>
          <a href="#step-upload"><strong>1</strong><span>{'Upload file'}</span></a>
          <a href="#step-review"><strong>2</strong><span>{'Review and confirm'}</span></a>
          <a href="#step-results"><strong>3</strong><span>{'Calculate and download'}</span></a>
        </nav>

        <section className="workspace-grid">
          <article className="card" id="step-upload">
            <div className="card-header">
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <span className="step-index">1</span>
                <div>
                  <h2>{'Thermal-analysis files'}</h2>
                  <p>
                    {'CSV, TSV, TXT, or XLSX for one sample and stage. Multiple files are supported.'}
                  </p>
                </div>
              </div>
              {files.length > 0 && (
                <button className="ghost-button" data-testid="clear-files" onClick={clearFiles}>
                  {'Clear'}
                </button>
              )}
            </div>

            <div
              className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void acceptFiles([...event.dataTransfer.files]);
              }}
            >
              <input
                ref={fileInput}
                data-testid="thermal-file-input"
                type="file"
                multiple
                accept=".csv,.tsv,.txt,.xlsx"
                onChange={(event) => void acceptFiles([...(event.target.files ?? [])])}
              />
              <div className="drop-icon">↥</div>
              <h3>{'Drop files here'}</h3>
              <p>
                {'The software proposes mappings and never silently accepts a column it cannot trust.'}
              </p>
              <div className="drop-actions">
                <button className="secondary-button" onClick={() => fileInput.current?.click()} type="button">
                  {'Choose files'}
                </button>
                <button
                  className="ghost-example-button"
                  disabled={isBusy}
                  onClick={loadSyntheticExample}
                  type="button"
                >
                  {'Try the synthetic check'}
                </button>
              </div>
              <small className="example-boundary">
                {'The synthetic check is for training and is separate from the real examples below.'}
              </small>
            </div>

            <section
              aria-labelledby="real-examples-title"
              className="real-examples"
              data-testid="real-examples"
            >
              <div className="real-examples-heading">
                <div>
                  <span>{'Start with licensed data'}</span>
                  <h3 id="real-examples-title">
                    {'Three real research examples'}
                  </h3>
                </div>
                <small>
                  {'Every example carries its own citation, license scope, and interpretation boundary.'}
                </small>
              </div>
              <div className="real-example-grid">
                {REAL_EXAMPLES.map((example) => (
                  <article
                    className={`real-example-card ${activeExampleId === example.id ? 'active' : ''}`}
                    key={example.id}
                  >
                    <div className="real-example-meta">
                      <span>{example.methods.join(' · ')}</span>
                      <strong>{example.license.spdx}</strong>
                    </div>
                    <h4>{example.title}</h4>
                    <p>{example.boundary}</p>
                    <p className="real-example-license-scope">
                      <strong>{'License scope:'}</strong>{' '}
                      {example.license.scope}
                    </p>
                    <small>
                      {example.citation.label} ·{' '}
                      <a href={example.citation.url} rel="noreferrer" target="_blank">
                        DOI {example.citation.doi}
                      </a>
                    </small>
                    <button
                      className={activeExampleId === example.id ? 'primary-button' : 'secondary-button'}
                      data-example-id={example.id}
                      disabled={isBusy}
                      onClick={() => void loadRealExample(example.id)}
                      type="button"
                    >
                      {activeExampleId === example.id
                        ? 'Example loaded'
                        : 'Try this real example'}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            {files.length > 0 && (
              <div className="file-list">
                {files.map((file, index) => {
                  const result = ingestion?.files[index];
                  return (
                    <div className="file-row" key={`${file.name}-${file.lastModified}`}>
                      <div>
                        <strong>{file.name}</strong>
                        <span>
                          {humanSize(file.size)} · {result?.records.length ?? 0}{' '}
                          {'normalized records'}
                        </span>
                      </div>
                      <span className={`status-pill ${result?.status === 'ready' ? 'ok' : result?.status === 'error' ? 'error' : 'warning'}`}>
                        {isBusy
                          ? 'Reading'
                          : result?.status === 'ready'
                            ? 'Ready'
                            : result?.status === 'needs_mapping'
                              ? 'Mapping required'
                              : 'Error'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {ingestion?.status === 'ready' && (
              <button
                className="ghost-button"
                data-testid="mapping-editor-toggle"
                onClick={() => setMappingEditorOpen((open) => !open)}
                type="button"
              >
                {mappingEditorOpen
                  ? 'Close mapping editor'
                  : 'Inspect column mapping'}
              </button>
            )}
            {mappingDirty && (
              <div className="notice warning" data-testid="mapping-pending-notice" role="status">
                {'Column-mapping changes have not been applied. Analysis and export remain disabled until the selections are validated and the file is read again.'}
              </div>
            )}

            {ingestion && (
              <MappingWizard
                ingestion={ingestion}
                optionsByFile={mappingOptions}
                isBusy={isBusy}
                allowReady={mappingEditorOpen}
                onChange={updateMappingOptions}
                onApply={() => void applyMapping()}
              />
            )}
          </article>

          <div className="side-stack">
            <article className="card">
              <div className="card-header">
                <div>
                  <h3>{'Scientific context'}</h3>
                  <p>{'Retained with the report.'}</p>
                </div>
              </div>
              <div className="form-stack">
                <label>
                  {'Project name'}
                  <input
                    data-testid="project-name"
                    value={projectName}
                    onChange={(event) => {
                      advanceReportInputRevision();
                      setProjectName(event.target.value);
                    }}
                  />
                </label>
                <label>
                  {'Process'}
                  <input
                    data-testid="process-name"
                    placeholder={'e.g. pyrolysis'}
                    value={processName}
                    onChange={(event) => {
                      advanceReportInputRevision();
                      setProcessName(event.target.value);
                    }}
                  />
                </label>
                <label>
                  {'Stage label (required without a stage window or column)'}
                  <input
                    data-testid="stage-label"
                    placeholder={'e.g. main decomposition'}
                    value={stageLabel}
                    onChange={(event) => {
                      setStageLabel(event.target.value);
                      invalidateConfiguredAnalysis();
                    }}
                  />
                </label>
                <div className="two-columns">
                  <label>
                    {'Stage start (°C)'}
                    <input
                      data-testid="stage-start"
                      inputMode="decimal"
                      placeholder="200"
                      value={stageStart}
                      onChange={(event) => {
                        setStageStart(event.target.value);
                        invalidateConfiguredAnalysis();
                      }}
                    />
                  </label>
                  <label>
                    {'Stage end (°C)'}
                    <input
                      data-testid="stage-end"
                      inputMode="decimal"
                      placeholder="500"
                      value={stageEnd}
                      onChange={(event) => {
                        setStageEnd(event.target.value);
                        invalidateConfiguredAnalysis();
                      }}
                    />
                  </label>
                </div>
                {stageWindowInput.status === 'invalid' && (
                  <small className="field-error" data-testid="stage-window-error">
                    {stageWindowInput.message}
                  </small>
                )}
                <details
                  className="alpha-grid-control expert-disclosure"
                  open={experienceMode === 'expert'}
                >
                  <summary>
                    {'Expert setting · alpha grid'}
                  </summary>
                  <div className="alpha-grid-control-body">
                  <div className="alpha-grid-heading">
                    <strong>{'Ea(α) conversion grid'}</strong>
                    <span>{'Fraction between 0 and 1'}</span>
                  </div>
                  <div className="three-columns">
                    <label>
                      {'α start'}
                      <input
                        data-testid="alpha-start"
                        inputMode="decimal"
                        value={alphaStart}
                        onChange={(event) => {
                          setAlphaStart(event.target.value);
                          invalidateConfiguredAnalysis();
                        }}
                      />
                    </label>
                    <label>
                      {'α end'}
                      <input
                        data-testid="alpha-end"
                        inputMode="decimal"
                        value={alphaEnd}
                        onChange={(event) => {
                          setAlphaEnd(event.target.value);
                          invalidateConfiguredAnalysis();
                        }}
                      />
                    </label>
                    <label>
                      {'α step'}
                      <input
                        data-testid="alpha-step"
                        inputMode="decimal"
                        value={alphaStep}
                        onChange={(event) => {
                          setAlphaStep(event.target.value);
                          invalidateConfiguredAnalysis();
                        }}
                      />
                    </label>
                  </div>
                  {alphaGrid.status === 'valid' ? (
                    <div className="notice info" data-testid="alpha-grid-summary">
                      {alphaGrid.values.length} {'α points will be calculated'}: {
                        alphaGrid.values[0]?.toFixed(2)
                      }–{alphaGrid.values.at(-1)?.toFixed(2)}
                    </div>
                  ) : (
                    <div className="notice error" data-testid="alpha-grid-error" role="alert">
                      {alphaGrid.message}
                    </div>
                  )}
                  {wideProjectionStale && (
                    <div
                      className="notice warning"
                      data-testid="wide-alpha-grid-stale"
                      role="status"
                    >
                      <span>
                        {'The wide-series projection belongs to the previous alpha grid. Stale points will not be used silently.'}
                      </span>
                      <button
                        className="secondary-button"
                        disabled={isBusy}
                        onClick={() => void applyMapping()}
                        type="button"
                      >
                        {'Refresh wide-series projection'}
                      </button>
                    </div>
                  )}
                  </div>
                </details>
              </div>
              <div className="context-facts" aria-label="Scientific context read from the file">
                <div><span>{'Sample'}</span><strong>{sampleContext.join(', ') || 'Not specified'}</strong></div>
                <div><span>{'Atmosphere'}</span><strong>{atmosphereContext.join(', ') || 'Not specified'}</strong></div>
              </div>
              <div className="notice info">
                {'A stage window is required when alpha is derived from raw mass. It may be left empty for supplied alpha.'}
              </div>
            </article>

            <article className="card">
              <div className="card-header">
                <div>
                  <h3>{'Scientific safety gates'}</h3>
                  <p>{'Checked automatically before analysis.'}</p>
                </div>
              </div>
              <ul className="checklist">
                {['At least 3 distinct heating rates', 'Kelvin and rate-unit consistency', 'Common alpha range', 'Explicit reaction stage', 'Derivative and regression quality'].map((item) => (
                  <li key={item}><span className="checklist-mark">✓</span><span>{item}</span></li>
                ))}
              </ul>
            </article>

            <PlatformSelfTestPanel />
          </div>

          <article className="card review-card analysis-card" id="step-review">
            <div className="card-header">
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <span className="step-index">2</span>
                <div>
                  <h2>
                    {'This is how the software understood your file'}
                  </h2>
                  <p>
                    {'Review the mapping, units, curve, stage, and scientific settings. No suggestion becomes a reportable decision without your confirmation.'}
                  </p>
                </div>
              </div>
              <span className={`status-pill ${interpretationConfirmed ? 'ok' : ingestion?.status === 'ready' ? 'warning' : 'error'}`}>
                {interpretationConfirmed
                  ? 'User confirmed'
                  : 'Awaiting confirmation'}
              </span>
            </div>

            {!ingestion ? (
              <div className="empty-state">
                <div>
                  <strong>{'Upload a file first'}</strong>
                  {'The software interpretation will appear here after the file is read.'}
                </div>
              </div>
            ) : ingestion.status !== 'ready' || mappingDirty ? (
              <div className="notice warning" role="status">
                <strong>
                  {'Confirmation is unavailable until mapping is complete.'}
                </strong>
                <span>
                  {'Complete uncertain column, unit, header, worksheet, or layout choices in step 1.'}
                </span>
              </div>
            ) : (
              <div className="review-body">
                <div className="understanding-grid">
                  <div>
                    <span>{'File / table'}</span>
                    <strong>{ingestion.files.length} / {ingestion.files.map(({ source }) => source.fileType.toUpperCase()).join(', ')}</strong>
                    <small>
                      {ingestion.files.map(({ source }) => (
                        `${source.fileName}: ${source.textEncoding ?? 'binary'} · ${
                          source.delimiter === '\t'
                            ? 'tab'
                            : source.delimiter ?? 'XLSX cells'
                        } · ${'header'} ${(source.headerRow ?? 0) + 1}`
                      )).join(' | ')}
                    </small>
                  </div>
                  <div>
                    <span>{'Runs / rates'}</span>
                    <strong>{runIds.length || ingestion.tables.betaTp.length} / {heatingRates.length || ingestion.tables.betaTp.length}</strong>
                    <small>
                      {heatingRates.length > 0
                        ? `${heatingRates.join(', ')} K/min`
                        : 'β–Tp peak table'}
                    </small>
                  </div>
                  <div>
                    <span>{'Signal'}</span>
                    <strong>
                      {hasDirectAlpha
                        ? 'α'
                        : hasMassSignal
                          ? 'TG / mass'
                          : 'Peak temperature'}
                    </strong>
                    <small>
                      {hasSuppliedDerivative
                        ? 'Supplied dα/dt is present and will not be replaced by a numerical derivative.'
                        : 'No supplied dα/dt; Friedman may carry a numerical-derivative caution or be rejected.'}
                    </small>
                  </div>
                  <div>
                    <span>{'Context'}</span>
                    <strong>{sampleContext.join(', ') || 'Sample not specified'}</strong>
                    <small>{atmosphereContext.join(', ') || 'Atmosphere not specified'}</small>
                  </div>
                </div>

                <section
                  aria-labelledby="device-profile-title"
                  className="device-profile-panel"
                  data-testid="device-profile-suggestions"
                >
                  <div className="device-profile-heading">
                    <div>
                      <span>{'Instrument-profile suggestion'}</span>
                      <h3 id="device-profile-title">
                        {'Starting point — not applied automatically'}
                      </h3>
                    </div>
                    <strong>{'User confirmation required'}</strong>
                  </div>
                  <div className="device-profile-list">
                    {deviceProfileSuggestions.map(({ fileName, suggestion }) => (
                      <article key={fileName}>
                        <div>
                          <strong>{fileName}</strong>
                          <span>{suggestion.name}</span>
                        </div>
                        <small>
                          {'Match confidence'}:{' '}
                          {Math.round(suggestion.confidence * 100)}% ·{' '}
                          {suggestion.reasons
                            .map((reason) => reason)
                            .join(' ')}
                        </small>
                      </article>
                    ))}
                  </div>
                  <p>
                    {'A profile provides guidance only. Header, delimiter, column meaning, unit, DTG sign, and physical stage are confirmed through the visible mapping above.'}
                  </p>
                </section>

                <details className="mapping-audit-details" open={experienceMode === 'expert'}>
                  <summary>
                    {experienceMode === 'expert'
                        ? 'Expert mode · mapping, unit, and method settings'
                        : 'Scientific assumptions and advanced settings'}
                  </summary>
                  <div className="mapping-audit-list">
                    {ingestion.files.map((file) => (
                      <section key={file.source.fileName}>
                        <strong>{file.source.fileName}</strong>
                        <p>
                          {file.mappings.map((mapping) => (
                            `${mapping.header || '(untitled)'} → ${mapping.role}${
                              mapping.unit ? ` [${mapping.unit}]` : ''
                            } · ${mapping.confidence}`
                          )).join(' | ') || 'No column mapping'}
                        </p>
                      </section>
                    ))}
                  </div>
                  <div className="expert-method-settings">
                    <fieldset>
                      <legend>{'Methods to run'}</legend>
                      {(['FWO', 'KAS', 'STARINK', 'FRIEDMAN'] as const).map((method) => (
                        <label key={method}>
                          <input
                            checked={selectedMethods.includes(method)}
                            onChange={(event) => {
                              setSelectedMethods((current) => event.target.checked
                                ? [...current, method]
                                : current.filter((item) => item !== method));
                              invalidateConfiguredAnalysis();
                            }}
                            type="checkbox"
                          />
                          {method === 'STARINK' ? 'Starink' : method}
                        </label>
                      ))}
                      <label>
                        <input
                          checked={includeKissinger}
                          onChange={(event) => {
                            setIncludeKissinger(event.target.checked);
                            invalidateConfiguredAnalysis();
                          }}
                          type="checkbox"
                        />
                        {'Kissinger (only with explicit β–Tp)'}
                      </label>
                    </fieldset>
                    <label>
                      {'R² caution threshold'}
                      <input
                        data-testid="min-r2-warning"
                        inputMode="decimal"
                        value={minR2Warning}
                        onChange={(event) => {
                          setMinR2Warning(event.target.value);
                          invalidateConfiguredAnalysis();
                        }}
                      />
                      {!minR2Valid && (
                        <small className="field-error">
                          {'Enter a finite number between 0 and 1.'}
                        </small>
                      )}
                    </label>
                  </div>
                  <div className="notice info">
                    {'Preprocessing contract: acquisition order is preserved; alpha uses linear interpolation; no smoothing or baseline correction is applied; a supplied derivative is never silently replaced.'}
                  </div>
                </details>

                <CurvePreview
                  onStageEndChange={(value) => {
                    setStageEnd(value);
                    invalidateConfiguredAnalysis();
                  }}
                  onStageStartChange={(value) => {
                    setStageStart(value);
                    invalidateConfiguredAnalysis();
                  }}
                  records={ingestion.records}
                  stageEnd={stageEnd}
                  stageStart={stageStart}
                />

                {requiresStageWindow && stageWindowInput.status !== 'valid' && (
                  <div className="notice error" role="alert">
                    <strong>{'Stage boundaries are required for raw mass data.'}</strong>
                    <span>
                      {'Use the suggestion only if it matches the curve, or enter start/end numerically. These boundaries define the m0 and mf anchors.'}
                    </span>
                  </div>
                )}
                {!stageIdentityReady && (
                  <div className="notice error" data-testid="stage-identity-required" role="alert">
                    <strong>
                      {'Name the common reaction stage.'}
                    </strong>
                    <span>
                      {'No reliable stage column was found. Enter a stage label in the scientific-context card; the software does not claim a mechanism or stage on your behalf.'}
                    </span>
                  </div>
                )}

                <label className={`interpretation-confirmation ${interpretationConfirmed ? 'confirmed' : ''}`}>
                  <input
                    checked={interpretationConfirmed}
                    data-testid="confirm-interpretation"
                    disabled={!interpretationReady}
                    onChange={(event) => {
                      advanceReportInputRevision();
                      setInterpretationConfirmed(event.target.checked);
                      analysisDatasetRevision.current = null;
                      setAnalysis(null);
                      setAnalysisAttempted(false);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <strong>
                      {'I confirm this interpretation and the visible assumptions.'}
                    </strong>
                    <small>
                      {'Confirmation does not make a method or result reliable. Every result is classified separately in the next step.'}
                    </small>
                  </span>
                </label>
              </div>
            )}
          </article>

          <article className="card analysis-card" id="step-results">
            <div className="card-header">
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <span className="step-index">3</span>
                <div>
                  <h2>{'Scientific decision, calculation, and report'}</h2>
                  <p>
                    {'Calculation completion and result reliability are assessed separately; every result receives exactly one of four decisions.'}
                  </p>
                </div>
              </div>
              <button
                className="primary-button"
                data-testid="run-analysis"
                disabled={
                  isBusy
                  || mappingDirty
                  || committedDatasetRevision === null
                  || ingestion?.status !== 'ready'
                  || !interpretationConfirmed
                  || alphaGrid.status !== 'valid'
                  || !minR2Valid
                  || wideProjectionStale
                  || stageWindowInput.status === 'invalid'
                }
                onClick={runAnalysis}
              >
                {isBusy
                  ? 'Processing…'
                  : 'Run eligible methods'}
              </button>
            </div>

            {!interpretationConfirmed && ingestion?.status === 'ready' && (
              <div className="analysis-gate-note notice warning" role="status">
                {'Confirm the file interpretation and scientific assumptions in step 2 before calculating.'}
              </div>
            )}

            <div className="analysis-body">
              <div className="method-panel">
                <div className="method-list">
                  {METHOD_EXPLANATIONS.map((method) => {
                    const decision = method.key === 'KISSINGER'
                      ? scientificDisposition?.kissinger
                      : scientificDisposition?.methods.find((item) => item.method === method.key);
                    const result = method.key === 'KISSINGER'
                      ? analysis?.kissinger
                      : analysis?.methods.find((item) => item.method === method.key);
                    const state = dispositionTone(decision?.disposition);
                    return (
                      <div className="method-row" key={method.key}>
                        <div>
                          <strong>{method.name}</strong>
                          <small>{method.detail}</small>
                        </div>
                        <span className={`method-pill ${state}`}>
                          {decision
                            ? dispositionLabel(decision.disposition)
                            : result
                              ? dispositionLabel('CALCULATION_REJECTED')
                              : 'Waiting'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="results-panel">
                {analysis ? (
                  <>
                    <div className="metric-grid">
                      <div className="metric">
                        <span>{'Scientific decision'}</span>
                        <strong>{dispositionLabel(scientificDisposition?.overallDisposition)}</strong>
                      </div>
                      <div className="metric"><span>{'Heating rates'}</span><strong>{analysis.eligibility.distinctHeatingRates}</strong></div>
                      <div className="metric"><span>{'Common α'}</span><strong>{analysis.eligibility.commonAlphaRange?.map((v) => v.toFixed(2)).join('–') ?? '—'}</strong></div>
                      <div className="metric"><span>{'Ea(α) points'}</span><strong>{isoconversionalPointCount}</strong></div>
                    </div>
                    {scientificDisposition && (
                      <ResearchSummary
                        analysis={analysis}
                        assessment={scientificDisposition}
                      />
                    )}
                    <section
                      className="result-type-comparison"
                      data-testid="result-type-comparison"
                      aria-labelledby="result-type-title"
                    >
                      <div className="result-type-heading">
                        <div>
                          <span className="result-type-kicker">
                            {'Scientific interpretation boundary'}
                          </span>
                          <h3 id="result-type-title">
                            {'Do not mix the two result types'}
                          </h3>
                        </div>
                        <strong>{'They are not the same result'}</strong>
                      </div>
                      <div className="result-type-grid">
                        <div className="result-type-card profile">
                          <span>{'Multiple rates · fixed conversion'}</span>
                          <h4>{'Ea(α) profile'}</h4>
                          <strong>
                            {isoconversionalPointCount}{' '}
                            {'calculated points'}
                          </strong>
                          <p>
                            {'Multiple heating rates are compared at fixed conversion; apparent Ea is reported as a profile that may vary with alpha.'}
                          </p>
                        </div>
                        <div className="result-type-card peak">
                          <span>{'One stage · β–Tp peak shift'}</span>
                          <h4>{'Kissinger peak Ea'}</h4>
                          <strong>
                            {kissingerEa === undefined
                              ? 'Not calculated'
                              : `${kissingerEa.toFixed(1)} kJ/mol`}
                          </strong>
                          <p>
                            {'A single peak-specific apparent Ea from peak temperatures of the same physical stage at different rates.'}
                          </p>
                        </div>
                      </div>
                      <p className="result-type-boundary">
                        {'The Ea(alpha) profile and Kissinger peak Ea are not interchangeable. Similar values do not prove a one-step mechanism or a uniquely correct value.'}
                      </p>
                    </section>
                    <EaChart series={chartSeries} />
                    <ScientificResultsTable rows={visibleResultRows} />
                    {resultDiagnostics.length > 0 && (
                      <section
                        aria-label={'Result cautions and rejections'}
                        data-testid="result-card-diagnostics"
                      >
                        <h3>{'Result cautions and rejections'}</h3>
                        <DiagnosticsList diagnostics={resultDiagnostics} />
                      </section>
                    )}
                  </>
                ) : analysisAttempted ? (
                  <section className="refused-state" data-testid="analysis-refused-state">
                    <strong>{dispositionLabel('CALCULATION_REJECTED')}</strong>
                    <p>
                      {'The safety gates found that this data cannot support a defensible result. No number or report is produced until the issue below is corrected.'}
                    </p>
                    <DiagnosticsList diagnostics={workflowDiagnostics} />
                  </section>
                ) : (
                  <div className="empty-state">
                    <div>
                      <strong>{'Analysis has not been run'}</strong>
                      {'After the file interpretation is confirmed, the eligibility engine checks the data and runs only valid methods.'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="action-row">
              <button data-testid="export-pdf" className="secondary-button" disabled={mappingDirty || committedDatasetRevision === null || !interpretationConfirmed || !analysis || !analysisStage || isBusy} onClick={() => void exportReport('pdf')}>{'PDF report'}</button>
              <button data-testid="export-csv" className="secondary-button" disabled={mappingDirty || committedDatasetRevision === null || !interpretationConfirmed || !analysis || !analysisStage || isBusy} onClick={() => void exportReport('csv')}>{'Results CSV'}</button>
              <button data-testid="export-json" className="secondary-button" disabled={mappingDirty || committedDatasetRevision === null || !interpretationConfirmed || !analysis || !analysisStage || isBusy} onClick={() => void exportReport('json')}>{'Reproducible JSON'}</button>
            </div>
            <small data-testid="csv-export-scope-note">
              {'The results CSV contains tidy result, context, and licensed-example citation fields. Keep the reproducible JSON for source-file hashes, import mappings, preprocessing settings, and row-level traceability.'}
            </small>
            <div className="notice info" data-testid="regression-ci-claim-boundary">
              {REGRESSION_CI_CLAIM_BOUNDARY}
            </div>
          </article>

          {workflowDiagnostics.length > 0 && !(analysisAttempted && !analysis) && (
            <article className="card analysis-card">
              <div className="card-header">
                <div>
                  <h2>{'Scientific diagnostics'}</h2>
                  <p>
                    {'Errors stop result production; cautions remain in the report.'}
                  </p>
                </div>
              </div>
              <DiagnosticsList diagnostics={workflowDiagnostics} />
            </article>
          )}
        </section>

        <PublishingPanel />

        <p className="footer-note">
          {'Activation Energy Studio results are apparent activation energies conditional on method, process, stage, atmosphere, alpha range, and preprocessing choices; they must not be interpreted as context-free material constants.'}
        </p>
      </main>
    </div>
  );
}
