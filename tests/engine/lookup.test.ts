import { describe, expect, it } from 'vitest';
import kData from '../../src/data/k_fv.json';
import gammaData from '../../src/data/gamma.json';
import lateralData from '../../src/data/lateral_boundary.json';
import {
  NA_CODE_DATA,
  gammaCrowdLookup,
  gammaGroupLookup,
  interpolate,
  kLookup,
} from '../../src/engine/lookup';

/** Values printed by validation/reference/reference_lookup.py (numpy.interp on the raw CSVs). */
function ref(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-6);
}

// Bridge A1 (SPEC §6): f = 2.0 Hz, ξ = 0.5 %, half-sine Seff for L = 30 m.
const A1_DELTA = 2 * Math.PI * 0.005;
const A1_SEFF = (2 * 30) / Math.PI / 0.634;

describe('digitised data files (SPEC §4 metadata)', () => {
  const files = { k_fv: kData, gamma: gammaData, lateral_boundary: lateralData };
  for (const [name, d] of Object.entries(files)) {
    it(`${name}.json carries its source metadata`, () => {
      const s = d.source;
      expect(s.document).toBe('NA+A1:2020 to BS EN 1991-2:2003');
      expect(s.figure).toMatch(/^Figure NA\.(8|9|11) /);
      for (const field of ['digitisingTool', 'digitisedBy', 'date', 'readingAccuracy'] as const) {
        expect(s[field]).toBeTruthy();
      }
    });
  }

  it('k and γ curves have increasing x', () => {
    const curves = [...Object.values(kData.curves), ...gammaData.groups, gammaData.crowd].map(
      (c) => c.points,
    );
    for (const pts of curves) {
      for (let i = 1; i < pts.length; i++) {
        expect((pts[i] as number[])[0]).toBeGreaterThan((pts[i - 1] as number[])[0] as number);
      }
    }
  });

  it('γ group curves are sorted by Seff, 10 m to 300 m', () => {
    expect(gammaData.groups.map((g) => g.Seff)).toEqual([
      10, 12, 15, 20, 30, 40, 60, 100, 200, 300,
    ]);
  });

  it('the NA.11 boundary has frequency never decreasing', () => {
    const pts = lateralData.boundary.points;
    for (let i = 1; i < pts.length; i++) {
      expect((pts[i] as number[])[0]).toBeGreaterThanOrEqual((pts[i - 1] as number[])[0] as number);
    }
  });
});

describe('interpolate: clamps with a warning, never extrapolates (CLAUDE.md)', () => {
  const pts = [
    [1, 10],
    [2, 20],
    [4, 0],
  ];
  it('is linear between points and exact at points', () => {
    expect(interpolate(pts, 1.5, 'test')).toEqual({ value: 15 });
    expect(interpolate(pts, 3, 'test')).toEqual({ value: 10 });
    expect(interpolate(pts, 2, 'test')).toEqual({ value: 20 });
    expect(interpolate(pts, 4, 'test')).toEqual({ value: 0 });
  });
  it('clamps below and above the data with a warning', () => {
    const lo = interpolate(pts, 0.5, 'test');
    expect(lo.value).toBe(10);
    expect(lo.warning).toMatch(/test/);
    const hi = interpolate(pts, 5, 'test');
    expect(hi.value).toBe(0);
    expect(hi.warning).toMatch(/test/);
  });
});

describe('k(f_v), Figure NA.8', () => {
  it('matches the independent reference for Bridge A1 (f = 2.0 Hz)', () => {
    ref(kLookup('walking', 2.0).value, 0.988873);
    ref(kLookup('jogging', 2.0).value, 0.872505);
    expect(kLookup('walking', 2.0).warning).toBeUndefined();
  });

  it('matches the reference at other frequencies', () => {
    ref(kLookup('walking', 3.3).value, 0.327171);
    ref(kLookup('jogging', 3.3).value, 0.254873);
    ref(kLookup('walking', 5.0).value, 0.177169);
    ref(kLookup('jogging', 1.2).value, 0.053157);
  });

  it('returns a digitised point exactly', () => {
    const [f, k] = kData.curves.walking.points[10] as [number, number];
    expect(kLookup('walking', f).value).toBe(k);
  });

  it('is zero outside the digitised range, with a warning (SPEC §2.4)', () => {
    for (const f of [8.5, 20]) {
      const r = kLookup('walking', f);
      expect(r.value).toBe(0);
      expect(r.warning).toMatch(/Figure NA\.8/);
    }
    // The walking curve starts at 0.008 Hz (the jogging curve starts at 0 Hz).
    expect(kLookup('walking', 0.001).value).toBe(0);
    expect(kLookup('walking', 0.001).warning).toMatch(/Figure NA\.8/);
  });
});

describe('γ, Figure NA.9', () => {
  it('groups: matches the reference for Bridge A1 (bilinear in δ and Seff)', () => {
    const r = gammaGroupLookup(A1_DELTA, A1_SEFF);
    ref(r.value, 0.358194);
    expect(r.warning).toBeUndefined();
  });

  it('groups: matches the reference at other points', () => {
    ref(gammaGroupLookup(0.1, 12.5).value, 0.673386);
    ref(gammaGroupLookup(0.05, 75).value, 0.259299);
    ref(gammaGroupLookup(0.15, 250).value, 0.429839);
    ref(gammaGroupLookup(0.01, 10).value, 0.691307);
  });

  it('groups: on a curve, uses that curve only', () => {
    const g40 = gammaData.groups.find((g) => g.Seff === 40);
    const [d, y] = g40?.points[5] as [number, number];
    expect(gammaGroupLookup(d, 40).value).toBe(y);
  });

  it('groups: clamps Seff outside 10–300 m with a warning', () => {
    const lo = gammaGroupLookup(0.05, 5);
    expect(lo.value).toBe(gammaGroupLookup(0.05, 10).value);
    expect(lo.warning).toMatch(/Seff/);
    const hi = gammaGroupLookup(0.05, 500);
    expect(hi.value).toBe(gammaGroupLookup(0.05, 300).value);
    expect(hi.warning).toMatch(/Seff/);
  });

  it('groups: clamps δ above the figure with a warning', () => {
    const r = gammaGroupLookup(0.3, 30);
    const last = gammaData.groups.find((g) => g.Seff === 30)?.points.at(-1) as number[];
    expect(r.value).toBe(last[1]);
    expect(r.warning).toMatch(/Figure NA\.9/);
  });

  it('crowd: matches the reference and clamps with a warning', () => {
    ref(gammaCrowdLookup(A1_DELTA).value, 0.041184);
    ref(gammaCrowdLookup(0.12).value, 0.144288);
    expect(gammaCrowdLookup(0.12).warning).toBeUndefined();
    const r = gammaCrowdLookup(0.25);
    expect(r.value).toBe((gammaData.crowd.points.at(-1) as number[])[1]);
    expect(r.warning).toMatch(/Figure NA\.9/);
  });
});

describe('NA_CODE_DATA', () => {
  it('routes k and γ to the digitised lookups', () => {
    expect(NA_CODE_DATA.k?.('jogging', 2)).toEqual(kLookup('jogging', 2));
    expect(NA_CODE_DATA.gammaGroup?.(0.05, 75)).toEqual(gammaGroupLookup(0.05, 75));
    expect(NA_CODE_DATA.gammaCrowd?.(0.12)).toEqual(gammaCrowdLookup(0.12));
  });
});
