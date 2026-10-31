// Lateral lock-in stability check (NA.2.44.7; SPEC §2.8). Pure functions.
// Data: src/data/lateral_boundary.json (Figure NA.11), digitised by the author; see its
// `source` for the reading accuracy. Kept separate from the vertical load model (loads.ts).
//
// Guidance applied here (PD 6688-2:2011):
// - §A.1: no pedestrian damping is added; ζ is the structural damping ratio of the mode.
// - §A.7: for a deck whose mass varies along the span, m_bridge is the lowest mass per metre.
//   The caller supplies that value.

import boundaryData from '../data/lateral_boundary.json';
import type { LookupValue } from './check';
import { interpolate } from './lookup';

/** NA.2.44.7 — lateral modes below this frequency need the lock-in check (Hz). */
export const LOCK_IN_TRIGGER_HZ = 1.5;

/** NA.2.44.7 — mass per pedestrian in m_pedestrian = ρ·b·70 (kg). */
export const PEDESTRIAN_MASS = 70;

/** Figure NA.11 note — frequency range covered by test data (Hz); outside it, use with caution. */
export const RELIABLE_RANGE_HZ = boundaryData.source.reliableRangeHz as [number, number];

/** Author's estimated reading accuracy of the digitised Figure NA.11 (data file metadata). */
export const BOUNDARY_READING_ACCURACY = boundaryData.source.readingAccuracy;

const POINTS: readonly (readonly number[])[] = boundaryData.boundary.points;

/** Boundary value D at frequency f, or null where the figure gives none. */
export interface BoundaryValue {
  value: number | null;
  warning?: string;
}

export type BoundaryLookup = (f: number) => BoundaryValue | LookupValue;

/**
 * NA.2.44.7, Figure NA.11 — boundary value of D at lateral frequency f, linear in f.
 * Below the first digitised frequency the curve is off the top of the figure, so no value is
 * given (null). Above the last point the end value is used with a warning (CLAUDE.md).
 * Where the curve is vertical (several points at one f), the highest D is used.
 */
export function lateralBoundaryLookup(f: number): BoundaryValue {
  const f0 = (POINTS[0] as readonly number[])[0] as number;
  if (f < f0) {
    return {
      value: null,
      warning: `Figure NA.11: ${f.toFixed(3)} Hz is outside the digitised boundary (from ${f0.toFixed(3)} Hz), where the curve leaves the top of the figure. The boundary cannot be read.`,
    };
  }
  const atPoint = POINTS.filter(([x]) => x === f).map(([, y]) => y as number);
  if (atPoint.length > 0) return { value: Math.max(...atPoint) };
  return interpolate(POINTS, f, 'Figure NA.11 boundary');
}

/** NA.2.44.7 — m_pedestrian = ρ·b·70 (kg/m). */
export function pedestrianMassPerMetre(rho: number, b: number): number {
  return rho * b * PEDESTRIAN_MASS;
}

export type LockInStatus = 'STABLE' | 'UNSTABLE' | 'NO-CROWD' | 'OUTSIDE-FIGURE';

export interface LockInInput {
  /** Lateral mode frequency (Hz). */
  f: number;
  /** Structural damping ratio ξ (decimal), no pedestrian damping (PD 6688-2 §A.1). */
  zeta: number;
  /** Bridge mass per metre (kg/m); the lowest value for a non-uniform deck (PD 6688-2 §A.7). */
  mBridge: number;
  /** Crowd density ρ (persons/m²) from Table NA.7 or the project override. */
  rho: number;
  /** Deck width b (m). */
  b: number;
  /** Injected boundary (tests). Defaults to the digitised Figure NA.11. */
  boundary?: BoundaryLookup;
}

export interface LockInResult {
  /** m_pedestrian = ρ·b·70 (kg/m). */
  mPedestrian: number;
  /** D = m_bridge·ξ/m_pedestrian, or null when there is no crowd. */
  D: number | null;
  /** Boundary D from Figure NA.11 at f, or null when it cannot be read. */
  DBoundary: number | null;
  status: LockInStatus;
  /** Caution when f is outside the 0.5–1.1 Hz test-data range of Figure NA.11. */
  caution: string | null;
  /** Explanation for NO-CROWD and OUTSIDE-FIGURE. */
  message: string | null;
  /** Lookup warnings (clamping). */
  warnings: string[];
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number (got ${value})`);
  }
}

/**
 * Lateral lock-in check for one lateral mode (NA.2.44.7; SPEC §2.8):
 * D = m_bridge·ξ / m_pedestrian, compared with the Figure NA.11 boundary.
 * Above the boundary: STABLE. On or below it: UNSTABLE (divergent lateral response may occur).
 */
export function lockInCheck(input: LockInInput): LockInResult {
  const { f, zeta, mBridge, rho, b } = input;
  requirePositive('f', f);
  requirePositive('zeta', zeta);
  requirePositive('mBridge', mBridge);
  requirePositive('b', b);
  if (!Number.isFinite(rho) || rho < 0) {
    throw new RangeError(`rho must be a non-negative number (got ${rho})`);
  }

  const [lo, hi] = RELIABLE_RANGE_HZ;
  const caution =
    f < lo || f > hi
      ? `${f.toFixed(2)} Hz is outside ${lo}–${hi} Hz, the range covered by test data in Figure NA.11. The boundary there is theoretical: use the result with caution.`
      : null;

  const mPedestrian = pedestrianMassPerMetre(rho, b);
  if (mPedestrian === 0) {
    return {
      mPedestrian,
      D: null,
      DBoundary: null,
      status: 'NO-CROWD',
      caution,
      message:
        'The crowd density ρ is 0, so m_pedestrian = ρ·b·70 = 0 and D = m_bridge·ξ/m_pedestrian is not defined. With no crowd on the deck, this check finds no lock-in risk.',
      warnings: [],
    };
  }

  const D = (mBridge * zeta) / mPedestrian;
  const lookup = (input.boundary ?? lateralBoundaryLookup)(f);
  const warnings = lookup.warning ? [lookup.warning] : [];
  if (lookup.value === null) {
    return {
      mPedestrian,
      D,
      DBoundary: null,
      status: 'OUTSIDE-FIGURE',
      caution,
      message: `The Figure NA.11 boundary cannot be read at ${f.toFixed(3)} Hz, so stability cannot be assessed.`,
      warnings,
    };
  }
  return {
    mPedestrian,
    D,
    DBoundary: lookup.value,
    status: D > lookup.value ? 'STABLE' : 'UNSTABLE',
    caution,
    message: null,
    warnings,
  };
}
