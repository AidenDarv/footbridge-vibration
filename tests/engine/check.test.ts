import { describe, expect, it } from 'vitest';
import {
  runCheck,
  type CheckInputs,
  type CodeData,
  type ModalModeInput,
} from '../../src/engine/check';
import { MAX_SPAN, MAX_VERTICAL_FREQ } from '../../src/engine/check';
import { gammaCrowdLookup, gammaGroupLookup, kLookup } from '../../src/engine/lookup';

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

/** No k(f) or γ supplied at all: the 'awaiting-data' path. */
const noCodeData: CodeData = {};

describe('runCheck: modal properties and limit without code data', () => {
  const r = runCheck({ ...a1, codeData: noCodeData });

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
    expect(m1?.Seff).toBeCloseTo((2 * L) / Math.PI / 0.637, 10);
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
    const one = runCheck({ ...a1, usage: { bridgeClass: 'B' }, codeData: noCodeData }); // jogging N = 1
    const jog = one.cases.find((c) => c.kind === 'jogging-group');
    expect(jog?.missing).toEqual(['k(f)']);
    expect(jog?.gammaNeeded).toBe(false);
  });

  it('flags the vertical frequency trigger (SPEC §2.9)', () => {
    expect(r.flags.some((f) => f.code === 'vertical-trigger')).toBe(true);
  });
});

describe('runCheck: digitised Figures NA.8 and NA.9 by default (M3)', () => {
  const r = runCheck(a1);
  const m1 = r.modes[0];

  it('computes every vertical load case, none awaiting', () => {
    expect(r.cases.map((c) => c.status)).toEqual(['computed', 'computed', 'computed']);
    expect(r.flags.some((f) => f.code === 'awaiting-code-data')).toBe(false);
    expect(r.status).not.toBe('AWAITING');
  });

  it('reads k(f) and γ from the lookups for the mode', () => {
    const walk = r.cases.find((c) => c.kind === 'walking-group');
    const jog = r.cases.find((c) => c.kind === 'jogging-group');
    const crowd = r.cases.find((c) => c.kind === 'crowd');
    expect(walk?.k).toBe(kLookup('walking', m1?.f as number).value);
    expect(walk?.gamma).toBe(gammaGroupLookup(m1?.delta as number, m1?.Seff as number).value);
    expect(jog?.k).toBe(kLookup('jogging', m1?.f as number).value);
    // NA.2.44.5, Table NA.7 — the crowd case uses the walking k(f).
    expect(crowd?.k).toBe(kLookup('walking', m1?.f as number).value);
    expect(crowd?.gamma).toBe(gammaCrowdLookup(m1?.delta as number).value);
  });

  it('injected code data still overrides the figures', () => {
    const inj = runCheck({ ...a1, codeData: injected });
    expect(inj.cases.every((c) => c.k === 1.0)).toBe(true);
  });

  it('shows a repeated clamping warning once', () => {
    // 8.5 Hz is above Figure NA.8: k = 0 for walking, used by the walking group and the crowd.
    const hi = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          { f: 8.5, M: 15000, dampingPercent: 0.5, direction: 'vertical', shape: 'half-sine' },
        ],
      },
    });
    const walkWarnings = hi.flags.filter(
      (f) => f.code === 'lookup-clamped' && f.message.startsWith('k(f) for walking'),
    );
    expect(walkWarnings.length).toBe(1);
    expect(walkWarnings[0]?.clause).toMatch(/Figure NA\.8/);
    expect(hi.cases.find((c) => c.kind === 'walking-group')?.aPeak).toBe(0);
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
    expect(r.modes[0]?.absPhi).toBeCloseTo(0.637 * 25, 12);
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
      expect.arrayContaining(['lateral-trigger', 'damper-provision']),
    );
    expect(r.flags.some((f) => f.code === 'lateral-lock-in-unavailable')).toBe(false);
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
      expect(r.statusNotes.join(' ')).toMatch(/acceleration.*not calculated/i);
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

  it('cites NA+A1:2020 for the frequency triggers; no case is [VERIFY] (SPEC §9)', () => {
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
    const clause = (code: string) => r.flags.find((f) => f.code === code)?.clause;
    expect(clause('vertical-trigger')).toBe('NA+A1:2020, NA.2.44.6(1)');
    expect(clause('lateral-trigger')).toBe('NA+A1:2020, NA.2.44.6(3)');
    expect(clause('damper-provision')).toBe('NA+A1:2020, NA.2.44.6(4)');
    expect(r.flags.find((f) => f.code === 'lateral-trigger')?.message).toMatch(/0\.2 m\/s²/);
    expect(r.flags.some((f) => f.clause?.includes('[VERIFY]'))).toBe(false);
    for (const c of r.cases) expect(c.verify).toBeNull();
  });

  it('rejects a user Seff larger than S/0.637 (max |φ| = 1, so ∫|φ| ≤ S)', () => {
    const modal = (Seff: number) =>
      runCheck({
        ...a1,
        bridge: { kind: 'modal', L, modes: [{ ...vertical, shape: 'user-seff', Seff }] },
      });
    expect(modal(200).inputErrors.join(' ')).toMatch(/Seff/);
    expect(modal(L / 0.637).inputErrors).toEqual([]);
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

describe('runCheck: lateral lock-in stability (NA.2.44.7; SPEC §2.8)', () => {
  const vertical = {
    f: 2,
    M: 15000,
    dampingPercent: 0.5,
    direction: 'vertical',
    shape: 'half-sine',
  } as const;
  const lowK: CodeData = { ...injected, k: () => ({ value: 0.01 }) };
  const lateralAt = (f: number, dampingPercent = 0.5) =>
    ({ f, M: 20000, dampingPercent, direction: 'lateral', shape: 'half-sine' }) as const;

  /** Modal bridge: one passing vertical mode plus the given extra modes. */
  const modal = (extra: ModalModeInput[], more: Partial<CheckInputs> = {}) =>
    runCheck({
      ...a1,
      bridge: { kind: 'modal', L, modes: [vertical, ...extra] },
      mBridgeMin: 1000,
      codeData: lowK,
      ...more,
    });

  it('hand-checked case H1: D = 0.03571 at 1.0 Hz is UNSTABLE, so the overall result is FAIL', () => {
    const r = modal([lateralAt(1.0)]);
    expect(r.lateral).toHaveLength(1);
    const l = r.lateral[0];
    expect(l?.modeId).toBe('mode-2');
    expect(l?.mBridge).toBe(1000);
    expect(l?.rho).toBe(0.8);
    expect(l?.mPedestrian).toBeCloseTo(140, 12);
    expect(Number((l?.D as number).toPrecision(4))).toBe(0.03571);
    expect(l?.status).toBe('UNSTABLE');
    expect(r.cases.every((c) => c.verdict === 'PASS')).toBe(true);
    expect(r.status).toBe('FAIL');
    expect(r.statusNotes.join(' ')).toMatch(/divergent lateral response may occur/i);
  });

  it('a STABLE lateral mode below 2.5 Hz still leaves the result INCOMPLETE (acceleration not calculated)', () => {
    const r = modal([lateralAt(1.0, 5)], { mBridgeMin: 5000 });
    expect(r.lateral[0]?.status).toBe('STABLE');
    expect(r.status).toBe('INCOMPLETE');
    expect(r.statusNotes.join(' ')).toMatch(/acceleration.*not calculated/i);
    expect(r.statusNotes.join(' ')).not.toMatch(/divergent/i);
  });

  it('class D uses the uncapped Table NA.7 density ρ = 1.5', () => {
    const r = modal([lateralAt(1.0)], { usage: { bridgeClass: 'D' } });
    expect(r.lateral[0]?.rho).toBe(1.5);
    expect(Number((r.lateral[0]?.D as number).toPrecision(4))).toBe(0.01905);
  });

  it('a crowd density override is used in m_pedestrian', () => {
    const r = modal([lateralAt(1.0)], {
      usage: { bridgeClass: 'C', overrides: { crowdDensity: 0.5 } },
    });
    expect(r.lateral[0]?.rho).toBe(0.5);
    expect(r.lateral[0]?.mPedestrian).toBeCloseTo(87.5, 12);
  });

  it('class A explains that D is not defined, and does not fail the bridge', () => {
    const r = modal([lateralAt(1.0)], { usage: { bridgeClass: 'A' } });
    const l = r.lateral[0];
    expect(l?.status).toBe('NO-CROWD');
    expect(l?.D).toBeNull();
    expect(l?.message).toMatch(/class A/);
    expect(l?.message).toMatch(/not defined/);
    expect(r.status).not.toBe('FAIL');
  });

  it('only lateral and torsional modes strictly below 1.5 Hz are checked', () => {
    const r = modal([
      lateralAt(1.5),
      lateralAt(1.6),
      { ...lateralAt(1.5), direction: 'torsional' },
    ]);
    expect(r.lateral).toEqual([]);
    expect(r.flags.find((f) => f.code === 'lock-in-not-expected')?.message).toMatch(
      /unstable lateral response not expected/i,
    );
  });

  it('includes torsional modes below 1.5 Hz, asking the user to confirm the lateral component', () => {
    const r = modal([{ ...lateralAt(1.0), direction: 'torsional' }]);
    expect(r.lateral).toHaveLength(1);
    const l = r.lateral[0];
    expect(l?.direction).toBe('torsional');
    expect(Number((l?.D as number).toPrecision(4))).toBe(0.03571);
    expect(l?.status).toBe('UNSTABLE');
    expect(r.status).toBe('FAIL');
    expect(r.statusNotes.join(' ')).toMatch(/Mode 2 \(1\.000 Hz, torsional\).*divergent/);
    const flag = r.flags.find((f) => f.code === 'lock-in-torsional');
    expect(flag?.modeId).toBe('mode-2');
    expect(flag?.clause).toBe('NA.2.44.7');
    expect(flag?.message).toMatch(/confirm.*significant lateral component/i);
    expect(l?.message).toMatch(/confirm.*significant lateral component/i);
  });

  it('does not ask lateral modes to confirm their lateral component', () => {
    const r = modal([lateralAt(1.0)]);
    expect(r.lateral[0]?.direction).toBe('lateral');
    expect(r.flags.some((f) => f.code === 'lock-in-torsional')).toBe(false);
  });

  it('beam mode says the lock-in check needs lateral modes from modal mode', () => {
    const r = runCheck({ ...a1, codeData: lowK });
    expect(r.lateral).toEqual([]);
    expect(r.flags.some((f) => f.code === 'lock-in-beam-mode')).toBe(true);
    expect(r.flags.some((f) => f.code === 'lock-in-not-expected')).toBe(false);
  });

  it('needs the lowest deck mass per metre in modal mode', () => {
    const r = modal([lateralAt(1.0)], { mBridgeMin: undefined });
    expect(r.lateral[0]?.status).toBe('needs-input');
    expect(r.missingInputs).toContain('lowest deck mass per metre');
    expect(r.status).toBe('INCOMPLETE');
  });

  it('needs the deck width', () => {
    const r = modal([lateralAt(1.0)], { b: undefined });
    expect(r.lateral[0]?.status).toBe('needs-input');
    expect(r.missingInputs).toContain('deck width');
  });

  it('rejects a non-positive deck mass per metre', () => {
    expect(modal([lateralAt(1.0)], { mBridgeMin: -5 }).status).toBe('INPUT-ERROR');
  });

  it('cannot assess a mode below the digitised boundary: INCOMPLETE with a note', () => {
    const r = modal([lateralAt(0.1)]);
    expect(r.lateral[0]?.status).toBe('OUTSIDE-FIGURE');
    expect(r.status).toBe('INCOMPLETE');
    expect(r.statusNotes.join(' ')).toMatch(/cannot be assessed/i);
  });

  it('cautions outside the 0.5–1.1 Hz test-data range (Figure NA.11 note)', () => {
    const r = modal([lateralAt(1.3)]);
    const flag = r.flags.find((f) => f.code === 'lock-in-caution');
    expect(flag?.modeId).toBe('mode-2');
    expect(flag?.clause).toBe('NA.2.44.7, Figure NA.11');
    expect(modal([lateralAt(1.0)]).flags.some((f) => f.code === 'lock-in-caution')).toBe(false);
  });
});

describe('runCheck: 8 Hz display cut-off uses the displayed precision (SPEC §2.1)', () => {
  /** EI for a given f1 on bridge A1's span and mass: f1 = (π/2L²)·√(EI/m). */
  const eiFor = (f1: number) => m * ((f1 * 2 * L ** 2) / Math.PI) ** 2;

  it('hides a mode that shows as 8.000 Hz (A1 from cases.json: f2 = 7.99993 Hz)', () => {
    const r = runCheck({ ...a1, bridge: { ...a1.bridge, EI: 1.3131e9 } as CheckInputs['bridge'] });
    expect(r.modes[1]).toBeUndefined();
    expect(r.modes.map((x) => x.n)).toEqual([1]);
    const flag = r.flags.find((f) => f.code === 'modes-hidden');
    expect(flag?.message).toMatch(/modes 2, 3/);
  });

  it('keeps a mode that shows as 7.999 Hz', () => {
    const r = runCheck({
      ...a1,
      bridge: { ...a1.bridge, EI: eiFor(1.99985) } as CheckInputs['bridge'],
    });
    expect(r.modes.map((x) => x.n)).toEqual([1, 2]);
    expect(r.modes[1]?.f.toFixed(3)).toBe('7.999');
  });
});

describe('runCheck: vertical comfort check not required at or above 5 Hz (NA.2.44.6(1); SPEC §2.10)', () => {
  const eiFor = (f1: number) => m * ((f1 * 2 * L ** 2) / Math.PI) ** 2;
  const beamAt = (f1: number): CheckInputs => ({
    ...a1,
    bridge: { kind: 'beam', L, EI: eiFor(f1), m, dampingPercent: 0.5 },
    codeData: injected,
  });
  const verticalAt = (f: number) =>
    ({ f, M: 15000, dampingPercent: 0.5, direction: 'vertical', shape: 'half-sine' }) as const;
  const lateralAt = (f: number) =>
    ({ f, M: 20000, dampingPercent: 0.5, direction: 'lateral', shape: 'half-sine' }) as const;
  const modal = (modes: ModalModeInput[]) =>
    runCheck({
      ...a1,
      bridge: { kind: 'modal', L, modes },
      mBridgeMin: 1000,
      codeData: injected,
    });

  it('beam with every mode at or above 8 Hz: NOT-REQUIRED, with the fundamental frequency', () => {
    const r = runCheck(beamAt(9));
    expect(r.modes).toEqual([]);
    expect(r.vertical.fundamentalHz).toBeCloseTo(9, 10);
    expect(r.vertical.required).toBe(false);
    expect(r.status).toBe('NOT-REQUIRED');
    expect(r.flags.some((f) => f.code === 'vertical-not-required')).toBe(true);
  });

  it('beam mode notes that lateral and torsional modes were not assessed', () => {
    for (const f1 of [2, 9]) {
      const r = runCheck(beamAt(f1));
      expect(r.statusInfo.join(' ')).toMatch(/lateral and torsional modes were not assessed/i);
    }
  });

  it('does not ask for comfort-limit inputs or the class when the check is not required', () => {
    const r = runCheck({ ...beamAt(9), height: undefined, comfort: undefined, usage: undefined });
    expect(r.missingInputs).toEqual([]);
    expect(r.status).toBe('NOT-REQUIRED');
  });

  it('computed accelerations between 5 and 8 Hz are for information only, never FAIL', () => {
    // Injected k = 1 at 6 Hz gives accelerations far above a_limit.
    const r = runCheck(beamAt(6));
    const computed = r.cases.filter((c) => c.status === 'computed');
    expect(computed.length).toBeGreaterThan(0);
    expect(computed.some((c) => (c.aPeak as number) > (c.aLimit as number))).toBe(true);
    for (const c of computed) {
      expect(c.informationOnly).toBe(true);
      expect(c.verdict).toBeNull();
      expect(c.aPeak).not.toBeNull();
    }
    expect(r.governing).toBeNull();
    expect(r.status).toBe('NOT-REQUIRED');
  });

  it('below 5 Hz the check is required and cases give verdicts', () => {
    const r = runCheck(beamAt(2));
    expect(r.vertical).toEqual({ fundamentalHz: expect.closeTo(2, 10), required: true });
    expect(r.cases.every((c) => !c.informationOnly)).toBe(true);
    expect(r.status).toBe('FAIL');
  });

  it('exactly 5 Hz is not below 5 Hz, so the check is not required', () => {
    expect(runCheck(beamAt(5)).vertical.required).toBe(false);
  });

  it('modal mode uses the lowest vertical frequency', () => {
    expect(modal([verticalAt(6), verticalAt(4)]).vertical).toEqual({
      fundamentalHz: 4,
      required: true,
    });
    const r = modal([verticalAt(6), lateralAt(3.2)]);
    expect(r.vertical).toEqual({ fundamentalHz: 6, required: false });
    expect(r.status).toBe('NOT-REQUIRED');
    expect(r.statusInfo.join(' ')).not.toMatch(/not assessed/);
  });

  it('modal mode with no vertical mode leaves the requirement unknown', () => {
    const r = modal([lateralAt(3.2)]);
    expect(r.vertical).toEqual({ fundamentalHz: null, required: null });
    expect(r.status).toBe('INCOMPLETE');
  });

  it('a lateral mode below 2.5 Hz still gives INCOMPLETE', () => {
    const r = modal([verticalAt(6), lateralAt(2.0)]);
    expect(r.status).toBe('INCOMPLETE');
  });

  it('an UNSTABLE lateral mode still gives FAIL', () => {
    const r = modal([verticalAt(6), lateralAt(1.0)]);
    expect(r.lateral[0]?.status).toBe('UNSTABLE');
    expect(r.status).toBe('FAIL');
  });

  it('a lateral check that needs the class still asks for it', () => {
    const r = runCheck({
      ...a1,
      usage: undefined,
      bridge: { kind: 'modal', L, modes: [verticalAt(6), lateralAt(1.0)] },
      mBridgeMin: 1000,
      codeData: injected,
    });
    expect(r.missingInputs).toContain('bridge class');
    expect(r.status).toBe('INCOMPLETE');
  });
});

describe('runCheck: review items #10 and #15', () => {
  it('does not flag a jogging group override when jogging is excluded (#10)', () => {
    const r = runCheck({
      ...a1,
      usage: { bridgeClass: 'C', includeJogging: false, overrides: { groupJogging: 5 } },
      codeData: injected,
    });
    expect(r.flags.some((f) => f.code === 'override')).toBe(false);
    const withJog = runCheck({
      ...a1,
      usage: { bridgeClass: 'C', overrides: { groupJogging: 5 } },
      codeData: injected,
    });
    expect(withJog.flags.some((f) => f.code === 'override')).toBe(true);
  });

  it('records the time history only for the governing group case (#15)', () => {
    const r = runCheck({ ...a1, codeData: injected });
    const withHistory = r.cases.filter((c) => c.history);
    expect(withHistory).toHaveLength(1);
    const g = withHistory[0];
    expect(g?.kind).toBe('jogging-group');
    for (const c of r.cases) {
      if (c.kind === 'crowd' || c.utilisation === null) continue;
      expect(g?.utilisation).toBeGreaterThanOrEqual(c.utilisation);
    }
    // The re-run with recording on gives the same peak as the case result.
    const maxAbs = Math.max(...(g?.history?.a ?? []).map(Math.abs));
    expect(maxAbs).toBe(g?.aPeak);
  });
});

describe('runCheck: sanity limits keep the page responsive (pre-release review)', () => {
  const vmode = (f: number): ModalModeInput => ({
    f,
    M: 15000,
    dampingPercent: 0.5,
    direction: 'vertical',
    shape: 'half-sine',
  });

  it(`rejects a span over ${MAX_SPAN} m in beam and modal mode`, () => {
    expect(MAX_SPAN).toBe(500);
    const beam = runCheck({ ...a1, bridge: { kind: 'beam', L: 501, EI, m, dampingPercent: 0.5 } });
    expect(beam.status).toBe('INPUT-ERROR');
    expect(beam.inputErrors.join(' ')).toMatch(/500 m or less/);
    const modal = runCheck({ ...a1, bridge: { kind: 'modal', L: 1e6, modes: [vmode(2)] } });
    expect(modal.status).toBe('INPUT-ERROR');
    expect(
      runCheck({ ...a1, bridge: { kind: 'modal', L: 500, modes: [vmode(2)] } }).status,
    ).not.toBe('INPUT-ERROR');
  });

  it(`rejects a vertical mode above ${MAX_VERTICAL_FREQ} Hz, but not a lateral one`, () => {
    expect(MAX_VERTICAL_FREQ).toBe(50);
    const r = runCheck({ ...a1, bridge: { kind: 'modal', L, modes: [vmode(60000)] } });
    expect(r.status).toBe('INPUT-ERROR');
    expect(r.inputErrors.join(' ')).toMatch(/Mode 1: frequency must be 50 Hz or less/);
    const lat = runCheck({
      ...a1,
      bridge: { kind: 'modal', L, modes: [{ ...vmode(60), direction: 'lateral' }] },
    });
    expect(lat.status).not.toBe('INPUT-ERROR');
  });

  it('the worst case inside the limits runs quickly (500 m, 50 Hz and 7.9 Hz modes)', () => {
    const t0 = Date.now();
    const r = runCheck({
      ...a1,
      bridge: { kind: 'modal', L: 500, modes: [vmode(50), vmode(7.9)] },
    });
    expect(r.status).not.toBe('INPUT-ERROR');
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('runCheck: damping above Figure NA.9 (author, 1 Nov 2026)', () => {
  // ξ = 4 % gives δ = 0.251, beyond the end of every Figure NA.9 curve (δ ≈ 0.2).
  const heavy: CheckInputs = {
    ...a1,
    bridge: { kind: 'beam', L, EI, m, dampingPercent: 4 },
  };

  it('gives no result for cases that need γ, and says the response would be under-estimated', () => {
    const r = runCheck(heavy);
    for (const kind of ['walking-group', 'jogging-group', 'crowd'] as const) {
      const c = r.cases.find((x) => x.kind === kind);
      expect(c?.status).toBe('blocked');
      expect(c?.aPeak).toBeNull();
      expect(c?.gamma).toBeNull();
    }
    expect(r.status).toBe('INCOMPLETE');
    expect(r.statusNotes.join(' ')).toMatch(/under-estimate/);
    expect(r.flags.some((f) => f.code === 'gamma-outside-figure' && f.level === 'warning')).toBe(
      true,
    );
    expect(r.flags.some((f) => f.code === 'lookup-clamped' && /NA\.9/.test(f.message))).toBe(false);
  });

  it('a single-person group needs no γ, so it still runs', () => {
    const r = runCheck({
      ...heavy,
      usage: { bridgeClass: 'C', overrides: { groupWalking: 1 } },
    });
    expect(r.cases.find((c) => c.kind === 'walking-group')?.status).toBe('computed');
    expect(r.status).toBe('INCOMPLETE');
  });

  it('a FAIL elsewhere still gives FAIL', () => {
    const r = runCheck({
      ...heavy,
      usage: { bridgeClass: 'C', overrides: { groupWalking: 1 } },
      codeData: {
        k: () => ({ value: 50 }),
        gammaGroup: () => ({ value: null, warning: 'outside' }),
        gammaCrowd: () => ({ value: null, warning: 'outside' }),
      },
    });
    expect(r.cases.find((c) => c.kind === 'walking-group')?.verdict).toBe('FAIL');
    expect(r.status).toBe('FAIL');
  });

  it('does not hold back NOT REQUIRED (information-only cases)', () => {
    // f1 = 6 Hz: the vertical check is not required, so no status note is added.
    const EI6 = m * ((2 * L ** 2 * 6) / Math.PI) ** 2;
    const r = runCheck({ ...heavy, bridge: { kind: 'beam', L, EI: EI6, m, dampingPercent: 4 } });
    expect(r.status).toBe('NOT-REQUIRED');
    expect(r.statusNotes).toEqual([]);
  });
});

describe('runCheck: frequencies in messages use the displayed 3 dp (pre-release review)', () => {
  it('a 4.996 Hz mode is not called "5.00 Hz is below 5 Hz"', () => {
    const r = runCheck({
      ...a1,
      bridge: {
        kind: 'modal',
        L,
        modes: [
          { f: 4.996, M: 15000, dampingPercent: 0.5, direction: 'vertical', shape: 'half-sine' },
        ],
      },
    });
    const msg = r.flags.find((f) => f.code === 'vertical-trigger')?.message;
    expect(msg).toMatch(/Mode 1 \(4\.996 Hz\) is below 5 Hz/);
  });
});
