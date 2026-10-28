import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STEPS_PER_PERIOD,
  MIN_STEPS_PER_PERIOD,
  movingLoadResponse,
  steadyStateAcceleration,
  type MovingLoadInput,
} from '../../src/engine/solver';
import {
  ModeShapeRequiredError,
  absPhiIntegral,
  absPhiIntegralFromSeff,
  modeShapeFunction,
  shapeEffectiveSpan,
} from '../../src/engine/modal';

// Bridge A1 (SPEC §6): f = 2 Hz, M = 15 000 kg, ξ = 0.5 %.
const S = 30;
const base: MovingLoadInput = {
  f: 2,
  M: 15000,
  zeta: 0.005,
  Famp: 280,
  v: 1.7,
  S,
  phi: modeShapeFunction('half-sine', S),
};

describe('mode shape functions (SPEC §2.1, §2.5)', () => {
  it('half-sine is sin(πx/S) with max 1 at midspan', () => {
    const phi = modeShapeFunction('half-sine', S);
    expect(phi(0)).toBe(0);
    expect(phi(S / 2)).toBeCloseTo(1, 15);
    expect(phi(S)).toBeCloseTo(0, 12);
  });

  it('full-sine is sin(2πx/S) with max |φ| = 1 at quarter points', () => {
    const phi = modeShapeFunction('full-sine', S);
    expect(phi(S / 4)).toBeCloseTo(1, 15);
    expect(phi(S / 2)).toBeCloseTo(0, 12);
    expect(phi((3 * S) / 4)).toBeCloseTo(-1, 15);
  });

  it('is zero off the span', () => {
    const phi = modeShapeFunction('half-sine', S);
    expect(phi(-1)).toBe(0);
    expect(phi(S + 1)).toBe(0);
  });

  it('user Seff has no φ(x): the group case is blocked with a clear message', () => {
    expect(() => modeShapeFunction('user-seff', S)).toThrow(ModeShapeRequiredError);
    expect(() => modeShapeFunction('user-seff', S)).toThrow(/choose a mode shape/i);
  });

  it('user Seff still gives ∫|φ| = 0.634·Seff for the crowd case (SPEC §2.6)', () => {
    expect(absPhiIntegralFromSeff(25)).toBeCloseTo(0.634 * 25, 12);
    // Round trip with a half-sine: Seff from ∫|φ| and back.
    const Seff = shapeEffectiveSpan('half-sine', S);
    expect(absPhiIntegralFromSeff(Seff)).toBeCloseTo(absPhiIntegral('half-sine', S), 12);
  });
});

describe('steady-state resonant acceleration (SPEC §2.6)', () => {
  it('is P0 / (2ξM)', () => {
    expect(steadyStateAcceleration(1500, 0.005, 15000)).toBeCloseTo(10, 12);
  });

  it('rejects non-positive damping or mass', () => {
    expect(() => steadyStateAcceleration(1, 0, 15000)).toThrow(RangeError);
    expect(() => steadyStateAcceleration(1, 0.005, 0)).toThrow(RangeError);
    expect(() => steadyStateAcceleration(-1, 0.005, 15000)).toThrow(RangeError);
  });
});

describe('moving-load solver (SPEC §2.5)', () => {
  it('defaults to RK4 with dt = 1/(200f)', () => {
    const r = movingLoadResponse(base);
    expect(DEFAULT_STEPS_PER_PERIOD).toBe(200);
    expect(r.method).toBe('rk4');
    expect(r.dt).toBeCloseTo(1 / (200 * base.f), 15);
  });

  it('zero force gives zero response', () => {
    for (const method of ['rk4', 'newmark'] as const) {
      expect(movingLoadResponse({ ...base, Famp: 0, method }).peakAccel).toBe(0);
    }
  });

  it('response is linear in the force amplitude', () => {
    const a1 = movingLoadResponse(base).peakAccel;
    const a2 = movingLoadResponse({ ...base, Famp: 2 * base.Famp }).peakAccel;
    expect(a2 / a1).toBeCloseTo(2, 10);
  });

  it('runs exactly over the crossing time S/v', () => {
    const r = movingLoadResponse({ ...base, recordHistory: true });
    const t = r.history?.t ?? [];
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeCloseTo(S / base.v, 12);
    expect(r.history?.a.length).toBe(t.length);
    expect(r.tPeak).toBeGreaterThan(0);
    expect(r.tPeak).toBeLessThanOrEqual(S / base.v + 1e-12);
  });

  it('peak equals the largest |a| in the recorded history', () => {
    const r = movingLoadResponse({ ...base, recordHistory: true });
    const maxAbs = Math.max(...(r.history?.a ?? []).map(Math.abs));
    expect(r.peakAccel).toBe(maxAbs);
  });

  it('does not record history unless asked', () => {
    expect(movingLoadResponse(base).history).toBeUndefined();
  });

  it(`rejects dt > 1/(${MIN_STEPS_PER_PERIOD}f)`, () => {
    expect(() => movingLoadResponse({ ...base, stepsPerPeriod: MIN_STEPS_PER_PERIOD - 1 })).toThrow(
      RangeError,
    );
    expect(() =>
      movingLoadResponse({ ...base, stepsPerPeriod: MIN_STEPS_PER_PERIOD }),
    ).not.toThrow();
  });

  it('rejects invalid inputs', () => {
    expect(() => movingLoadResponse({ ...base, f: 0 })).toThrow(RangeError);
    expect(() => movingLoadResponse({ ...base, M: -1 })).toThrow(RangeError);
    expect(() => movingLoadResponse({ ...base, zeta: -0.01 })).toThrow(RangeError);
    expect(() => movingLoadResponse({ ...base, v: 0 })).toThrow(RangeError);
    expect(() => movingLoadResponse({ ...base, S: 0 })).toThrow(RangeError);
    expect(() => movingLoadResponse({ ...base, Famp: Number.NaN })).toThrow(RangeError);
  });
});
