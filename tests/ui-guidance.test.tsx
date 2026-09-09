import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MappingWizard } from '../src/components/MappingWizard';
import { diagnosticMessage, hasEnglishDiagnosticCopy } from '../src/diagnostics/en';
import { ingestThermalFiles } from '../src/io';
import ambiguousCsv from './fixtures/bare_ambiguous.csv?raw';

describe('guided mapping UI', () => {
  it('renders source columns, units, preview and a per-file validation action', async () => {
    const ingestion = await ingestThermalFiles([
      new File([ambiguousCsv], 'instrument-a.csv', { type: 'text/csv' }),
    ]);

    const html = renderToStaticMarkup(
      <MappingWizard
        ingestion={ingestion}
        optionsByFile={[{}]}
        isBusy={false}
        onChange={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(ingestion.status).toBe('needs_mapping');
    expect(html).toContain('Guided data mapping');
    expect(html).toContain('Temperature');
    expect(html).toContain('Conversion α');
    expect(html).toContain('Heating rate β');
    expect(html).toContain('Source preview');
    expect(html).toContain('Validate selections and reread');
    expect(html).toContain('Select a unit');
  });
});

describe('actionable English scientific diagnostics', () => {
  const criticalCodes = [
    'UNKNOWN_TEMPERATURE_UNIT',
    'UNKNOWN_HEATING_RATE_UNIT',
    'INSUFFICIENT_DISTINCT_HEATING_RATES',
    'NO_COMMON_ALPHA_RANGE',
    'NON_MONOTONIC_ALPHA',
    'STAGE_WINDOW_REQUIRED',
    'INCONSISTENT_CONTEXT',
    'NONLINEAR_HEATING_UNSUPPORTED',
    'LOW_R2',
    'KISSINGER_PEAK_MISSING',
  ];

  it.each(criticalCodes)('%s explains the problem, scientific risk and corrective action', (code) => {
    const message = diagnosticMessage(code, 'fallback');
    expect(hasEnglishDiagnosticCopy(code)).toBe(true);
    expect(message).toContain('Problem:');
    expect(message).toContain('Why it matters:');
    expect(message).toContain('Action:');
    expect(message).not.toBe('fallback');
  });

  it('preserves unknown technical diagnostics instead of inventing copy', () => {
    expect(diagnosticMessage('FUTURE_CODE', 'Source detail')).toBe('Source detail');
  });
});
