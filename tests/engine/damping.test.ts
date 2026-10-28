import { describe, expect, it } from 'vitest';
import { DAMPING_SOURCE, typicalDamping } from '../../src/engine/damping';

describe('typical damping suggestions (PD 6688-2 Table A.1)', () => {
  const rows = typicalDamping();

  it('lists the six materials with the PD 6688-2 log decrements', () => {
    expect(rows.map((r) => [r.id, r.deltaMin, r.deltaMax])).toEqual([
      ['steel', 0.03, 0.03],
      ['composite', 0.04, 0.04],
      ['concrete', 0.05, 0.05],
      ['timber', 0.06, 0.12],
      ['aluminium', 0.02, 0.02],
      ['gfrp', 0.04, 0.08],
    ]);
  });

  it('derives the damping ratio as ξ = δ/2π, in % for the input field', () => {
    const steel = rows.find((r) => r.id === 'steel');
    expect(steel?.zetaPercentMin).toBeCloseTo((0.03 / (2 * Math.PI)) * 100, 12);
    const timber = rows.find((r) => r.id === 'timber');
    expect(timber?.zetaPercentMin).toBeCloseTo((0.06 / (2 * Math.PI)) * 100, 12);
    expect(timber?.zetaPercentMax).toBeCloseTo((0.12 / (2 * Math.PI)) * 100, 12);
  });

  it('carries its citation', () => {
    expect(DAMPING_SOURCE).toMatch(/PD 6688-2:2011.*Table A\.1/);
  });
});
