// SPEC.md §6 Level 3 — published real bridges, run end to end through runCheck.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { runCheck } from '../../src/engine/check';
import { level3Inputs } from '../../src/validation/rows';

const r5 = cases.level3.cases.find((c) => c.id === 'R5');

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
