/** CODATA exact molar gas constant (J mol-1 K-1). */
export const GAS_CONSTANT_J_PER_MOL_K = 8.31446261815324;

/** Conservative conversion grid used when the caller does not provide one. */
export const DEFAULT_ALPHA_VALUES = Object.freeze([
  0.1,
  0.2,
  0.3,
  0.4,
  0.5,
  0.6,
  0.7,
  0.8,
  0.9,
] as const);

export const FWO_SLOPE_COEFFICIENT = 1.052;
export const STARINK_SLOPE_COEFFICIENT = 1.0008;
export const STARINK_TEMPERATURE_EXPONENT = 1.92;

