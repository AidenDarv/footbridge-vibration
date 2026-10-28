// Vertical comfort limit (NA.2.44.6; SPEC §2.7) and frequency triggers (SPEC §2.9).

/** NA.2.44.6, Table NA.9 — site usage factor k1. */
export const K1 = {
  hospital: 0.6, // primary route for hospitals or other high-sensitivity routes
  school: 0.8, // primary route for school
  stadia: 0.8, // primary route for sports stadia or other high-usage routes
  urban: 1.0, // major urban centres
  suburban: 1.3, // suburban crossings
  rural: 1.6, // rural environments
} as const;

/** NA.2.44.6, Table NA.10 — route redundancy factor k2. */
export const K2 = {
  sole: 0.7, // sole means of access
  primary: 1.0, // primary route
  alternative: 1.3, // alternative routes readily available
} as const;

/** NA.2.44.6, Table NA.11 — structure height factor k3. */
export const K3 = {
  over8: 0.7, // greater than 8 m
  from4to8: 1.0, // 4 m to 8 m
  under4: 1.1, // less than 4 m
} as const;

export type K1Key = keyof typeof K1;
export type K2Key = keyof typeof K2;
export type K3Key = keyof typeof K3;

/** NA.2.44.6 — exposure factor k4 default (SPEC §2.7). */
export const K4_DEFAULT = 1.0;
/** NA.2.44.6 — permitted range of k4 (SPEC §2.7). */
export const K4_MIN = 0.8;
export const K4_MAX = 1.2;

/** NA.2.44.6 — bounds on the vertical comfort limit (m/s²). */
export const A_LIMIT_MIN = 0.5;
export const A_LIMIT_MAX = 2.0;

/** NA.2.44.6 — basic comfort acceleration in a_limit = 1.0·k1·k2·k3·k4 (m/s²). */
export const A_LIMIT_BASE = 1.0;

/** NA.2.44.6, Table NA.11 — k3 from height of the structure above ground (m). */
export function k3FromHeight(height: number): number {
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError(`height must be a non-negative number (got ${height})`);
  }
  if (height > 8) return K3.over8;
  if (height >= 4) return K3.from4to8;
  return K3.under4;
}

export interface ComfortLimitInput {
  k1: number;
  k2: number;
  k3: number;
  /** Exposure factor, 0.8–1.2. Defaults to 1.0. */
  k4?: number;
}

export interface ComfortLimitResult {
  /** Unclamped product 1.0·k1·k2·k3·k4 (m/s²). */
  raw: number;
  /** Value used in the check, clamped to 0.5–2.0 (m/s²). */
  aLimit: number;
  /** Which bound was applied, if any. */
  clamped: 'lower' | 'upper' | null;
}

/** a_limit = 1.0·k1·k2·k3·k4, clamped to 0.5 ≤ a_limit ≤ 2.0 (NA.2.44.6; SPEC §2.7). */
export function comfortLimit(input: ComfortLimitInput): ComfortLimitResult {
  const k4 = input.k4 ?? K4_DEFAULT;
  for (const [name, value] of [
    ['k1', input.k1],
    ['k2', input.k2],
    ['k3', input.k3],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive number (got ${value})`);
    }
  }
  if (!Number.isFinite(k4) || k4 < K4_MIN || k4 > K4_MAX) {
    throw new RangeError(`k4 must be between ${K4_MIN} and ${K4_MAX} (got ${k4})`);
  }

  const raw = A_LIMIT_BASE * input.k1 * input.k2 * input.k3 * k4;
  if (raw < A_LIMIT_MIN) return { raw, aLimit: A_LIMIT_MIN, clamped: 'lower' };
  if (raw > A_LIMIT_MAX) return { raw, aLimit: A_LIMIT_MAX, clamped: 'upper' };
  return { raw, aLimit: raw, clamped: null };
}

/**
 * EN 1990 A2.4.3.2(2), noted in CD 353 4.4 — vertical modes below this need a comfort check
 * (Hz). [VERIFY] against NA+A1:2020 (SPEC §9).
 */
export const VERTICAL_TRIGGER_HZ = 5;

/**
 * CD 353 4.4–4.5 and NA+A1:2020 (SPEC §2.9) — lateral or torsional modes below this need
 * verification (Hz). [VERIFY] against NA+A1:2020 (SPEC §9).
 */
export const LATERAL_TRIGGER_HZ = 2.5;

/**
 * NA+A1:2020 as summarised in SCI AD 428A (SPEC §2.9) — lateral or torsional modes below
 * this: consider making provision for dampers (Hz). [VERIFY] value and wording.
 */
export const DAMPER_PROVISION_HZ = 3;
