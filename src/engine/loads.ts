// UK NA load model for vertical pedestrian actions (NA.2.44.2, NA.2.44.4, NA.2.44.5).
// Kept in its own module so another method (Sétra/HiVoSS, new Eurocode) can sit alongside.
// k(f_v) and γ are passed in as numbers: the caller either reads them from the digitised
// figures (milestone M3) or injects them (tests).

export type BridgeClass = 'A' | 'B' | 'C' | 'D';

export interface BridgeClassData {
  /** Pedestrians in a walking group, N. */
  groupWalking: number;
  /** Pedestrians in a jogging group, N. */
  groupJogging: number;
  /** Crowd density ρ (persons/m²), before the NA.2.44.5 cap. */
  crowdDensity: number;
}

/** NA.2.44.2, Table NA.7 — group sizes and crowd density by bridge class. */
export const BRIDGE_CLASSES: Readonly<Record<BridgeClass, BridgeClassData>> = {
  A: { groupWalking: 2, groupJogging: 0, crowdDensity: 0 },
  B: { groupWalking: 4, groupJogging: 1, crowdDensity: 0.4 },
  C: { groupWalking: 8, groupJogging: 2, crowdDensity: 0.8 },
  D: { groupWalking: 16, groupJogging: 4, crowdDensity: 1.5 },
};

export interface ActivityParams {
  /** Reference load F₀ (N). */
  F0: number;
  /** Crossing speed v (m/s). */
  v: number;
}

/** NA.2.44.4, Table NA.8 — walking: F₀ = 280 N, v = 1.7 m/s. */
export const WALKING: Readonly<ActivityParams> = { F0: 280, v: 1.7 };

/** NA.2.44.4, Table NA.8 — jogging: F₀ = 910 N, v = 3.0 m/s. */
export const JOGGING: Readonly<ActivityParams> = { F0: 910, v: 3.0 };

/** NA.2.44.5 — crowd density used in the crowd load is capped at 1.0 persons/m². */
export const CROWD_DENSITY_CAP = 1.0;

/** NA.2.44.5 — numerical factor in w(t) = 1.8·(F₀/A)·k·√(γN/λ)·sin(2πf t) (checked against NA+A1:2020). */
export const CROWD_LOAD_FACTOR = 1.8;

export type UsageOverrideField = keyof BridgeClassData;

export interface UsageInput {
  bridgeClass: BridgeClass;
  /** NA.2.44.2(3) — jogging may be neglected for an individual project. Default true. */
  includeJogging?: boolean;
  /** NA.2.44.2(2) — project-specific values replacing Table NA.7. */
  overrides?: Partial<BridgeClassData>;
}

export interface UsageOverride {
  field: UsageOverrideField;
  tableValue: number;
  value: number;
}

export interface ResolvedUsage {
  bridgeClass: BridgeClass;
  includeJogging: boolean;
  nWalking: number;
  /** 0 when jogging is excluded. */
  nJogging: number;
  /** Crowd density from the table or override, before the cap. */
  rhoInput: number;
  /** Crowd density used in the load, after the NA.2.44.5 cap. */
  rhoUsed: number;
  /** Values that differ from Table NA.7, for the calc sheet. */
  overrides: UsageOverride[];
  warnings: string[];
}

/** Crowd density after the NA.2.44.5 cap of 1.0 persons/m². */
export function capCrowdDensity(rho: number): { rhoUsed: number; warning: string | null } {
  if (!Number.isFinite(rho) || rho < 0) {
    throw new RangeError(`Crowd density must be a non-negative number (got ${rho})`);
  }
  if (rho > CROWD_DENSITY_CAP) {
    return {
      rhoUsed: CROWD_DENSITY_CAP,
      warning: `Crowd density ${rho} persons/m² capped to ${CROWD_DENSITY_CAP} persons/m² in the crowd load (NA.2.44.5).`,
    };
  }
  return { rhoUsed: rho, warning: null };
}

/** Group sizes and crowd density for a bridge class, with overrides and the ρ cap applied. */
export function resolveUsage(input: UsageInput): ResolvedUsage {
  const table = BRIDGE_CLASSES[input.bridgeClass];
  const includeJogging = input.includeJogging ?? true;
  const ov = input.overrides ?? {};

  const overrides: UsageOverride[] = [];
  const pick = (field: UsageOverrideField, integer: boolean): number => {
    const value = ov[field];
    const tableValue = table[field];
    if (value === undefined) return tableValue;
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
      throw new RangeError(
        `${field} override must be a non-negative ${integer ? 'integer' : 'number'} (got ${value})`,
      );
    }
    if (value !== tableValue) overrides.push({ field, tableValue, value });
    return value;
  };

  const nWalking = pick('groupWalking', true);
  const nJoggingTable = pick('groupJogging', true);
  const rhoInput = pick('crowdDensity', false);

  const { rhoUsed, warning } = capCrowdDensity(rhoInput);
  return {
    bridgeClass: input.bridgeClass,
    includeJogging,
    nWalking,
    nJogging: includeJogging ? nJoggingTable : 0,
    rhoInput,
    rhoUsed,
    overrides,
    warnings: warning ? [warning] : [],
  };
}

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number (got ${value})`);
  }
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number (got ${value})`);
  }
}

/** γ is a reduction factor (NA.2.44.4, Figure NA.9), so it must lie in [0, 1]. */
function requireGamma(gamma: number): void {
  if (!Number.isFinite(gamma) || gamma < 0 || gamma > 1) {
    throw new RangeError(`gamma must be between 0 and 1 (got ${gamma})`);
  }
}

export interface GroupForceInput {
  /** Reference load F₀ (N), Table NA.8. */
  F0: number;
  /** k(f_v), Figure NA.8 — injected or looked up by the caller. */
  k: number;
  /** γ, Figure NA.9 — injected or looked up by the caller. */
  gamma: number;
  /** Number of pedestrians in the group (≥ 1). */
  N: number;
}

/**
 * Amplitude of the moving pulsating group force (NA.2.44.4; SPEC §2.5):
 * F₀ · k(f_v) · √(1 + γ·(N − 1))
 */
export function groupForceAmplitude({ F0, k, gamma, N }: GroupForceInput): number {
  requirePositive('F0', F0);
  requireNonNegative('k', k);
  requireGamma(gamma);
  if (!Number.isInteger(N) || N < 1) {
    throw new RangeError(`Group size N must be an integer ≥ 1 (got ${N})`);
  }
  return F0 * k * Math.sqrt(1 + gamma * (N - 1));
}

export interface CrowdLoadInput {
  /** Reference load F₀ (N), Table NA.8. */
  F0: number;
  /** k(f_v), Figure NA.8. */
  k: number;
  /** γ for crowds, Figure NA.9. */
  gamma: number;
  /** Crowd density before the cap (persons/m²). */
  rho: number;
  /** Span S (m). */
  S: number;
  /** Deck width b (m). */
  b: number;
  /** λ = 0.637·Seff/S. */
  lambda_: number;
  /** ∫|φ(x)| dx over the span for the unit-max mode shape (m). */
  absPhiIntegral: number;
}

export interface CrowdLoadResult {
  rhoUsed: number;
  /** Deck area A = S·b (m²). */
  A: number;
  /** Number of pedestrians N = ρ·A. */
  N: number;
  /** Amplitude of the distributed load w(t) (N/m²). */
  W0: number;
  /** Generalised (modal) force amplitude P₀ = W₀·b·∫|φ| dx (N). */
  P0: number;
  warnings: string[];
}

/**
 * Crowd load amplitude (NA.2.44.5; SPEC §2.6). Equation form checked against NA+A1:2020.
 * W₀ = 1.8 · (F₀/A) · k · √(γ·N/λ), with N = ρ·S·b and ρ ≤ 1.0.
 * The load follows the sign of the mode shape (NA.2.44.5(2)), so P₀ = W₀ · b · ∫|φ| dx.
 */
export function crowdLoad(input: CrowdLoadInput): CrowdLoadResult {
  requirePositive('F0', input.F0);
  requireNonNegative('k', input.k);
  requireGamma(input.gamma);
  requirePositive('S', input.S);
  requirePositive('b', input.b);
  requirePositive('lambda_', input.lambda_);
  requirePositive('absPhiIntegral', input.absPhiIntegral);

  const { rhoUsed, warning } = capCrowdDensity(input.rho);
  const A = input.S * input.b;
  const N = rhoUsed * A;
  const W0 =
    CROWD_LOAD_FACTOR * (input.F0 / A) * input.k * Math.sqrt((input.gamma * N) / input.lambda_);
  const P0 = W0 * input.b * input.absPhiIntegral;
  return { rhoUsed, A, N, W0, P0, warnings: warning ? [warning] : [] };
}
