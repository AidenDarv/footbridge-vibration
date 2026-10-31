// Chart data for the results page (SPEC §3 items 3–5). Selection and pass-through only: every
// number comes from the engine result or the digitised data files, never from new maths here.
// Curves are drawn from our own digitised points, never from images of the BSI figures.

import type { CheckResult, LateralCheckResult, LoadCaseResult } from '../engine/check';
import kData from '../data/k_fv.json';
import boundaryData from '../data/lateral_boundary.json';
import {
  BOUNDARY_READING_ACCURACY,
  LOCK_IN_TRIGGER_HZ,
  RELIABLE_RANGE_HZ,
} from '../engine/lateral';
import { READING_ACCURACY } from '../engine/lookup';
import { fixed } from './format';
import { LOCK_IN_WORD, caseLabel, lockInModeLabel } from './wording';

type Points = readonly (readonly number[])[];

/**
 * The group case drawn in the time-history chart. The engine chooses it (governingGroupCase in
 * engine/check.ts) and records the history for that case only, so it is the case with a history.
 */
export function governingGroupCase(r: CheckResult): LoadCaseResult | null {
  return r.cases.find((c) => c.history !== undefined && c.aPeak !== null) ?? null;
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
      reason =
        r.vertical.required === false
          ? 'No vertical mode below 8 Hz to show, so there is no group case to plot.'
          : 'No vertical modes, so there is no group case to plot.';
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

/**
 * Fewer points for drawing a long time history (the calc sheet). Selection only: the history
 * is split into `buckets` equal runs of samples and the smallest and largest sample of each run
 * are kept in time order, so every peak, including the overall peak, is drawn.
 */
export function thinHistory(
  h: { t: number[]; a: number[] },
  buckets: number,
): { t: number[]; a: number[] } {
  const n = h.t.length;
  if (n <= 2 * buckets) return { t: [...h.t], a: [...h.a] };
  const t: number[] = [];
  const a: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * n) / buckets);
    const end = Math.floor(((b + 1) * n) / buckets);
    let lo = start;
    let hi = start;
    for (let i = start; i < end; i++) {
      if ((h.a[i] as number) < (h.a[lo] as number)) lo = i;
      if ((h.a[i] as number) > (h.a[hi] as number)) hi = i;
    }
    for (const i of lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo]) {
      t.push(h.t[i] as number);
      a.push(h.a[i] as number);
    }
  }
  return { t, a };
}

/** Written summary of the time-history chart (also its text alternative). */
export function timeHistorySummary(d: Extract<TimeHistoryChartData, { kind: 'ready' }>): string {
  const limit =
    d.aLimit === null
      ? 'No a_limit lines: enter k1, k2 and the height to get the comfort limit.'
      : `Dashed lines: ±a_limit = ${fixed(d.aLimit, 3)} m/s²` +
        (d.utilisation === null ? '.' : `, utilisation ${fixed(d.utilisation, 2)}.`);
  return `${d.modeLabel}, ${d.caseLabel.toLowerCase()} crossing the span. Antinode acceleration, peak ${fixed(d.aPeak, 3)} m/s². ${limit}`;
}

/** Written summary of the k(f) chart. */
export function kChartSummary(k: KChartData): string {
  const marks = k.markers
    .map((mk) => {
      const parts = [
        mk.kWalking === null ? null : `walking k = ${fixed(mk.kWalking, 3)}`,
        mk.kJogging === null ? null : `jogging k = ${fixed(mk.kJogging, 3)}`,
      ].filter((x) => x !== null);
      return `${mk.modeLabel} at ${fixed(mk.f, 3)} Hz${parts.length ? ` (${parts.join(', ')})` : ''}`;
    })
    .join('; ');
  return `Walking and jogging curves as digitised from Figure NA.8 (reading accuracy ${READING_ACCURACY.k}). Dashed lines: ${marks}.`;
}

/** Written summary of the lateral stability chart. */
export function lateralChartSummary(lat: LateralChartData): string {
  const pts = lat.points
    .map(
      (p) =>
        `${p.modeLabel}: f = ${fixed(p.f, 3)} Hz, D = ${fixed(p.D, 4)}, ${LOCK_IN_WORD[p.status]}`,
    )
    .join('; ');
  return `Boundary as digitised from Figure NA.11 (reading accuracy ${BOUNDARY_READING_ACCURACY}); shaded band: test-data range ${lat.reliableRangeHz[0]}–${lat.reliableRangeHz[1]} Hz. ${pts}. Above the line is stable; on or below it, divergent lateral response may occur.`;
}

/** Why each lateral mode in the lock-in check is not on the chart. */
export function lateralNotPlotted(lat: LateralChartData): string[] {
  return lat.notPlotted.map((n) => `${n.modeLabel} not plotted: ${n.reason}`);
}
