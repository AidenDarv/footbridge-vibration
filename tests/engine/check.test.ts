import { describe, expect, it } from 'vitest';
import { runCheck, type CheckInputs, type CodeData } from '../../src/engine/check';

// Bridge A1 (SPEC §6): L = 30 m, m = 1000 kg/m, EI for f1 = 2 Hz, ξ = 0.5 %, b = 2.5 m.
const L = 30;
const m = 1000;
const EI = m * ((2 * L ** 2 * 2) / Math.PI) ** 2;

const a1: CheckInputs = {
  bridge: { kind: 'beam', L, EI, m, dampingPercent: 0.5 },
  b: 2.5,
  height: 10,
  usage: { bridgeClass: 'C' },
  comfort: { k1: 'rural', k2: 'alternative' },
};

/** Injected test values from SPEC §6 Level 2 — not readings from the NA figures. */
const injected: CodeData = {
  k: () => ({ value: 1.0 }),
  gammaGroup: () => ({ value: 0.3 }),
  gammaCrowd: () => ({ value: 0.2 }),
};

function within(actual: number | null | undefined, expected: number, tol = 0.005): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected) / expected).toBeLessThanOrEqual(tol);
}

describe('runCheck: modal properties and limit without code data', () => {
  const r = runCheck(a1);

  it('has no input errors', () => {
    expect(r.inputErrors).toEqual([]);
  });

  it('keeps beam modes below 8 Hz and flags the rest (SPEC §2.1)', () => {
    expect(r.modes.map((x) => x.n)).toEqual([1]);
    const m1 = r.modes[0];
    expect(m1?.f).toBeCloseTo(2, 10);
    expect(m1?.M).toBe(15000);
    expect(m1?.zeta).toBeCloseTo(0.005, 15);
    expect(m1?.delta).toBeCloseTo(2 * Math.PI * 0.005, 15);
    expect(m1?.Seff).toBeCloseTo((2 * L) / Math.PI / 0.634, 10);
    expect(m1?.lambda_).toBeCloseTo(2 / Math.PI, 10);
    expect(r.flags.some((f) => f.code === 'modes-hidden')).toBe(true);
  });

  it('computes a_limit with k3 from the height (SPEC §2.7, case A3)', () => {
    expect(r.comfort?.k3).toBe(0.7);
    expect(r.comfort?.aLimit).toBeCloseTo(1.456, 10);
  });

  it('shows every vertical load case as awaiting digitised data', () => {
    expect(r.cases.map((c) => c.kind)).toEqual(['walking-group', 'jogging-group', 'crowd']);
    for (const c of r.cases) {
      expect(c.status).toBe('awaiting-data');
      expect(c.aPeak).toBeNull();
      expect(c.verdict).toBeNull();
      expect(c.missing).toContain('k(f)');
      expect(c.missing).toContain('γ');
    }
    expect(r.status).toBe('AWAITING');
    expect(r.governing).toBeNull();
  });

  it('a single-person group only needs k(f), not γ', () => {
    const one = runCheck({ ...a1, usage: { bridgeClass: 'B' } }); // jogging N = 1
    const jog = one.cases.find((c) => c.kind === 'jogging-group');
    expect(jog?.missing).toEqual(['k(f)']);
    expect(jog?.gammaNeeded).toBe(false);
  });

  it('flags the vertical frequency trigger (SPEC §2.9)', () => {
    expect(r.flags.some((f) => f.code === 'vertical-trigger')).toBe(true);
  });
});

describe('runCheck: with injected k and γ (matches Level 2)', () => {
  const r = runCheck({ ...a1, codeData: injected });

  it('walking group matches N2', () => {
    const c = r.cases.find((x) => x.kind === 'walking-group');
    expect(c?.status).toBe('computed');
    expect(c?.N).toBe(8);
    within(c?.forceAmplitude, 493.0);
    within(c?.aPeak, 1.486);
  });

  it('crowd matches N1', () => {
    const c = r.cases.find((x) => x.kind === 'crowd');
    expect(c?.status).toBe('computed');
    within(c?.N, 60);
    within(c?.W0, 29.18);
    within(c?.forceAmplitude, 1393.0);
    within(c?.aPeak, 9.287);
  });

  it('gives verdicts, utilisation and the governing case', () => {
    const crowd = r.cases.find((x) => x.kind === 'crowd');
    within(crowd?.utilisation, 9.287 / 1.456);
    expect(crowd?.verdict).toBe('FAIL');
    expect(r.governing?.kind).toBe('crowd');
    expect(r.status).toBe('FAIL');
  });

  it('PASS when every computed case is below the limit', () => {
    const small: CodeData = { ...injected, k: () => ({ value: 0.01 }) };
    const p = runCheck({ ...a1, codeData: small });
    expect(p.cases.every((c) => c.verdict === 'PASS')).toBe(true);
    expect(p.status).toBe('PASS');
  });

  it('passes lookup warnings through as flags', () => {
    const warn: CodeData = { ...injected, k: () => ({ value: 1, warning: 'k clamped' }) };
    const w = runCheck({ ...a1, codeData: warn });
    expect(w.flags.some((f) => f.message === 'k clamped')).toBe(true);
  });
});

describe('runCheck: modal mode', () => {
  it('blocks the group case for a user-Seff mode but still runs the crowd case', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          {
            f: 2,
            M: 15000,
            dampingPercent: 0.5,
            direction: 'vertical',
            shape: 'user-seff',
            Seff: 25,
          },
        ],
      },
      codeData: injected,
    });
    const walk = r.cases.find((c) => c.kind === 'walking-group');
    expect(walk?.status).toBe('blocked');
    expect(walk?.message).toMatch(/choose a mode shape/i);
    // One flag per mode, even though both the walking and jogging groups are blocked.
    expect(r.flags.filter((f) => f.code === 'mode-shape-required').length).toBe(1);
    expect(r.cases.find((c) => c.kind === 'jogging-group')?.status).toBe('blocked');
    expect(r.modes[0]?.absPhi).toBeCloseTo(0.634 * 25, 12);
    const crowd = r.cases.find((c) => c.kind === 'crowd');
    expect(crowd?.status).toBe('computed');
    // A blocked case means no overall PASS can be given.
    expect(r.status).not.toBe('PASS');
  });

  it('requires Seff for a user-Seff mode', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [{ f: 2, M: 15000, dampingPercent: 0.5, direction: 'vertical', shape: 'user-seff' }],
      },
    });
    expect(r.inputErrors.length).toBeGreaterThan(0);
    expect(r.status).toBe('INPUT-ERROR');
  });

  it('lateral and torsional modes raise flags, not vertical load cases (SPEC §2.9)', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          { f: 2.0, M: 20000, dampingPercent: 0.5, direction: 'lateral', shape: 'half-sine' },
          { f: 2.8, M: 20000, dampingPercent: 0.5, direction: 'torsional', shape: 'half-sine' },
          { f: 3.5, M: 20000, dampingPercent: 0.5, direction: 'lateral', shape: 'half-sine' },
        ],
      },
    });
    expect(r.cases).toEqual([]);
    const codes = (modeId: string) => r.flags.filter((f) => f.modeId === modeId).map((f) => f.code);
    expect(codes('mode-1')).toEqual(
      expect.arrayContaining([
        'lateral-trigger',
        'damper-provision',
        'lateral-lock-in-unavailable',
      ]),
    );
    expect(codes('mode-2')).toContain('damper-provision');
    expect(codes('mode-2')).not.toContain('lateral-trigger');
    expect(codes('mode-3')).not.toContain('damper-provision');
  });
});

describe('runCheck: partial and invalid inputs', () => {
  it('shows modes even with no usage or comfort inputs', () => {
    const r = runCheck({ bridge: a1.bridge });
    expect(r.inputErrors).toEqual([]);
    expect(r.modes.length).toBe(1);
    expect(r.comfort).toBeNull();
    expect(r.cases).toEqual([]);
    expect(r.missingInputs).toEqual(
      expect.arrayContaining(['bridge class', 'height above ground', 'k1', 'k2']),
    );
    expect(r.status).toBe('INCOMPLETE');
  });

  it('crowd case needs the deck width', () => {
    const { b: _b, ...noWidth } = a1;
    void _b;
    const r = runCheck(noWidth);
    expect(r.cases.find((c) => c.kind === 'crowd')?.status).toBe('needs-input');
  });

  it('jogging can be excluded (NA.2.44.2(3))', () => {
    const r = runCheck({ ...a1, usage: { bridgeClass: 'C', includeJogging: false } });
    expect(r.cases.find((c) => c.kind === 'jogging-group')?.status).toBe('not-applicable');
  });

  it('class A has no jogging group and no crowd (Table NA.7)', () => {
    const r = runCheck({ ...a1, usage: { bridgeClass: 'A' } });
    expect(r.cases.find((c) => c.kind === 'jogging-group')?.status).toBe('not-applicable');
    expect(r.cases.find((c) => c.kind === 'crowd')?.status).toBe('not-applicable');
  });

  it('reports bad numbers as input errors instead of throwing', () => {
    const r = runCheck({ ...a1, bridge: { kind: 'beam', L: -5, EI, m, dampingPercent: 0.5 } });
    expect(r.inputErrors.length).toBeGreaterThan(0);
    expect(r.status).toBe('INPUT-ERROR');
    expect(r.modes).toEqual([]);
  });

  it('flags overrides and the crowd density cap', () => {
    const r = runCheck({ ...a1, usage: { bridgeClass: 'D', overrides: { groupWalking: 10 } } });
    expect(r.flags.some((f) => f.code === 'override')).toBe(true);
    expect(r.flags.some((f) => f.code === 'crowd-cap')).toBe(true);
  });
});

describe('runCheck: review fixes', () => {
  const vertical = {
    f: 2,
    M: 15000,
    dampingPercent: 0.5,
    direction: 'vertical',
    shape: 'half-sine',
  } as const;
  const lowK: CodeData = { ...injected, k: () => ({ value: 0.01 }) };

  it('no overall PASS while a lateral or torsional mode below 2.5 Hz is unchecked', () => {
    for (const direction of ['lateral', 'torsional'] as const) {
      const r = runCheck({
        ...a1,
        bridge: {
          kind: 'modal',
          L,
          modes: [
            vertical,
            { f: 1.0, M: 20000, dampingPercent: 0.8, direction, shape: 'half-sine' },
          ],
        },
        codeData: lowK,
      });
      expect(r.cases.every((c) => c.verdict === 'PASS')).toBe(true);
      expect(r.status).toBe('INCOMPLETE');
      expect(r.statusNotes.join(' ')).toMatch(/not checked/i);
    }
  });

  it('a lateral mode at or above 2.5 Hz does not hold back a PASS', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          vertical,
          { f: 2.8, M: 20000, dampingPercent: 0.8, direction: 'lateral', shape: 'half-sine' },
        ],
      },
      codeData: lowK,
    });
    expect(r.status).toBe('PASS');
    expect(r.statusNotes).toEqual([]);
  });

  it('a FAIL still shows as FAIL with an unchecked lateral mode', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          vertical,
          { f: 1.0, M: 20000, dampingPercent: 0.8, direction: 'lateral', shape: 'half-sine' },
        ],
      },
      codeData: injected,
    });
    expect(r.status).toBe('FAIL');
  });

  it('marks unverified frequency triggers and the crowd case [VERIFY] (SPEC §9)', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          vertical,
          { f: 1.0, M: 20000, dampingPercent: 0.8, direction: 'lateral', shape: 'half-sine' },
        ],
      },
    });
    for (const code of ['vertical-trigger', 'lateral-trigger', 'damper-provision']) {
      expect(r.flags.find((f) => f.code === code)?.clause).toContain('[VERIFY]');
    }
    const crowd = r.cases.find((c) => c.kind === 'crowd');
    expect(crowd?.verify).toMatch(/not yet verified/i);
    expect(r.cases.find((c) => c.kind === 'walking-group')?.verify).toBeNull();
  });

  it('rejects a user Seff larger than S/0.634 (max |φ| = 1, so ∫|φ| ≤ S)', () => {
    const modal = (Seff: number) =>
      runCheck({
        ...a1,
        bridge: { kind: 'modal', L, modes: [{ ...vertical, shape: 'user-seff', Seff }] },
      });
    expect(modal(200).inputErrors.join(' ')).toMatch(/Seff/);
    expect(modal(L / 0.634).inputErrors).toEqual([]);
  });

  it('rejects damping of 100 % or more', () => {
    const beam = (dampingPercent: number) =>
      runCheck({ ...a1, bridge: { kind: 'beam', L, EI, m, dampingPercent } });
    expect(beam(100).status).toBe('INPUT-ERROR');
    expect(beam(150).status).toBe('INPUT-ERROR');
    expect(beam(99).inputErrors).toEqual([]);
    const r = runCheck({
      ...a1,
      bridge: { kind: 'modal', L, modes: [{ ...vertical, dampingPercent: 120 }] },
    });
    expect(r.status).toBe('INPUT-ERROR');
  });
});
