import { describe, expect, it } from 'vitest';
import {
  accelText,
  fixedDown,
  fixedUp,
  limitText,
  sig,
  signedPercent,
  utilText,
} from '../../src/share/format';

describe('sig', () => {
  it('rounds to n significant figures', () => {
    expect(sig(0.844179, 4)).toBe('0.8442');
    expect(sig(29.9811, 4)).toBe('29.98');
    expect(sig(1.8446988, 5)).toBe('1.8447');
    expect(sig(0, 4)).toBe('0');
  });

  it('groups thousands like the rest of the tool', () => {
    expect(sig(15000, 5)).toBe('15\u2009000');
  });
});

describe('signedPercent', () => {
  it('shows the sign and a true minus', () => {
    expect(signedPercent(0.4935)).toBe('+0.49 %');
    expect(signedPercent(-0.1403)).toBe('−0.14 %');
  });

  it('shows zero without a sign', () => {
    expect(signedPercent(0.0004)).toBe('0.00 %');
    expect(signedPercent(-0.0004)).toBe('0.00 %');
  });
});

describe('rounding that never hides a FAIL (pre-release review)', () => {
  it('rounds accelerations and utilisation up, and the limit down', () => {
    expect(fixedUp(1.4564, 3)).toBe('1.457');
    expect(fixedUp(1.456, 3)).toBe('1.456');
    expect(fixedDown(1.6744, 3)).toBe('1.674');
    expect(accelText(1.4564)).toBe('1.457');
    expect(limitText(1.4564)).toBe('1.456');
    expect(utilText(1.004)).toBe('1.01');
    expect(utilText(1)).toBe('1.00');
    expect(utilText(0.5)).toBe('0.50');
  });

  it('exact values are not moved by floating-point noise', () => {
    const a3 = 1.6 * 1.3 * 0.7; // 1.456 in exact arithmetic (case A3)
    expect(limitText(a3)).toBe('1.456');
    expect(accelText(a3)).toBe('1.456');
    expect(utilText(0.1 + 0.2 + 0.7)).toBe('1.00');
  });

  it('keeps the missing-value dash', () => {
    expect(accelText(null)).toBe('–');
    expect(limitText(undefined)).toBe('–');
    expect(utilText(Number.NaN)).toBe('–');
  });

  it('a FAIL always shows above the limit and above 1.00', () => {
    // Deterministic sweep of a_limit and small exceedances, including near rounding steps.
    for (let i = 0; i <= 1500; i++) {
      const aLimit = 0.5 + i / 1000 + (i % 7) * 1.3e-5;
      for (const over of [1e-8, 1e-6, 4e-4, 5e-4, 6e-4, 1e-3, 0.01]) {
        const aPeak = aLimit + over;
        expect(Number(accelText(aPeak))).toBeGreaterThan(Number(limitText(aLimit)));
        expect(Number(utilText(aPeak / aLimit))).toBeGreaterThan(1);
      }
    }
  });
});
