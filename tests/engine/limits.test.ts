import { describe, expect, it } from 'vitest';
import {
  A_LIMIT_MAX,
  A_LIMIT_MIN,
  K1,
  K2,
  K3,
  comfortLimit,
  k3FromHeight,
} from '../../src/engine/limits';

describe('k factor tables (SPEC §2.7, NA.2.44.6)', () => {
  it('k1 site usage', () => {
    expect(K1).toEqual({
      hospital: 0.6,
      school: 0.8,
      stadia: 0.8,
      urban: 1.0,
      suburban: 1.3,
      rural: 1.6,
    });
  });

  it('k2 route redundancy', () => {
    expect(K2).toEqual({ sole: 0.7, primary: 1.0, alternative: 1.3 });
  });

  it('k3 structure height', () => {
    expect(K3).toEqual({ over8: 0.7, from4to8: 1.0, under4: 1.1 });
  });

  it('k3 from height: > 8 m, 4–8 m inclusive, < 4 m', () => {
    expect(k3FromHeight(12)).toBe(0.7);
    expect(k3FromHeight(8.01)).toBe(0.7);
    expect(k3FromHeight(8)).toBe(1.0);
    expect(k3FromHeight(4)).toBe(1.0);
    expect(k3FromHeight(3.99)).toBe(1.1);
    expect(k3FromHeight(0)).toBe(1.1);
    expect(() => k3FromHeight(-1)).toThrow(RangeError);
  });
});

describe('comfort limit a_limit (SPEC §2.7)', () => {
  it('bounds are 0.5 and 2.0 m/s²', () => {
    expect(A_LIMIT_MIN).toBe(0.5);
    expect(A_LIMIT_MAX).toBe(2.0);
  });

  it('within bounds: not clamped', () => {
    const r = comfortLimit({ k1: 1.0, k2: 1.0, k3: 1.0, k4: 1.0 });
    expect(r).toEqual({ raw: 1.0, aLimit: 1.0, clamped: null });
  });

  it('k4 defaults to 1.0', () => {
    expect(comfortLimit({ k1: 1.3, k2: 1.0, k3: 1.0 }).raw).toBeCloseTo(1.3, 12);
  });

  it('reports which bound was applied', () => {
    expect(comfortLimit({ k1: 0.6, k2: 0.7, k3: 0.7 }).clamped).toBe('lower');
    expect(comfortLimit({ k1: 1.6, k2: 1.3, k3: 1.1, k4: 1.2 }).clamped).toBe('upper');
  });

  it('k4 must be within 0.8–1.2', () => {
    expect(() => comfortLimit({ k1: 1, k2: 1, k3: 1, k4: 0.79 })).toThrow(RangeError);
    expect(() => comfortLimit({ k1: 1, k2: 1, k3: 1, k4: 1.21 })).toThrow(RangeError);
    expect(() => comfortLimit({ k1: 1, k2: 1, k3: 1, k4: 0.8 })).not.toThrow();
    expect(() => comfortLimit({ k1: 1, k2: 1, k3: 1, k4: 1.2 })).not.toThrow();
  });

  it('rejects non-positive k1–k3', () => {
    expect(() => comfortLimit({ k1: 0, k2: 1, k3: 1 })).toThrow(RangeError);
  });
});
