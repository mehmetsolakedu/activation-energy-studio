import type { ActivationEnergyAnalysis, MethodName } from '../core';
import {
  scientificDispositionLabel,
  type ScientificDisposition,
  type ReportableAlphaSegment,
  type ScientificDispositionAssessment,
  type ScientificDispositionReason,
  type ScientificMethodDisposition,
  type ScientificResultDisposition,
} from '../product/disposition';

export { scientificDispositionLabel } from '../product/disposition';

interface ResearchSummaryProps {
  assessment: ScientificDispositionAssessment;
  analysis: ActivationEnergyAnalysis;
}

const METHOD_LABELS: Record<MethodName, string> = {
  FWO: 'FWO/OFW',
  KAS: 'KAS',
  STARINK: 'Starink',
  FRIEDMAN: 'Friedman',
  KISSINGER: 'Kissinger',
};

function numberFormatter(digits: number): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatAlpha(alpha: number): string {
  return numberFormatter(2).format(alpha);
}

function formatEnergy(value: number): string {
  return numberFormatter(1).format(value);
}

function formatR2(value: number): string {
  return numberFormatter(4).format(value);
}

function segmentText(segment: ReportableAlphaSegment): string {
  return segment.startAlpha === segment.endAlpha
    ? `α=${formatAlpha(segment.startAlpha)}`
    : `α=${formatAlpha(segment.startAlpha)}–${formatAlpha(segment.endAlpha)}`;
}

function derivativeSourceText(
  source: ActivationEnergyAnalysis['preparedRuns'][number]['derivativeSource'],
): string {
  switch (source) {
    case 'provided':
      return 'supplied derivative';
    case 'time':
      return 'numerical derivative from time';
    case 'temperature':
      return 'numerical derivative from temperature';
    case 'unavailable':
      return 'unavailable derivative';
  }
}

function dataSeenAnswer(
  analysis: ActivationEnergyAnalysis,
): string {
  const runCount = analysis.preparedRuns.length;
  const pointCount = analysis.preparedRuns.reduce(
    (sum, run) => sum + run.points.length,
    0,
  );
  const peakCount = analysis.kissinger?.observations.length ?? 0;
  const distinctRates = analysis.eligibility.distinctHeatingRates;
  const commonRange = analysis.eligibility.commonAlphaRange;
  const derivativeSources = [
    ...new Set(analysis.preparedRuns.map((run) => derivativeSourceText(run.derivativeSource))),
  ];

  if (runCount === 0 && peakCount === 0) {
    return 'No calculation-ready conversion curve or beta-Tp observation was found.';
  }

  const curveText =
    runCount === 0
      ? ''
      : `${runCount} calculation-ready conversion curves (${pointCount} points) at ${distinctRates} distinct heating rates were found${commonRange ? ` with common α=${formatAlpha(commonRange[0])}–${formatAlpha(commonRange[1])}` : ''}.${derivativeSources.length > 0 ? ` Derivative source: ${derivativeSources.join(', ')}.` : ''}`;
  const peakText =
    peakCount === 0
      ? ''
      : `${peakCount} beta-Tp peak observations were found as separate Kissinger input.`;
  return [curveText, peakText].filter(Boolean).join(' ');
}

function methodSummaries(
  assessment: ScientificDispositionAssessment,
): ScientificMethodDisposition[] {
  return [
    ...assessment.methods,
    ...(assessment.kissinger === undefined ? [] : [assessment.kissinger]),
  ];
}

function methodsAnswer(
  assessment: ScientificDispositionAssessment,
): string {
  const methods = methodSummaries(assessment);
  if (methods.length === 0) {
    return 'No method result was produced because scientific prerequisites were not met.';
  }
  return methods
    .map(
      (method) =>
        `${METHOD_LABELS[method.method]} — ${scientificDispositionLabel(method.disposition)}`,
    )
    .join('; ');
}

function reportableAnswer(
  assessment: ScientificDispositionAssessment,
): string {
  const statements: string[] = [];
  for (const method of assessment.methods) {
    for (const segment of method.reportableAlphaSegments) {
      statements.push(
        `${METHOD_LABELS[method.method]}: ${segmentText(segment)} — `
        + scientificDispositionLabel(segment.disposition),
      );
    }
  }
  const peak = assessment.kissinger?.results[0];
  if (
    peak
    && (
      peak.disposition === 'REPORTABLE'
      || peak.disposition === 'REPORTABLE_WITH_CAUTION'
    )
  ) {
    statements.push(
      `${METHOD_LABELS.KISSINGER}: ${'separate peak Ea'} — `
      + scientificDispositionLabel(peak.disposition),
    );
  }
  if (statements.length === 0) {
    return 'This analysis has no Ea result or alpha range that can be recommended for reporting.';
  }
  return statements.join('; ');
}

function meanAnswer(
  assessment: ScientificDispositionAssessment,
): string {
  if (assessment.methods.length === 0) {
    return 'No. No Ea(alpha) profile is available to average.';
  }
  const recommended = assessment.methods.filter((method) => method.meanEaRecommended);
  const notRecommended = assessment.methods.filter((method) => !method.meanEaRecommended);
  const parts: string[] = [];
  if (recommended.length > 0) {
    parts.push(
      `For ${recommended.map((method) => METHOD_LABELS[method.method]).join(', ')}, a within-method mean may be used only as a secondary summary and cannot replace the Ea(alpha) profile`,
    );
  }
  if (notRecommended.length > 0) {
    const multistep = notRecommended.some((method) =>
      method.reasons.some((reason) => reason.code === 'MULTISTEP_EA_VARIATION'));
    parts.push(
      `A mean is not recommended for ${notRecommended.map((method) => METHOD_LABELS[method.method]).join(', ')}${multistep ? '; strong Ea(alpha) variation makes one number misleading' : '; there are insufficient reliable alpha results'}`,
    );
  }
  return `${parts.join('. ')}.`;
}

function dispositionReason(reason: ScientificDispositionReason): string {
  return reason.message;
}

function limitingReasons(
  assessment: ScientificDispositionAssessment,
): ScientificDispositionReason[] {
  const unique = new Map<string, ScientificDispositionReason>();
  for (const reason of assessment.reasons) {
    if (reason.severity === 'info') continue;
    if (!unique.has(reason.code)) unique.set(reason.code, reason);
  }
  return [...unique.values()];
}

function resultsInSegment(
  method: ScientificMethodDisposition,
  segment: ReportableAlphaSegment,
): ScientificResultDisposition[] {
  return method.results.filter(
    (result) =>
      result.alpha !== null
      && segment.alphaValues.some((alpha) => Math.abs(alpha - (result.alpha as number)) <= 1e-12)
      && result.activationEnergyKJPerMol !== null
      && Number.isFinite(result.activationEnergyKJPerMol),
  );
}

function acceptedReportStatements(
  assessment: ScientificDispositionAssessment,
): string[] {
  const statements: string[] = [];
  for (const method of assessment.methods) {
    for (const segment of method.reportableAlphaSegments) {
      const results = resultsInSegment(method, segment);
      if (results.length === 0) continue;
      const energies = results.map((result) => result.activationEnergyKJPerMol as number);
      const minimumEnergy = Math.min(...energies);
      const maximumEnergy = Math.max(...energies);
      const energyText =
        minimumEnergy === maximumEnergy
          ? formatEnergy(minimumEnergy)
          : `${formatEnergy(minimumEnergy)}–${formatEnergy(maximumEnergy)}`;
      const finiteR2 = results
        .map((result) => result.r2)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const r2Text =
        finiteR2.length === 0
          ? ''
          : `; minimum R²=${formatR2(Math.min(...finiteR2))}`;
      statements.push(
        `"Using ${METHOD_LABELS[method.method]}, apparent Ea was ${energyText} kJ/mol over ${segmentText(segment)}${r2Text}; the result is ${scientificDispositionLabel(segment.disposition)}. This Ea(alpha) result is conditional on the selected stage, method, and experimental conditions."`,
      );
    }
  }

  const peak = assessment.kissinger?.results[0];
  if (
    peak
    && peak.activationEnergyKJPerMol !== null
    && (
      peak.disposition === 'REPORTABLE'
      || peak.disposition === 'REPORTABLE_WITH_CAUTION'
    )
  ) {
    const r2Text =
      peak.r2 === null
        ? ''
        : ` (R²=${formatR2(peak.r2)})`;
    statements.push(
      `"The Kissinger peak method gave an apparent peak Ea of ${formatEnergy(peak.activationEnergyKJPerMol)} kJ/mol${r2Text}; the result is ${scientificDispositionLabel(peak.disposition)}. This value is not an Ea(alpha) result."`,
    );
  }
  return statements;
}

function fallbackReportStatement(
  assessment: ScientificDispositionAssessment,
): string {
  const unreliable = methodSummaries(assessment)
    .flatMap((method) => method.results)
    .find(
      (result) =>
        result.disposition === 'CALCULATED_UNRELIABLE'
        && result.activationEnergyKJPerMol !== null,
    );
  if (unreliable?.activationEnergyKJPerMol !== null && unreliable !== undefined) {
    const target =
      unreliable.alpha === null
        ? 'peak'
        : `α=${formatAlpha(unreliable.alpha)}`;
    return `"${METHOD_LABELS[unreliable.method]} calculated ${formatEnergy(unreliable.activationEnergyKJPerMol)} kJ/mol at ${target}; it is ${scientificDispositionLabel(unreliable.disposition)} and must not be used as a reportable Ea."`;
  }
  return `"No Ea number should be reported from this analysis; the disposition is ${scientificDispositionLabel('CALCULATION_REJECTED')}."`;
}

function rateAdvice(
  analysis: ActivationEnergyAnalysis,
  assessment: ScientificDispositionAssessment,
): string {
  const rates = [
    ...analysis.preparedRuns.map((run) => run.heatingRateKPerMinute),
    ...(analysis.kissinger?.observations.map((observation) => observation.heatingRateKPerMinute) ?? []),
  ].filter((rate) => Number.isFinite(rate) && rate > 0);
  const distinctRates = [...new Set(rates)].sort((left, right) => left - right);
  const count = distinctRates.length || analysis.eligibility.distinctHeatingRates;
  const hasKissinger = assessment.kissinger !== undefined;
  if (count < 3) {
    return `Current nβ=${count}. Add at least ${3 - count} new distinct positive heating rate${3 - count === 1 ? '' : 's'} to reach nβ≥3, preferably outside the current range.`;
  }
  if (count < 5) {
    return `Current nβ=${count}. Add at least one independent rate outside the current range${hasKissinger ? '; for Kissinger complexity, target at least five rates over an approximately five-fold beta span' : ''}.`;
  }
  return `Current nβ=${count}. Add independent repeats at the lowest and highest rates to test stage identity and repeatability.`;
}

function nextExperimentHints(
  assessment: ScientificDispositionAssessment,
  analysis: ActivationEnergyAnalysis,
): string[] {
  const hints = new Set<string>();
  assessment.nextExperimentHints.forEach((hint) => hints.add(hint));
  hints.add(rateAdvice(analysis, assessment));
  return [...hints];
}

export function ResearchSummary({
  assessment,
  analysis,
}: ResearchSummaryProps) {
  const summaries = methodSummaries(assessment);
  const reasons = limitingReasons(assessment);
  const reportStatements = acceptedReportStatements(assessment);
  const experimentHints = nextExperimentHints(assessment, analysis);

  return (
    <section
      className="card research-summary"
      aria-labelledby="research-summary-title"
      data-testid="research-summary"
      lang="en"
    >
      <header className="card-header">
        <div>
          <span>
            {'Scientific decision summary'}
          </span>
          <h3 id="research-summary-title">
            {'What can be written in the report?'}
          </h3>
        </div>
        <strong
          data-testid="research-summary-disposition"
          data-disposition={assessment.overallDisposition}
        >
          {scientificDispositionLabel(assessment.overallDisposition)}
        </strong>
      </header>

      <dl className="research-summary-answers">
        <div data-answer="data-seen">
          <dt>
            {'What did the software see in the data?'}
          </dt>
          <dd>{dataSeenAnswer(analysis)}</dd>
        </div>

        <div data-answer="methods-run">
          <dt>
            {'Which methods were run?'}
          </dt>
          <dd>{methodsAnswer(assessment)}</dd>
        </div>

        <div data-answer="reportable-results">
          <dt>
            {'Which result or alpha range is reportable?'}
          </dt>
          <dd>{reportableAnswer(assessment)}</dd>
        </div>

        <div data-answer="mean-ea">
          <dt>
            {'Is using a mean Ea meaningful?'}
          </dt>
          <dd>{meanAnswer(assessment)}</dd>
        </div>

        <div data-answer="limitations">
          <dt>
            {'Why is the result limited or rejected?'}
          </dt>
          <dd>
            {reasons.length === 0 ? (
              'No limiting diagnostic is active; the apparent-Ea and regression-only uncertainty boundaries still apply.'
            ) : (
              <ul>
                {reasons.map((reason) => (
                  <li key={reason.code}>
                    <strong>{reason.code}</strong>: {dispositionReason(reason)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div data-answer="report-wording">
          <dt>
            {'Which number and method name should be written in the report?'}
          </dt>
          <dd>
            {reportStatements.length > 0 ? (
              reportStatements.map((statement) => (
                <blockquote key={statement}>{statement}</blockquote>
              ))
            ) : (
              <blockquote>{fallbackReportStatement(assessment)}</blockquote>
            )}
          </dd>
        </div>

        <div data-answer="next-experiment">
          <dt>
            {'What additional experiment or heating rate is needed?'}
          </dt>
          <dd>
            <ul>
              {experimentHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      {summaries.length === 0 && (
        <p className="notice warning">
          {'No method-level decision could be produced; correct the input and eligibility issues.'}
        </p>
      )}
    </section>
  );
}
