import { describe, expect, it } from 'vitest';
import { runCheck, type CheckInputs, type CodeData } from '../../src/engine/check';
import kData from '../../src/data/k_fv.json';
import boundaryData from '../../src/data/lateral_boundary.json';
import {
  governingGroupCase,
  kChartData,
  lateralChartData,
  timeHistoryChartData,
} from '../../src/share/charts';

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

/** Vertical 2 Hz mode plus a 1.0 Hz lateral mode, lowest deck mass 1000 kg/m (case H1). */
function withLateral(bridgeClass: 'A' | 'C', mBridgeMin = 1000): CheckInputs {
  return {
    ...a1,
    usage: { bridgeClass },
    mBridgeMin,
    bridge: {
      kind: 'modal',
      L,
      modes: [
        { f: 2.0, M: 15000, dampingPercent: 0.5, direction: 'vertical', shape: 'half-sine' },
        { f: 1.0, M: 15000, dampingPercent: 0.5, direction: 'lateral', shape: 'half-sine' },
      ],
    },
  };
}

describe('governingGroupCase', () => {
  it('picks the group case with the highest utilisation, never the crowd case', () => {
    const r = runCheck({ ...a1, codeData: injected });
    // With these injected values the crowd case governs overall (a = 9.287 m/s², SPEC §6 N1).
    expect(r.governing?.kind).toBe('crowd');
    const g = governingGroupCase(r);
    expect(g?.kind).toBe('jogging-group');
    const groups = r.cases.filter((c) => c.kind !== 'crowd');
    for (const c of groups) expect(g?.aPeak).toBeGreaterThanOrEqual(c.aPeak as number);
  });

  it('uses the walking group when jogging is switched off', () => {
    const r = runCheck({
      ...a1,
      usage: { bridgeClass: 'C', includeJogging: false },
      codeData: injected,
    });
    expect(governingGroupCase(r)?.kind).toBe('walking-group');
  });

  it('falls back to the highest a_peak when there is no comfort limit', () => {
    const r = runCheck({ ...a1, comfort: undefined, codeData: injected });
    expect(r.cases.every((c) => c.utilisation === null)).toBe(true);
    expect(governingGroupCase(r)?.kind).toBe('jogging-group');
  });

  it('returns null when no group case has a computed history', () => {
    expect(governingGroupCase(runCheck({ ...a1, codeData: {} }))).toBeNull();
  });
});

describe('timeHistoryChartData', () => {
  it('passes the engine history and the limit through unchanged', () => {
    const r = runCheck({ ...a1, codeData: injected });
    const d = timeHistoryChartData(r);
    expect(d.kind).toBe('ready');
    if (d.kind !== 'ready') return;
    const g = governingGroupCase(r);
    expect(d.t).toBe(g?.history?.t);
    expect(d.a).toBe(g?.history?.a);
    expect(d.aLimit).toBe(r.comfort?.aLimit);
    expect(d.aPeak).toBe(g?.aPeak);
    expect(d.caseLabel).toBe('Jogging group');
    expect(d.activity).toBe('jogging');
    expect(d.modeLabel).toBe(r.modes[0]?.label);
  });

  it('keeps the chart without limit lines when a_limit is not known', () => {
    const d = timeHistoryChartData(runCheck({ ...a1, comfort: undefined, codeData: injected }));
    expect(d.kind).toBe('ready');
    if (d.kind === 'ready') expect(d.aLimit).toBeNull();
  });

  it('explains why there is no chart when no group case ran', () => {
    const d = timeHistoryChartData(runCheck({ ...a1, usage: undefined, codeData: injected }));
    expect(d.kind).toBe('empty');
    if (d.kind === 'empty') expect(d.reason).toMatch(/bridge class/i);
  });
});

describe('kChartData', () => {
  it('draws the digitised Figure NA.8 curves verbatim', () => {
    const d = kChartData(runCheck(a1));
    expect(d.curves.walking).toBe(kData.curves.walking.points);
    expect(d.curves.jogging).toBe(kData.curves.jogging.points);
  });

  it('marks each vertical mode with the k values the engine used', () => {
    const r = runCheck(a1);
    const d = kChartData(r);
    expect(d.markers).toHaveLength(1);
    const mk = d.markers[0];
    const walk = r.cases.find((c) => c.kind === 'walking-group');
    const jog = r.cases.find((c) => c.kind === 'jogging-group');
    expect(mk?.f).toBe(r.modes[0]?.f);
    expect(mk?.kWalking).toBe(walk?.k);
    expect(mk?.kJogging).toBe(jog?.k);
    expect(mk?.kWalking).not.toBeNull();
  });

  it('marks the frequency with no k values before a bridge class is chosen', () => {
    const d = kChartData(runCheck({ ...a1, usage: undefined }));
    expect(d.markers[0]?.kWalking).toBeNull();
    expect(d.markers[0]?.kJogging).toBeNull();
  });

  it('leaves lateral modes off the k(f) chart', () => {
    const d = kChartData(runCheck(withLateral('C')));
    expect(d.markers.map((mk) => mk.f)).toEqual([2.0]);
  });
});

describe('lateralChartData', () => {
  it('is null when there is no lateral lock-in check', () => {
    expect(lateralChartData(runCheck(a1))).toBeNull();
  });

  it('draws the digitised Figure NA.11 boundary and the mode (f, D) point', () => {
    const r = runCheck(withLateral('C'));
    const d = lateralChartData(r);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.boundary).toBe(boundaryData.boundary.points);
    expect(d.reliableRangeHz).toEqual([0.5, 1.1]);
    expect(d.triggerHz).toBe(1.5);
    expect(d.points).toHaveLength(1);
    const l = r.lateral[0];
    expect(d.points[0]?.f).toBe(l?.f);
    expect(d.points[0]?.D).toBe(l?.D);
    expect(d.points[0]?.status).toBe(l?.status);
    // Hand check H1 (SPEC §2.8): D = 1000 · 0.005 / 140.
    expect(d.points[0]?.D).toBeCloseTo(0.03571, 5);
    expect(d.notPlotted).toEqual([]);
  });

  it('lists modes with no D as not plotted, with the reason', () => {
    const d = lateralChartData(runCheck(withLateral('A')));
    expect(d?.points).toEqual([]);
    expect(d?.notPlotted).toHaveLength(1);
    expect(d?.notPlotted[0]?.reason).toMatch(/no crowd/i);
  });
});
