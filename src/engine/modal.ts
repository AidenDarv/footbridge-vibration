// Modal properties: simply supported beam frequencies and modal mass, effective span and λ.
// Pure functions, SI units. Mode shapes are normalised so max |φ| = 1 (CLAUDE.md).

/** NA.2.44.4, Figure NA.7 — divisor in Seff = ∫|φ| / (0.634 · max|φ|). (0.634 ≈ 2/π.) */
export const SEFF_DIVISOR = 0.634;

/** NA.2.44.5 — factor in λ = 0.634 · Seff / S. */
export const LAMBDA_FACTOR = 0.634;

/** SPEC §2.1 — beam mode computes n = 1, 2, 3. */
export const BEAM_MODE_COUNT = 3;

/** SPEC §2.1 — beam modes at or above this frequency are not displayed (Hz). */
export const BEAM_DISPLAY_FREQ_LIMIT = 8;

export type ModeShape = 'half-sine' | 'full-sine';

export interface BeamInput {
  /** Span (m). */
  L: number;
  /** Flexural rigidity (N·m²). */
  EI: number;
  /** Mass per unit length including permanent and superimposed dead load (kg/m). */
  m: number;
}

export interface BeamMode {
  n: number;
  /** Natural frequency (Hz). */
  f: number;
  /** Modal mass for unit-max mode shape (kg). */
  M: number;
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number (got ${value})`);
  }
}

/**
 * Natural frequency of mode n of a uniform simply supported beam (SPEC §2.1):
 * fₙ = (n²π / 2L²) · √(EI / m)
 */
export function beamFrequency(n: number, L: number, EI: number, m: number): number {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError(`n must be a positive integer (got ${n})`);
  requirePositive('L', L);
  requirePositive('EI', EI);
  requirePositive('m', m);
  return ((n * n * Math.PI) / (2 * L * L)) * Math.sqrt(EI / m);
}

/**
 * Modal mass of a uniform simply supported beam for φ(x) = sin(nπx/L), max |φ| = 1
 * (SPEC §2.1): Mₙ = m·L/2, the same for every n.
 */
export function beamModalMass(L: number, m: number): number {
  requirePositive('L', L);
  requirePositive('m', m);
  return (m * L) / 2;
}

/** Modes n = 1..3 of a simply supported beam (SPEC §2.1). Display filtering is left to the caller. */
export function beamModes(input: BeamInput): BeamMode[] {
  const M = beamModalMass(input.L, input.m);
  const modes: BeamMode[] = [];
  for (let n = 1; n <= BEAM_MODE_COUNT; n++) {
    modes.push({ n, f: beamFrequency(n, input.L, input.EI, input.m), M });
  }
  return modes;
}

/**
 * ∫|φ(x)| dx over the span S for a unit-max mode shape.
 * Half-sine sin(πx/S): 2S/π. Full-sine sin(2πx/S): two half-waves of S/π each, also 2S/π.
 */
export function absPhiIntegral(shape: ModeShape, S: number): number {
  requirePositive('S', S);
  switch (shape) {
    case 'half-sine':
    case 'full-sine':
      return (2 * S) / Math.PI;
  }
}

/**
 * Effective span (NA.2.44.4, Figure NA.7; SPEC §2.2):
 * Seff = (area enclosed by |φ|) / (0.634 · max|φ|)
 */
export function effectiveSpan(absPhiArea: number, maxAbsPhi = 1): number {
  requirePositive('absPhiArea', absPhiArea);
  requirePositive('maxAbsPhi', maxAbsPhi);
  return absPhiArea / (SEFF_DIVISOR * maxAbsPhi);
}

/** Effective span for a standard unit-max shape over span S. */
export function shapeEffectiveSpan(shape: ModeShape, S: number): number {
  return effectiveSpan(absPhiIntegral(shape, S), 1);
}

/** ∫|φ| dx recovered from a user-entered Seff (inverse of Figure NA.7 definition, max|φ| = 1). */
export function absPhiIntegralFromSeff(Seff: number): number {
  requirePositive('Seff', Seff);
  return SEFF_DIVISOR * Seff;
}

/** λ = 0.634 · Seff / S (NA.2.44.5; SPEC §2.2). */
export function lambdaFactor(Seff: number, S: number): number {
  requirePositive('Seff', Seff);
  requirePositive('S', S);
  return (LAMBDA_FACTOR * Seff) / S;
}
