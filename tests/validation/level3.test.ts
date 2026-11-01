// SPEC.md §6 Level 3 — published real bridges, run end to end through runCheck.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { runCheck } from '../../src/engine/check';
import { level3Inputs, validationGroups } from '../../src/validation/rows';

const r5 = cases.level3.cases.find((c) => c.id === 'R5') as
  | {
      kind: string;
      caveat: string;
      observed: string;
      inputs: { M: number; mBridgeMin: number; S: number };
      expected: { D: number; status: string };
    }
  | undefined;

describe('Level 3: R5 London Millennium Bridge, central span (demonstration)', () => {
  it('is in cases.json with its source, observation and caveat', () => {
    expect(r5).toBeDefined();
    expect(r5?.kind).toBe('demonstration');
    expect(r5?.caveat).toMatch(/not independent validation/);
    expect(r5?.observed).toMatch(/June 2000/);
  });

  it('the modal mass is m·L/2 for the lowest deck mass and span given', () => {
    const i = r5!.inputs;
    expect(i.M).toBe((i.mBridgeMin * i.S) / 2);
  });

  it('D = 0.0319 within 0.5 %, and the lateral mode is UNSTABLE, so the bridge FAILS', () => {
    const r = runCheck(level3Inputs('R5'));
    expect(r.inputErrors).toEqual([]);
    expect(r.lateral).toHaveLength(1);
    const l = r.lateral[0]!;
    expect(Math.abs((l.D as number) - r5!.expected.D) / r5!.expected.D).toBeLessThanOrEqual(0.005);
    expect(l.status).toBe(r5!.expected.status);
    // m_pedestrian = ρ·b·70 with the uncapped class D density ρ = 1.5 (SPEC §2.8).
    expect(l.rho).toBe(1.5);
    expect(l.mPedestrian).toBeCloseTo(420, 10);
    expect(l.caution).toBeNull(); // 0.517 Hz is inside the 0.5–1.1 Hz test-data range
    expect(r.status).toBe('FAIL');
  });
});

describe('Level 3: R1 Podgorica footbridge (report only)', () => {
  const r1 = cases.level3.cases.find((c) => c.id === 'R1')!;
  const report = validationGroups()
    .find((g) => g.id === 'level3')!
    .reports.find((x) => x.id === 'R1')!;

  it('walking-group predictions for classes B, C, D match the independent reference within 0.5 %', () => {
    const ref = r1.referencePredictions!.walkingGroupPeakA as Record<string, number>;
    expect(report.rows.map((x) => x.bridgeClass)).toEqual(['B', 'C', 'D']);
    expect(report.rows.map((x) => x.N)).toEqual([4, 8, 16]); // Table NA.7
    for (const row of report.rows) {
      const expected = ref[row.bridgeClass] as number;
      expect(Math.abs(row.aPeak - expected) / expected).toBeLessThanOrEqual(0.005);
    }
  });

  it('compares with the measured ranges, computed, not asserted', () => {
    const by = (c: string) => report.rows.find((x) => x.bridgeClass === c)!;
    expect(by('C').vsMaxInstantaneous).toBe('within');
    expect(by('B').vsMaxInstantaneous).toBe('within');
    expect(by('D').vsMaxInstantaneous).toBe('above');
    for (const row of report.rows) expect(row.vsMeanPeak).toBe('above');
    expect(report.summary).toMatch(
      /Class C .* is within the measured range of maximum instantaneous/,
    );
  });

  it('is a report: not counted as a check, and explains the width and crowd limits', () => {
    const level3 = validationGroups().find((g) => g.id === 'level3')!;
    expect(level3.rows.some((x) => x.id === 'R1')).toBe(false);
    const notes = report.notes.join(' ');
    expect(notes).toMatch(/width is not published/);
    expect(notes).toMatch(/0\.08 persons\/m²/);
    expect(notes).toMatch(/15–26 pedestrians/);
  });
});
