// Interpolation of the digitised NA figures (SPEC §2.4, §5). Pure functions.
// Data: src/data/k_fv.json (Figure NA.8) and src/data/gamma.json (Figure NA.9), digitised by
// the author; see each file's `source` for the reading accuracy.
// Interpolation clamps at the data limits and returns a warning; it never extrapolates
// (CLAUDE.md). The one exception is k(f), which SPEC §2.4 sets to zero outside the figure.

import kData from '../data/k_fv.json';
import gammaData from '../data/gamma.json';
import type { Activity, CodeData, LookupValue } from './check';

type Points = readonly (readonly number[])[];

function pt(points: Points, i: number): [number, number] {
  const p = points[i] as readonly number[];
  return [p[0] as number, p[1] as number];
}

const fmt = (v: number, d: number) => v.toFixed(d);

/**
 * Linear interpolation in sorted (x, y) points. Outside the data the end value is used and
 * a warning names `what`.
 */
export function interpolate(points: Points, x: number, what: string): LookupValue {
  const n = points.length;
  const [x0, y0] = pt(points, 0);
  const [xn, yn] = pt(points, n - 1);
  if (x < x0 || x > xn) {
    const edge = x < x0 ? x0 : xn;
    return {
      value: x < x0 ? y0 : yn,
      warning: `${what}: ${x} is outside the digitised range ${x0}–${xn}; the value at ${edge} is used.`,
    };
  }
  for (let i = 1; i < n; i++) {
    const [xa, ya] = pt(points, i - 1);
    const [xb, yb] = pt(points, i);
    if (x === xb) return { value: yb };
    if (x < xb) return { value: x === xa ? ya : ya + ((x - xa) / (xb - xa)) * (yb - ya) };
  }
  return { value: yn };
}

const K_CURVES: Record<Activity, Points> = {
  walking: kData.curves.walking.points,
  jogging: kData.curves.jogging.points,
};

/** NA.2.44.4, Figure NA.8 — k(f_v). Zero outside the digitised range (SPEC §2.4). */
export function kLookup(activity: Activity, fv: number): LookupValue {
  const points = K_CURVES[activity];
  const [f0] = pt(points, 0);
  const [fn] = pt(points, points.length - 1);
  if (fv < f0 || fv > fn) {
    return {
      value: 0,
      warning: `k(f) for ${activity}: ${fmt(fv, 2)} Hz is outside the digitised range of Figure NA.8 (${fmt(f0, 2)}–${fmt(fn, 2)} Hz), so k = 0 is used (SPEC §2.4).`,
    };
  }
  return interpolate(points, fv, `k(f) for ${activity}, Figure NA.8`);
}

/** Figure NA.9 group curves, sorted by Seff (m). */
const GROUPS = [...gammaData.groups].sort((a, b) => a.Seff - b.Seff);

function gammaOnCurve(g: (typeof GROUPS)[number], delta: number): LookupValue {
  const r = interpolate(g.points, delta, 'γ');
  if (!r.warning) return r;
  const [d0] = pt(g.points, 0);
  const [dn] = pt(g.points, g.points.length - 1);
  const edge = delta < d0 ? d0 : dn;
  return {
    value: r.value,
    warning: `γ for groups: log decrement δ = ${fmt(delta, 4)} is outside Figure NA.9 (Seff = ${g.Seff} m curve, δ = ${fmt(d0, 4)}–${fmt(dn, 4)}), so γ is read at δ = ${fmt(edge, 4)}.`,
  };
}

/**
 * NA.2.44.4, Figure NA.9 — γ for pedestrian groups. Linear in δ along each Seff curve, then
 * linear in Seff between the two curves either side (SPEC §2.4). Clamped at the figure limits.
 */
export function gammaGroupLookup(delta: number, Seff: number): LookupValue {
  const first = GROUPS[0] as (typeof GROUPS)[number];
  const last = GROUPS[GROUPS.length - 1] as (typeof GROUPS)[number];
  const warnings: string[] = [];
  let lo: (typeof GROUPS)[number];
  let hi: (typeof GROUPS)[number];
  if (Seff <= first.Seff || Seff >= last.Seff) {
    lo = hi = Seff <= first.Seff ? first : last;
    if (Seff !== lo.Seff) {
      warnings.push(
        `γ for groups: Seff = ${fmt(Seff, 2)} m is outside Figure NA.9 (Seff = ${first.Seff}–${last.Seff} m), so the Seff = ${lo.Seff} m curve is used.`,
      );
    }
  } else {
    const i = GROUPS.findIndex((g) => g.Seff >= Seff);
    hi = GROUPS[i] as (typeof GROUPS)[number];
    lo = hi.Seff === Seff ? hi : (GROUPS[i - 1] as (typeof GROUPS)[number]);
  }
  const a = gammaOnCurve(lo, delta);
  const b = lo === hi ? a : gammaOnCurve(hi, delta);
  for (const w of [a.warning, b.warning]) if (w && !warnings.includes(w)) warnings.push(w);
  const value =
    lo === hi ? a.value : a.value + ((Seff - lo.Seff) / (hi.Seff - lo.Seff)) * (b.value - a.value);
  return warnings.length > 0 ? { value, warning: warnings.join(' ') } : { value };
}

/** NA.2.44.5, Figure NA.9 — γ for crowds, linear in δ (SPEC §2.4). Clamped at the figure limits. */
export function gammaCrowdLookup(delta: number): LookupValue {
  const points = gammaData.crowd.points;
  const r = interpolate(points, delta, 'γ');
  if (!r.warning) return r;
  const [d0] = pt(points, 0);
  const [dn] = pt(points, points.length - 1);
  return {
    value: r.value,
    warning: `γ for crowds: log decrement δ = ${fmt(delta, 4)} is outside Figure NA.9 (δ = ${fmt(d0, 4)}–${fmt(dn, 4)}), so γ is read at δ = ${fmt(delta < d0 ? d0 : dn, 4)}.`,
  };
}

/** Author's estimated reading accuracy of each digitised figure (data file metadata). */
export const READING_ACCURACY = {
  k: kData.source.readingAccuracy,
  gamma: gammaData.source.readingAccuracy,
};

/** The digitised NA figures, used by runCheck unless code data is injected. */
export const NA_CODE_DATA: CodeData = {
  k: kLookup,
  gammaGroup: gammaGroupLookup,
  gammaCrowd: gammaCrowdLookup,
};
