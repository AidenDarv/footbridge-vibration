import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CLASSES,
  CROWD_DENSITY_CAP,
  JOGGING,
  WALKING,
  crowdLoad,
  groupForceAmplitude,
  resolveUsage,
} from '../../src/engine/loads';
import { absPhiIntegral, lambdaFactor, shapeEffectiveSpan } from '../../src/engine/modal';

describe('Table NA.7 / NA.8 data (SPEC §2.3)', () => {
  it('bridge classes', () => {
    expect(BRIDGE_CLASSES).toEqual({
      A: { groupWalking: 2, groupJogging: 0, crowdDensity: 0 },
      B: { groupWalking: 4, groupJogging: 1, crowdDensity: 0.4 },
      C: { groupWalking: 8, groupJogging: 2, crowdDensity: 0.8 },
      D: { groupWalking: 16, groupJogging: 4, crowdDensity: 1.5 },
    });
  });

  it('walking and jogging parameters', () => {
    expect(WALKING).toEqual({ F0: 280, v: 1.7 });
    expect(JOGGING).toEqual({ F0: 910, v: 3.0 });
  });

  it('crowd density cap is 1.0 persons/m²', () => {
    expect(CROWD_DENSITY_CAP).toBe(1.0);
  });
});

describe('resolveUsage (SPEC §2.3)', () => {
  it('takes table values for the class, jogging on by default', () => {
    const u = resolveUsage({ bridgeClass: 'C' });
    expect(u.nWalking).toBe(8);
    expect(u.nJogging).toBe(2);
    expect(u.includeJogging).toBe(true);
    expect(u.rhoInput).toBe(0.8);
    expect(u.rhoUsed).toBe(0.8);
    expect(u.overrides).toEqual([]);
    expect(u.warnings).toEqual([]);
  });

  it('class D crowd density is capped at 1.0 with a warning', () => {
    const u = resolveUsage({ bridgeClass: 'D' });
    expect(u.rhoInput).toBe(1.5);
    expect(u.rhoUsed).toBe(1.0);
    expect(u.warnings.length).toBe(1);
  });

  it('jogging toggle off sets jogging group to 0', () => {
    const u = resolveUsage({ bridgeClass: 'D', includeJogging: false });
    expect(u.includeJogging).toBe(false);
    expect(u.nJogging).toBe(0);
  });

  it('records overrides so the calc sheet can show them', () => {
    const u = resolveUsage({
      bridgeClass: 'B',
      overrides: { groupWalking: 6, crowdDensity: 0.5 },
    });
    expect(u.nWalking).toBe(6);
    expect(u.rhoUsed).toBe(0.5);
    expect(u.overrides).toEqual([
      { field: 'groupWalking', tableValue: 4, value: 6 },
      { field: 'crowdDensity', tableValue: 0.4, value: 0.5 },
    ]);
  });

  it('an override equal to the table value is not recorded', () => {
    expect(resolveUsage({ bridgeClass: 'B', overrides: { groupWalking: 4 } }).overrides).toEqual(
      [],
    );
  });

  it('rejects invalid overrides', () => {
    expect(() => resolveUsage({ bridgeClass: 'B', overrides: { groupWalking: -1 } })).toThrow(
      RangeError,
    );
    expect(() => resolveUsage({ bridgeClass: 'B', overrides: { groupWalking: 2.5 } })).toThrow(
      RangeError,
    );
    expect(() => resolveUsage({ bridgeClass: 'B', overrides: { crowdDensity: -0.1 } })).toThrow(
      RangeError,
    );
  });
});

describe('group force amplitude (SPEC §2.5, injected k and γ)', () => {
  it('F0 · k · √(1 + γ(N − 1))', () => {
    expect(groupForceAmplitude({ F0: 280, k: 0.5, gamma: 0.2, N: 6 })).toBeCloseTo(
      280 * 0.5 * Math.sqrt(2),
      10,
    );
  });

  it('single pedestrian gives F0 · k regardless of γ', () => {
    expect(groupForceAmplitude({ F0: 280, k: 1, gamma: 0.9, N: 1 })).toBe(280);
  });

  it('N2: N = 8, k = 1.0, γ = 0.3 gives 493.0 N', () => {
    const F = groupForceAmplitude({ F0: WALKING.F0, k: 1.0, gamma: 0.3, N: 8 });
    expect(Number(F.toPrecision(4))).toBe(493.0);
  });

  it('rejects N < 1 and out-of-range k or γ', () => {
    expect(() => groupForceAmplitude({ F0: 280, k: 1, gamma: 0.3, N: 0 })).toThrow(RangeError);
    expect(() => groupForceAmplitude({ F0: 280, k: 1, gamma: 1.1, N: 2 })).toThrow(RangeError);
    expect(() => groupForceAmplitude({ F0: 280, k: -0.1, gamma: 0.3, N: 2 })).toThrow(RangeError);
  });
});

describe('crowd load amplitude (SPEC §2.6, injected k and γ)', () => {
  // Bridge A1, b = 2.5 m, half-sine mode, as in SPEC §6 N1.
  const S = 30;
  const b = 2.5;
  const Seff = shapeEffectiveSpan('half-sine', S);
  const base = {
    F0: WALKING.F0,
    k: 1.0,
    gamma: 0.2,
    rho: 0.8,
    S,
    b,
    lambda_: lambdaFactor(Seff, S),
    absPhiIntegral: absPhiIntegral('half-sine', S),
  };

  it('N1: N = 60, W0 = 29.18 N/m², P0 = 1393.0 N (within 0.5 %)', () => {
    const r = crowdLoad(base);
    expect(r.N).toBeCloseTo(60, 12);
    expect(r.A).toBe(75);
    expect(Math.abs(r.W0 / 29.18 - 1)).toBeLessThan(0.005);
    expect(Math.abs(r.P0 / 1393.0 - 1)).toBeLessThan(0.005);
  });

  it('caps ρ at 1.0 inside the load', () => {
    const r = crowdLoad({ ...base, rho: 1.5 });
    expect(r.rhoUsed).toBe(1.0);
    expect(r.N).toBeCloseTo(75, 12);
    expect(r.warnings.length).toBe(1);
  });

  it('zero crowd density gives zero load', () => {
    const r = crowdLoad({ ...base, rho: 0 });
    expect(r.W0).toBe(0);
    expect(r.P0).toBe(0);
  });
});
