// Calc sheet content (SPEC §7) as display strings. Pure, no DOM, no PDF library.
// Values awaiting digitised code data are printed as "awaiting", never blank or invented.

import type { CheckResult, LoadCaseResult, ModeResult } from '../engine/check';
import { K1, K2 } from '../engine/limits';
import { JOGGING, WALKING } from '../engine/loads';
import { fixed } from '../share/format';
import type { FormValues } from '../share/form-values';
import {
  CALC_SHEET_FOOTER,
  CROWD_SIGMA_NOTE,
  CLASS_LABELS,
  FLAG_WORD,
  K1_LABELS,
  K2_LABELS,
  OUT_OF_SCOPE,
  PD6688_NOTES,
  SCREENING_NOTICE,
  STATUS_TEXT,
  VERIFY_NOTICE,
  caseLabel,
  chartNotes,
  type ChartNote,
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

export interface ReportModel {
  header: { project: string; bridge: string; date: string; toolVersion: string; commit: string };
  status: {
    word: string;
    detail: string;
    governing: string | null;
    missing: string | null;
    notes: string[];
  };
  inputErrors: string[];
  inputs: ReportTable;
  method: { text: string; clause: string }[];
  modes: ReportTable;
  comfort: ReportTable;
  cases: ReportTable;
  charts: ChartNote[];
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
      text: 'Beam mode: fn = (n²π / 2L²)·sqrt(EI/m), M = mL/2, φ = sin(nπx/L) scaled to max |φ| = 1. Modes below 8 Hz kept. Modal mode: f, M, ξ entered from FE.',
      clause: 'SPEC §2.1',
    },
    {
      text: 'Effective span Seff = (area enclosed by |φ| along the span) / (0.634·max|φ|); λ = 0.634·Seff/S.',
      clause: 'NA.2.44.4, Figure NA.7; NA.2.44.5',
    },
    {
      text: `Group: pulsating force F₀·k(f)·sqrt(1 + γ(N − 1))·sin(2πft) crossing the span at speed v. Walking F₀ = ${WALKING.F0} N, v = ${WALKING.v} m/s; jogging F₀ = ${JOGGING.F0} N, v = ${JOGGING.v} m/s. Single-mode response by RK4, dt = 1/(200f); peak at the antinode.`,
      clause: 'NA.2.44.4, Table NA.8; SPEC §2.5',
    },
    {
      text: `Crowd: w = 1.8·(F₀/A)·k(f)·sqrt(γN/λ)·sin(2πft) following the sign of the mode shape, N = ρ·S·b with ρ capped at 1.0, walking only. Steady-state a = P₀/(2ξM). [VERIFY] equation form. The NA notes this may be conservative. ${CROWD_SIGMA_NOTE}`,
      clause: 'NA.2.44.5; Table NA.7; SPEC §2.6; PD 6688-2 §A.3',
    },
    {
      text: 'Comfort limit a_limit = 1.0·k1·k2·k3·k4, kept between 0.5 and 2.0 m/s².',
      clause: 'NA.2.44.6, Tables NA.9–NA.11',
    },
    {
      text: 'k(f) and γ are read from digitised Figures NA.8 and NA.9. These are not yet in the tool, so results that need them are shown as "awaiting".',
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
            `${fixed(c.aLimit, 3)} m/s²${c.clamped ? (c.clamped === 'lower' ? ' (raised to 0.5)' : ' (reduced to 2.0)') : ''}`,
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
  const value = (v: number | null, d: number): ReportCell =>
    inactive ? cell('–') : v === null ? awaiting() : cell(fixed(v, d));

  const N = c.N === null ? '–' : c.kind === 'crowd' ? fixed(c.N, 1) : fixed(c.N, 0);
  const gamma = !c.gammaNeeded ? cell('not needed (N = 1)') : value(c.gamma, 3);

  let result: ReportCell;
  switch (c.status) {
    case 'computed':
      result = c.verdict ? cell(c.verdict, { verdict: c.verdict }) : cell('no limit');
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
    value(c.aPeak, 3),
    cell(fixed(c.aLimit ?? r.comfort?.aLimit, 3)),
    c.status === 'computed' && c.utilisation === null
      ? cell('needs limit')
      : value(c.utilisation, 2),
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
        ? 'No load cases: choose a bridge class, and enter at least one vertical mode.'
        : 'Group force is the moving point-force amplitude. Crowd force is the modal force P₀.',
  };
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
        ? `${gMode}, ${g.label.toLowerCase()}${g.verify ? ' [VERIFY]' : ''}: utilisation ${fixed(g.utilisation, 2)}`
        : null,
      missing: result.missingInputs.length
        ? `Still needed: ${result.missingInputs.join(', ')}.`
        : null,
      notes: result.statusNotes,
    },
    inputErrors: result.inputErrors,
    inputs: inputsTable(values, result),
    method: methodLines(),
    modes: modesTable(result),
    comfort: comfortTable(result),
    cases: casesTable(result),
    charts: result.inputErrors.length ? [] : chartNotes(result),
    flags: result.flags.map((f) => ({
      level: FLAG_WORD[f.level],
      text: f.message,
      clause: f.clause ?? '',
    })),
    limitations: [
      SCREENING_NOTICE,
      VERIFY_NOTICE,
      ...PD6688_NOTES,
      ...OUT_OF_SCOPE.map((t) => `Not covered: ${t}`),
    ],
    footer: CALC_SHEET_FOOTER,
  };
  return sanitise(model);
}
