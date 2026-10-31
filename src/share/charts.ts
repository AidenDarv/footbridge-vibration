// Chart data for the results page (SPEC §3 items 3–5). Selection and pass-through only: every
// number comes from the engine result or the digitised data files, never from new maths here.
// Curves are drawn from our own digitised points, never from images of the BSI figures.

import type { CheckResult, LateralCheckResult, LoadCaseResult } from '../engine/check';
import kData from '../data/k_fv.json';
import boundaryData from '../data/lateral_boundary.json';
import { LOCK_IN_TRIGGER_HZ, RELIABLE_RANGE_HZ } from '../engine/lateral';
import { caseLabel, lockInModeLabel } from './wording';

type Points = readonly (readonly number[])[];

const isGroup = (c: LoadCaseResult) => c.kind === 'walking-group' || c.kind === 'jogging-group';

/**
 * The group case drawn in the time-history chart: the computed group case with the highest
 * utilisation, or the highest a_peak when there is no comfort limit. Crowd cases are steady
 * state and have no time history. Ties keep the first case (walking before jogging).
 */
export function governingGroupCase(r: CheckResult): LoadCaseResult | null {
  const ran = r.cases.filter(
    (c) => isGroup(c) && c.status === 'computed' && c.history && c.aPeak !== null,
  );
  const byUtil = ran.every((c) => c.utilisation !== null);
  let best: LoadCaseResult | null = null;
  for (const c of ran) {
    const score = (x: LoadCaseResult) => (byUtil ? x.utilisation : x.aPeak) as number;
    if (best === null || score(c) > score(best)) best = c;
  }
  return best;
}

export type TimeHistoryChartData =
  | {
      kind: 'ready';
      activity: 'walking' | 'jogging';
      modeLabel: string;
      caseLabel: string;
      t: number[];
      a: number[];
      aPeak: number;
      /** a_limit for the ±a_limit lines, or null when the comfort inputs are missing. */
      aLimit: number | null;
      utilisation: number | null;
    }
  | { kind: 'empty'; reason: string };

/** SPEC §3 item 3 — antinode acceleration history of the governing group case. */
export function timeHistoryChartData(r: CheckResult): TimeHistoryChartData {
  const c = governingGroupCase(r);
  if (c === null || !c.history || c.aPeak === null) {
    let reason = 'No group case could be run, so there is no time history. See the load cases.';
    if (!r.modes.some((md) => md.direction === 'vertical')) {
      reason = 'No vertical modes, so there is no group case to plot.';
    } else if (r.cases.length === 0) {
      reason = 'Choose a bridge class to run the group cases.';
    }
    return { kind: 'empty', reason };
  }
  return {
    kind: 'ready',
    activity: c.kind === 'jogging-group' ? 'jogging' : 'walking',
    modeLabel: r.modes.find((md) => md.id === c.modeId)?.label ?? c.modeId,
    caseLabel: caseLabel(c),
    t: c.history.t,
    a: c.history.a,
    aPeak: c.aPeak,
    aLimit: c.aLimit ?? r.comfort?.aLimit ?? null,
    utilisation: c.utilisation,
  };
}

export interface KMarker {
  modeLabel: string;
  f: number;
  /** k used for the walking cases, or null if not looked up (no class, or awaiting data). */
  kWalking: number | null;
  /** k used for the jogging group, or null if jogging is not run. */
  kJogging: number | null;
}

export interface KChartData {
  /** Figure NA.8 as digitised, [f (Hz), k] points. */
  curves: { walking: Points; jogging: Points };
  markers: KMarker[];
}

/** SPEC §3 item 4 — Figure NA.8 k(f) curves with the bridge's vertical mode frequencies. */
export function kChartData(r: CheckResult): KChartData {
  const kOf = (modeId: string, kinds: LoadCaseResult['kind'][]) => {
    for (const kind of kinds) {
      const c = r.cases.find((x) => x.modeId === modeId && x.kind === kind);
      if (c && c.k !== null) return c.k;
    }
    return null;
  };
  return {
    curves: { walking: kData.curves.walking.points, jogging: kData.curves.jogging.points },
    markers: r.modes
      .filter((md) => md.direction === 'vertical')
      .map((md) => ({
        modeLabel: md.label,
        f: md.f,
        kWalking: kOf(md.id, ['walking-group', 'crowd']),
        kJogging: kOf(md.id, ['jogging-group']),
      })),
  };
}

export interface LateralPoint {
  modeLabel: string;
  f: number;
  D: number;
  status: LateralCheckResult['status'];
}

export interface LateralChartData {
  /** Figure NA.11 as digitised, [f (Hz), D] points. */
  boundary: Points;
  /** Figure NA.11 test-data range (Hz). */
  reliableRangeHz: readonly [number, number];
  /** NA.2.44.7 — modes below this frequency are checked (Hz). */
  triggerHz: number;
  points: LateralPoint[];
  /** Modes in the lock-in check with no D to plot, with the reason. */
  notPlotted: { modeLabel: string; reason: string }[];
}

/** SPEC §3 item 5 — Figure NA.11 boundary with each mode's (f, D). Null if not relevant. */
export function lateralChartData(r: CheckResult): LateralChartData | null {
  if (r.lateral.length === 0) return null;
  const points: LateralPoint[] = [];
  const notPlotted: LateralChartData['notPlotted'] = [];
  for (const l of r.lateral) {
    const modeLabel = lockInModeLabel(r, l);
    if (l.D !== null) {
      points.push({ modeLabel, f: l.f, D: l.D, status: l.status });
    } else if (l.status === 'NO-CROWD') {
      notPlotted.push({ modeLabel, reason: 'No crowd (ρ = 0), so D is not defined.' });
    } else {
      notPlotted.push({ modeLabel, reason: l.message ?? 'D could not be calculated.' });
    }
  }
  return {
    boundary: boundaryData.boundary.points,
    reliableRangeHz: RELIABLE_RANGE_HZ,
    triggerHz: LOCK_IN_TRIGGER_HZ,
    points,
    notPlotted,
  };
}
