import { describe, expect, it } from 'vitest';
import { sig, signedPercent } from '../../src/share/format';

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
