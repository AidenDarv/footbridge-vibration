// Calc sheet content (SPEC §7) as display strings. Pure, no DOM, no PDF library.
// Values awaiting digitised code data are printed as "awaiting", never blank or invented.

import type { CheckResult, LoadCaseResult, ModeResult } from '../engine/check';
import { K1, K2 } from '../engine/limits';
import { JOGGING, WALKING } from '../engine/loads';
import { BOUNDARY_READING_ACCURACY } from '../engine/lateral';
import { READING_ACCURACY } from '../engine/lookup';
import {
  kChartData,
  kChartSummary,
  lateralChartData,
  lateralChartSummary,
  lateralNotPlotted,
  thinHistory,
  timeHistoryChartData,
  timeHistorySummary,
  type KChartData,
  type LateralChartData,
  type TimeHistoryChartData,
} from '../share/charts';
import { accelText, fixed, limitText, utilText } from '../share/format';
import type { FormValues } from '../share/form-values';
import {
  CALC_SHEET_FOOTER,
  CROWD_SIGMA_NOTE,
  CLASS_LABELS,
  FLAG_WORD,
  INFO_ONLY_WORD,
  K1_LABELS,
  K2_LABELS,
  OUT_OF_SCOPE,
  PD6688_NOTES,
  SCREENING_NOTICE,
  SERVICEABILITY_ONLY_NOTICE,
  STATUS_TEXT,
  METHOD_CHECK_NOTICE,
  LOCK_IN_METHOD,
  LOCK_IN_WORD,
  caseLabel,
  lockInModeLabel,
  lockInNotes,
} from '../share/wording';

/** Characters missing from the embedded Noto Sans font, with printable replacements. */
const REPLACEMENTS: [string, string][] = [
  ['≤', '<='],
  ['≥', '>='],
  ['√', 'sqrt'],
  ['→', '->'],
  ['≈', '~'],
  ['∫', 'integral of '],
];
export const PDF_UNSUPPORTED = REPLACEMENTS.map(([ch]) => ch);

export function pdfSafe(text: string): string {
  let out = text;
  for (const [ch, rep] of REPLACEMENTS) out = out.split(ch).join(rep);
  return out;
}

export interface ReportCell {
  text: string;
  /** Waiting for digitised code data. */
  awaiting?: boolean;
  /** A user override of a Table NA.7 value (printed in red). */
  override?: boolean;
  verdict?: 'PASS' | 'FAIL';
}

export interface ReportTable {
  title: string;
  clause: string;
  head: string[];
  rows: ReportCell[][];
  note?: string;
}

/** Number of buckets when thinning the time history for drawing: at most 2 points each. */
export const HISTORY_BUCKETS = 400;

/** A chart for the calc sheet (SPEC §7 item 5), with its written summary. */
export type ReportChart = { title: string; clause: string; caption: string } & (
  | { kind: 'time-history'; data: Extract<TimeHistoryChartData, { kind: 'ready' }> }
  | { kind: 'k'; data: KChartData }
  | { kind: 'lateral'; data: LateralChartData }
  | { kind: 'empty' }
);

export interface ReportModel {
  header: { project: string; bridge: string; date: string; toolVersion: string; commit: string };
  status: {
    word: string;
    detail: string;
    governing: string | null;
    missing: string | null;
    notes: string[];
    /** Information that does not change the status. */
    info: string[];
  };
  inputErrors: string[];
  inputs: ReportTable;
  method: { text: string; clause: string }[];
  modes: ReportTable;
  comfort: ReportTable;
  cases: ReportTable;
  /** Lateral lock-in check (NA.2.44.7), or null when no lateral mode is below 1.5 Hz. */
  lateral: ReportTable | null;
  charts: ReportChart[];
  flags: { level: string; text: string; clause: string }[];
  limitations: string[];
  footer: string;
}

export interface ReportInput {
  values: FormValues;
  result: CheckResult;
  date: Date;
  version: string;
  commit: string;
}

const AWAITING_TEXT = 'awaiting';
const cell = (text: string, extra: Partial<ReportCell> = {}): ReportCell => ({ text, ...extra });
const awaiting = (): ReportCell => ({ text: AWAITING_TEXT, awaiting: true });
const typed = (raw: string) => (raw.trim() === '' ? 'not entered' : raw.trim());

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inputsTable(v: FormValues, r: CheckResult): ReportTable {
  const rows: ReportCell[][] = [];
  const row = (item: string, value: ReportCell | string, unit: string, source: string) =>
    rows.push([
      cell(item),
      typeof value === 'string' ? cell(value) : value,
      cell(unit),
      cell(source),
    ]);

  row(
    'Input mode',
    v.inputMode === 'beam' ? 'Beam (simply supported)' : 'Modal (from FE)',
    '',
    'SPEC §2.1',
  );
  row('Span S', typed(v.L), 'm', '');
  row('Deck width b', typed(v.b), 'm', '');
  row('Height above ground', typed(v.height), 'm', 'for k3, Table NA.11');
  if (v.inputMode === 'beam') {
    row('Bending stiffness EI', typed(v.EI), 'N·m²', '');
    row('Mass per metre m', typed(v.m), 'kg/m', 'incl. permanent and superimposed dead load');
    row('Damping ratio ξ', typed(v.damping), '%', '');
  } else {
    row('Modes', `${v.modes.length} entered`, '', 'see Modal properties');
    row(
      'Lowest deck mass per metre',
      typed(v.mBridgeMin),
      'kg/m',
      'm_bridge in D, NA.2.44.7; lowest value for a non-uniform deck, PD 6688-2 §A.7',
    );
  }

  row(
    'Bridge class',
    v.bridgeClass ? CLASS_LABELS[v.bridgeClass] : 'not chosen',
    '',
    'NA.2.44.2, Table NA.7',
  );
  row(
    'Jogging cases',
    v.includeJogging ? 'Included' : 'Excluded for this project',
    '',
    'NA.2.44.2(3)',
  );

  const u = r.usage;
  if (u) {
    const overridden = new Map(u.overrides.map((o) => [o.field, o.tableValue]));
    const usageRow = (
      item: string,
      field: 'groupWalking' | 'groupJogging' | 'crowdDensity',
      value: number,
      unit: string,
    ) => {
      const tableValue = overridden.get(field);
      const isOverride = tableValue !== undefined;
      row(
        item,
        cell(String(value), { override: isOverride }),
        unit,
        isOverride ? `OVERRIDE, Table NA.7 value ${tableValue} (NA.2.44.2(2))` : 'Table NA.7',
      );
    };
    usageRow('Walking group N', 'groupWalking', u.nWalking, '');
    if (u.includeJogging) usageRow('Jogging group N', 'groupJogging', u.nJogging, '');
    usageRow('Crowd density ρ', 'crowdDensity', u.rhoInput, 'persons/m²');
    if (u.rhoUsed !== u.rhoInput) {
      row(
        'Crowd density used in load',
        String(u.rhoUsed),
        'persons/m²',
        'capped at 1.0, NA.2.44.5',
      );
    }
  }

  const c = r.comfort;
  row(
    'k1 site usage',
    c ? fixed(c.k1, 1) : v.k1 ? fixed(K1[v.k1], 1) : 'not chosen',
    '',
    v.k1 ? `Table NA.9: ${K1_LABELS[v.k1]}` : 'Table NA.9',
  );
  row(
    'k2 route redundancy',
    c ? fixed(c.k2, 1) : v.k2 ? fixed(K2[v.k2], 1) : 'not chosen',
    '',
    v.k2 ? `Table NA.10: ${K2_LABELS[v.k2]}` : 'Table NA.10',
  );
  if (c) row('k3 structure height', fixed(c.k3, 1), '', 'Table NA.11, from height');
  row(
    'k4 exposure',
    c ? fixed(c.k4, 2) : typed(v.k4),
    '',
    v.k4Justification.trim()
      ? `NA.2.44.6. Justification: ${v.k4Justification.trim()}`
      : 'NA.2.44.6',
  );

  return { title: 'Inputs', clause: '', head: ['Item', 'Value', 'Unit', 'Source / note'], rows };
}

function methodLines(): { text: string; clause: string }[] {
  return [
    {
      text: 'Beam mode: fn = (n²π / 2L²)·sqrt(EI/m), M = mL/2, φ = sin(nπx/L) scaled to max |φ| = 1. Modes kept if below 8 Hz when rounded to 0.001 Hz, as printed. Modal mode: f, M, ξ entered from FE.',
      clause: 'SPEC §2.1',
    },
    {
      text: 'Vertical comfort check required only if the fundamental vertical frequency is below 5 Hz; otherwise NOT REQUIRED, with any accelerations for information only. Lateral and torsional checks still apply.',
      clause: 'NA+A1:2020, NA.2.44.6(1); SPEC §2.10',
    },
    {
      text: 'Effective span Seff = (area enclosed by |φ| along the span) / (0.637·max|φ|); λ = 0.637·Seff/S.',
      clause: 'NA+A1:2020, NA.2.44.4, Figure NA.7; NA.2.44.5',
    },
    {
      text: `Group: pulsating force F₀·k(f)·sqrt(1 + γ(N − 1))·sin(2πft) crossing the span at speed v. Walking F₀ = ${WALKING.F0} N, v = ${WALKING.v} m/s; jogging F₀ = ${JOGGING.F0} N, v = ${JOGGING.v} m/s. Single-mode response by RK4, dt = 1/(200f); peak at the antinode.`,
      clause: 'NA.2.44.4, Table NA.8; SPEC §2.5',
    },
    {
      text: `Crowd: w = 1.8·(F₀/A)·k(f)·sqrt(γN/λ)·sin(2πft) following the sign of the mode shape, N = ρ·S·b with ρ capped at 1.0, walking only. Steady-state a = P₀/(2ξM). The NA notes this may be conservative. ${CROWD_SIGMA_NOTE}`,
      clause: 'NA.2.44.5; Table NA.7; SPEC §2.6; PD 6688-2 §A.3',
    },
    {
      text: 'Comfort limit a_limit = 1.0·k1·k2·k3·k4, kept between 0.5 and 2.0 m/s².',
      clause: 'NA.2.44.6, Tables NA.9–NA.11',
    },
    {
      text: `${LOCK_IN_METHOD} The boundary is read from Figure NA.11 as digitised by the author (reading accuracy ${BOUNDARY_READING_ACCURACY}), linear in f.`,
      clause: 'NA.2.44.7, Figure NA.11; PD 6688-2 §A.1, §A.7',
    },
    {
      text: `k(f) and γ are read from Figures NA.8 and NA.9 as digitised by the author (reading accuracy ${READING_ACCURACY.k}, ${READING_ACCURACY.gamma}). k(f) is linear in f and zero outside the figure. γ is linear in δ and Seff for groups and linear in δ for crowds, held at the figure limits with a warning. The digitising was checked by overlaying the points on the source figures; the overlay images are not published because they contain BSI figures. PD 6688-2 §3.20 recommends agreeing γ for each project.`,
      clause: 'NA.2.44.4, Figures NA.8, NA.9',
    },
  ];
}

function modesTable(r: CheckResult): ReportTable {
  const shape = (m: ModeResult) =>
    m.shape === 'sine'
      ? `sin(${m.n === 1 ? '' : m.n}πx/S)`
      : m.shape === 'user-seff'
        ? 'Seff entered'
        : m.shape;
  return {
    title: 'Modal properties',
    clause: 'SPEC §2.1–2.2; NA.2.44.4 Figure NA.7',
    head: ['Mode', 'Direction', 'f (Hz)', 'M (kg)', 'ξ (%)', 'δ', 'Shape', 'Seff (m)', 'λ'],
    rows: r.modes.map((m) => [
      cell(m.label),
      cell(m.direction),
      cell(fixed(m.f, 3)),
      cell(fixed(m.M, 0)),
      cell(fixed(m.zeta * 100, 2)),
      cell(fixed(m.delta, 4)),
      cell(shape(m)),
      cell(fixed(m.Seff, 2)),
      cell(fixed(m.lambda_, 4)),
    ]),
    note: 'Mode shapes scaled to max |φ| = 1; M is the modal mass for that scaling. δ = 2πξ.',
  };
}

function comfortTable(r: CheckResult): ReportTable {
  const c = r.comfort;
  const rows: ReportCell[][] = c
    ? [
        [cell('1.0·k1·k2·k3·k4'), cell(`${fixed(c.raw, 3)} m/s²`)],
        [
          cell('a_limit (0.5 to 2.0 m/s²)'),
          cell(
            `${limitText(c.aLimit)} m/s²${c.clamped ? (c.clamped === 'lower' ? ' (raised to 0.5)' : ' (reduced to 2.0)') : ''}`,
          ),
        ],
      ]
    : [[cell('a_limit'), cell('not available: choose k1, k2 and enter the height')]];
  return { title: 'Comfort limit', clause: 'NA.2.44.6', head: ['Item', 'Value'], rows };
}

function caseRow(r: CheckResult, c: LoadCaseResult): ReportCell[] {
  const mode = r.modes.find((m) => m.id === c.modeId)?.label ?? c.modeId;
  const inactive =
    c.status === 'not-applicable' || c.status === 'blocked' || c.status === 'needs-input';
  const value = (v: number | null, d: number | ((x: number) => string)): ReportCell =>
    inactive
      ? cell('–')
      : v === null
        ? awaiting()
        : cell(typeof d === 'number' ? fixed(v, d) : d(v));

  const N = c.N === null ? '–' : c.kind === 'crowd' ? fixed(c.N, 1) : fixed(c.N, 0);
  const gamma = !c.gammaNeeded ? cell('not needed (N = 1)') : value(c.gamma, 3);

  let result: ReportCell;
  switch (c.status) {
    case 'computed':
      result = c.informationOnly
        ? cell(INFO_ONLY_WORD)
        : c.verdict
          ? cell(c.verdict, { verdict: c.verdict })
          : cell('no limit');
      break;
    case 'awaiting-data':
      result = { text: 'AWAITING', awaiting: true };
      break;
    case 'blocked':
      result = cell('NOT RUN');
      break;
    case 'needs-input':
      result = cell('NEEDS INPUT');
      break;
    case 'not-applicable':
      result = cell('N/A');
      break;
  }

  return [
    cell(mode),
    cell(caseLabel(c)),
    cell(N),
    value(c.k, 3),
    gamma,
    value(c.forceAmplitude, 1),
    value(c.aPeak, accelText),
    cell(limitText(c.aLimit ?? r.comfort?.aLimit)),
    c.status === 'computed' && c.utilisation === null
      ? cell('needs limit')
      : value(c.utilisation, utilText),
    result,
  ];
}

function casesTable(r: CheckResult): ReportTable {
  return {
    title: 'Load cases',
    clause: 'NA.2.44.4–NA.2.44.5',
    head: [
      'Mode',
      'Case',
      'N',
      'k(f)',
      'γ',
      'Force (N)',
      'a_peak (m/s²)',
      'a_limit (m/s²)',
      'Util.',
      'Result',
    ],
    rows: r.cases.map((c) => caseRow(r, c)),
    note:
      r.cases.length === 0
        ? r.vertical.required === false
          ? 'No load cases: no vertical mode below 8 Hz to show, and the vertical comfort check is not required (NA.2.44.6(1)).'
          : 'No load cases: choose a bridge class, and enter at least one vertical mode.'
        : 'Group force is the moving point-force amplitude. Crowd force is the modal force P₀.' +
          (r.vertical.required === false
            ? ' The vertical comfort check is not required (NA.2.44.6(1)): accelerations are for information only.'
            : ''),
  };
}

function lateralTable(r: CheckResult): ReportTable | null {
  if (r.lateral.length === 0) return null;
  const rows = r.lateral.map((l): ReportCell[] => {
    const mode = lockInModeLabel(r, l);
    const verdict = l.status === 'STABLE' ? 'PASS' : l.status === 'UNSTABLE' ? 'FAIL' : undefined;
    const D =
      l.status === 'NO-CROWD' ? 'not defined' : l.status === 'needs-input' ? '–' : fixed(l.D, 4);
    const boundary =
      l.status === 'OUTSIDE-FIGURE'
        ? 'cannot be read'
        : l.status === 'NO-CROWD' || l.status === 'needs-input'
          ? '–'
          : fixed(l.DBoundary, 3);
    return [
      cell(mode),
      cell(fixed(l.f, 3)),
      cell(fixed(l.mBridge, 0)),
      cell(fixed(l.zeta * 100, 2)),
      cell(l.rho === null ? '–' : String(l.rho)),
      cell(fixed(l.b, 2)),
      cell(fixed(l.mPedestrian, 1)),
      cell(D),
      cell(boundary),
      cell(LOCK_IN_WORD[l.status], verdict ? { verdict } : {}),
    ];
  });
  return {
    title: 'Lateral stability (lock-in)',
    clause: 'NA.2.44.7, Figure NA.11',
    head: [
      'Mode',
      'f (Hz)',
      'm_bridge (kg/m)',
      'ξ (%)',
      'ρ (persons/m²)',
      'b (m)',
      'm_ped (kg/m)',
      'D',
      'Boundary D',
      'Result',
    ],
    rows,
    note: lockInNotes(r).join(' '),
  };
}

/** Charts for the calc sheet: the same data and summaries as the results page. */
function reportCharts(r: CheckResult): ReportChart[] {
  const charts: ReportChart[] = [];
  const th = timeHistoryChartData(r);
  const thHead = { title: 'Acceleration time history, governing group case', clause: 'NA.2.44.4' };
  charts.push(
    th.kind === 'ready'
      ? {
          ...thHead,
          kind: 'time-history',
          caption: timeHistorySummary(th),
          data: { ...th, ...thinHistory({ t: th.t, a: th.a }, HISTORY_BUCKETS) },
        }
      : { ...thHead, kind: 'empty', caption: th.reason },
  );

  const k = kChartData(r);
  const kHead = { title: 'k(f) with this bridge’s vertical modes', clause: 'Figure NA.8' };
  charts.push(
    k.markers.length > 0
      ? { ...kHead, kind: 'k', caption: kChartSummary(k), data: k }
      : {
          ...kHead,
          kind: 'empty',
          caption:
            r.vertical.required === false
              ? 'No vertical mode below 8 Hz to mark.'
              : 'No vertical modes to mark.',
        },
  );

  const lat = lateralChartData(r);
  if (lat) {
    const latHead = { title: 'Lateral stability boundary', clause: 'NA.2.44.7, Figure NA.11' };
    const notPlotted = lateralNotPlotted(lat);
    charts.push(
      lat.points.length > 0
        ? {
            ...latHead,
            kind: 'lateral',
            caption: [lateralChartSummary(lat), ...notPlotted].join(' '),
            data: lat,
          }
        : { ...latHead, kind: 'empty', caption: notPlotted.join(' ') },
    );
  }
  return charts;
}

/** Deep copy with pdfSafe applied to every string. */
function sanitise<T>(x: T): T {
  if (typeof x === 'string') return pdfSafe(x) as T;
  if (Array.isArray(x)) return x.map(sanitise) as T;
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sanitise(v)])) as T;
  }
  return x;
}

export function buildReport({ values, result, date, version, commit }: ReportInput): ReportModel {
  const s = STATUS_TEXT[result.status];
  const g = result.governing;
  const gMode = g ? result.modes.find((m) => m.id === g.modeId)?.label : null;

  const model: ReportModel = {
    header: {
      project: values.project.trim() || 'not entered',
      bridge: values.name.trim() || 'not entered',
      date: isoDate(date),
      toolVersion: version,
      commit,
    },
    status: {
      word: s.word,
      detail: s.detail,
      governing: g
        ? `${gMode}, ${g.label.toLowerCase()}${g.verify ? ' [VERIFY]' : ''}: utilisation ${utilText(g.utilisation)}`
        : null,
      missing: result.missingInputs.length
        ? `Still needed: ${result.missingInputs.join(', ')}.`
        : null,
      notes: result.statusNotes,
      info: result.statusInfo,
    },
    inputErrors: result.inputErrors,
    inputs: inputsTable(values, result),
    method: methodLines(),
    modes: modesTable(result),
    comfort: comfortTable(result),
    cases: casesTable(result),
    lateral: lateralTable(result),
    charts: result.inputErrors.length ? [] : reportCharts(result),
    flags: result.flags.map((f) => ({
      level: FLAG_WORD[f.level],
      text: f.message,
      clause: f.clause ?? '',
    })),
    limitations: [
      SCREENING_NOTICE,
      SERVICEABILITY_ONLY_NOTICE,
      METHOD_CHECK_NOTICE,
      ...PD6688_NOTES,
      ...OUT_OF_SCOPE.map((t) => `Not covered: ${t}`),
    ],
    footer: CALC_SHEET_FOOTER,
  };
  return sanitise(model);
}
