import type {
  AlphaDerivativeSource,
  AlphaDerivativeUnit,
  HeatingRateUnit,
  IngestionSource,
  MassRateUnit,
  RawCell,
  RawTable,
  WideSeriesDataset,
  WideSeriesDefinition,
  WideSeriesDiagnostic,
  WideSeriesDiagnosticCode,
  WideSeriesNormalizationResult,
  WideSeriesProjectedPoint,
  WideSeriesProjectionResult,
  WideSeriesSourceObservation,
  WideSeriesTableOptions,
  WideSeriesTableProjectionResult,
} from './types';

const CANONICAL_NUMBER = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?$/;
const ALPHA_TOLERANCE = 1e-10;
const GRID_TOLERANCE = 1e-9;
const REFERENCE_TOLERANCE = 1e-10;

interface DerivativeObservation {
  sourceRow: number;
  temperatureK: number;
  rawValue: number;
  dAlphaDtPerMinute: number;
}

interface CrossingEvent {
  direction: 'upward' | 'downward';
  leftIndex: number;
  rightIndex: number;
  exactIndex?: number;
}

interface CrossingSelection {
  lowerIndex: number;
  upperIndex: number;
}

function diagnostic(
  severity: WideSeriesDiagnostic['severity'],
  code: WideSeriesDiagnosticCode,
  message: string,
  details: Partial<Omit<WideSeriesDiagnostic, 'severity' | 'code' | 'message'>> = {},
): WideSeriesDiagnostic {
  return { severity, code, message, ...details };
}

function displayCell(value: RawCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function isBlank(value: RawCell): boolean {
  return displayCell(value) === '';
}

function parseNumberCell(value: RawCell, decimalSeparator: '.' | ','): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  let normalized = value
    .trim()
    .replace(/[−–]/g, '-')
    .replace(/[\u00a0\u202f\s]/g, '');
  if (normalized === '') return undefined;
  if (decimalSeparator === ',') {
    if (normalized.includes('.')) return undefined;
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',')) {
    return undefined;
  }
  if (!CANONICAL_NUMBER.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function temperatureK(value: number, unit: 'K' | 'C'): number {
  return unit === 'C' ? value + 273.15 : value;
}

function heatingRateKPerMinute(value: number, unit: HeatingRateUnit): number {
  return unit.endsWith('/s') ? value * 60 : value;
}

function directDerivativePerMinute(value: number, unit: AlphaDerivativeUnit): number {
  switch (unit) {
    case 'min^-1':
      return value;
    case 's^-1':
      return value * 60;
    case '%/min':
      return value / 100;
    case '%/s':
      return (value * 60) / 100;
  }
}

function massRatePerMinute(value: number, unit: MassRateUnit): number {
  switch (unit) {
    case 'mg/min':
    case 'fraction/min':
      return value;
    case 'mg/s':
    case 'fraction/s':
      return value * 60;
    case 'g/min':
      return value * 1000;
    case 'g/s':
      return value * 60_000;
    case '%/min':
      return value / 100;
    case '%/s':
      return (value * 60) / 100;
  }
}

function referenceScale(initialValue: number, finalValue: number): number {
  return Math.max(1, Math.abs(initialValue), Math.abs(finalValue));
}

function valuesMatch(left: number, right: number, tolerance = GRID_TOLERANCE): boolean {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function columnIndices(definition: WideSeriesDefinition): number[] {
  const indices = [
    definition.temperature.columnIndex,
    definition.signal.columnIndex,
  ];
  if (definition.derivative) {
    indices.push(definition.derivative.valueColumnIndex);
    if (definition.derivative.temperatureColumn) {
      indices.push(definition.derivative.temperatureColumn.columnIndex);
    }
  }
  return indices;
}

function validateDefinitions(
  options: WideSeriesTableOptions,
  columnCount: number,
  diagnostics: WideSeriesDiagnostic[],
): boolean {
  if (options.series.length === 0) {
    diagnostics.push(
      diagnostic('error', 'WIDE_SERIES_REQUIRED', 'At least one explicit wide-series definition is required.'),
    );
    return false;
  }

  const seenSeriesIds = new Set<string>();
  const seenRunIds = new Set<string>();
  const temperatureColumns = new Set<number>();
  const valueColumnOwners = new Map<number, string>();

  for (const definition of options.series) {
    const details = { seriesId: definition.seriesId, runId: definition.runId };
    const seriesId = definition.seriesId.trim();
    const runId = definition.runId.trim();
    if (seriesId === '' || seenSeriesIds.has(seriesId)) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_SERIES_ID_INVALID',
          seriesId === ''
            ? 'Every wide series requires a non-empty seriesId.'
            : `Duplicate wide-series id "${seriesId}" is not allowed.`,
          details,
        ),
      );
    } else {
      seenSeriesIds.add(seriesId);
    }
    if (runId === '' || seenRunIds.has(runId)) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_RUN_ID_INVALID',
          runId === ''
            ? 'Every wide series requires a non-empty runId.'
            : `Duplicate wide-series runId "${runId}" is not allowed.`,
          details,
        ),
      );
    } else {
      seenRunIds.add(runId);
    }

    if (
      definition.context.sample.trim() === ''
      || definition.context.atmosphere.trim() === ''
      || definition.context.stage.trim() === ''
    ) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_CONTEXT_REQUIRED',
          'Sample, atmosphere, and stage context must be supplied explicitly for every series.',
          details,
        ),
      );
    }

    if (!Number.isFinite(definition.heatingRate.value) || definition.heatingRate.value <= 0) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_HEATING_RATE_INVALID',
          'Heating rate must be finite and positive.',
          details,
        ),
      );
    }

    for (const index of columnIndices(definition)) {
      if (!Number.isInteger(index) || index < 0 || index >= columnCount) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_COLUMN_OUT_OF_RANGE',
            `Column index ${index} is outside the ${columnCount}-column source table.`,
            { ...details, columnIndex: index },
          ),
        );
      }
    }

    const localValueColumns = [
      definition.signal.columnIndex,
      ...(definition.derivative ? [definition.derivative.valueColumnIndex] : []),
    ];
    const localTemperatureColumns = [
      definition.temperature.columnIndex,
      ...(definition.derivative?.temperatureColumn
        ? [definition.derivative.temperatureColumn.columnIndex]
        : []),
    ];
    if (
      new Set(localValueColumns).size !== localValueColumns.length
      || localValueColumns.some((index) => localTemperatureColumns.includes(index))
    ) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_COLUMN_CONFLICT',
          'Signal and derivative value columns must be distinct from each other and from temperature columns.',
          details,
        ),
      );
    }

    for (const index of localTemperatureColumns) temperatureColumns.add(index);
    for (const index of localValueColumns) {
      const owner = valueColumnOwners.get(index);
      if (owner) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_COLUMN_CONFLICT',
            `Value column ${index} is assigned to both "${owner}" and "${definition.seriesId}".`,
            { ...details, columnIndex: index },
          ),
        );
      } else {
        valueColumnOwners.set(index, definition.seriesId);
      }
    }

    if (definition.signal.kind !== 'alpha') {
      const { initialValue, finalValue } = definition.signal.alphaReference;
      const tolerance = REFERENCE_TOLERANCE * referenceScale(initialValue, finalValue);
      if (
        !Number.isFinite(initialValue)
        || !Number.isFinite(finalValue)
        || !(initialValue - finalValue > tolerance)
      ) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_ALPHA_REFERENCE_INVALID',
            'Initial mass reference must be finite and greater than the final reference.',
            details,
          ),
        );
      }
    }

    if (definition.derivative && definition.derivative.semantic !== 'dAlphaDt') {
      const derivativeUnit = definition.derivative.unit;
      const isAbsoluteRate = /^(?:mg|g)\//.test(derivativeUnit);
      const isRelativeRate = /^(?:%|fraction)\//.test(derivativeUnit);
      const compatible = (
        (definition.signal.kind === 'mass' && isAbsoluteRate)
        || (definition.signal.kind === 'massPercent' && isRelativeRate)
      );
      if (!compatible) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_DERIVATIVE_SIGNAL_MISMATCH',
            'Mass-rate derivative semantics require a mass signal in compatible absolute or relative units.',
            details,
          ),
        );
      }
    }
  }

  for (const [index, owner] of valueColumnOwners) {
    if (temperatureColumns.has(index)) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_COLUMN_CONFLICT',
          `Column ${index}, owned as a value column by "${owner}", is also used as a temperature column.`,
          { seriesId: owner, columnIndex: index },
        ),
      );
    }
  }

  return !diagnostics.some((item) => item.severity === 'error');
}

function canonicalSignal(
  definition: WideSeriesDefinition,
  rawValue: number,
): Pick<WideSeriesSourceObservation, 'alpha' | 'massValue' | 'massReference'> {
  if (definition.signal.kind === 'alpha') {
    return {
      alpha: definition.signal.unit === '%' ? rawValue / 100 : rawValue,
    };
  }

  if (definition.signal.kind === 'mass') {
    const factor = definition.signal.unit === 'g' ? 1000 : 1;
    const massValue = rawValue * factor;
    const initialValue = definition.signal.alphaReference.initialValue * factor;
    const finalValue = definition.signal.alphaReference.finalValue * factor;
    return {
      alpha: (initialValue - massValue) / (initialValue - finalValue),
      massValue,
      massReference: { initialValue, finalValue, unit: 'mg' },
    };
  }

  const factor = definition.signal.unit === '%' ? 1 / 100 : 1;
  const massValue = rawValue * factor;
  const initialValue = definition.signal.alphaReference.initialValue * factor;
  const finalValue = definition.signal.alphaReference.finalValue * factor;
  return {
    alpha: (initialValue - massValue) / (initialValue - finalValue),
    massValue,
    massReference: { initialValue, finalValue, unit: 'fraction' },
  };
}

function canonicalDerivative(
  definition: WideSeriesDefinition,
  rawValue: number,
): number {
  const derivative = definition.derivative;
  if (!derivative) {
    throw new Error('Derivative conversion requires an explicit derivative definition.');
  }
  if (derivative.semantic === 'dAlphaDt') {
    return directDerivativePerMinute(rawValue, derivative.unit);
  }
  if (definition.signal.kind === 'alpha') {
    throw new Error('Mass derivative semantics cannot be applied to an alpha-only signal.');
  }

  const signalFactor = definition.signal.kind === 'mass'
    ? (definition.signal.unit === 'g' ? 1000 : 1)
    : (definition.signal.unit === '%' ? 1 / 100 : 1);
  const span = (
    definition.signal.alphaReference.initialValue
    - definition.signal.alphaReference.finalValue
  ) * signalFactor;
  const rate = massRatePerMinute(rawValue, derivative.unit);
  return derivative.semantic === 'massLossRate' ? rate / span : -rate / span;
}

function pushInvalidNumeric(
  diagnostics: WideSeriesDiagnostic[],
  definition: WideSeriesDefinition,
  sourceRow: number,
  columnIndex: number,
  label: string,
): void {
  diagnostics.push(
    diagnostic(
      'error',
      'WIDE_INVALID_NUMERIC_VALUE',
      `${label} must contain a finite number.`,
      {
        seriesId: definition.seriesId,
        runId: definition.runId,
        sourceRow,
        columnIndex,
      },
    ),
  );
}

function verifyIncreasingTemperatures(
  observations: readonly { temperatureK: number; sourceRow: number }[],
  definition: WideSeriesDefinition,
  diagnostics: WideSeriesDiagnostic[],
  label: string,
): void {
  for (let index = 1; index < observations.length; index += 1) {
    if (!(observations[index].temperatureK > observations[index - 1].temperatureK)) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_TEMPERATURE_NOT_INCREASING',
          `${label} temperatures must be strictly increasing in source acquisition order; rows are never sorted silently.`,
          {
            seriesId: definition.seriesId,
            runId: definition.runId,
            sourceRow: observations[index].sourceRow,
          },
        ),
      );
      return;
    }
  }
}

function normalizeOneSeries(
  rawTable: RawTable,
  options: WideSeriesTableOptions,
  definition: WideSeriesDefinition,
  diagnostics: WideSeriesDiagnostic[],
): WideSeriesSourceObservation[] {
  const observations: WideSeriesSourceObservation[] = [];
  const derivative = definition.derivative;
  const derivativeHasOwnTemperature = Boolean(derivative?.temperatureColumn);
  const details = { seriesId: definition.seriesId, runId: definition.runId };
  const heatingRate = heatingRateKPerMinute(
    definition.heatingRate.value,
    definition.heatingRate.unit,
  );
  const lastCompletePrimaryRowIndex = rawTable.reduce(
    (lastIndex, row, rowIndex) => {
      if (rowIndex <= options.headerRow) return lastIndex;
      return (
        !isBlank(row[definition.temperature.columnIndex])
        && !isBlank(row[definition.signal.columnIndex])
      )
        ? rowIndex
        : lastIndex;
    },
    -1,
  );

  for (let rowIndex = options.headerRow + 1; rowIndex < rawTable.length; rowIndex += 1) {
    const row = rawTable[rowIndex];
    const sourceRow = rowIndex + 1;
    const rawTemperature = row[definition.temperature.columnIndex];
    const rawSignal = row[definition.signal.columnIndex];
    const temperatureBlank = isBlank(rawTemperature);
    const signalBlank = isBlank(rawSignal);

    if (temperatureBlank && signalBlank) {
      if (
        derivative
        && !derivativeHasOwnTemperature
        && !isBlank(row[derivative.valueColumnIndex])
      ) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_DERIVATIVE_ORPHAN',
            'A derivative value exists on a row without its primary temperature and signal.',
            { ...details, sourceRow, columnIndex: derivative.valueColumnIndex },
          ),
        );
      }
      continue;
    }
    if (temperatureBlank || signalBlank) {
      if (
        lastCompletePrimaryRowIndex >= 0
        && rowIndex > lastCompletePrimaryRowIndex
      ) {
        diagnostics.push(
          diagnostic(
            'warning',
            'WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED',
            'A populated but incomplete row after the final complete observation was excluded as trailing export debris; review the reported source row.',
            {
              ...details,
              sourceRow,
              columnIndex: temperatureBlank
                ? definition.temperature.columnIndex
                : definition.signal.columnIndex,
            },
          ),
        );
        continue;
      }
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_INCOMPLETE_SIGNAL_ROW',
          'Temperature and signal must both be present for every retained source observation.',
          {
            ...details,
            sourceRow,
            columnIndex: temperatureBlank
              ? definition.temperature.columnIndex
              : definition.signal.columnIndex,
          },
        ),
      );
      continue;
    }

    const parsedTemperature = parseNumberCell(rawTemperature, options.decimalSeparator);
    const parsedSignal = parseNumberCell(rawSignal, options.decimalSeparator);
    if (parsedTemperature === undefined) {
      pushInvalidNumeric(
        diagnostics,
        definition,
        sourceRow,
        definition.temperature.columnIndex,
        'Temperature',
      );
      continue;
    }
    if (parsedSignal === undefined) {
      pushInvalidNumeric(
        diagnostics,
        definition,
        sourceRow,
        definition.signal.columnIndex,
        'Signal',
      );
      continue;
    }

    const convertedTemperature = temperatureK(parsedTemperature, definition.temperature.unit);
    if (!(convertedTemperature > 0)) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_NONPHYSICAL_TEMPERATURE',
          'Temperature must be above absolute zero after unit conversion.',
          { ...details, sourceRow, columnIndex: definition.temperature.columnIndex },
        ),
      );
      continue;
    }

    const signal = canonicalSignal(definition, parsedSignal);
    let rawDerivativeValue: number | undefined;
    let dAlphaDtPerMinute: number | undefined;
    let derivativeSourceRow: number | undefined;
    if (derivative && !derivativeHasOwnTemperature) {
      const rawDerivative = row[derivative.valueColumnIndex];
      if (isBlank(rawDerivative)) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_INCOMPLETE_DERIVATIVE_ROW',
            'A derivative value is required on every primary source row when no separate derivative temperature column is supplied.',
            { ...details, sourceRow, columnIndex: derivative.valueColumnIndex },
          ),
        );
        continue;
      }
      const parsedDerivative = parseNumberCell(rawDerivative, options.decimalSeparator);
      if (parsedDerivative === undefined) {
        pushInvalidNumeric(
          diagnostics,
          definition,
          sourceRow,
          derivative.valueColumnIndex,
          'Derivative',
        );
        continue;
      }
      rawDerivativeValue = parsedDerivative;
      dAlphaDtPerMinute = canonicalDerivative(definition, parsedDerivative);
      derivativeSourceRow = sourceRow;
    }

    observations.push({
      seriesId: definition.seriesId,
      runId: definition.runId,
      sourceRow,
      ...(derivativeSourceRow === undefined ? {} : { derivativeSourceRow }),
      temperatureK: convertedTemperature,
      ...signal,
      ...(dAlphaDtPerMinute === undefined ? {} : { dAlphaDtPerMinute }),
      heatingRateKPerMin: heatingRate,
      signalKind: definition.signal.kind,
      rawSignalValue: parsedSignal,
      ...(rawDerivativeValue === undefined ? {} : { rawDerivativeValue }),
      context: { ...definition.context },
      sourceColumns: {
        temperatureColumnIndex: definition.temperature.columnIndex,
        signalColumnIndex: definition.signal.columnIndex,
        ...(derivative?.temperatureColumn
          ? { derivativeTemperatureColumnIndex: derivative.temperatureColumn.columnIndex }
          : {}),
        ...(derivative ? { derivativeValueColumnIndex: derivative.valueColumnIndex } : {}),
      },
    });
  }

  verifyIncreasingTemperatures(observations, definition, diagnostics, 'Primary');

  if (derivative?.temperatureColumn) {
    const derivativeObservations: DerivativeObservation[] = [];
    for (let rowIndex = options.headerRow + 1; rowIndex < rawTable.length; rowIndex += 1) {
      const row = rawTable[rowIndex];
      const sourceRow = rowIndex + 1;
      const rawTemperature = row[derivative.temperatureColumn.columnIndex];
      const rawValue = row[derivative.valueColumnIndex];
      const temperatureBlank = isBlank(rawTemperature);
      const valueBlank = isBlank(rawValue);
      if (temperatureBlank && valueBlank) continue;
      if (temperatureBlank || valueBlank) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_INCOMPLETE_DERIVATIVE_ROW',
            'Separate derivative temperature and value columns must contain complete pairs.',
            {
              ...details,
              sourceRow,
              columnIndex: temperatureBlank
                ? derivative.temperatureColumn.columnIndex
                : derivative.valueColumnIndex,
            },
          ),
        );
        continue;
      }

      const parsedTemperature = parseNumberCell(rawTemperature, options.decimalSeparator);
      const parsedValue = parseNumberCell(rawValue, options.decimalSeparator);
      if (parsedTemperature === undefined) {
        pushInvalidNumeric(
          diagnostics,
          definition,
          sourceRow,
          derivative.temperatureColumn.columnIndex,
          'Derivative temperature',
        );
        continue;
      }
      if (parsedValue === undefined) {
        pushInvalidNumeric(
          diagnostics,
          definition,
          sourceRow,
          derivative.valueColumnIndex,
          'Derivative',
        );
        continue;
      }
      const convertedTemperature = temperatureK(
        parsedTemperature,
        derivative.temperatureColumn.unit,
      );
      if (!(convertedTemperature > 0)) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_NONPHYSICAL_TEMPERATURE',
            'Derivative temperature must be above absolute zero after unit conversion.',
            {
              ...details,
              sourceRow,
              columnIndex: derivative.temperatureColumn.columnIndex,
            },
          ),
        );
        continue;
      }
      derivativeObservations.push({
        sourceRow,
        temperatureK: convertedTemperature,
        rawValue: parsedValue,
        dAlphaDtPerMinute: canonicalDerivative(definition, parsedValue),
      });
    }

    verifyIncreasingTemperatures(
      derivativeObservations,
      definition,
      diagnostics,
      'Derivative-grid',
    );
    if (derivativeObservations.length !== observations.length) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_DERIVATIVE_GRID_MISMATCH',
          `Primary and derivative grids contain ${observations.length} and ${derivativeObservations.length} observations; no interpolation or row dropping is permitted.`,
          details,
        ),
      );
    } else {
      const mismatchIndex = observations.findIndex(
        (observation, index) => !valuesMatch(
          observation.temperatureK,
          derivativeObservations[index].temperatureK,
        ),
      );
      if (mismatchIndex >= 0) {
        diagnostics.push(
          diagnostic(
            'error',
            'WIDE_DERIVATIVE_GRID_MISMATCH',
            'Primary and derivative temperature grids differ in acquisition order; the importer will not sort or interpolate them.',
            {
              ...details,
              sourceRow: observations[mismatchIndex].sourceRow,
            },
          ),
        );
      } else {
        for (let index = 0; index < observations.length; index += 1) {
          const derivativeObservation = derivativeObservations[index];
          observations[index] = {
            ...observations[index],
            derivativeSourceRow: derivativeObservation.sourceRow,
            rawDerivativeValue: derivativeObservation.rawValue,
            dAlphaDtPerMinute: derivativeObservation.dAlphaDtPerMinute,
          };
        }
      }
    }
  }

  const firstOutsideReference = observations.find((observation) => {
    if (observation.massValue === undefined || !observation.massReference) return false;
    const { initialValue, finalValue } = observation.massReference;
    const tolerance = REFERENCE_TOLERANCE * referenceScale(initialValue, finalValue);
    return (
      observation.massValue < finalValue - tolerance
      || observation.massValue > initialValue + tolerance
    );
  });
  if (firstOutsideReference) {
    diagnostics.push(
      diagnostic(
        'warning',
        'WIDE_MASS_REFERENCE_EXCURSION_OUTSIDE_BRANCH',
        'Raw mass observations outside the selected reference anchors were retained. Projection is allowed only when every observation in the selected alpha branch lies within those anchors.',
        {
          ...details,
          sourceRow: firstOutsideReference.sourceRow,
        },
      ),
    );
  }

  return observations;
}

export function normalizeWideSeriesTable(
  rawTable: RawTable,
  source: IngestionSource,
  options: WideSeriesTableOptions,
): WideSeriesNormalizationResult {
  const diagnostics: WideSeriesDiagnostic[] = [];
  if (
    !Number.isInteger(options.headerRow)
    || options.headerRow < 0
    || options.headerRow >= rawTable.length
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'WIDE_HEADER_ROW_INVALID',
        'headerRow must identify an existing zero-based row in the source table.',
      ),
    );
    return { status: 'error', dataset: null, diagnostics };
  }

  const columnCount = rawTable.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (!validateDefinitions(options, columnCount, diagnostics)) {
    return { status: 'error', dataset: null, diagnostics };
  }

  const headerCells = rawTable[options.headerRow];
  const headers = Array.from(
    { length: columnCount },
    (_, columnIndex) => displayCell(headerCells[columnIndex]),
  );
  const observations = options.series.flatMap((definition) => (
    normalizeOneSeries(rawTable, options, definition, diagnostics)
  ));

  if (diagnostics.some((item) => item.severity === 'error')) {
    return { status: 'error', dataset: null, diagnostics };
  }

  return {
    status: 'ready',
    dataset: {
      source: { ...source },
      headerRow: options.headerRow,
      headers,
      series: options.series.map((definition) => ({
        ...definition,
        temperature: { ...definition.temperature },
        signal: definition.signal.kind === 'alpha'
          ? { ...definition.signal }
          : {
              ...definition.signal,
              alphaReference: { ...definition.signal.alphaReference },
            },
        ...(definition.derivative
          ? {
              derivative: {
                ...definition.derivative,
                ...(definition.derivative.temperatureColumn
                  ? { temperatureColumn: { ...definition.derivative.temperatureColumn } }
                  : {}),
              },
            }
          : {}),
        heatingRate: { ...definition.heatingRate },
        context: { ...definition.context },
      })),
      observations,
    },
    diagnostics,
  };
}

function crossingSelection(
  observations: readonly WideSeriesSourceObservation[],
  alpha: number,
  definition: WideSeriesDefinition,
  diagnostics: WideSeriesDiagnostic[],
): CrossingSelection | null {
  const signs = observations.map((observation) => {
    const delta = observation.alpha - alpha;
    if (Math.abs(delta) <= ALPHA_TOLERANCE) return 0;
    return delta < 0 ? -1 : 1;
  });
  const exactIndices = signs
    .map((sign, index) => ({ sign, index }))
    .filter(({ sign }) => sign === 0)
    .map(({ index }) => index);
  const nonzeroIndices = signs
    .map((sign, index) => ({ sign, index }))
    .filter(({ sign }) => sign !== 0)
    .map(({ index }) => index);
  const events: CrossingEvent[] = [];

  for (let index = 1; index < nonzeroIndices.length; index += 1) {
    const leftIndex = nonzeroIndices[index - 1];
    const rightIndex = nonzeroIndices[index];
    if (signs[leftIndex] === signs[rightIndex]) continue;
    const exactBetween = exactIndices.filter(
      (exactIndex) => leftIndex < exactIndex && exactIndex < rightIndex,
    );
    events.push({
      direction: signs[leftIndex] < signs[rightIndex] ? 'upward' : 'downward',
      leftIndex,
      rightIndex,
      ...(exactBetween.length === 1 ? { exactIndex: exactBetween[0] } : {}),
    });
  }

  if (exactIndices.length === 1 && observations.length > 1) {
    const exactIndex = exactIndices[0];
    if (exactIndex === 0 && nonzeroIndices.length > 0) {
      const rightIndex = nonzeroIndices[0];
      events.push({
        direction: signs[rightIndex] > 0 ? 'upward' : 'downward',
        leftIndex: exactIndex,
        rightIndex,
        exactIndex,
      });
    } else if (exactIndex === observations.length - 1 && nonzeroIndices.length > 0) {
      const leftIndex = nonzeroIndices[nonzeroIndices.length - 1];
      events.push({
        direction: signs[leftIndex] < 0 ? 'upward' : 'downward',
        leftIndex,
        rightIndex: exactIndex,
        exactIndex,
      });
    }
  }

  const upward = events.filter((event) => event.direction === 'upward');
  const downward = events.filter((event) => event.direction === 'downward');
  const details = {
    seriesId: definition.seriesId,
    runId: definition.runId,
    alpha,
  };
  let failed = false;

  if (exactIndices.length > 1 || upward.length > 1) {
    diagnostics.push(
      diagnostic(
        'error',
        'WIDE_ALPHA_MULTIPLE_CROSSINGS',
        `alpha=${alpha} has more than one candidate upward crossing; branch selection is ambiguous.`,
        details,
      ),
    );
    failed = true;
  }
  if (downward.length > 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'WIDE_ALPHA_DOWNWARD_CROSSING',
        `alpha=${alpha} has a downward crossing; the unique-upward-branch policy refuses this series.`,
        details,
      ),
    );
    failed = true;
  }

  const upwardEvent = upward[0];
  if (!upwardEvent) {
    if (exactIndices.length === 1) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_ALPHA_TOUCH_WITHOUT_CROSSING',
          `alpha=${alpha} is touched but not crossed upward.`,
          details,
        ),
      );
    } else if (downward.length === 0) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_ALPHA_UNREACHABLE',
          `alpha=${alpha} is not reached by a unique upward crossing; extrapolation is forbidden.`,
          details,
        ),
      );
    }
    return null;
  }

  if (
    exactIndices.length === 1
    && upwardEvent.exactIndex !== exactIndices[0]
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'WIDE_ALPHA_TOUCH_WITHOUT_CROSSING',
        `alpha=${alpha} is touched outside its separate upward crossing.`,
        details,
      ),
    );
    return null;
  }
  if (failed) return null;
  if (upwardEvent.exactIndex !== undefined) {
    return {
      lowerIndex: upwardEvent.exactIndex,
      upperIndex: upwardEvent.exactIndex,
    };
  }
  return {
    lowerIndex: upwardEvent.leftIndex,
    upperIndex: upwardEvent.rightIndex,
  };
}

function numericalTemperatureDerivatives(
  observations: readonly WideSeriesSourceObservation[],
): WideSeriesSourceObservation[] | null {
  if (observations.length < 2) return null;

  const derived: WideSeriesSourceObservation[] = [];
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    const leftIndex = index === 0 ? 0 : index - 1;
    const rightIndex = index === observations.length - 1
      ? observations.length - 1
      : index + 1;
    if (leftIndex === rightIndex) return null;

    const left = observations[leftIndex];
    const right = observations[rightIndex];
    const deltaTemperature = right.temperatureK - left.temperatureK;
    if (!(deltaTemperature > 0)) return null;
    const dAlphaDtPerMinute = (
      (right.alpha - left.alpha)
      / deltaTemperature
    ) * observation.heatingRateKPerMin;
    if (!Number.isFinite(dAlphaDtPerMinute)) return null;

    derived.push({
      ...observation,
      dAlphaDtPerMinute,
      numericalDerivativeSourceRows: [left.sourceRow, right.sourceRow],
    });
  }
  return derived;
}

function derivativeSourceRows(
  observation: WideSeriesSourceObservation,
): readonly number[] | undefined {
  if (observation.numericalDerivativeSourceRows) {
    return observation.numericalDerivativeSourceRows;
  }
  return observation.derivativeSourceRow === undefined
    ? undefined
    : [observation.derivativeSourceRow];
}

function mergedSourceRows(
  ...rowGroups: Array<readonly number[] | undefined>
): number[] | undefined {
  const rows = [...new Set(rowGroups.flatMap((group) => group ?? []))]
    .sort((left, right) => left - right);
  return rows.length === 0 ? undefined : rows;
}

function interpolatePoint(
  observations: readonly WideSeriesSourceObservation[],
  selection: CrossingSelection,
  alpha: number,
  dAlphaDtSource: AlphaDerivativeSource,
): WideSeriesProjectedPoint {
  const left = observations[selection.lowerIndex];
  const right = observations[selection.upperIndex];
  if (selection.lowerIndex === selection.upperIndex) {
    const rows = derivativeSourceRows(left);
    return {
      seriesId: left.seriesId,
      runId: left.runId,
      alpha,
      temperatureK: left.temperatureK,
      ...(left.dAlphaDtPerMinute === undefined
        ? {}
        : {
            dAlphaDtPerMinute: left.dAlphaDtPerMinute,
            dAlphaDtSource,
          }),
      heatingRateKPerMin: left.heatingRateKPerMin,
      context: { ...left.context },
      sourceRows: [left.sourceRow],
      ...(rows === undefined
        ? {}
        : { derivativeSourceRows: rows }),
    };
  }

  const fraction = (alpha - left.alpha) / (right.alpha - left.alpha);
  const leftDerivative = left.dAlphaDtPerMinute;
  const rightDerivative = right.dAlphaDtPerMinute;
  const interpolatedDerivative = (
    leftDerivative === undefined || rightDerivative === undefined
  )
    ? undefined
    : leftDerivative + fraction * (rightDerivative - leftDerivative);
  const rows = mergedSourceRows(
    derivativeSourceRows(left),
    derivativeSourceRows(right),
  );
  return {
    seriesId: left.seriesId,
    runId: left.runId,
    alpha,
    temperatureK: left.temperatureK + fraction * (right.temperatureK - left.temperatureK),
    ...(interpolatedDerivative === undefined
      ? {}
      : {
          dAlphaDtPerMinute: interpolatedDerivative,
          dAlphaDtSource,
        }),
    heatingRateKPerMin: left.heatingRateKPerMin,
    context: { ...left.context },
    sourceRows: [left.sourceRow, right.sourceRow],
    ...(rows === undefined
      ? {}
      : { derivativeSourceRows: rows }),
  };
}

export function projectWideSeriesAtAlpha(
  dataset: WideSeriesDataset,
  alphaValues: readonly number[],
): WideSeriesProjectionResult {
  const diagnostics: WideSeriesDiagnostic[] = [];
  if (
    alphaValues.length === 0
    || alphaValues.some((alpha) => !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1)
    || alphaValues.some((alpha, index) => index > 0 && alpha <= alphaValues[index - 1])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'WIDE_ALPHA_GRID_INVALID',
        'Requested alpha values must be finite, strictly increasing fractions inside (0, 1); values are never sorted or repaired.',
      ),
    );
    return { status: 'error', projectedPoints: [], branches: [], diagnostics };
  }

  const projectedPoints: WideSeriesProjectedPoint[] = [];
  const branches: WideSeriesProjectionResult['branches'] = [];

  for (const definition of dataset.series) {
    const sourceObservations = dataset.observations.filter(
      (observation) => (
        observation.seriesId === definition.seriesId
        && observation.runId === definition.runId
      ),
    );
    const observations = definition.derivative
      ? sourceObservations
      : numericalTemperatureDerivatives(sourceObservations);
    if (!observations) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_NUMERICAL_DERIVATIVE_UNAVAILABLE',
          'An unsmoothed finite dAlpha/dt series could not be calculated from the retained raw alpha/temperature observations.',
          { seriesId: definition.seriesId, runId: definition.runId },
        ),
      );
      continue;
    }
    const selections = alphaValues.map((alpha) => (
      crossingSelection(observations, alpha, definition, diagnostics)
    ));
    if (selections.some((selection) => selection === null)) continue;

    const confirmedSelections = selections as CrossingSelection[];
    const startIndex = Math.min(...confirmedSelections.map((selection) => selection.lowerIndex));
    const endIndex = Math.max(...confirmedSelections.map((selection) => selection.upperIndex));
    const selected = observations.slice(startIndex, endIndex + 1);
    const details = { seriesId: definition.seriesId, runId: definition.runId };

    const nonMonotonic = selected.findIndex(
      (observation, index) => (
        index > 0
        && observation.alpha + ALPHA_TOLERANCE < selected[index - 1].alpha
      ),
    );
    if (nonMonotonic >= 0) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_SELECTED_BRANCH_NON_MONOTONIC',
          'The minimal branch spanning the requested alpha grid is not monotonic in source order; smoothing and point deletion are forbidden.',
          {
            ...details,
            sourceRow: selected[nonMonotonic].sourceRow,
          },
        ),
      );
      continue;
    }

    const outsideReference = selected.find((observation) => {
      if (observation.massValue === undefined || !observation.massReference) return false;
      const { initialValue, finalValue } = observation.massReference;
      const tolerance = REFERENCE_TOLERANCE * referenceScale(initialValue, finalValue);
      return (
        observation.massValue < finalValue - tolerance
        || observation.massValue > initialValue + tolerance
      );
    });
    if (outsideReference) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_MASS_OUTSIDE_REFERENCE',
          'The selected alpha branch contains mass outside its explicit initial/final anchors.',
          { ...details, sourceRow: outsideReference.sourceRow },
        ),
      );
      continue;
    }

    if (
      definition.derivative
      && selected.some((observation) => observation.dAlphaDtPerMinute === undefined)
    ) {
      diagnostics.push(
        diagnostic(
          'error',
          'WIDE_INCOMPLETE_DERIVATIVE_ROW',
          'The selected branch does not contain a derivative for every source observation.',
          details,
        ),
      );
      continue;
    }

    branches.push({
      seriesId: definition.seriesId,
      runId: definition.runId,
      sourceObservationCount: observations.length,
      selectedObservationCount: selected.length,
      startSourceRow: selected[0].sourceRow,
      endSourceRow: selected[selected.length - 1].sourceRow,
      targetAlphaRange: [alphaValues[0], alphaValues[alphaValues.length - 1]],
      selectedAlphaRange: [selected[0].alpha, selected[selected.length - 1].alpha],
    });
    for (let index = 0; index < alphaValues.length; index += 1) {
      projectedPoints.push(
        interpolatePoint(
          observations,
          confirmedSelections[index],
          alphaValues[index],
          definition.derivative ? 'provided' : 'temperature',
        ),
      );
    }
  }

  if (diagnostics.some((item) => item.severity === 'error')) {
    return { status: 'error', projectedPoints: [], branches: [], diagnostics };
  }
  return { status: 'ready', projectedPoints, branches, diagnostics };
}

export function projectWideSeriesTable(
  rawTable: RawTable,
  source: IngestionSource,
  options: WideSeriesTableOptions,
  alphaValues: readonly number[],
): WideSeriesTableProjectionResult {
  const normalization = normalizeWideSeriesTable(rawTable, source, options);
  if (normalization.status === 'error' || !normalization.dataset) {
    return {
      status: 'error',
      dataset: null,
      projectedPoints: [],
      branches: [],
      diagnostics: normalization.diagnostics,
    };
  }

  const projection = projectWideSeriesAtAlpha(normalization.dataset, alphaValues);
  return {
    ...projection,
    dataset: normalization.dataset,
    diagnostics: [...normalization.diagnostics, ...projection.diagnostics],
  };
}
