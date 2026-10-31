import { describe, expect, it } from 'vitest';
import {
  LOCK_IN_TRIGGER_HZ,
  PEDESTRIAN_MASS,
  lateralBoundaryLookup,
  lockInCheck,
  pedestrianMassPerMetre,
} from '../../src/engine/lateral';

/** Values printed by validation/reference/reference_lateral.py (numpy.interp on the raw CSV). */
const REF_BOUNDARY: [number, number][] = [
  [0.3, 1.086687],
  [0.6, 0.566563],
  [1.0, 0.339938],
  [1.3, 0.162986],
  [1.45, 0.090686],
];

describe('constants (NA.2.44.7)', () => {
  it('uses 70 kg per pedestrian and the 1.5 Hz threshold', () => {
    expect(PEDESTRIAN_MASS).toBe(70);
    expect(LOCK_IN_TRIGGER_HZ).toBe(1.5);
  });

  it('m_pedestrian = ρ·b·70', () => {
    expect(pedestrianMassPerMetre(0.8, 2.5)).toBeCloseTo(140, 12);
  });
});

describe('lateralBoundaryLookup (Figure NA.11)', () => {
  it('matches the independent reference to 4 significant figures', () => {
    for (const [f, d] of REF_BOUNDARY) {
      const r = lateralBoundaryLookup(f);
      expect(r.value).not.toBeNull();
      expect(Number((r.value as number).toPrecision(4))).toBe(Number(d.toPrecision(4)));
      expect(r.warning).toBeUndefined();
    }
  });

  it('takes the upper end of the vertical part of the curve at its first frequency', () => {
    expect(lateralBoundaryLookup(0.17098445595854928).value).toBe(2);
  });

  it('cannot read the boundary below the first digitised frequency', () => {
    const r = lateralBoundaryLookup(0.1);
    expect(r.value).toBeNull();
    expect(r.warning).toMatch(/outside/i);
  });

  it('clamps above the last digitised frequency, with a warning', () => {
    const r = lateralBoundaryLookup(2.0);
    expect(r.value).toBeCloseTo(0.003095975232197734, 12);
    expect(r.warning).toMatch(/outside/i);
  });
});

describe('lockInCheck (NA.2.44.7; SPEC §2.8)', () => {
  // Hand check H1: m = 1000 kg/m, ξ = 0.5 %, class C ρ = 0.8, b = 2.5 m.
  // m_ped = 0.8 × 2.5 × 70 = 140 kg/m; D = 1000 × 0.005 / 140 = 0.03571.
  const h1 = { f: 1.0, zeta: 0.005, mBridge: 1000, rho: 0.8, b: 2.5 };

  it('hand-checked D case H1', () => {
    const r = lockInCheck(h1);
    expect(r.mPedestrian).toBeCloseTo(140, 12);
    expect(Number((r.D as number).toPrecision(4))).toBe(0.03571);
    expect(Number((r.DBoundary as number).toPrecision(4))).toBe(0.3399);
    expect(r.status).toBe('UNSTABLE');
  });

  it('uses ζ as a decimal ratio, so high damping and mass give STABLE', () => {
    // D = 5000 × 0.05 / 140 = 1.786, above the 1.0 Hz boundary of 0.34.
    const r = lockInCheck({ ...h1, mBridge: 5000, zeta: 0.05 });
    expect(r.D).toBeCloseTo((5000 * 0.05) / 140, 12);
    expect(r.status).toBe('STABLE');
  });

  it('uses the ρ it is given (class D Table NA.7 value 1.5, not capped)', () => {
    const r = lockInCheck({ ...h1, rho: 1.5 });
    expect(r.mPedestrian).toBeCloseTo(262.5, 12);
    expect(Number((r.D as number).toPrecision(4))).toBe(0.01905);
  });

  it('a point exactly on the boundary is not called stable', () => {
    const r = lockInCheck({
      ...h1,
      boundary: () => ({ value: (1000 * 0.005) / 140 }),
    });
    expect(r.status).toBe('UNSTABLE');
  });

  it('accepts an injected boundary', () => {
    expect(lockInCheck({ ...h1, boundary: () => ({ value: 0.01 }) }).status).toBe('STABLE');
  });

  it('ρ = 0 (class A) gives NO-CROWD with an explanation, not a division by zero', () => {
    const r = lockInCheck({ ...h1, rho: 0 });
    expect(r.status).toBe('NO-CROWD');
    expect(r.mPedestrian).toBe(0);
    expect(r.D).toBeNull();
    expect(r.message).toMatch(/crowd density.*0/i);
    expect(r.message).toMatch(/not defined/i);
  });

  it('cannot assess a mode below the start of the digitised boundary', () => {
    const r = lockInCheck({ ...h1, f: 0.1 });
    expect(r.status).toBe('OUTSIDE-FIGURE');
    expect(r.D).not.toBeNull();
    expect(r.DBoundary).toBeNull();
  });

  it('cautions outside the 0.5–1.1 Hz range covered by test data', () => {
    expect(lockInCheck({ ...h1, f: 0.5 }).caution).toBeNull();
    expect(lockInCheck({ ...h1, f: 1.1 }).caution).toBeNull();
    expect(lockInCheck({ ...h1, f: 0.45 }).caution).toMatch(/0\.5.*1\.1 Hz/);
    expect(lockInCheck({ ...h1, f: 1.3 }).caution).toMatch(/0\.5.*1\.1 Hz/);
  });

  it('rejects non-physical inputs', () => {
    expect(() => lockInCheck({ ...h1, mBridge: 0 })).toThrow(RangeError);
    expect(() => lockInCheck({ ...h1, b: -1 })).toThrow(RangeError);
    expect(() => lockInCheck({ ...h1, zeta: 0 })).toThrow(RangeError);
    expect(() => lockInCheck({ ...h1, rho: -0.1 })).toThrow(RangeError);
  });
});
