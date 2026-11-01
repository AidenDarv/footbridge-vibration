// Damping material select and the "Use X %" fix (SPEC §2.1, design/DESIGN.md §3, §6).

import { describe, expect, it } from 'vitest';
import { typicalDamping } from '../../src/engine/damping';
import {
  CUSTOM_DAMPING,
  dampingOptions,
  materialForDamping,
  percentFix,
} from '../../src/share/damping-options';

describe('damping material options (PD 6688-2 Table A.1)', () => {
  const opts = dampingOptions();

  it('lists all six materials from the data file, then Custom', () => {
    expect(opts.map((o) => o.id)).toEqual([...typicalDamping().map((m) => m.id), CUSTOM_DAMPING]);
    expect(opts).toHaveLength(7);
  });

  it('fills ξ = δ/2π at the lower δ, to 6 significant figures', () => {
    const value = (id: string) => opts.find((o) => o.id === id)?.value;
    expect(value('steel')).toBe('0.477465'); // δ 0.03
    expect(value('composite')).toBe('0.63662'); // δ 0.04
    expect(value('concrete')).toBe('0.795775'); // δ 0.05
    expect(value('timber')).toBe('0.95493'); // δ 0.06, lower end of 0.06–0.12
    expect(value('aluminium')).toBe('0.31831'); // δ 0.02
    expect(value('gfrp')).toBe('0.63662'); // δ 0.04, lower end of 0.04–0.08
  });

  it('labels show δ, and the value used for a range', () => {
    const label = (id: string) => opts.find((o) => o.id === id)?.label;
    expect(label('steel')).toBe('Steel · δ 0.03');
    expect(label('timber')).toBe('Timber · δ 0.06–0.12 (uses 0.06)');
    expect(label('gfrp')).toBe('GFRP · δ 0.04–0.08 (uses 0.04)');
    expect(label(CUSTOM_DAMPING)).toBe('Custom value');
  });

  it('matches the example bridges, which use the same rule', async () => {
    const { EXAMPLES } = await import('../../src/share/examples');
    const steel = EXAMPLES.find((e) => e.id === 'steel-box-40');
    expect(steel?.values.damping).toBe(opts.find((o) => o.id === 'steel')?.value);
  });
});

describe('materialForDamping', () => {
  it('finds the material a value came from', () => {
    expect(materialForDamping('0.477465')).toBe('steel');
    expect(materialForDamping(' 0.95493 ')).toBe('timber');
  });

  it('is Custom for anything else, including blank', () => {
    expect(materialForDamping('0.5')).toBe(CUSTOM_DAMPING);
    expect(materialForDamping('')).toBe(CUSTOM_DAMPING);
  });

  it('picks the first material when two share a value (composite and GFRP)', () => {
    expect(materialForDamping('0.63662')).toBe('composite');
  });
});

describe('percentFix: "did you mean X %?"', () => {
  it('moves the decimal point two places, without floating-point noise', () => {
    expect(percentFix('0.006')).toBe('0.6');
    expect(percentFix('0.005')).toBe('0.5');
    expect(percentFix('.0048')).toBe('0.48');
    expect(percentFix('0.0047746')).toBe('0.47746');
    expect(percentFix(' 0.007 ')).toBe('0.7');
    expect(percentFix('5e-3')).toBe('0.5');
  });

  it('offers nothing when the value is not below 0.1 %', () => {
    expect(percentFix('0.1')).toBeNull();
    expect(percentFix('0.5')).toBeNull();
    expect(percentFix('12')).toBeNull();
  });

  it('offers nothing when the result would still be outside 0.1–10 %', () => {
    expect(percentFix('0.0005')).toBeNull(); // 0.05 %
  });

  it('offers nothing for zero, negatives or text that is not a number', () => {
    expect(percentFix('0')).toBeNull();
    expect(percentFix('-0.005')).toBeNull();
    expect(percentFix('abc')).toBeNull();
    expect(percentFix('')).toBeNull();
    expect(percentFix('0x1')).toBeNull();
  });
});
