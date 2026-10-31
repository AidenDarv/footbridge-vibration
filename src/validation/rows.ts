// Validation page data (SPEC §6): expected vs tool vs % difference for Level 1, Level 2 and
// PD1. Pure: runs the same engine functions as tests/validation/*.test.ts on the inputs in
// validation/cases.json, so the page shows what the code computes in the browser now.
// Expected values come from cases.json. Where a case states a rule instead of a number
// (N4, N5, PD1), the reference value is computed as that rule says, and `reference` says how.

import cases from '../../validation/cases.json';
import { comfortLimit } from '../engine/limits';
import { WALKING, crowdLoad, groupForceAmplitude } from '../engine/loads';
import {
  absPhiIntegral,
  beamFrequency,
  beamModalMass,
  lambdaFactor,
  modeShapeFunction,
  shapeEffectiveSpan,
} from '../engine/modal';
import { movingLoadResponse, steadyStateAcceleration, type SolverMethod } from '../engine/solver';
import { parsePsiCsv, psiAt, type PsiKnown } from './psi';

export interface ValidationRow {
  id: string;
  check: string;
  /** Quantity compared, e.g. "f₁" or "a, dt = 1/(40f)". */
  quantity: string;
  unit: string;
  expected: number;
  tool: number;
  /** (tool − expected) / expected × 100. */
  diffPercent: number;
  pass: boolean;
  /** Where the expected value comes from. */
  reference: string;
  note?: string;
}

export interface ValidationGroup {
  id: 'level1' | 'level2' | 'pd1';
  title: string;
  tolerance: string;
  rows: ValidationRow[];
  /** Cases that could not be run, with the reason. */
  missing: string[];
}

/** CLAUDE.md — Level 1: exact to 4 significant figures. */
const sf4 = (x: number) => Number(x.toPrecision(4));
/** CLAUDE.md — Level 2: within 0.5 %. */
const LEVEL2_TOL = 0.005;
/** SPEC §6 PD1 — within 5 %, allowing for reading Ψ from a figure. */
const PD1_TOL = 0.05;

const diff = (tool: number, expected: number) => ((tool - expected) / expected) * 100;
const within = (tool: number, expected: number, tol: number) =>
  Math.abs(tool - expected) / Math.abs(expected) <= tol;

type Inputs = Record<string, unknown>;
type Case = { id: string; check: string; inputs: Inputs; expected: Inputs };

function num(rec: Inputs, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new Error(`Expected numeric "${key}"`);
  return v;
}

function nums(rec: Inputs, key: string): number[] {
  const v = rec[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
    throw new Error(`Expected numeric array "${key}"`);
  }
  return v as number[];
}

function byId(list: unknown[], id: string): Case {
  const c = (list as Case[]).find((x) => x.id === id);
  if (!c) throw new Error(`Case ${id} missing from validation/cases.json`);
  return c;
}

const FROM_CASES = 'validation/cases.json';

function level1(): ValidationGroup {
  const list = cases.level1.cases as unknown[];
  const rows: ValidationRow[] = [];
  const add = (c: Case, quantity: string, unit: string, key: string, tool: number) => {
    const expected = num(c.expected, key);
    rows.push({
      id: c.id,
      check: c.check,
      quantity,
      unit,
      expected,
      tool,
      diffPercent: diff(tool, expected),
      pass: sf4(tool) === sf4(expected),
      reference: FROM_CASES,
    });
  };

  const a1 = byId(list, 'A1');
  const L = num(a1.inputs, 'L');
  const m = num(a1.inputs, 'm');
  add(a1, 'f₁', 'Hz', 'f1', beamFrequency(1, L, num(a1.inputs, 'EI'), m));
  add(a1, 'M', 'kg', 'M', beamModalMass(L, m));

  const a2 = byId(list, 'A2');
  const L2 = num(a2.inputs, 'L');
  const Seff = shapeEffectiveSpan('half-sine', L2);
  add(a2, 'Seff', 'm', 'Seff', Seff);
  add(a2, 'λ', '–', 'lambda', lambdaFactor(Seff, L2));

  for (const id of ['A3', 'A4', 'A5']) {
    const c = byId(list, id);
    const r = comfortLimit({
      k1: num(c.inputs, 'k1'),
      k2: num(c.inputs, 'k2'),
      k3: num(c.inputs, 'k3'),
      k4: typeof c.inputs.k4 === 'number' ? c.inputs.k4 : undefined,
    });
    add(c, 'a_limit, raw', 'm/s²', 'raw', r.raw);
    add(c, 'a_limit', 'm/s²', 'aLimit', r.aLimit);
  }

  const a6 = byId(list, 'A6');
  const S = 30; // any valid span: the cap does not depend on geometry
  const crowd = crowdLoad({
    F0: WALKING.F0,
    k: 1,
    gamma: 0.2,
    rho: num(a6.inputs, 'rho'),
    S,
    b: 2.5,
    lambda_: lambdaFactor(shapeEffectiveSpan('half-sine', S), S),
    absPhiIntegral: absPhiIntegral('half-sine', S),
  });
  add(a6, 'ρ used in load', 'persons/m²', 'rhoUsed', crowd.rhoUsed);

  return {
    id: 'level1',
    title: 'Level 1: analytical and code-value checks',
    tolerance: cases.level1.tolerance,
    rows,
    missing: [],
  };
}

const { bridge } = cases.level2;
const shape = bridge.shape as 'half-sine';
const phi = modeShapeFunction(shape, bridge.L);

function peak(
  Famp: number,
  v: number,
  extra: { stepsPerPeriod?: number; method?: SolverMethod } = {},
): number {
  return movingLoadResponse({
    f: bridge.f,
    M: bridge.M,
    zeta: bridge.zeta,
    Famp,
    v,
    S: bridge.L,
    phi,
    ...extra,
  }).peakAccel;
}

const groupForce = (inputs: Inputs) =>
  groupForceAmplitude({
    F0: num(inputs, 'F0'),
    k: num(inputs, 'k'),
    gamma: num(inputs, 'gamma'),
    N: num(inputs, 'N'),
  });

function level2(): ValidationGroup {
  const list = cases.level2.cases as unknown[];
  const rows: ValidationRow[] = [];
  const row = (
    c: Case,
    quantity: string,
    unit: string,
    expected: number,
    tool: number,
    reference = FROM_CASES,
    extra: { pass?: boolean; note?: string } = {},
  ) =>
    rows.push({
      id: c.id,
      check: c.check,
      quantity,
      unit,
      expected,
      tool,
      diffPercent: diff(tool, expected),
      pass: (extra.pass ?? true) && within(tool, expected, LEVEL2_TOL),
      reference,
      ...(extra.note ? { note: extra.note } : {}),
    });

  const n1 = byId(list, 'N1');
  const load = crowdLoad({
    F0: num(n1.inputs, 'F0'),
    k: num(n1.inputs, 'k'),
    gamma: num(n1.inputs, 'gamma'),
    rho: num(n1.inputs, 'rho'),
    S: bridge.L,
    b: bridge.b,
    lambda_: lambdaFactor(shapeEffectiveSpan(shape, bridge.L), bridge.L),
    absPhiIntegral: absPhiIntegral(shape, bridge.L),
  });
  row(n1, 'N', 'persons', num(n1.expected, 'N'), load.N);
  row(n1, 'W₀', 'N/m²', num(n1.expected, 'W0'), load.W0);
  row(n1, 'P₀', 'N', num(n1.expected, 'P0'), load.P0);
  row(
    n1,
    'a',
    'm/s²',
    num(n1.expected, 'a'),
    steadyStateAcceleration(load.P0, bridge.zeta, bridge.M),
  );

  const n2 = byId(list, 'N2');
  const F2 = groupForce(n2.inputs);
  row(n2, 'Force amplitude', 'N', num(n2.expected, 'forceAmplitude'), F2);
  for (const n of nums(n2.inputs, 'dtPerPeriod')) {
    row(
      n2,
      `a, dt = 1/(${n}f)`,
      'm/s²',
      num(n2.expected, 'a'),
      peak(F2, num(n2.inputs, 'v'), { stepsPerPeriod: n }),
    );
  }

  const n3 = byId(list, 'N3');
  row(n3, 'a', 'm/s²', num(n3.expected, 'a'), peak(groupForce(n3.inputs), num(n3.inputs, 'v')));

  const n4 = byId(list, 'N4');
  const F4 = groupForce(n4.inputs);
  // Half-sine max |φ| = 1, so the steady-state generalised force at midspan is F_amp.
  const aSteady = steadyStateAcceleration(F4, bridge.zeta, bridge.M);
  const speeds = nums(n4.inputs, 'v');
  const peaks = speeds.map((v) => peak(F4, v));
  const rising = peaks.every((a, i) => i === 0 || a > (peaks[i - 1] as number));
  const below = peaks.every((a) => a < aSteady);
  const vMin = speeds[speeds.length - 1] as number;
  row(
    n4,
    `a, v = ${vMin} m/s`,
    'm/s²',
    aSteady,
    peaks[peaks.length - 1] as number,
    'Steady state F_amp/(2ξM)',
    {
      pass: rising && below,
      note: `Peaks for v = ${speeds.join(', ')} m/s: ${peaks.map((a) => a.toFixed(3)).join(', ')} m/s². ${rising ? 'They rise' : 'They do not rise'} as v falls and ${below ? 'all stay' : 'do not all stay'} below the steady state.`,
    },
  );

  const n5 = byId(list, 'N5');
  const F5 = groupForce(n5.inputs);
  const steps = num(n5.inputs, 'dtPerPeriod');
  const v5 = num(n5.inputs, 'v');
  row(
    n5,
    `a (Newmark), dt = 1/(${steps}f)`,
    'm/s²',
    peak(F5, v5, { stepsPerPeriod: steps, method: 'rk4' }),
    peak(F5, v5, { stepsPerPeriod: steps, method: 'newmark' }),
    `RK4 at dt = 1/(${steps}f)`,
  );

  return {
    id: 'level2',
    title: 'Level 2: numerical checks (injected k and γ)',
    tolerance: cases.level2.tolerance,
    rows,
    missing: [],
  };
}

const PSI_FILES = import.meta.glob('../../validation/digitising/pd_figA4_*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function pd1(): ValidationGroup {
  const known: PsiKnown = {
    delta: 2 * Math.PI * bridge.zeta, // δ = 2πξ
    S_m: bridge.L,
    f_Hz: bridge.f,
  };
  const rows: ValidationRow[] = [];
  const missing: string[] = [];
  for (const c of cases.codeCrossCheck.cases) {
    const text = PSI_FILES[c.psiFile.replace(/^validation\//, '../../validation/')];
    if (text === undefined) {
      missing.push(`${c.id}: awaiting ${c.psiFile} (PD 6688-2 Figure A.4, to be digitised).`);
      continue;
    }
    const { F0, v, N, k, K, phiMax } = c.inputs;
    // F′ = F₀·k·√(1 + γ(N − 1)); γ is irrelevant for N = 1.
    const Fprime = groupForceAmplitude({ F0, k, gamma: 0, N });
    const psi = psiAt(parsePsiCsv(text, c.psiFile), known, c.psiFile);
    // PD 6688-2 §A.4 — a = F′/M · φmax² · K · Ψ.
    const expected = (Fprime / bridge.M) * phiMax ** 2 * K * psi;
    const tool = peak(Fprime, v);
    rows.push({
      id: c.id,
      check: c.check,
      quantity: 'a',
      unit: 'm/s²',
      expected,
      tool,
      diffPercent: diff(tool, expected),
      pass: within(tool, expected, PD1_TOL),
      reference: `PD 6688-2 §A.4, Ψ = ${psi.toFixed(1)} from Figure A.4 (digitised)`,
    });
  }
  return {
    id: 'pd1',
    title: 'Code cross-check: PD 6688-2 simplified method (PD1)',
    tolerance: cases.codeCrossCheck.tolerance,
    rows,
    missing,
  };
}

/** All rows for the Validation page, computed now with the current engine. */
export function validationGroups(): ValidationGroup[] {
  return [level1(), level2(), pd1()];
}
