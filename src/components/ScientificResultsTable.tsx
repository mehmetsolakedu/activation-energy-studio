import type { ScientificResultRow } from '../report';

interface ScientificResultsTableProps {
  rows: readonly ScientificResultRow[];
}

const METHOD_LABELS: Record<ScientificResultRow['method'], string> = {
  FWO: 'FWO/OFW',
  KAS: 'KAS',
  STARINK: 'Starink',
  FRIEDMAN: 'Friedman',
  KISSINGER: 'Kissinger',
};

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function confidenceInterval(row: ScientificResultRow): string {
  if (
    row.confidence95LowerKJPerMol === null
    || row.confidence95UpperKJPerMol === null
  ) {
    return '—';
  }
  return `${row.confidence95LowerKJPerMol.toFixed(2)} – ${row.confidence95UpperKJPerMol.toFixed(2)}`;
}

function statusLabel(status: string): string {
  if (status === 'REPORTABLE') return 'REPORTABLE';
  if (status === 'REPORTABLE_WITH_CAUTION') {
    return 'REPORTABLE WITH CAUTION';
  }
  if (status === 'CALCULATED_UNRELIABLE') {
    return 'CALCULATED BUT UNRELIABLE';
  }
  if (status === 'CALCULATION_REJECTED' || status === 'refused') {
    return 'CALCULATION REJECTED';
  }
  // Legacy report rows retain core completion status. Never translate that
  // computational state as a scientific suitability claim.
  if (status === 'success') return 'Calculated';
  if (status === 'partial') return 'Partly calculated';
  return 'Disposition unavailable';
}

export function ScientificResultsTable({
  rows,
}: ScientificResultsTableProps) {
  if (rows.length === 0) return null;

  return (
    <section
      className="numeric-results"
      aria-labelledby="numeric-results-title"
      data-testid="numeric-results"
    >
      <div className="numeric-results-heading">
        <div>
          <span>{'Apparent numerical output'}</span>
          <h3 id="numeric-results-title">
            {'Numerical Ea and regression diagnostics'}
          </h3>
        </div>
        <strong>
          {`${rows.length} result rows`}
        </strong>
      </div>
      <p className="numeric-results-boundary">
        {'These rows come from the same canonical result generator as the PDF, CSV, and reproducible JSON. The 95% CI covers regression uncertainty only; it excludes instrument, sample preparation, model, within-β replicate variability, and derivative-method uncertainty. Replicates at the same heating rate are averaged on the physical scale and enter the regression as one equally weighted β point.'}
      </p>
      <div
        className="numeric-results-table-wrap"
        role="region"
        aria-label={'Horizontally scrollable numerical activation-energy results'}
        tabIndex={0}
      >
        <table className="numeric-results-table">
          <caption>
            {'Apparent activation energy and OLS regression diagnostics by method'}
          </caption>
          <thead>
            <tr>
              <th scope="col">{'Method'}</th>
              <th scope="col">{'Result type'}</th>
              <th scope="col">{'α / peak'}</th>
              <th scope="col">Ea (kJ/mol)</th>
              <th scope="col">{'95% CI (kJ/mol)'}</th>
              <th scope="col">R²</th>
              <th scope="col">nβ</th>
              <th scope="col">{'Raw n'}</th>
              <th scope="col">df</th>
              <th scope="col">{'Scientific disposition'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.resultId}
                data-result-id={row.resultId}
                data-method={row.method}
                data-result-type={row.resultType}
              >
                <th scope="row">{METHOD_LABELS[row.method]}</th>
                <td>
                  {row.resultType === 'peak'
                    ? 'Separate peak Ea'
                    : 'Ea(α)'}
                </td>
                <td data-field="alpha">
                  {row.alpha === null ? 'Peak' : row.alpha.toFixed(2)}
                </td>
                <td data-field="ea">{formatNumber(row.activationEnergyKJPerMol, 2)}</td>
                <td data-field="ci95">{confidenceInterval(row)}</td>
                <td data-field="r2">{formatNumber(row.r2, 5)}</td>
                <td data-field="n">{row.n ?? '—'}</td>
                <td data-field="raw-n">{row.rawObservationCount ?? '—'}</td>
                <td data-field="df">{row.residualDegreesOfFreedom ?? '—'}</td>
                <td>{statusLabel(row.disposition)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
