// SPEC.md §6 Level 2 — numerical checks with injected k and γ, within 0.5 %.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { runCheck, type CheckInputs, type CodeData } from '../../src/engine/check';
import { WALKING, crowdLoad, groupForceAmplitude } from '../../src/engine/loads';
import {
  absPhiIntegral,
  lambdaFactor,
  modeShapeFunction,
  shapeEffectiveSpan,
} from '../../src/engine/modal';
import { movingLoadResponse, steadyStateAcceleration } from '../../src/engine/solver';

type Value = number | string | number[];
type Level2Case = {
  id: string;
  inputs: Record<string, Value>;
  expected: Record<string, Value>;
};

/** CLAUDE.md — Level 2 tolerance. */
const TOL = 0.005;

const { bridge } = cases.level2;
const byId = new Map<string, Level2Case>(
  (cases.level2.cases as unknown as Level2Case[]).map((c) => [c.id, c]),
);

function get(id: string): Level2Case {
  const c = byId.get(id);
  if (!c) throw new Error(`Case ${id} missing from validation/cases.json`);
  return c;
}

function num(rec: Record<string, Value>, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new Error(`Expected numeric "${key}"`);
  return v;
}

function nums(rec: Record<string, Value>, key: string): number[] {
  const v = rec[key];
  if (!Array.isArray(v)) throw new Error(`Expected numeric array "${key}"`);
  return v;
}

function expectWithin(actual: number, expected: number, tol = TOL): void {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(tol);
}

const S = bridge.L;
const shape = bridge.shape as 'half-sine';
const phi = modeShapeFunction(shape, S);

function groupForce(inputs: Record<string, Value>): number {
  return groupForceAmplitude({
    F0: num(inputs, 'F0'),
    k: num(inputs, 'k'),
    gamma: num(inputs, 'gamma'),
    N: num(inputs, 'N'),
  });
}

function peak(
  Famp: number,
  v: number,
  extra: { stepsPerPeriod?: number; method?: 'rk4' | 'newmark' } = {},
) {
  return movingLoadResponse({
    f: bridge.f,
    M: bridge.M,
    zeta: bridge.zeta,
    Famp,
    v,
    S,
    phi,
    ...extra,
  }).peakAccel;
}

/** N6–N8 run end to end through runCheck with k and γ injected from the case. */
function endToEnd(id: 'N6' | 'N7' | 'N8') {
  const c = get(id);
  const i = c.inputs;
  const codeData: CodeData = {
    k: () => ({ value: num(i, 'k') }),
    gammaGroup: () => ({ value: num(i, 'gamma') }),
    gammaCrowd: () => ({ value: num(i, 'gamma') }),
  };
  if (num(i, 'F0') !== WALKING.F0) throw new Error(`${id}: F0 must be the walking value`);
  const usage = { bridgeClass: 'C' as const, includeJogging: false };
  let inputs: CheckInputs;
  if (id === 'N7') {
    inputs = {
      bridge: {
        kind: 'beam',
        L: num(i, 'L'),
        EI: num(i, 'EI'),
        m: num(i, 'm'),
        dampingPercent: num(i, 'zeta') * 100,
      },
      usage: { ...usage, overrides: { groupWalking: num(i, 'N') } },
      codeData,
    };
  } else {
    const userSeff = id === 'N8';
    inputs = {
      bridge: {
        kind: 'modal',
        L: num(i, 'S'),
        modes: [
          {
            f: num(i, 'f'),
            M: num(i, 'M'),
            dampingPercent: num(i, 'zeta') * 100,
            direction: 'vertical',
            shape: userSeff ? 'user-seff' : 'full-sine',
            ...(userSeff ? { Seff: num(i, 'Seff') } : {}),
          },
        ],
      },
      ...(userSeff ? { b: num(i, 'b') } : {}),
      usage: userSeff
        ? { ...usage, overrides: { crowdDensity: num(i, 'rho') } }
        : { ...usage, overrides: { groupWalking: num(i, 'N') } },
      codeData,
    };
  }
  const r = runCheck(inputs);
  const modeId = id === 'N7' ? `mode-${num(i, 'mode')}` : 'mode-1';
  const kind = id === 'N8' ? 'crowd' : 'walking-group';
  const result = r.cases.find((x) => x.modeId === modeId && x.kind === kind);
  const mode = r.modes.find((x) => x.id === modeId);
  if (!result || !mode || result.aPeak === null) throw new Error(`${id}: case did not run`);
  return { c, mode, result };
}

describe('Level 2 validation (SPEC §6)', () => {
  it('N1: crowd steady state', () => {
    const { inputs, expected } = get('N1');
    const Seff = shapeEffectiveSpan(shape, S);
    const load = crowdLoad({
      F0: num(inputs, 'F0'),
      k: num(inputs, 'k'),
      gamma: num(inputs, 'gamma'),
      rho: num(inputs, 'rho'),
      S,
      b: bridge.b,
      lambda_: lambdaFactor(Seff, S),
      absPhiIntegral: absPhiIntegral(shape, S),
    });
    expectWithin(load.N, num(expected, 'N'));
    expectWithin(load.W0, num(expected, 'W0'));
    expectWithin(load.P0, num(expected, 'P0'));
    expectWithin(steadyStateAcceleration(load.P0, bridge.zeta, bridge.M), num(expected, 'a'));
  });

  it('N2: walking group, converged for dt = 1/(40f) and 1/(200f)', () => {
    const { inputs, expected } = get('N2');
    const Famp = groupForce(inputs);
    expectWithin(Famp, num(expected, 'forceAmplitude'));
    const peaks = nums(inputs, 'dtPerPeriod').map((n) =>
      peak(Famp, num(inputs, 'v'), { stepsPerPeriod: n }),
    );
    for (const a of peaks) expectWithin(a, num(expected, 'a'));
    const [coarse, fine] = peaks as [number, number];
    expectWithin(coarse, fine);
  });

  it('N3: single walker', () => {
    const { inputs, expected } = get('N3');
    expectWithin(peak(groupForce(inputs), num(inputs, 'v')), num(expected, 'a'));
  });

  it('N4: very long crossing tends to F_amp/(2ξM) from below', () => {
    const { inputs } = get('N4');
    const Famp = groupForce(inputs);
    // Half-sine max |φ| = 1, so the steady-state generalised force at midspan is F_amp.
    const aSteady = steadyStateAcceleration(Famp, bridge.zeta, bridge.M);
    const speeds = nums(inputs, 'v'); // decreasing
    const peaks = speeds.map((v) => peak(Famp, v));
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1] as number);
    }
    for (const a of peaks) expect(a).toBeLessThan(aSteady);
    expectWithin(peaks[peaks.length - 1] as number, aSteady);
  });

  it('N5: Newmark and RK4 agree at dt = 1/(200f)', () => {
    const { inputs } = get('N5');
    const Famp = groupForce(inputs);
    const n = num(inputs, 'dtPerPeriod');
    const v = num(inputs, 'v');
    const rk4 = peak(Famp, v, { stepsPerPeriod: n, method: 'rk4' });
    const newmark = peak(Famp, v, { stepsPerPeriod: n, method: 'newmark' });
    expectWithin(newmark, rk4);
  });

  it('N6: walking group on a full-sine mode', () => {
    const { c, result } = endToEnd('N6');
    expectWithin(result.forceAmplitude as number, num(c.expected, 'forceAmplitude'));
    expectWithin(result.aPeak as number, num(c.expected, 'a'));
  });

  it('N7: walking group on beam mode n = 2', () => {
    const { c, mode, result } = endToEnd('N7');
    expectWithin(mode.f, num(c.expected, 'f'));
    expectWithin(mode.M, num(c.expected, 'M'));
    expectWithin(result.forceAmplitude as number, num(c.expected, 'forceAmplitude'));
    expectWithin(result.aPeak as number, num(c.expected, 'a'));
  });

  it('N8: crowd on a user-Seff mode', () => {
    const { c, result } = endToEnd('N8');
    expectWithin(result.N as number, num(c.expected, 'N'));
    expectWithin(result.W0 as number, num(c.expected, 'W0'));
    expectWithin(result.forceAmplitude as number, num(c.expected, 'P0'));
    expectWithin(result.aPeak as number, num(c.expected, 'a'));
  });
});
