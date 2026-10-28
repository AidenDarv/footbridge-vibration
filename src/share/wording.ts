// Wording shared by the results page and the calc sheet, so the two always say the same thing.

import type { CheckResult, Flag, LoadCaseResult, OverallStatus } from '../engine/check';
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
  FAIL: { word: 'FAIL', detail: 'At least one load case exceeds the comfort limit.' },
  AWAITING: {
    word: 'AWAITING DATA',
    detail:
      'Peak accelerations need the digitised code data for k(f) (Figure NA.8) and γ (Figure NA.9). These are not in the tool yet, so no PASS or FAIL can be given. Everything else is calculated.',
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

export const VERIFY_NOTICE =
  'Some parts of the method are not yet verified against the current NA+A1:2020 text, including the crowd load equation, the lateral and torsional frequency triggers and the damper provision threshold. These are marked [VERIFY] where they appear.';

/** SPEC §1.3 — out of scope for v1. */
export const OUT_OF_SCOPE: readonly string[] = [
  'Lateral and torsional accelerations to CD 353 Appendix A, and the lateral lock-in check (NA.2.44.7).',
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
  status: 'awaiting';
  note: string;
}

/** Chart panels. All need digitised NA figures, which are not in the tool yet (SPEC §5). */
export function chartNotes(r: CheckResult): ChartNote[] {
  const charts: ChartNote[] = [
    {
      title: 'Acceleration time history, governing group case',
      clause: 'NA.2.44.4',
      status: 'awaiting',
      note: 'Needs k(f) from Figure NA.8 and γ from Figure NA.9 to find the force.',
    },
    {
      title: 'k(f) with this bridge’s frequencies',
      clause: 'Figure NA.8',
      status: 'awaiting',
      note: 'Needs the digitised Figure NA.8 curves for walking and jogging.',
    },
  ];
  if (r.modes.some((m) => m.direction === 'lateral')) {
    charts.push({
      title: 'Lateral stability boundary',
      clause: 'NA.2.44.7, Figure NA.11',
      status: 'awaiting',
      note: 'The lateral lock-in check is not in this version. It needs the digitised Figure NA.11 boundary.',
    });
  }
  return charts;
}
