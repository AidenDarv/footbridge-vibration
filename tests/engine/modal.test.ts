import { describe, expect, it } from 'vitest';
import {
  SEFF_DIVISOR,
  absPhiIntegral,
  beamFrequency,
  beamModalMass,
  beamModes,
  effectiveSpan,
  lambdaFactor,
  shapeEffectiveSpan,
} from '../../src/engine/modal';

describe('beam modal properties (SPEC §2.1)', () => {
  // Bridge A1 with EI back-calculated exactly for f1 = 2 Hz, as in validation/reference.
  const L = 30;
  const m = 1000;
  const EI = m * ((2 * L ** 2 * 2) / Math.PI) ** 2;

  it('fn scales with n²', () => {
    expect(beamFrequency(1, L, EI, m)).toBeCloseTo(2, 12);
    expect(beamFrequency(2, L, EI, m)).toBeCloseTo(8, 12);
    expect(beamFrequency(3, L, EI, m)).toBeCloseTo(18, 12);
  });

  it('modal mass is mL/2 for a unit-max sine mode', () => {
    expect(beamModalMass(L, m)).toBe(15000);
  });

  it('beamModes returns n = 1..3 with frequency and modal mass', () => {
    const modes = beamModes({ L, EI, m });
    expect(modes.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(modes[0]?.f).toBeCloseTo(2, 12);
    expect(modes.every((x) => x.M === 15000)).toBe(true);
  });

  it('rejects non-positive inputs', () => {
    expect(() => beamFrequency(1, 0, EI, m)).toThrow(RangeError);
    expect(() => beamFrequency(1, L, -1, m)).toThrow(RangeError);
    expect(() => beamFrequency(0, L, EI, m)).toThrow(RangeError);
    expect(() => beamModalMass(L, 0)).toThrow(RangeError);
  });
});

describe('effective span and lambda (SPEC §2.2)', () => {
  it('uses the 0.634 divisor from NA.2.44.4', () => {
    expect(SEFF_DIVISOR).toBe(0.634);
  });

  it('∫|φ| is 2S/π for half-sine and full-sine shapes', () => {
    expect(absPhiIntegral('half-sine', 30)).toBeCloseTo(60 / Math.PI, 12);
    expect(absPhiIntegral('full-sine', 30)).toBeCloseTo(60 / Math.PI, 12);
  });

  it('Seff = area / (0.634 · max|φ|)', () => {
    expect(effectiveSpan(19.0, 1)).toBeCloseTo(19.0 / 0.634, 12);
    // Scaling φ must not change Seff.
    expect(effectiveSpan(38.0, 2)).toBeCloseTo(19.0 / 0.634, 12);
  });

  it('half-sine Seff is about 1.004 L', () => {
    expect(shapeEffectiveSpan('half-sine', 30) / 30).toBeCloseTo(1.004, 3);
  });

  it('lambda = 0.634 · Seff / S', () => {
    expect(lambdaFactor(30, 30)).toBeCloseTo(0.634, 12);
    expect(lambdaFactor(shapeEffectiveSpan('half-sine', 30), 30)).toBeCloseTo(2 / Math.PI, 12);
  });

  it('rejects non-positive inputs', () => {
    expect(() => effectiveSpan(0, 1)).toThrow(RangeError);
    expect(() => effectiveSpan(1, 0)).toThrow(RangeError);
    expect(() => lambdaFactor(30, 0)).toThrow(RangeError);
  });
});
