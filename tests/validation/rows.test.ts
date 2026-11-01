// Rows shown on the Validation page (SPEC §6): expected vs tool vs % difference.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { validationGroups } from '../../src/validation/rows';

const groups = validationGroups();
const rows = groups.flatMap((g) => g.rows);
const row = (id: string, quantity: string) => {
  const r = rows.find((x) => x.id === id && x.quantity === quantity);
  if (!r) throw new Error(`No row ${id} ${quantity}`);
  return r;
};

describe('Validation page rows', () => {
  it('has Level 1, Level 2, PD1 and Level 3 groups, in that order', () => {
    expect(groups.map((g) => g.id)).toEqual(['level1', 'level2', 'pd1', 'level3']);
  });

  it('covers every case in validation/cases.json', () => {
    const ids = new Set([
      ...rows.map((r) => r.id),
      ...groups.flatMap((g) => g.reports.map((x) => x.id)),
    ]);
    for (const c of [
      ...cases.level1.cases,
      ...cases.level2.cases,
      ...cases.codeCrossCheck.cases,
      ...cases.level3.cases,
    ]) {
      expect(ids.has(c.id)).toBe(true);
    }
  });

  it('every row is within its tolerance', () => {
    for (const r of rows) expect(r.pass, `${r.id} ${r.quantity}`).toBe(true);
  });

  it('takes Level 1 and 2 expected values straight from cases.json', () => {
    expect(row('A1', 'f₁').expected).toBe(2.0);
    expect(row('A4', 'a_limit, raw').expected).toBe(0.294);
    expect(row('N1', 'a').expected).toBe(9.287);
    expect(row('N2', 'a, dt = 1/(40f)').expected).toBe(1.486);
  });

  it('computes % difference as (tool − expected) / expected', () => {
    for (const r of rows) {
      expect(r.diffPercent).toBeCloseTo(((r.tool - r.expected) / r.expected) * 100, 10);
    }
  });

  it('applies the 4 significant figure rule to Level 1', () => {
    // A2: Seff = 29.981… m rounds to the expected 29.98 m.
    const seff = row('A2', 'Seff');
    expect(Number(seff.tool.toPrecision(4))).toBe(29.98);
    expect(seff.pass).toBe(true);
  });

  it('gives the PD1 headline: +0.49 % walking, −0.14 % jogging', () => {
    expect(row('PD1-walking', 'a').diffPercent.toFixed(2)).toBe('0.49');
    expect(row('PD1-jogging', 'a').diffPercent.toFixed(2)).toBe('-0.14');
  });

  it('R5 shows D against cases.json, with the status and the demonstration caveat', () => {
    const d = row('R5', 'D');
    expect(d.expected).toBe(0.0319);
    expect(d.pass).toBe(true);
    expect(d.note).toMatch(/UNSTABLE/);
    expect(d.note).toMatch(/demonstration, not independent validation/);
  });
});
