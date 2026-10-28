// Single-mode response to pedestrian loads (SPEC §2.5, §2.6).
// Moving pulsating point force (NA.2.44.4) integrated in time, and the crowd steady-state
// resonant response (NA.2.44.5). Pure functions, SI units, mode shapes with max |φ| = 1.

/** SPEC §2.5 — time step must satisfy dt ≤ 1/(40·f). */
export const MIN_STEPS_PER_PERIOD = 40;

/**
 * Default time step dt = 1/(200·f) (SPEC §2.5 note). Keeps the error from sampling the peak
 * only at time steps below about 0.02 %, and costs little (≈ 7 000 steps for bridge A1).
 */
export const DEFAULT_STEPS_PER_PERIOD = 200;

/**
 * RK4 is the default. Newmark average acceleration is kept as a cross-check (SPEC §6 N5);
 * at dt = 1/(40f) its period elongation detunes a lightly damped mode (SPEC §2.5 note).
 */
export type SolverMethod = 'rk4' | 'newmark';

export interface MovingLoadInput {
  /** Natural frequency of the mode (Hz). The force pulsates at the same frequency. */
  f: number;
  /** Modal mass for the unit-max mode shape (kg). */
  M: number;
  /** Damping ratio ξ (decimal). */
  zeta: number;
  /** Amplitude of the pulsating force F₀·k·√(1 + γ(N − 1)) (N). */
  Famp: number;
  /** Crossing speed v (m/s). */
  v: number;
  /** Span S crossed by the force (m). */
  S: number;
  /** Mode shape φ(x), max |φ| = 1. */
  phi: (x: number) => number;
  /** Time steps per natural period, ≥ 40. Default 200. */
  stepsPerPeriod?: number;
  method?: SolverMethod;
  /** Record the antinode acceleration time history (for the UI chart). */
  recordHistory?: boolean;
}

export interface MovingLoadResult {
  /** Peak |q̈| over the crossing, i.e. peak acceleration at the antinode (m/s²). */
  peakAccel: number;
  /** Time at which the peak occurs (s). */
  tPeak: number;
  /** Nominal time step used (s). The last step is shortened to end at S/v. */
  dt: number;
  steps: number;
  method: SolverMethod;
  history?: { t: number[]; a: number[] };
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number (got ${value})`);
  }
}

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number (got ${value})`);
  }
}

/**
 * Steady-state resonant peak acceleration of a mode under a harmonic generalised force of
 * amplitude P₀ at its natural frequency: a = P₀ / (2ξM) (SPEC §2.6).
 */
export function steadyStateAcceleration(P0: number, zeta: number, M: number): number {
  requireNonNegative('P0', P0);
  requirePositive('zeta', zeta);
  requirePositive('M', M);
  return P0 / (2 * zeta * M);
}

/**
 * Response of one mode to a pulsating point force crossing the span (NA.2.44.4; SPEC §2.5):
 *   M·q̈ + 2ξωM·q̇ + ω²M·q = Famp·sin(ωt)·φ(vt),  0 ≤ t ≤ S/v,  ω = 2πf
 * starting from rest. Returns the peak |q̈|, which is the antinode acceleration for max |φ| = 1.
 */
export function movingLoadResponse(input: MovingLoadInput): MovingLoadResult {
  const { f, M, zeta, Famp, v, S, phi } = input;
  requirePositive('f', f);
  requirePositive('M', M);
  requireNonNegative('zeta', zeta);
  requireNonNegative('Famp', Famp);
  requirePositive('v', v);
  requirePositive('S', S);
  const stepsPerPeriod = input.stepsPerPeriod ?? DEFAULT_STEPS_PER_PERIOD;
  if (!Number.isFinite(stepsPerPeriod) || stepsPerPeriod < MIN_STEPS_PER_PERIOD) {
    throw new RangeError(
      `stepsPerPeriod must be at least ${MIN_STEPS_PER_PERIOD}, i.e. dt ≤ 1/(${MIN_STEPS_PER_PERIOD}f) (got ${stepsPerPeriod})`,
    );
  }
  const method = input.method ?? 'rk4';

  const omega = 2 * Math.PI * f;
  const c = 2 * zeta * omega; // damping per unit modal mass
  const k = omega * omega; // stiffness per unit modal mass
  const tEnd = S / v;
  const dt = 1 / (stepsPerPeriod * f);
  // Small slack so floating-point round-off in tEnd/dt does not add a near-zero last step.
  const steps = Math.max(1, Math.ceil(tEnd / dt - 1e-9));

  /** Generalised force per unit modal mass. Position is clamped to the span. */
  const p = (t: number): number => (Famp * Math.sin(omega * t) * phi(Math.min(v * t, S))) / M;
  const accel = (t: number, q: number, qd: number): number => p(t) - c * qd - k * q;

  const history = input.recordHistory ? { t: [0], a: [0] } : undefined;
  let t = 0;
  let q = 0;
  let qd = 0;
  let qdd = accel(0, 0, 0); // p(0) = 0 because sin(0) = 0
  let peakAccel = Math.abs(qdd);
  let tPeak = 0;

  for (let i = 0; i < steps; i++) {
    const h = i === steps - 1 ? tEnd - t : dt;
    const tn = i === steps - 1 ? tEnd : t + h;

    if (method === 'rk4') {
      // Classical fourth-order Runge–Kutta on y = [q, q̇].
      const k1q = qd;
      const k1v = accel(t, q, qd);
      const k2q = qd + (h / 2) * k1v;
      const k2v = accel(t + h / 2, q + (h / 2) * k1q, k2q);
      const k3q = qd + (h / 2) * k2v;
      const k3v = accel(t + h / 2, q + (h / 2) * k2q, k3q);
      const k4q = qd + h * k3v;
      const k4v = accel(t + h, q + h * k3q, k4q);
      q += (h / 6) * (k1q + 2 * k2q + 2 * k3q + k4q);
      qd += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      qdd = accel(tn, q, qd);
    } else {
      // Newmark average acceleration, β = 1/4, γ = 1/2 (Newmark 1959; Chopra, Dynamics of
      // Structures, §5.4). Unconditionally stable, no amplitude decay, period elongation.
      const keff = k + (2 * c) / h + 4 / (h * h);
      const rhs = p(tn) + q * (4 / (h * h) + (2 * c) / h) + qd * (4 / h + c) + qdd;
      const qn = rhs / keff;
      const qdn = (2 / h) * (qn - q) - qd;
      qdd = (4 / (h * h)) * (qn - q) - (4 / h) * qd - qdd;
      q = qn;
      qd = qdn;
    }
    t = tn;

    const aAbs = Math.abs(qdd);
    if (aAbs > peakAccel) {
      peakAccel = aAbs;
      tPeak = t;
    }
    if (history) {
      history.t.push(t);
      history.a.push(qdd);
    }
  }

  const result: MovingLoadResult = { peakAccel, tPeak, dt, steps, method };
  if (history) result.history = history;
  return result;
}
