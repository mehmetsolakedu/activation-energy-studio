import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DiagnosticsList } from '../src/components/DiagnosticsList';
import { EaChart } from '../src/components/EaChart';
import { MappingWizard } from '../src/components/MappingWizard';
import { PlatformSelfTestPanel } from '../src/components/PlatformSelfTestPanel';
import { ScientificResultsTable } from '../src/components/ScientificResultsTable';
import { WideSeriesMapper } from '../src/components/WideSeriesMapper';
import type { BatchIngestionResult } from '../src/io';
import {
  APPARENT_EA_CLAIM_BOUNDARY,
  REGRESSION_CI_CLAIM_BOUNDARY,
  type ScientificResultRow,
} from '../src/report';

const mappingIngestion: BatchIngestionResult = {
  status: 'needs_mapping',
  files: [{
    status: 'needs_mapping',
    source: { fileName: 'sample.csv', fileType: 'csv' },
    headers: ['Temperature [C]', 'Mass [%]'],
    preview: [[100, 99]],
    mappings: [],
    candidates: [],
    mappingNeeds: [{
      kind: 'column',
      role: 'temperature',
      message: 'Select temperature.',
      candidateColumns: [0],
    }],
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  }],
  diagnostics: [],
  records: [],
  tables: { tAlphaBeta: [], betaTp: [] },
};

const resultRow: ScientificResultRow = {
  resultId: 'KAS-alpha-0.5',
  quantity: 'apparent activation energy',
  claimBoundary: APPARENT_EA_CLAIM_BOUNDARY,
  confidenceBoundary: REGRESSION_CI_CLAIM_BOUNDARY,
  sample: 'sample',
  process: 'pyrolysis',
  stage: 'main',
  atmosphere: 'N2',
  method: 'KAS',
  resultType: 'isoconversional',
  formulaId: 'kas_integral_v1',
  alpha: 0.5,
  activationEnergyKJPerMol: 150,
  confidence95LowerKJPerMol: 145,
  confidence95UpperKJPerMol: 155,
  n: 4,
  rawObservationCount: 4,
  residualDegreesOfFreedom: 2,
  regressionInputAggregation: 'none',
  r2: 0.999,
  slope: -18_000,
  slopeStandardError: 10,
  status: 'success',
  disposition: 'REPORTABLE',
};

describe('reusable component English contract', () => {
  it('renders standard technical English without changing selectors or scientific values', () => {
    const html = renderToStaticMarkup(
      <>
        <MappingWizard
          ingestion={mappingIngestion}
          optionsByFile={[{}]}
          isBusy={false}
          onApply={() => undefined}
          onChange={() => undefined}
        />
        <WideSeriesMapper
          headers={['T', 'TG']}
          onScopeConfirmedChange={() => undefined}
          onSeriesChange={() => undefined}
          preview={[[100, 99]]}
          scopeConfirmed={false}
          series={[]}
        />
        <EaChart series={[]} />
        <ScientificResultsTable rows={[resultRow]} />
        <DiagnosticsList diagnostics={[]} />
        <PlatformSelfTestPanel />
      </>,
    );

    expect(html).toContain('Guided data mapping');
    expect(html).toContain('Add series');
    expect(html).toContain('No results to plot yet');
    expect(html).toContain('Numerical Ea and regression diagnostics');
    expect(html).toContain('No active warning.');
    expect(html).toContain('Platform scientific self-test');
    expect(html).toContain('data-testid="apply-mapping"');
    expect(html).toContain('data-testid="wide-add-series"');
    expect(html).toContain('150.00');
  });
});
