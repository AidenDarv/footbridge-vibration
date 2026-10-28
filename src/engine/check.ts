// Orchestrates the check: inputs → modal properties, limit, load cases, flags (SPEC §2.10).
// Pure. k(f) and γ come from `codeData`; when a lookup is missing (the digitised NA figures
// are not in the repo yet) the affected cases are returned as 'awaiting-data', never guessed.

import {
  DAMPER_PROVISION_HZ,
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
} from './loads';
import {
  BEAM_DISPLAY_FREQ_LIMIT,
  ModeShapeRequiredError,
  absPhiIntegral,
  absPhiIntegralFromSeff,
  beamModes,
  effectiveSpan,
  lambdaFactor,
  modeShapeFunction,
  sineModeShape,
  type ShapeType,
} from './modal';
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
  codeData?: CodeData;
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
  /** Antinode acceleration history, group cases only. */
  history?: { t: number[]; a: number[] };
}

export interface ComfortResult extends ComfortLimitResult {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k4Justification: string | null;
}

export type OverallStatus = 'PASS' | 'FAIL' | 'AWAITING' | 'INCOMPLETE' | 'INPUT-ERROR';

export interface CheckResult {
  inputErrors: string[];
  modes: ModeResult[];
  comfort: ComfortResult | null;
  usage: ResolvedUsage | null;
  cases: LoadCaseResult[];
  governing: LoadCaseResult | null;
  status: OverallStatus;
  flags: Flag[];
  /** Inputs still needed before every result can be shown. */
  missingInputs: string[];
}

const K_LABEL = 'k(f)';
const GAMMA_LABEL = 'γ';

function emptyResult(inputErrors: string[]): CheckResult {
  return {
    inputErrors,
    modes: [],
    comfort: null,
    usage: null,
    cases: [],
    governing: null,
    status: 'INPUT-ERROR',
    flags: [],
    missingInputs: [],
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
  const { bridge } = inputs;
  pos('Span', bridge.L);
  if (bridge.kind === 'beam') {
    pos('EI', bridge.EI);
    pos('Mass per metre', bridge.m);
    pos('Damping', bridge.dampingPercent);
  } else {
    if (bridge.modes.length === 0) errors.push('Enter at least one mode.');
    bridge.modes.forEach((md, i) => {
      const n = i + 1;
      pos(`Mode ${n}: frequency`, md.f);
      pos(`Mode ${n}: modal mass`, md.M);
      pos(`Mode ${n}: damping`, md.dampingPercent);
      if (md.shape === 'user-seff') pos(`Mode ${n}: Seff`, md.Seff);
    });
  }
  if (inputs.b !== undefined) pos('Deck width', inputs.b);
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
} {
  const S = bridge.L;
  const modes: ModeResult[] = [];
  const phis = new Map<string, () => (x: number) => number>();
  const hidden: number[] = [];

  if (bridge.kind === 'beam') {
    const zeta = bridge.dampingPercent / 100;
    for (const bm of beamModes({ L: S, EI: bridge.EI, m: bridge.m })) {
      // SPEC §2.1 — keep modes below 8 Hz for display.
      if (bm.f >= BEAM_DISPLAY_FREQ_LIMIT) {
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
          ? absPhiIntegralFromSeff(md.Seff as number) // SPEC §2.6 — ∫|φ| = 0.634·Seff
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
  }
  return { modes, phis, hidden };
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
        clause: 'EN 1990 A2.4.3.2(2); CD 353 4.4',
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
      clause: 'CD 353 4.4–4.5; NA+A1:2020',
      message: `${at} is a ${mode.direction} mode below ${LATERAL_TRIGGER_HZ} Hz, so it needs verification. The CD 353 Appendix A lateral acceleration check is not calculated in this version.`,
    });
  }
  if (mode.f < DAMPER_PROVISION_HZ) {
    flags.push({
      level: 'warning',
      code: 'damper-provision',
      modeId: mode.id,
      clause: 'NA+A1:2020, as summarised in SCI AD 428A [VERIFY]',
      message: `${at} is a ${mode.direction} mode below ${DAMPER_PROVISION_HZ} Hz: consider making provision for dampers. This threshold and wording are not yet verified.`,
    });
  }
  if (mode.direction === 'lateral') {
    flags.push({
      level: 'info',
      code: 'lateral-lock-in-unavailable',
      modeId: mode.id,
      clause: 'NA.2.44.7',
      message: `${at}: the lateral lock-in stability check is not available in this version.`,
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
  };
}

function finish(c: LoadCaseResult, aPeak: number, aLimit: number | null): void {
  c.status = 'computed';
  c.aPeak = aPeak;
  c.aLimit = aLimit;
  if (aLimit !== null) {
    c.utilisation = aPeak / aLimit;
    c.verdict = aPeak <= aLimit ? 'PASS' : 'FAIL';
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

  c.forceAmplitude = groupForceAmplitude({ F0: params.F0, k, gamma, N });
  const r = movingLoadResponse({
    f: mode.f,
    M: mode.M,
    zeta: mode.zeta,
    Famp: c.forceAmplitude,
    v: params.v,
    S: mode.S,
    phi: phiFn,
    recordHistory: true,
  });
  c.history = r.history;
  finish(c, r.peakAccel, ctx.aLimit);
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
  // NA.2.44.5 crowd load uses the walking reference load F₀ = 280 N (SPEC §6 N1). [VERIFY]
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
  finish(c, steadyStateAcceleration(load.P0, mode.zeta, mode.M), ctx.aLimit);
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
  flags: Flag[];
  lookupK: (a: Activity, f: number) => number | null;
  lookupGammaGroup: (delta: number, Seff: number) => number | null;
  lookupGammaCrowd: (delta: number) => number | null;
}

function makeContext(
  codeData: CodeData | undefined,
  aLimit: number | null,
  flags: Flag[],
): Context {
  const use = (v: LookupValue): number => {
    if (v.warning) flags.push({ level: 'warning', code: 'lookup-clamped', message: v.warning });
    return v.value;
  };
  return {
    aLimit,
    flags,
    lookupK: (a, f) => (codeData?.k ? use(codeData.k(a, f)) : null),
    lookupGammaGroup: (d, s) => (codeData?.gammaGroup ? use(codeData.gammaGroup(d, s)) : null),
    lookupGammaCrowd: (d) => (codeData?.gammaCrowd ? use(codeData.gammaCrowd(d)) : null),
  };
}

function overallStatus(cases: LoadCaseResult[], missingInputs: string[]): OverallStatus {
  const active = cases.filter((c) => c.status !== 'not-applicable');
  if (active.some((c) => c.verdict === 'FAIL')) return 'FAIL';
  if (missingInputs.length > 0 || active.length === 0) return 'INCOMPLETE';
  if (active.some((c) => c.status === 'blocked' || c.status === 'needs-input')) return 'INCOMPLETE';
  if (active.some((c) => c.status === 'awaiting-data')) return 'AWAITING';
  return active.every((c) => c.verdict === 'PASS') ? 'PASS' : 'INCOMPLETE';
}

/** Run the full check (SPEC §2.10). Never throws for bad user input: see `inputErrors`. */
export function runCheck(inputs: CheckInputs): CheckResult {
  const errors = validate(inputs);
  if (errors.length > 0) return emptyResult(errors);

  try {
    const flags: Flag[] = [];
    const missingInputs: string[] = [];

    const { modes, phis, hidden } = buildModes(inputs.bridge);
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
        flags.push({
          level: 'warning',
          code: 'override',
          clause: 'NA.2.44.2(2)',
          message: `${o.field} overridden: ${o.value} used instead of the Table NA.7 value ${o.tableValue}.`,
        });
      }
      const ctx = makeContext(inputs.codeData, comfort?.aLimit ?? null, flags);
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
          'Peak accelerations need k(f) and γ from the digitised NA figures, which are not yet in the tool. No PASS or FAIL is given for those cases.',
      });
    }

    let governing: LoadCaseResult | null = null;
    for (const c of cases) {
      if (c.utilisation === null) continue;
      if (governing === null || c.utilisation > (governing.utilisation as number)) governing = c;
    }

    return {
      inputErrors: [],
      modes,
      comfort,
      usage,
      cases,
      governing,
      status: overallStatus(cases, missingInputs),
      flags,
      missingInputs,
    };
  } catch (e) {
    if (e instanceof RangeError) return emptyResult([e.message]);
    throw e;
  }
}
