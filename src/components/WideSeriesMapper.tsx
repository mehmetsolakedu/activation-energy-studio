import type {
  AlphaDerivativeUnit,
  HeatingRateUnit,
  MassRateUnit,
  RawCell,
  WideSeriesDefinition,
  WideSeriesDerivative,
  WideSeriesPopulatedColumnProfile,
  WideSeriesSignal,
} from '../io';

const HEATING_RATE_UNITS: readonly HeatingRateUnit[] = ['K/min', 'C/min', 'K/s', 'C/s'];
const ALPHA_DERIVATIVE_UNITS: readonly AlphaDerivativeUnit[] = [
  'min^-1',
  's^-1',
  '%/min',
  '%/s',
];
const MASS_RATE_UNITS: readonly MassRateUnit[] = [
  'mg/min',
  'mg/s',
  'g/min',
  'g/s',
  '%/min',
  '%/s',
  'fraction/min',
  'fraction/s',
];

interface WideSeriesMapperProps {
  headers: readonly string[];
  preview: readonly (readonly RawCell[])[];
  populatedColumns?: readonly WideSeriesPopulatedColumnProfile[];
  series: readonly WideSeriesDefinition[];
  scopeConfirmed: boolean;
  onSeriesChange: (series: readonly WideSeriesDefinition[]) => void;
  onScopeConfirmedChange: (confirmed: boolean) => void;
}

function columnIsValid(columnIndex: number, columnCount: number): boolean {
  return Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex < columnCount;
}

function populatedColumnIndices(
  headers: readonly string[],
  preview: readonly (readonly RawCell[])[],
): number[] {
  return headers
    .map((_, index) => index)
    .filter((index) => preview.some((row) => {
      const value = row[index];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }));
}

function selectedColumnIndices(series: readonly WideSeriesDefinition[]): Set<number> {
  const selected = new Set<number>();
  for (const definition of series) {
    selected.add(definition.temperature.columnIndex);
    selected.add(definition.signal.columnIndex);
    if (definition.derivative) {
      selected.add(definition.derivative.valueColumnIndex);
      if (definition.derivative.temperatureColumn) {
        selected.add(definition.derivative.temperatureColumn.columnIndex);
      }
    }
  }
  return selected;
}

function hasCompatibleMassDerivative(definition: WideSeriesDefinition): boolean {
  const derivative = definition.derivative;
  if (!derivative || derivative.semantic === 'dAlphaDt') return true;
  if (definition.signal.kind === 'mass') {
    return derivative.unit.startsWith('mg/') || derivative.unit.startsWith('g/');
  }
  if (definition.signal.kind === 'massPercent') {
    return derivative.unit.startsWith('%/') || derivative.unit.startsWith('fraction/');
  }
  return false;
}

export function wideSeriesDefinitionsComplete(
  series: readonly WideSeriesDefinition[] | undefined,
  columnCount: number,
): boolean {
  if (!series || series.length === 0 || columnCount <= 0) return false;

  const seriesIds = new Set<string>();
  const runIds = new Set<string>();
  const valueColumns = new Set<number>();
  const temperatureColumns = new Set<number>();

  for (const definition of series) {
    const seriesId = definition.seriesId.trim();
    const runId = definition.runId.trim();
    if (
      seriesId === ''
      || runId === ''
      || seriesIds.has(seriesId)
      || runIds.has(runId)
      || definition.context.sample.trim() === ''
      || definition.context.atmosphere.trim() === ''
      || definition.context.stage.trim() === ''
      || !Number.isFinite(definition.heatingRate.value)
      || definition.heatingRate.value <= 0
      || !columnIsValid(definition.temperature.columnIndex, columnCount)
      || !columnIsValid(definition.signal.columnIndex, columnCount)
    ) {
      return false;
    }
    seriesIds.add(seriesId);
    runIds.add(runId);
    temperatureColumns.add(definition.temperature.columnIndex);

    if (valueColumns.has(definition.signal.columnIndex)) return false;
    valueColumns.add(definition.signal.columnIndex);

    if (definition.signal.kind !== 'alpha') {
      const { initialValue, finalValue } = definition.signal.alphaReference;
      if (
        !Number.isFinite(initialValue)
        || !Number.isFinite(finalValue)
        || initialValue <= finalValue
      ) {
        return false;
      }
    }

    if (definition.derivative) {
      if (
        !columnIsValid(definition.derivative.valueColumnIndex, columnCount)
        || valueColumns.has(definition.derivative.valueColumnIndex)
      ) {
        return false;
      }
      valueColumns.add(definition.derivative.valueColumnIndex);
      if (definition.derivative.temperatureColumn) {
        if (
          !columnIsValid(definition.derivative.temperatureColumn.columnIndex, columnCount)
        ) {
          return false;
        }
        temperatureColumns.add(definition.derivative.temperatureColumn.columnIndex);
      }
      if (!hasCompatibleMassDerivative(definition)) return false;
    }
  }

  return [...valueColumns].every((column) => !temperatureColumns.has(column));
}

function numberInputValue(value: number): string | number {
  return Number.isFinite(value) ? value : '';
}

function parseNumberInput(rawValue: string): number {
  if (rawValue.trim() === '') return Number.NaN;
  const value = Number(rawValue.replace(',', '.'));
  return Number.isFinite(value) ? value : Number.NaN;
}

function parseColumnInput(rawValue: string): number {
  return rawValue === '' ? -1 : Number(rawValue);
}

function columnOptions(headers: readonly string[]) {
  return headers.map((header, index) => (
    <option key={`${header}-${index}`} value={index}>
      {index + 1}. {header || '(no header)'}
    </option>
  ));
}

function defaultSignal(kind: WideSeriesSignal['kind']): WideSeriesSignal {
  switch (kind) {
    case 'alpha':
      return { kind, columnIndex: -1, unit: 'fraction' };
    case 'mass':
      return {
        kind,
        columnIndex: -1,
        unit: 'mg',
        alphaReference: { initialValue: Number.NaN, finalValue: Number.NaN },
      };
    case 'massPercent':
      return {
        kind,
        columnIndex: -1,
        unit: '%',
        alphaReference: { initialValue: Number.NaN, finalValue: Number.NaN },
      };
  }
}

function defaultDerivative(
  semantic: WideSeriesDerivative['semantic'],
  signal: WideSeriesSignal,
  previous?: WideSeriesDerivative,
): WideSeriesDerivative {
  const valueColumnIndex = previous?.valueColumnIndex ?? -1;
  const temperatureColumn = previous?.temperatureColumn;
  if (semantic === 'dAlphaDt') {
    return {
      semantic,
      valueColumnIndex,
      unit: 'min^-1',
      ...(temperatureColumn ? { temperatureColumn } : {}),
    };
  }
  const unit: MassRateUnit = signal.kind === 'mass' ? 'mg/min' : '%/min';
  return {
    semantic,
    valueColumnIndex,
    unit,
    ...(temperatureColumn ? { temperatureColumn } : {}),
  };
}

function sharedContextValue(
  series: readonly WideSeriesDefinition[],
  field: keyof WideSeriesDefinition['context'],
): string {
  const first = series[0]?.context[field] ?? '';
  return series.every((definition) => definition.context[field] === first) ? first : '';
}

function nextDefinition(series: readonly WideSeriesDefinition[]): WideSeriesDefinition {
  const seriesIds = new Set(series.map(({ seriesId }) => seriesId));
  const runIds = new Set(series.map(({ runId }) => runId));
  let number = 1;
  while (seriesIds.has(`series-${number}`) || runIds.has(`run-${number}`)) number += 1;
  return {
    seriesId: `series-${number}`,
    runId: `run-${number}`,
    temperature: { columnIndex: -1, unit: 'C' },
    signal: defaultSignal('alpha'),
    heatingRate: { value: Number.NaN, unit: 'K/min' },
    context: { sample: '', atmosphere: '', stage: '' },
  };
}

export function WideSeriesMapper({
  headers,
  preview,
  populatedColumns,
  series,
  scopeConfirmed,
  onSeriesChange,
  onScopeConfirmedChange,
}: WideSeriesMapperProps) {
  const selectedColumns = selectedColumnIndices(series);
  const fullTableProfileAvailable = populatedColumns !== undefined;
  const populationProfile = populatedColumns ?? populatedColumnIndices(headers, preview)
    .map((columnIndex) => ({
      columnIndex,
      header: headers[columnIndex] ?? '',
      populatedRowCount: 0,
      firstSourceRow: 0,
      lastSourceRow: 0,
    }));
  const excludedPopulatedColumns = populationProfile
    .filter(({ columnIndex }) => !selectedColumns.has(columnIndex));

  function updateDefinition(
    index: number,
    update: (definition: WideSeriesDefinition) => WideSeriesDefinition,
  ) {
    const next = [...series];
    const current = next[index];
    if (!current) return;
    next[index] = update(current);
    onSeriesChange(next);
  }

  function updateAllContexts(
    field: keyof WideSeriesDefinition['context'],
    value: string,
  ) {
    onSeriesChange(series.map((definition) => ({
      ...definition,
      context: { ...definition.context, [field]: value },
    })));
  }

  return (
    <div className="wide-series-mapper" data-testid="wide-series-mapper">
      <div className="notice info">
        {'For side-by-side series, column meaning is not inferred automatically from position, header, or numeric magnitude. Explicitly verify every assignment against your source file.'}
      </div>

      <div className="default-rate-box wide-common-context">
        <div>
          <strong>
            {'Experimental context shared by all series'}
          </strong>
          <span>
            {'These fields are applied to every series together and can then be changed individually.'}
          </span>
        </div>
        <label>
          {'Shared sample'}
          <input
            data-testid="wide-common-sample"
            disabled={series.length === 0}
            value={sharedContextValue(series, 'sample')}
            onChange={(event) => updateAllContexts('sample', event.target.value)}
          />
        </label>
        <label>
          {'Shared atmosphere'}
          <input
            data-testid="wide-common-atmosphere"
            disabled={series.length === 0}
            value={sharedContextValue(series, 'atmosphere')}
            onChange={(event) => updateAllContexts('atmosphere', event.target.value)}
          />
        </label>
        <label>
          {'Shared reaction stage'}
          <input
            data-testid="wide-common-stage"
            disabled={series.length === 0}
            value={sharedContextValue(series, 'stage')}
            onChange={(event) => updateAllContexts('stage', event.target.value)}
          />
        </label>
      </div>

      {series.map((definition, index) => {
        const derivative = definition.derivative;
        const derivativeUnits = derivative?.semantic === 'dAlphaDt'
          ? ALPHA_DERIVATIVE_UNITS
          : MASS_RATE_UNITS;
        return (
          <fieldset
            className="mapping-role-grid mapping-role wide-series-definition"
            data-testid={`wide-series-${index}`}
            key={index}
          >
            <legend>{`Series ${index + 1}`}</legend>
            <label>
              {'Series identifier'}
              <input
                data-testid={`wide-series-id-${index}`}
                value={definition.seriesId}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  seriesId: event.target.value,
                }))}
              />
            </label>
            <label>
              {'Run identifier'}
              <input
                data-testid={`wide-run-id-${index}`}
                value={definition.runId}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  runId: event.target.value,
                }))}
              />
            </label>
            <label>
              {'Temperature column'}
              <select
                data-testid={`wide-temperature-column-${index}`}
                value={definition.temperature.columnIndex >= 0
                  ? definition.temperature.columnIndex
                  : ''}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  temperature: {
                    ...current.temperature,
                    columnIndex: parseColumnInput(event.target.value),
                  },
                }))}
              >
                <option value="">{'Select a column…'}</option>
                {columnOptions(headers)}
              </select>
            </label>
            <label>
              {'Temperature unit'}
              <select
                data-testid={`wide-temperature-unit-${index}`}
                value={definition.temperature.unit}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  temperature: {
                    ...current.temperature,
                    unit: event.target.value as 'C' | 'K',
                  },
                }))}
              >
                <option value="C">°C</option>
                <option value="K">K</option>
              </select>
            </label>

            <label>
              {'Primary signal meaning'}
              <select
                data-testid={`wide-signal-kind-${index}`}
                value={definition.signal.kind}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  signal: defaultSignal(event.target.value as WideSeriesSignal['kind']),
                  derivative: undefined,
                }))}
              >
                <option value="alpha">{'Conversion α'}</option>
                <option value="mass">{'Absolute mass'}</option>
                <option value="massPercent">
                  {'Mass percentage / fraction'}
                </option>
              </select>
            </label>
            <label>
              {'Primary signal column'}
              <select
                data-testid={`wide-signal-column-${index}`}
                value={definition.signal.columnIndex >= 0 ? definition.signal.columnIndex : ''}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  signal: {
                    ...current.signal,
                    columnIndex: parseColumnInput(event.target.value),
                  },
                }))}
              >
                <option value="">{'Select a column…'}</option>
                {columnOptions(headers)}
              </select>
            </label>
            <label>
              {'Primary signal unit'}
              {definition.signal.kind === 'alpha' && (
                <select
                  data-testid={`wide-signal-unit-${index}`}
                  value={definition.signal.unit}
                  onChange={(event) => updateDefinition(index, (current) => ({
                    ...current,
                    signal: current.signal.kind === 'alpha'
                      ? { ...current.signal, unit: event.target.value as 'fraction' | '%' }
                      : current.signal,
                  }))}
                >
                  <option value="fraction">{'Fraction (0–1)'}</option>
                  <option value="%">%</option>
                </select>
              )}
              {definition.signal.kind === 'mass' && (
                <select
                  data-testid={`wide-signal-unit-${index}`}
                  value={definition.signal.unit}
                  onChange={(event) => updateDefinition(index, (current) => ({
                    ...current,
                    signal: current.signal.kind === 'mass'
                      ? { ...current.signal, unit: event.target.value as 'mg' | 'g' }
                      : current.signal,
                  }))}
                >
                  <option value="mg">mg</option>
                  <option value="g">g</option>
                </select>
              )}
              {definition.signal.kind === 'massPercent' && (
                <select
                  data-testid={`wide-signal-unit-${index}`}
                  value={definition.signal.unit}
                  onChange={(event) => updateDefinition(index, (current) => ({
                    ...current,
                    signal: current.signal.kind === 'massPercent'
                      ? { ...current.signal, unit: event.target.value as '%' | 'fraction' }
                      : current.signal,
                  }))}
                >
                  <option value="%">%</option>
                  <option value="fraction">{'Fraction (0–1)'}</option>
                </select>
              )}
            </label>

            {definition.signal.kind !== 'alpha' && (
              <>
                <label>
                  {'α=0 initial mass reference'}
                  <input
                    data-testid={`wide-alpha-initial-${index}`}
                    inputMode="decimal"
                    value={numberInputValue(definition.signal.alphaReference.initialValue)}
                    onChange={(event) => updateDefinition(index, (current) => ({
                      ...current,
                      signal: current.signal.kind === 'alpha'
                        ? current.signal
                        : {
                            ...current.signal,
                            alphaReference: {
                              ...current.signal.alphaReference,
                              initialValue: parseNumberInput(event.target.value),
                            },
                          },
                    }))}
                  />
                </label>
                <label>
                  {'α=1 final mass reference'}
                  <input
                    data-testid={`wide-alpha-final-${index}`}
                    inputMode="decimal"
                    value={numberInputValue(definition.signal.alphaReference.finalValue)}
                    onChange={(event) => updateDefinition(index, (current) => ({
                      ...current,
                      signal: current.signal.kind === 'alpha'
                        ? current.signal
                        : {
                            ...current.signal,
                            alphaReference: {
                              ...current.signal.alphaReference,
                              finalValue: parseNumberInput(event.target.value),
                            },
                          },
                    }))}
                  />
                </label>
              </>
            )}

            <label>
              {'Heating rate β'}
              <input
                data-testid={`wide-heating-rate-${index}`}
                inputMode="decimal"
                value={numberInputValue(definition.heatingRate.value)}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  heatingRate: {
                    ...current.heatingRate,
                    value: parseNumberInput(event.target.value),
                  },
                }))}
              />
            </label>
            <label>
              {'Heating-rate unit'}
              <select
                data-testid={`wide-heating-rate-unit-${index}`}
                value={definition.heatingRate.unit}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  heatingRate: {
                    ...current.heatingRate,
                    unit: event.target.value as HeatingRateUnit,
                  },
                }))}
              >
                {HEATING_RATE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
              </select>
            </label>

            <label>
              {'Derivative column meaning'}
              <select
                data-testid={`wide-derivative-semantic-${index}`}
                value={derivative?.semantic ?? 'none'}
                onChange={(event) => updateDefinition(index, (current) => {
                  if (event.target.value === 'none') {
                    return { ...current, derivative: undefined };
                  }
                  return {
                    ...current,
                    derivative: defaultDerivative(
                      event.target.value as WideSeriesDerivative['semantic'],
                      current.signal,
                      current.derivative,
                    ),
                  };
                })}
              >
                <option value="none">
                  {'Do not use a derivative column'}
                </option>
                <option value="dAlphaDt">{'Direct dα/dt'}</option>
                <option value="massLossRate">
                  {'Positive mass-loss rate (−dm/dt)'}
                </option>
                <option value="massChangeRate">
                  {'Signed mass-change rate (dm/dt)'}
                </option>
              </select>
            </label>

            {derivative && (
              <>
                <label>
                  {'Derivative value column'}
                  <select
                    data-testid={`wide-derivative-value-column-${index}`}
                    value={derivative.valueColumnIndex >= 0
                      ? derivative.valueColumnIndex
                      : ''}
                    onChange={(event) => updateDefinition(index, (current) => ({
                      ...current,
                      derivative: current.derivative
                        ? {
                          ...current.derivative,
                            valueColumnIndex: parseColumnInput(event.target.value),
                          }
                        : undefined,
                    }))}
                  >
                    <option value="">{'Select a column…'}</option>
                    {columnOptions(headers)}
                  </select>
                </label>
                <label>
                  {'Derivative unit'}
                  <select
                    data-testid={`wide-derivative-unit-${index}`}
                    value={derivative.unit}
                    onChange={(event) => updateDefinition(index, (current) => ({
                      ...current,
                      derivative: current.derivative
                        ? {
                            ...current.derivative,
                            unit: event.target.value as AlphaDerivativeUnit | MassRateUnit,
                          } as WideSeriesDerivative
                        : undefined,
                    }))}
                  >
                    {derivativeUnits.map((unit) => <option key={unit}>{unit}</option>)}
                  </select>
                </label>
                <label>
                  <span>
                    {'Separate derivative-temperature column'}
                  </span>
                  <input
                    checked={derivative.temperatureColumn !== undefined}
                    data-testid={`wide-derivative-temperature-enabled-${index}`}
                    type="checkbox"
                    onChange={(event) => updateDefinition(index, (current) => {
                      if (!current.derivative) return current;
                      return {
                        ...current,
                        derivative: {
                          ...current.derivative,
                          temperatureColumn: event.target.checked
                            ? {
                                columnIndex: -1,
                                unit: current.temperature.unit,
                              }
                            : undefined,
                        } as WideSeriesDerivative,
                      };
                    })}
                  />
                </label>
                {derivative.temperatureColumn && (
                  <>
                    <label>
                      {'Derivative-temperature column'}
                      <select
                        data-testid={`wide-derivative-temperature-column-${index}`}
                        value={derivative.temperatureColumn.columnIndex >= 0
                          ? derivative.temperatureColumn.columnIndex
                          : ''}
                        onChange={(event) => updateDefinition(index, (current) => {
                          if (!current.derivative?.temperatureColumn) return current;
                          return {
                            ...current,
                            derivative: {
                              ...current.derivative,
                              temperatureColumn: {
                                ...current.derivative.temperatureColumn,
                                columnIndex: parseColumnInput(event.target.value),
                              },
                            } as WideSeriesDerivative,
                          };
                        })}
                      >
                        <option value="">{'Select a column…'}</option>
                        {columnOptions(headers)}
                      </select>
                    </label>
                    <label>
                      {'Derivative-temperature unit'}
                      <select
                        data-testid={`wide-derivative-temperature-unit-${index}`}
                        value={derivative.temperatureColumn.unit}
                        onChange={(event) => updateDefinition(index, (current) => {
                          if (!current.derivative?.temperatureColumn) return current;
                          return {
                            ...current,
                            derivative: {
                              ...current.derivative,
                              temperatureColumn: {
                                ...current.derivative.temperatureColumn,
                                unit: event.target.value as 'C' | 'K',
                              },
                            } as WideSeriesDerivative,
                          };
                        })}
                      >
                        <option value="C">°C</option>
                        <option value="K">K</option>
                      </select>
                    </label>
                  </>
                )}
              </>
            )}

            <label>
              {'Sample'}
              <input
                data-testid={`wide-sample-${index}`}
                value={definition.context.sample}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  context: { ...current.context, sample: event.target.value },
                }))}
              />
            </label>
            <label>
              {'Atmosphere'}
              <input
                data-testid={`wide-atmosphere-${index}`}
                value={definition.context.atmosphere}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  context: { ...current.context, atmosphere: event.target.value },
                }))}
              />
            </label>
            <label>
              {'Reaction stage'}
              <input
                data-testid={`wide-stage-${index}`}
                value={definition.context.stage}
                onChange={(event) => updateDefinition(index, (current) => ({
                  ...current,
                  context: { ...current.context, stage: event.target.value },
                }))}
              />
            </label>
            <button
              className="secondary-button"
              data-testid={`wide-remove-series-${index}`}
              onClick={() => onSeriesChange(series.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              {'Remove this series'}
            </button>
          </fieldset>
        );
      })}

      <button
        className="secondary-button"
        data-testid="wide-add-series"
        onClick={() => onSeriesChange([...series, nextDefinition(series)])}
        type="button"
      >
        {'Add series'}
      </button>

      <div className="notice warning wide-scope-confirmation">
        <strong>{'Analysis scope confirmation'}</strong>
        <p>
          {fullTableProfileAvailable
            ? 'Populated columns found in the full source table but not selected'
            : 'Populated columns visible in the source preview but not selected'}: {
            excludedPopulatedColumns.length > 0
              ? excludedPopulatedColumns
                .map((profile) => {
                  const label = `${profile.columnIndex + 1}. ${
                    profile.header
                    || headers[profile.columnIndex]
                    || '(no header)'
                  }`;
                  return fullTableProfileAvailable
                    ? `${label} (${profile.populatedRowCount} rows; source rows ${profile.firstSourceRow}–${profile.lastSourceRow})`
                    : label;
                })
                .join(', ')
              : 'none'
          }
        </p>
        <label>
          <input
            checked={scopeConfirmed}
            data-testid="wide-scope-confirmed"
            onChange={(event) => onScopeConfirmedChange(event.target.checked)}
            type="checkbox"
          />
          {'I explicitly confirm that populated columns I did not select are outside the scope of this analysis.'}
        </label>
      </div>
    </div>
  );
}
