// Wording shared by the results page and the calc sheet, so the two always say the same thing.

import type {
  CheckResult,
  Flag,
  LateralCheckResult,
  LoadCaseResult,
  OverallStatus,
} from '../engine/check';
import { PEDESTRIAN_MASS, RELIABLE_RANGE_HZ } from '../engine/lateral';
import type { K1Key, K2Key } from '../engine/limits';
import type { BridgeClass } from '../engine/loads';

/** Case name as shown on the page and calc sheet; unverified methods carry [VERIFY]. */
export function caseLabel(c: LoadCaseResult): string {
  return c.verify ? `${c.label} [VERIFY]` : c.label;
}

/** Text for a utilisation that has no value: why it is missing. */
export function missingUtilisationText(c: LoadCaseResult): string {
  return c.status === 'computed' ? 'needs limit' : 'awaiting';
}

export const STATUS_TEXT: Record<OverallStatus, { word: string; detail: string }> = {
  PASS: { word: 'PASS', detail: 'Every load case is within the comfort limit.' },
  FAIL: {
    word: 'FAIL',
    detail:
      'At least one load case exceeds the comfort limit, or a lateral mode may be unstable (NA.2.44.7).',
  },
  AWAITING: {
    word: 'AWAITING DATA',
    detail:
      'Peak accelerations need k(f) (Figure NA.8) and γ (Figure NA.9), which were not supplied for this run, so no PASS or FAIL can be given. Everything else is calculated.',
  },
  INCOMPLETE: {
    word: 'INCOMPLETE',
    detail: 'Some results cannot be shown yet. See the notes.',
  },
  'INPUT-ERROR': { word: 'CHECK INPUTS', detail: 'Some inputs are not valid.' },
};

export const FLAG_WORD: Record<Flag['level'], string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
};

/** Shortened descriptions (SPEC §2.3, §2.7). Check the NA for the full wording. */
export const CLASS_LABELS: Record<BridgeClass, string> = {
  A: 'A: rural, seldom used',
  B: 'B: suburban, occasional variation in use',
  C: 'C: urban route, significant daily variation',
  D: 'D: primary access to stadia or major transport',
};

export const K1_LABELS: Record<K1Key, string> = {
  hospital: 'Primary route for hospitals or other high-sensitivity users',
  school: 'Primary route for a school',
  stadia: 'Primary route for sports stadia or other high-usage routes',
  urban: 'Major urban centre',
  suburban: 'Suburban crossing',
  rural: 'Rural environment',
};

export const K2_LABELS: Record<K2Key, string> = {
  sole: 'Sole means of access',
  primary: 'Primary route',
  alternative: 'Alternative routes readily available',
};

export const SCREENING_NOTICE =
  'This tool is a screening and checking aid. It is not a substitute for a designer’s judgement or a full dynamic analysis. Verify against NA+A1:2020 to BS EN 1991-2 and the project requirements.';

/** What has been checked against the current NA, shown with the limitations. */
export const METHOD_CHECK_NOTICE =
  'The method has been checked by the author against NA+A1:2020 to BS EN 1991-2: the group and crowd load equations, Tables NA.7 to NA.11, the frequency triggers and the lateral stability parameter D. Figures NA.8, NA.9 and NA.11 were digitised from it and the digitised points were checked by overlaying them on the source figures. The overlay images are not published because they contain BSI figures.';

/** Guidance from PD 6688-2:2011 (SPEC §2.4, §2.8), shown with the limitations. */
export const PD6688_NOTES: readonly string[] = [
  'Do not add pedestrian damping when checking lateral stability (PD 6688-2 §A.1).',
  'For a deck whose mass varies along the span, use the lowest deck mass per metre in the lateral stability parameter D (PD 6688-2 §A.7).',
  'Agree the value of γ for each project (PD 6688-2 §3.20).',
];

/** PD 6688-2 §A.3 — response level the crowd model aims at (SPEC §2.6). */
export const CROWD_SIGMA_NOTE =
  'The NA crowd model is set to give a 2.5σ response (2.5 standard deviations); the Sétra guide uses 4σ (PD 6688-2 §A.3).';

/** SPEC §1.3 — out of scope for v1. */
export const OUT_OF_SCOPE: readonly string[] = [
  'Lateral and torsional accelerations, which NA+A1:2020 (NA.2.44.3, NA.2.44.6(3)) requires from the same load models and limits to 0.2 m/s² for modes below 2.5 Hz.',
  'Multi-span, continuous, cable-stayed and suspension bridges in beam mode (use modal mode with FE results).',
  'Closely spaced modes (NA.2.44.3 calls for more detailed analysis).',
  'Mass gatherings, deliberate synchronisation and vandal loading (excluded by NA.2.44.1).',
  'Human–structure interaction, and added pedestrian mass or damping.',
  'Wind, and any loading other than pedestrians.',
];

/** SPEC §7 item 7 — footer on every page of the calc sheet. */
export const CALC_SHEET_FOOTER =
  'Screening tool. Verify against NA+A1:2020 to BS EN 1991-2 and project requirements. Not a substitute for engineering judgement.';

export interface ChartNote {
  title: string;
  clause: string;
  status: 'not-drawn';
  note: string;
}

/** Status shown for a chart that is not drawn yet. */
export const CHART_NOT_DRAWN = 'not drawn in this version';

/** Chart panels (SPEC §3). The charts themselves are not drawn in this version. */
export function chartNotes(r: CheckResult): ChartNote[] {
  const charts: ChartNote[] = [
    {
      title: 'Acceleration time history, governing group case',
      clause: 'NA.2.44.4',
      status: 'not-drawn',
      note: 'The peak accelerations are in the load case table.',
    },
    {
      title: 'k(f) with this bridge’s frequencies',
      clause: 'Figure NA.8',
      status: 'not-drawn',
      note: 'The k(f) values used are in the load case table.',
    },
  ];
  if (r.lateral.length > 0) {
    charts.push({
      title: 'Lateral stability boundary',
      clause: 'NA.2.44.7, Figure NA.11',
      status: 'not-drawn',
      note: 'Each mode’s (f, D) point and the boundary D at that frequency are in the lateral stability table.',
    });
  }
  return charts;
}

/** Lateral lock-in result in words (never colour only). */
export const LOCK_IN_WORD: Record<LateralCheckResult['status'], string> = {
  STABLE: 'STABLE',
  UNSTABLE: 'UNSTABLE',
  'NO-CROWD': 'NO CROWD',
  'OUTSIDE-FIGURE': 'CANNOT ASSESS',
  'needs-input': 'NEEDS INPUT',
};

/** Method summary for the lateral lock-in check (NA.2.44.7; SPEC §2.8). */
export const LOCK_IN_METHOD = `Lateral lock-in, for lateral modes below 1.5 Hz: D = m_bridge·ξ/m_pedestrian, with m_pedestrian = ρ·b·${PEDESTRIAN_MASS} kg/m and ρ from Table NA.7 (not capped). ξ is the structural damping ratio; no pedestrian damping is added (PD 6688-2 §A.1). For a deck whose mass varies along the span, m_bridge is the lowest mass per metre (PD 6688-2 §A.7). D above the Figure NA.11 boundary: stable. On or below it: divergent lateral response may occur.`;

/** Figure NA.11 note on the frequency range covered by test data. */
export const LOCK_IN_RANGE_NOTE = `Figure NA.11 is based on test data from ${RELIABLE_RANGE_HZ[0]} to ${RELIABLE_RANGE_HZ[1]} Hz. Outside that range the boundary is theoretical: use the result with caution.`;

/** Notes printed under the lateral stability table: method notes, then per-mode messages. */
export function lockInNotes(r: CheckResult): string[] {
  const label = (id: string) => r.modes.find((m) => m.id === id)?.label ?? id;
  return [
    LOCK_IN_METHOD,
    LOCK_IN_RANGE_NOTE,
    ...r.lateral.flatMap((l) => (l.message ? [`${label(l.modeId)}: ${l.message}`] : [])),
    ...r.lateral.flatMap((l) => (l.caution ? [`${label(l.modeId)}: ${l.caution}`] : [])),
  ];
}
