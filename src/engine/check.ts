// Orchestrates the check: inputs → modal properties, limit, load cases, flags (SPEC §2.10).
// Pure. k(f) and γ come from the digitised Figures NA.8 and NA.9 (lookup.ts) unless
// `codeData` is injected. When an injected set lacks a lookup, the affected cases are
// returned as 'awaiting-data', never guessed.

import {
  DAMPER_PROVISION_HZ,
  HORIZONTAL_ACCEL_LIMIT,
  K1,
  K2,
  K4_DEFAULT,
  LATERAL_TRIGGER_HZ,
  VERTICAL_TRIGGER_HZ,
  comfortLimit,
  k3FromHeight,
  type ComfortLimitResult,
  type K1Key,
  type K2Key,
} from './limits';
import {
  JOGGING,
  WALKING,
  crowdLoad,
  groupForceAmplitude,
  resolveUsage,
  type ActivityParams,
  type ResolvedUsage,
  type UsageInput,
  type UsageOverrideField,
} from './loads';
import {
  BEAM_DISPLAY_FREQ_LIMIT,
  ModeShapeRequiredError,
  SEFF_DIVISOR,
  absPhiIntegral,
  absPhiIntegralFromSeff,
  beamModes,
  effectiveSpan,
  isBeamModeDisplayed,
  lambdaFactor,
  modeShapeFunction,
  sineModeShape,
  type ShapeType,
} from './modal';
import { NA_CODE_DATA } from './lookup';
import { LOCK_IN_TRIGGER_HZ, lockInCheck, type BoundaryLookup, type LockInStatus } from './lateral';
import { movingLoadResponse, steadyStateAcceleration } from './solver';

export type Direction = 'vertical' | 'lateral' | 'torsional';
export type Activity = 'walking' | 'jogging';

/** A value read from a digitised figure, with a warning when the lookup clamped. */
export interface LookupValue {
  value: number;
  warning?: string;
}

/** Injectable code data (CLAUDE.md: k(f) and γ must be injectable). */
export interface CodeData {
  /** NA.2.44.4, Figure NA.8 — k(f_v) for walking or jogging. */
  k?: (activity: Activity, fv: number) => LookupValue;
  /** NA.2.44.4, Figure NA.9 — γ for groups, from log decrement δ and Seff (m). */
  gammaGroup?: (delta: number, Seff: number) => LookupValue;
  /** NA.2.44.5, Figure NA.9 — γ for crowds, from log decrement δ. */
  gammaCrowd?: (delta: number) => LookupValue;
}

export interface BeamBridgeInput {
  kind: 'beam';
  /** Span (m). */
  L: number;
  /** Flexural rigidity (N·m²). */
  EI: number;
  /** Mass per metre including permanent and superimposed dead load (kg/m). */
  m: number;
  /** Damping ratio in % (SPEC §2). */
  dampingPercent: number;
}

export interface ModalModeInput {
  f: number;
  /** Modal mass for a unit-max mode shape (kg). */
  M: number;
  dampingPercent: number;
  direction: Direction;
  shape: ShapeType;
  /** Effective span (m), required when shape is 'user-seff'. */
  Seff?: number;
}

export interface ModalBridgeInput {
  kind: 'modal';
  /** Span S (m). */
  L: number;
  modes: ModalModeInput[];
}

export interface CheckInputs {
  name?: string;
  bridge: BeamBridgeInput | ModalBridgeInput;
  /** Deck width b (m). */
  b?: number;
  /** Height of the structure above ground (m), for k3. */
  height?: number;
  usage?: UsageInput;
  comfort?: { k1?: K1Key; k2?: K2Key; k4?: number; k4Justification?: string };
  /**
   * Lowest deck mass per metre (kg/m) for the lateral lock-in check in modal mode
   * (NA.2.44.7; PD 6688-2 §A.7). Beam mode uses its uniform mass per metre instead.
   */
  mBridgeMin?: number;
  /** Injected k(f) and γ (tests). Omit to use the digitised Figures NA.8 and NA.9. */
  codeData?: CodeData;
  /** Injected Figure NA.11 boundary (tests). Omit to use the digitised figure. */
  lateralBoundary?: BoundaryLookup;
}

export interface Flag {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  clause?: string;
  modeId?: string;
}

export interface ModeResult {
  id: string;
  label: string;
  /** Beam mode number, or null in modal mode. */
  n: number | null;
  direction: Direction;
  f: number;
  M: number;
  /** Damping ratio ξ (decimal). */
  zeta: number;
  /** Log decrement δ = 2πξ (derived). */
  delta: number;
  shape: ShapeType | 'sine';
  /** Span S (m). */
  S: number;
  Seff: number;
  lambda_: number;
  /** ∫|φ| dx over the span (m). */
  absPhi: number;
}

export type CaseKind = 'walking-group' | 'jogging-group' | 'crowd';
export type CaseStatus =
  'computed' | 'awaiting-data' | 'blocked' | 'not-applicable' | 'needs-input';

export interface LoadCaseResult {
  modeId: string;
  kind: CaseKind;
  label: string;
  status: CaseStatus;
  /** Group size, or number of pedestrians in the crowd. */
  N: number | null;
  k: number | null;
  gamma: number | null;
  gammaNeeded: boolean;
  /** Group: moving force amplitude (N). Crowd: generalised force amplitude P₀ (N). */
  forceAmplitude: number | null;
  /** Crowd only: distributed load amplitude W₀ (N/m²). */
  W0: number | null;
  aPeak: number | null;
  aLimit: number | null;
  utilisation: number | null;
  verdict: 'PASS' | 'FAIL' | null;
  /** Code data this case is waiting for, e.g. ['k(f)', 'γ']. */
  missing: string[];
  message: string | null;
  /** Why this case's method is not yet verified ([VERIFY] in SPEC.md), or null. */
  verify: string | null;
  /**
   * True when the vertical comfort check is not required (fundamental vertical frequency
   * ≥ 5 Hz, NA.2.44.6(1)): the accelerations are shown for information only, with no verdict.
   */
  informationOnly: boolean;
  /** Antinode acceleration history, recorded for the governing group case only. */
  history?: { t: number[]; a: number[] };
}

export interface ComfortResult extends ComfortLimitResult {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k4Justification: string | null;
}

/**
 * Lateral lock-in check for one lateral or torsional mode below 1.5 Hz (NA.2.44.7; SPEC §2.8).
 * Torsional modes are included because they can have a significant lateral component; the
 * user is asked to confirm that.
 */
export interface LateralCheckResult {
  modeId: string;
  direction: 'lateral' | 'torsional';
  f: number;
  /** Structural damping ratio ξ (decimal); no pedestrian damping (PD 6688-2 §A.1). */
  zeta: number;
  /** Bridge mass per metre used (kg/m); lowest value for a non-uniform deck (PD 6688-2 §A.7). */
  mBridge: number | null;
  /** Crowd density from Table NA.7 or the override, not capped (persons/m²). */
  rho: number | null;
  /** Deck width (m). */
  b: number | null;
  /** m_pedestrian = ρ·b·70 (kg/m). */
  mPedestrian: number | null;
  /** D = m_bridge·ξ/m_pedestrian. */
  D: number | null;
  /** Boundary D read from Figure NA.11 at f. */
  DBoundary: number | null;
  status: LockInStatus | 'needs-input';
  /** Caution outside the 0.5–1.1 Hz test-data range of Figure NA.11. */
  caution: string | null;
  message: string | null;
}

export type OverallStatus =
  'PASS' | 'FAIL' | 'AWAITING' | 'INCOMPLETE' | 'NOT-REQUIRED' | 'INPUT-ERROR';

/** Whether the vertical comfort check is required (NA+A1:2020, NA.2.44.6(1); SPEC §2.10). */
export interface VerticalRequirement {
  /**
   * Lowest vertical natural frequency (Hz). In beam mode this is mode 1, even when it is at or
   * above the 8 Hz display cut-off. Null in modal mode when no vertical mode is entered.
   */
  fundamentalHz: number | null;
  /** True below 5 Hz, false at or above it, null when fundamentalHz is null. */
  required: boolean | null;
}

export interface CheckResult {
  inputErrors: string[];
  modes: ModeResult[];
  comfort: ComfortResult | null;
  usage: ResolvedUsage | null;
  cases: LoadCaseResult[];
  /** Lateral lock-in checks, one per lateral or torsional mode below 1.5 Hz (NA.2.44.7). */
  lateral: LateralCheckResult[];
  governing: LoadCaseResult | null;
  status: OverallStatus;
  flags: Flag[];
  /** Inputs still needed before every result can be shown. */
  missingInputs: string[];
  /** Reasons the overall status is not a plain PASS, for the status card and calc sheet. */
  statusNotes: string[];
  /** Information for the status card and calc sheet that does not change the status. */
  statusInfo: string[];
  vertical: VerticalRequirement;
}

/** Plain names for Table NA.7 fields in override flags. */
const OVERRIDE_LABEL: Record<UsageOverrideField, string> = {
  groupWalking: 'Walking group size',
  groupJogging: 'Jogging group size',
  crowdDensity: 'Crowd density',
};

const K_LABEL = 'k(f)';
const GAMMA_LABEL = 'γ';

function emptyResult(inputErrors: string[]): CheckResult {
  return {
    inputErrors,
    modes: [],
    comfort: null,
    usage: null,
    cases: [],
    lateral: [],
    governing: null,
    status: 'INPUT-ERROR',
    flags: [],
    missingInputs: [],
    statusNotes: [],
    statusInfo: [],
    vertical: { fundamentalHz: null, required: null },
  };
}

function isPositive(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v) && v > 0;
}

function validate(inputs: CheckInputs): string[] {
  const errors: string[] = [];
  const pos = (label: string, v: number | undefined) => {
    if (!isPositive(v)) errors.push(`${label} must be a positive number.`);
  };
  // The response formulas assume an underdamped mode, so ξ must be below 100 % of critical.
  const damping = (label: string, v: number) => {
    if (!isPositive(v)) errors.push(`${label} must be a positive number.`);
    else if (v >= 100) errors.push(`${label} must be less than 100 % of critical.`);
  };
  const { bridge } = inputs;
  pos('Span', bridge.L);
  if (bridge.kind === 'beam') {
    pos('EI', bridge.EI);
    pos('Mass per metre', bridge.m);
    damping('Damping', bridge.dampingPercent);
  } else {
    if (bridge.modes.length === 0) errors.push('Enter at least one mode.');
    bridge.modes.forEach((md, i) => {
      const n = i + 1;
      pos(`Mode ${n}: frequency`, md.f);
      pos(`Mode ${n}: modal mass`, md.M);
      damping(`Mode ${n}: damping`, md.dampingPercent);
      if (md.shape === 'user-seff') {
        pos(`Mode ${n}: Seff`, md.Seff);
        // NA+A1:2020, NA.2.44.4, Figure NA.7 — with max |φ| = 1, ∫|φ| ≤ S, so Seff ≤ S/0.637.
        const maxSeff = bridge.L / SEFF_DIVISOR;
        if (isPositive(md.Seff) && isPositive(bridge.L) && md.Seff > maxSeff) {
          errors.push(
            `Mode ${n}: Seff cannot be more than S/0.637 = ${maxSeff.toFixed(2)} m for a mode shape scaled to a largest value of 1 (NA.2.44.4, Figure NA.7).`,
          );
        }
      }
    });
  }
  if (inputs.b !== undefined) pos('Deck width', inputs.b);
  if (inputs.mBridgeMin !== undefined) pos('Lowest deck mass per metre', inputs.mBridgeMin);
  if (inputs.height !== undefined && !(Number.isFinite(inputs.height) && inputs.height >= 0)) {
    errors.push('Height above ground must be zero or more.');
  }
  return errors;
}

/** Modal properties for every mode, before display filtering. */
function buildModes(bridge: CheckInputs['bridge']): {
  modes: ModeResult[];
  phis: Map<string, () => (x: number) => number>;
  hidden: number[];
  fundamentalHz: number | null;
} {
  const S = bridge.L;
  const modes: ModeResult[] = [];
  const phis = new Map<string, () => (x: number) => number>();
  const hidden: number[] = [];
  let fundamentalHz: number | null;

  if (bridge.kind === 'beam') {
    const zeta = bridge.dampingPercent / 100;
    const all = beamModes({ L: S, EI: bridge.EI, m: bridge.m });
    fundamentalHz = all[0]?.f ?? null; // mode 1 is the lowest
    for (const bm of all) {
      // SPEC §2.1 — keep modes below 8 Hz for display, judged at the displayed precision.
      if (!isBeamModeDisplayed(bm.f)) {
        hidden.push(bm.n);
        continue;
      }
      const absPhi = absPhiIntegral('half-sine', S); // 2S/π for every sine mode n
      const Seff = effectiveSpan(absPhi);
      const id = `mode-${bm.n}`;
      modes.push({
        id,
        label: `Mode ${bm.n}`,
        n: bm.n,
        direction: 'vertical',
        f: bm.f,
        M: bm.M,
        zeta,
        delta: 2 * Math.PI * zeta,
        shape: 'sine',
        S,
        Seff,
        lambda_: lambdaFactor(Seff, S),
        absPhi,
      });
      phis.set(id, () => sineModeShape(bm.n, S));
    }
  } else {
    bridge.modes.forEach((md, i) => {
      const zeta = md.dampingPercent / 100;
      const absPhi =
        md.shape === 'user-seff'
          ? absPhiIntegralFromSeff(md.Seff as number) // SPEC §2.6 — ∫|φ| = 0.637·Seff
          : absPhiIntegral(md.shape, S);
      const Seff = effectiveSpan(absPhi);
      const id = `mode-${i + 1}`;
      modes.push({
        id,
        label: `Mode ${i + 1}`,
        n: null,
        direction: md.direction,
        f: md.f,
        M: md.M,
        zeta,
        delta: 2 * Math.PI * zeta,
        shape: md.shape,
        S,
        Seff,
        lambda_: lambdaFactor(Seff, S),
        absPhi,
      });
      phis.set(id, () => modeShapeFunction(md.shape, S));
    });
    const vertical = bridge.modes.filter((md) => md.direction === 'vertical').map((md) => md.f);
    fundamentalHz = vertical.length > 0 ? Math.min(...vertical) : null;
  }
  return { modes, phis, hidden, fundamentalHz };
}

function frequencyFlags(mode: ModeResult): Flag[] {
  const flags: Flag[] = [];
  const at = `${mode.label} (${mode.f.toFixed(2)} Hz)`;
  if (mode.direction === 'vertical') {
    if (mode.f < VERTICAL_TRIGGER_HZ) {
      flags.push({
        level: 'info',
        code: 'vertical-trigger',
        modeId: mode.id,
        clause: 'NA+A1:2020, NA.2.44.6(1)',
        message: `${at} is below ${VERTICAL_TRIGGER_HZ} Hz, so the vertical comfort check is required.`,
      });
    }
    return flags;
  }
  if (mode.f < LATERAL_TRIGGER_HZ) {
    flags.push({
      level: 'warning',
      code: 'lateral-trigger',
      modeId: mode.id,
      clause: 'NA+A1:2020, NA.2.44.6(3)',
      message: `${at} is a ${mode.direction} mode below ${LATERAL_TRIGGER_HZ} Hz, so its horizontal acceleration must be checked against ${HORIZONTAL_ACCEL_LIMIT} m/s². Lateral and torsional accelerations are not calculated in this version.`,
    });
  }
  if (mode.f < DAMPER_PROVISION_HZ) {
    flags.push({
      level: 'warning',
      code: 'damper-provision',
      modeId: mode.id,
      clause: 'NA+A1:2020, NA.2.44.6(4)',
      message: `${at} is a ${mode.direction} mode below ${DAMPER_PROVISION_HZ} Hz: consider making provision for dampers.`,
    });
  }
  return flags;
}

function blankCase(mode: ModeResult, kind: CaseKind, label: string): LoadCaseResult {
  return {
    modeId: mode.id,
    kind,
    label,
    status: 'awaiting-data',
    N: null,
    k: null,
    gamma: null,
    gammaNeeded: true,
    forceAmplitude: null,
    W0: null,
    aPeak: null,
    aLimit: null,
    utilisation: null,
    verdict: null,
    missing: [],
    message: null,
    verify: null,
    informationOnly: false,
  };
}

function finish(c: LoadCaseResult, aPeak: number, ctx: Context): void {
  c.status = 'computed';
  c.aPeak = aPeak;
  c.aLimit = ctx.aLimit;
  c.informationOnly = !ctx.verticalRequired;
  if (ctx.aLimit !== null) {
    c.utilisation = aPeak / ctx.aLimit;
    // NA.2.44.6(1) — no verdict when the vertical comfort check is not required.
    if (ctx.verticalRequired) c.verdict = aPeak <= ctx.aLimit ? 'PASS' : 'FAIL';
  }
}

function groupCase(
  mode: ModeResult,
  activity: Activity,
  params: ActivityParams,
  N: number,
  phi: () => (x: number) => number,
  ctx: Context,
): LoadCaseResult {
  const kind: CaseKind = activity === 'walking' ? 'walking-group' : 'jogging-group';
  const c = blankCase(mode, kind, activity === 'walking' ? 'Walking group' : 'Jogging group');
  c.N = N;
  // NA.2.44.4 — for N = 1, √(1 + γ(N − 1)) = 1, so γ is not needed.
  c.gammaNeeded = N > 1;

  let phiFn: (x: number) => number;
  try {
    phiFn = phi();
  } catch (e) {
    if (!(e instanceof ModeShapeRequiredError)) throw e;
    c.status = 'blocked';
    c.message = e.message;
    // One flag per mode, however many group cases it blocks.
    if (!ctx.flags.some((f) => f.code === 'mode-shape-required' && f.modeId === mode.id)) {
      ctx.flags.push({
        level: 'warning',
        code: 'mode-shape-required',
        modeId: mode.id,
        clause: 'NA.2.44.4',
        message: `${mode.label}, group cases not run: ${e.message}`,
      });
    }
    return c;
  }

  const k = ctx.lookupK(activity, mode.f);
  const gamma = c.gammaNeeded ? ctx.lookupGammaGroup(mode.delta, mode.Seff) : 0;
  if (k === null) c.missing.push(K_LABEL);
  if (gamma === null) c.missing.push(GAMMA_LABEL);
  c.k = k;
  c.gamma = c.gammaNeeded ? gamma : null;
  if (k === null || gamma === null) return c;

  const Famp = groupForceAmplitude({ F0: params.F0, k, gamma, N });
  c.forceAmplitude = Famp;
  const solve = (recordHistory: boolean) =>
    movingLoadResponse({
      f: mode.f,
      M: mode.M,
      zeta: mode.zeta,
      Famp,
      v: params.v,
      S: mode.S,
      phi: phiFn,
      recordHistory,
    });
  // The history is only needed for the governing group case, which runs again to record it.
  ctx.historyRuns.set(c, () => solve(true).history);
  finish(c, solve(false).peakAccel, ctx);
  return c;
}

function crowdCase(mode: ModeResult, usage: ResolvedUsage, b: number | undefined, ctx: Context) {
  const c = blankCase(mode, 'crowd', 'Crowd');
  if (b === undefined) {
    c.status = 'needs-input';
    c.message = 'Enter the deck width to run the crowd case.';
    return c;
  }
  c.N = usage.rhoUsed * mode.S * b;
  // NA.2.44.2, Table NA.7 — crowd density is given for walking only (no jogging crowd), so the
  // crowd case uses the walking k(f) curve and F₀ = 280 N (Table NA.8).
  const k = ctx.lookupK('walking', mode.f);
  const gamma = ctx.lookupGammaCrowd(mode.delta);
  if (k === null) c.missing.push(K_LABEL);
  if (gamma === null) c.missing.push(GAMMA_LABEL);
  c.k = k;
  c.gamma = gamma;
  if (k === null || gamma === null) return c;

  const load = crowdLoad({
    F0: WALKING.F0,
    k,
    gamma,
    rho: usage.rhoInput,
    S: mode.S,
    b,
    lambda_: mode.lambda_,
    absPhiIntegral: mode.absPhi,
  });
  c.N = load.N;
  c.W0 = load.W0;
  c.forceAmplitude = load.P0;
  finish(c, steadyStateAcceleration(load.P0, mode.zeta, mode.M), ctx);
  return c;
}

function notApplicable(mode: ModeResult, kind: CaseKind, label: string, message: string) {
  const c = blankCase(mode, kind, label);
  c.status = 'not-applicable';
  c.gammaNeeded = false;
  c.message = message;
  return c;
}

interface Context {
  aLimit: number | null;
  /** False when the vertical comfort check is not required (NA.2.44.6(1)). */
  verticalRequired: boolean;
  flags: Flag[];
  /** Group cases that can run again to record their antinode history. */
  historyRuns: Map<LoadCaseResult, () => LoadCaseResult['history']>;
  lookupK: (a: Activity, f: number) => number | null;
  lookupGammaGroup: (delta: number, Seff: number) => number | null;
  lookupGammaCrowd: (delta: number) => number | null;
}

function makeContext(
  codeData: CodeData,
  aLimit: number | null,
  verticalRequired: boolean,
  flags: Flag[],
): Context {
  // The same lookup can run for several cases (walking k(f) for the group and the crowd),
  // so each warning is flagged once.
  const use = (v: LookupValue, clause: string): number => {
    if (v.warning && !flags.some((f) => f.code === 'lookup-clamped' && f.message === v.warning)) {
      flags.push({ level: 'warning', code: 'lookup-clamped', clause, message: v.warning });
    }
    return v.value;
  };
  return {
    aLimit,
    verticalRequired,
    flags,
    historyRuns: new Map(),
    lookupK: (a, f) => (codeData.k ? use(codeData.k(a, f), 'NA.2.44.4, Figure NA.8') : null),
    lookupGammaGroup: (d, s) =>
      codeData.gammaGroup ? use(codeData.gammaGroup(d, s), 'NA.2.44.4, Figure NA.9') : null,
    lookupGammaCrowd: (d) =>
      codeData.gammaCrowd ? use(codeData.gammaCrowd(d), 'NA.2.44.5, Figure NA.9') : null,
  };
}

/** NA.2.44.7 covers deck modes with a significant lateral component; torsional modes may have one. */
const TORSIONAL_CONFIRM =
  'This is a torsional mode, checked by default because NA.2.44.7 covers deck modes with a significant lateral component. Confirm that it has a significant lateral component; if it does not, this result does not apply.';

/** Lateral lock-in check for one lateral or torsional mode below 1.5 Hz (NA.2.44.7; SPEC §2.8). */
function lateralCase(
  mode: ModeResult,
  mBridge: number | undefined,
  usage: ResolvedUsage | null,
  b: number | undefined,
  boundary: BoundaryLookup | undefined,
): LateralCheckResult {
  const direction = mode.direction === 'torsional' ? 'torsional' : 'lateral';
  const withConfirm = (msg: string | null): string | null =>
    direction === 'torsional' ? [TORSIONAL_CONFIRM, msg].filter(Boolean).join(' ') : msg;
  const base: LateralCheckResult = {
    modeId: mode.id,
    direction,
    f: mode.f,
    zeta: mode.zeta,
    mBridge: mBridge ?? null,
    // NA.2.44.7 — ρ from Table NA.7 (or the project override), without the NA.2.44.5 cap,
    // which applies to the crowd load only.
    rho: usage?.rhoInput ?? null,
    b: b ?? null,
    mPedestrian: null,
    D: null,
    DBoundary: null,
    status: 'needs-input',
    caution: null,
    message: null,
  };
  if (mBridge === undefined || b === undefined || usage === null) {
    const needs = [
      mBridge === undefined ? 'the lowest deck mass per metre' : null,
      b === undefined ? 'the deck width' : null,
      usage === null ? 'the bridge class' : null,
    ].filter((x): x is string => x !== null);
    base.message = withConfirm(`Enter ${needs.join(' and ')} to run the lateral lock-in check.`);
    return base;
  }
  const r = lockInCheck({ f: mode.f, zeta: mode.zeta, mBridge, rho: usage.rhoInput, b, boundary });
  let message = r.message;
  const tableClassA =
    usage.bridgeClass === 'A' && usage.overrides.every((o) => o.field !== 'crowdDensity');
  if (r.status === 'NO-CROWD' && tableClassA) {
    message = `Table NA.7 gives no crowd for class A. ${message}`;
  }
  return {
    ...base,
    mPedestrian: r.mPedestrian,
    D: r.D,
    DBoundary: r.DBoundary,
    status: r.status,
    caution: r.caution,
    message: withConfirm(message),
  };
}

function overallStatus(
  cases: LoadCaseResult[],
  lateral: LateralCheckResult[],
  missingInputs: string[],
  statusNotes: string[],
  verticalRequired: boolean | null,
): OverallStatus {
  if (verticalRequired === false) {
    // SPEC §2.10 — vertical check not required (NA.2.44.6(1)); the lateral rules still apply.
    if (lateral.some((l) => l.status === 'UNSTABLE')) return 'FAIL';
    if (lateral.some((l) => l.status === 'needs-input' || l.status === 'OUTSIDE-FIGURE')) {
      return 'INCOMPLETE';
    }
    if (missingInputs.length > 0 || statusNotes.length > 0) return 'INCOMPLETE';
    return 'NOT-REQUIRED';
  }
  const active = cases.filter((c) => c.status !== 'not-applicable');
  if (active.some((c) => c.verdict === 'FAIL')) return 'FAIL';
  // NA.2.44.7 — below the Figure NA.11 boundary, divergent lateral response may occur.
  if (lateral.some((l) => l.status === 'UNSTABLE')) return 'FAIL';
  if (lateral.some((l) => l.status === 'needs-input' || l.status === 'OUTSIDE-FIGURE')) {
    return 'INCOMPLETE';
  }
  if (missingInputs.length > 0 || active.length === 0) return 'INCOMPLETE';
  if (statusNotes.length > 0) return 'INCOMPLETE';
  if (active.some((c) => c.status === 'blocked' || c.status === 'needs-input')) return 'INCOMPLETE';
  if (active.some((c) => c.status === 'awaiting-data')) return 'AWAITING';
  return active.every((c) => c.verdict === 'PASS') ? 'PASS' : 'INCOMPLETE';
}

/**
 * The group case whose time history is recorded and plotted: the computed group case with the
 * highest utilisation, or the highest a_peak when there is no comfort limit. Crowd cases are
 * steady state and have no time history. Ties keep the first case (walking before jogging).
 */
export function governingGroupCase(cases: LoadCaseResult[]): LoadCaseResult | null {
  const ran = cases.filter(
    (c) =>
      (c.kind === 'walking-group' || c.kind === 'jogging-group') &&
      c.status === 'computed' &&
      c.aPeak !== null,
  );
  const byUtil = ran.every((c) => c.utilisation !== null);
  const score = (x: LoadCaseResult) => (byUtil ? x.utilisation : x.aPeak) as number;
  let best: LoadCaseResult | null = null;
  for (const c of ran) {
    if (best === null || score(c) > score(best)) best = c;
  }
  return best;
}

/** Run the full check (SPEC §2.10). Never throws for bad user input: see `inputErrors`. */
export function runCheck(inputs: CheckInputs): CheckResult {
  const errors = validate(inputs);
  if (errors.length > 0) return emptyResult(errors);

  try {
    const flags: Flag[] = [];
    const missingInputs: string[] = [];

    const { modes, phis, hidden, fundamentalHz } = buildModes(inputs.bridge);
    // NA+A1:2020, NA.2.44.6(1) — the vertical comfort check is needed only when the fundamental
    // vertical frequency is below 5 Hz (SPEC §2.10).
    const vertical: VerticalRequirement = {
      fundamentalHz,
      required: fundamentalHz === null ? null : fundamentalHz < VERTICAL_TRIGGER_HZ,
    };
    const statusInfo: string[] = [];
    if (vertical.required === false) {
      const text = `The fundamental vertical frequency, ${(fundamentalHz as number).toFixed(2)} Hz, is at or above ${VERTICAL_TRIGGER_HZ} Hz, so the vertical comfort check is not required. Any accelerations shown are for information only.`;
      statusInfo.push(text);
      flags.push({
        level: 'info',
        code: 'vertical-not-required',
        clause: 'NA+A1:2020, NA.2.44.6(1)',
        message: text,
      });
    }
    if (inputs.bridge.kind === 'beam') {
      statusInfo.push(
        'Beam mode gives vertical modes only: lateral and torsional modes were not assessed. Enter them in modal mode to check them.',
      );
    }
    if (hidden.length > 0) {
      flags.push({
        level: 'info',
        code: 'modes-hidden',
        clause: 'SPEC §2.1',
        message: `Beam mode${hidden.length > 1 ? 's' : ''} ${hidden.join(', ')} at or above ${BEAM_DISPLAY_FREQ_LIMIT} Hz not shown.`,
      });
    }
    for (const md of modes) flags.push(...frequencyFlags(md));

    // Comfort limit (NA.2.44.6).
    let comfort: ComfortResult | null = null;
    const k1Key = inputs.comfort?.k1;
    const k2Key = inputs.comfort?.k2;
    if (inputs.height === undefined) missingInputs.push('height above ground');
    if (k1Key === undefined) missingInputs.push('k1');
    if (k2Key === undefined) missingInputs.push('k2');
    if (inputs.height !== undefined && k1Key !== undefined && k2Key !== undefined) {
      const k1 = K1[k1Key];
      const k2 = K2[k2Key];
      const k3 = k3FromHeight(inputs.height);
      const k4 = inputs.comfort?.k4 ?? K4_DEFAULT; // NA.2.44.6 — exposure factor default
      const lim = comfortLimit({ k1, k2, k3, k4 });
      const just = inputs.comfort?.k4Justification?.trim() || null;
      comfort = { ...lim, k1, k2, k3, k4, k4Justification: just };
      if (lim.clamped) {
        flags.push({
          level: 'info',
          code: 'limit-clamped',
          clause: 'NA.2.44.6',
          message: `The product k1·k2·k3·k4 = ${lim.raw.toFixed(3)} m/s² is ${lim.clamped === 'lower' ? 'raised' : 'reduced'} to ${lim.aLimit.toFixed(2)} m/s².`,
        });
      }
      if (k4 !== K4_DEFAULT && just === null) {
        flags.push({
          level: 'warning',
          code: 'k4-justification',
          clause: 'NA.2.44.6',
          message: 'k4 differs from 1.0. Add a justification for the calc sheet.',
        });
      }
    }

    // Usage (Table NA.7) and load cases (NA.2.44.4, NA.2.44.5).
    let usage: ResolvedUsage | null = null;
    const cases: LoadCaseResult[] = [];
    if (inputs.usage === undefined) {
      missingInputs.push('bridge class');
    } else {
      usage = resolveUsage(inputs.usage);
      for (const w of usage.warnings) {
        flags.push({ level: 'info', code: 'crowd-cap', clause: 'NA.2.44.5', message: w });
      }
      for (const o of usage.overrides) {
        // An excluded jogging group is not used, so its override is not flagged.
        if (o.field === 'groupJogging' && !usage.includeJogging) continue;
        flags.push({
          level: 'warning',
          code: 'override',
          clause: 'NA.2.44.2(2)',
          message: `${OVERRIDE_LABEL[o.field]} overridden: ${o.value} used instead of the Table NA.7 value ${o.tableValue}.`,
        });
      }
      const ctx = makeContext(
        inputs.codeData ?? NA_CODE_DATA,
        comfort?.aLimit ?? null,
        vertical.required !== false,
        flags,
      );
      for (const md of modes) {
        if (md.direction !== 'vertical') continue;
        const phi = phis.get(md.id) as () => (x: number) => number;

        cases.push(
          usage.nWalking >= 1
            ? groupCase(md, 'walking', WALKING, usage.nWalking, phi, ctx)
            : notApplicable(md, 'walking-group', 'Walking group', 'Group size is zero.'),
        );
        if (!usage.includeJogging) {
          cases.push(
            notApplicable(
              md,
              'jogging-group',
              'Jogging group',
              'Jogging excluded for this project (NA.2.44.2(3)).',
            ),
          );
        } else if (usage.nJogging >= 1) {
          cases.push(groupCase(md, 'jogging', JOGGING, usage.nJogging, phi, ctx));
        } else {
          cases.push(
            notApplicable(md, 'jogging-group', 'Jogging group', 'No jogging group for this class.'),
          );
        }
        cases.push(
          usage.rhoUsed > 0
            ? crowdCase(md, usage, inputs.b, ctx)
            : notApplicable(md, 'crowd', 'Crowd', 'Crowd density is zero for this class.'),
        );
      }
      const g = governingGroupCase(cases);
      const record = g ? ctx.historyRuns.get(g) : undefined;
      if (g && record) g.history = record();
      if (!usage.includeJogging) {
        flags.push({
          level: 'info',
          code: 'jogging-excluded',
          clause: 'NA.2.44.2(3)',
          message: 'Jogging cases are excluded for this project.',
        });
      }
    }

    const awaiting = cases.some((c) => c.status === 'awaiting-data');
    if (awaiting) {
      flags.push({
        level: 'info',
        code: 'awaiting-code-data',
        clause: 'NA.2.44.4, Figures NA.8 and NA.9',
        message:
          'Peak accelerations need k(f) and γ, which were not supplied for this run. No PASS or FAIL is given for those cases.',
      });
    }

    // Lateral lock-in stability (NA.2.44.7; SPEC §2.8) for lateral modes below 1.5 Hz.
    const lateral: LateralCheckResult[] = [];
    if (inputs.bridge.kind === 'beam') {
      flags.push({
        level: 'info',
        code: 'lock-in-beam-mode',
        clause: 'NA.2.44.7',
        message:
          'Beam mode gives vertical modes only, so the lateral lock-in check is not run. Enter lateral modes in modal mode to check them.',
      });
    } else {
      for (const md of modes) {
        // NA.2.44.7 — modes with a significant lateral component: lateral, and torsional by
        // default (the user confirms the lateral component).
        if (md.direction === 'vertical' || !(md.f < LOCK_IN_TRIGGER_HZ)) continue;
        const l = lateralCase(md, inputs.mBridgeMin, usage, inputs.b, inputs.lateralBoundary);
        lateral.push(l);
        if (l.direction === 'torsional') {
          flags.push({
            level: 'warning',
            code: 'lock-in-torsional',
            modeId: md.id,
            clause: 'NA.2.44.7',
            message: `${md.label} (${md.f.toFixed(2)} Hz) is torsional and is included in the lateral lock-in check. Confirm that it has a significant lateral component.`,
          });
        }
        if (l.caution) {
          flags.push({
            level: 'warning',
            code: 'lock-in-caution',
            modeId: md.id,
            clause: 'NA.2.44.7, Figure NA.11',
            message: `${md.label}: ${l.caution}`,
          });
        }
        if (l.status === 'OUTSIDE-FIGURE') {
          flags.push({
            level: 'warning',
            code: 'lock-in-outside-figure',
            modeId: md.id,
            clause: 'NA.2.44.7, Figure NA.11',
            message: `${md.label}: ${l.message}`,
          });
        }
      }
      if (lateral.length === 0) {
        flags.push({
          level: 'info',
          code: 'lock-in-not-expected',
          clause: 'NA.2.44.7',
          message: `No lateral or torsional mode below ${LOCK_IN_TRIGGER_HZ} Hz was entered: unstable lateral response not expected.`,
        });
      }
      if (lateral.some((l) => l.status === 'needs-input')) {
        if (inputs.mBridgeMin === undefined) missingInputs.push('lowest deck mass per metre');
        if (inputs.b === undefined) missingInputs.push('deck width');
      }
    }

    const statusNotes: string[] = [];
    for (const l of lateral) {
      const md = modes.find((x) => x.id === l.modeId) as ModeResult;
      const at = `${md.label} (${md.f.toFixed(2)} Hz, ${l.direction})`;
      if (l.status === 'UNSTABLE') {
        statusNotes.push(
          `${at}: D = ${(l.D as number).toFixed(3)} is not above the Figure NA.11 boundary of ${(l.DBoundary as number).toFixed(3)}, so divergent lateral response may occur (NA.2.44.7).`,
        );
      } else if (l.status === 'OUTSIDE-FIGURE') {
        statusNotes.push(
          `${at}: lateral stability cannot be assessed, because the frequency is outside the digitised Figure NA.11 boundary.`,
        );
      }
    }
    // SPEC §2.9 — lateral/torsional modes below 2.5 Hz need their horizontal acceleration
    // checked against 0.2 m/s² (NA.2.44.6(3)), which this version does not calculate (§10),
    // so no overall PASS can be given while any exist.
    for (const md of modes) {
      if (md.direction === 'vertical' || !(md.f < LATERAL_TRIGGER_HZ)) continue;
      statusNotes.push(
        `${md.label} (${md.f.toFixed(2)} Hz, ${md.direction}) is below ${LATERAL_TRIGGER_HZ} Hz: its horizontal acceleration (limit ${HORIZONTAL_ACCEL_LIMIT} m/s², NA.2.44.6(3)) is not calculated in this version.`,
      );
    }

    if (vertical.required === false) {
      // NA.2.44.6(1) — the comfort-limit inputs are not needed; the class is needed only for
      // the lateral lock-in check.
      const notNeeded = ['height above ground', 'k1', 'k2'];
      if (lateral.length === 0) notNeeded.push('bridge class');
      for (const x of notNeeded) {
        const i = missingInputs.indexOf(x);
        if (i >= 0) missingInputs.splice(i, 1);
      }
    }

    // The governing case drives the verdict, so there is none when the check is not required.
    let governing: LoadCaseResult | null = null;
    for (const c of cases) {
      if (c.utilisation === null || c.informationOnly) continue;
      if (governing === null || c.utilisation > (governing.utilisation as number)) governing = c;
    }

    return {
      inputErrors: [],
      statusNotes,
      statusInfo,
      vertical,
      modes,
      comfort,
      usage,
      cases,
      lateral,
      governing,
      status: overallStatus(cases, lateral, missingInputs, statusNotes, vertical.required),
      flags,
      missingInputs,
    };
  } catch (e) {
    if (e instanceof RangeError) return emptyResult([e.message]);
    throw e;
  }
}
