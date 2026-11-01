// Plain-English verdict for the result card and the sticky phone bar (design/DESIGN.md §4–5).
// Wording only: every number comes from the engine result and is shown with the existing
// rounding rules (accelText, limitText, utilText). No maths beyond picking what to show.

import type { CaseKind, CheckResult, LoadCaseResult, ModeResult } from '../engine/check';
import { VERTICAL_TRIGGER_HZ } from '../engine/limits';
import { accelText, fixed, limitText, utilText } from './format';
import { STATUS_TEXT, lockInModeLabel } from './wording';

export type VerdictTone = 'pass' | 'fail' | 'neutral';

export interface Verdict {
  tone: VerdictTone;
  /** Status word, as on the calc sheet (PASS, FAIL, CHECK INPUTS…). */
  word: string;
  headline: string;
  sentence: string;
}

/** Bars in "Each load case against the limit" are drawn to this many times a_limit. */
export const BAR_SCALE = 3;

/** People count as written in a sentence: whole numbers without decimals. */
export function people(n: number): string {
  const t = fixed(n, 1);
  return t.endsWith('.0') ? t.slice(0, -2) : t;
}

const KIND_NOUN: Record<CaseKind, string> = {
  'walking-group': 'walking group',
  'jogging-group': 'jogging group',
  crowd: 'crowd',
};

function verticalModes(r: CheckResult): ModeResult[] {
  return r.modes.filter((m) => m.direction === 'vertical');
}

function modeLabel(r: CheckResult, id: string): string {
  return r.modes.find((m) => m.id === id)?.label ?? id;
}

/** "a crowd of 60 people", with the mode named when there is more than one vertical mode. */
function caseSubject(r: CheckResult, c: LoadCaseResult): string {
  const n = c.N === null ? '' : ` of ${people(c.N)} ${c.N === 1 ? 'person' : 'people'}`;
  const on = verticalModes(r).length > 1 ? ` on ${modeLabel(r, c.modeId).toLowerCase()}` : '';
  return `a ${KIND_NOUN[c.kind]}${n}${on}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Walking and jogging groups also exceed it." for the other failing cases. */
function othersSentence(r: CheckResult, g: LoadCaseResult): string {
  const failing = r.cases.filter((c) => c !== g && c.verdict === 'FAIL' && !c.informationOnly);
  if (failing.length === 0) return '';
  const sameMode = failing.filter((c) => c.modeId === g.modeId);
  const kinds = new Set(sameMode.map((c) => c.kind));
  const items: string[] = [];
  if (kinds.has('walking-group') && kinds.has('jogging-group')) {
    items.push('walking and jogging groups');
  } else if (kinds.has('walking-group')) items.push('the walking group');
  else if (kinds.has('jogging-group')) items.push('the jogging group');
  if (kinds.has('crowd')) items.push('the crowd');
  const parts: string[] = [];
  if (items.length > 0) {
    const plural = items.length > 1 || items[0] === 'walking and jogging groups';
    parts.push(`${capital(items.join(' and '))} also ${plural ? 'exceed' : 'exceeds'} it.`);
  }
  if (failing.some((c) => c.modeId !== g.modeId)) {
    parts.push('Load cases on other modes exceed it too.');
  }
  return parts.join(' ');
}

function lateralFailSentence(r: CheckResult): string {
  const l = r.lateral.find((x) => x.status === 'UNSTABLE');
  if (!l) return STATUS_TEXT.FAIL.detail;
  return `${lockInModeLabel(r, l)} may lock in sideways under a crowd: D = ${fixed(l.D, 4)} is below the stability boundary of ${fixed(l.DBoundary, 3)} at ${fixed(l.f, 3)} Hz (NA.2.44.7).`;
}

/** Headline and sentence for the result card. `r` is null while the form is blank. */
export function verdictText(r: CheckResult | null): Verdict {
  if (r === null) {
    return {
      tone: 'neutral',
      word: '',
      headline: 'Enter a bridge',
      sentence: 'Fill in the bridge details, or start from one of the examples.',
    };
  }
  const word = STATUS_TEXT[r.status].word;
  const g = r.governing;
  switch (r.status) {
    case 'INPUT-ERROR': {
      const n = r.inputErrors.length;
      return {
        tone: 'neutral',
        word,
        headline: 'Check your inputs',
        sentence: `${n} ${n === 1 ? 'value needs' : 'values need'} checking. The check runs again as soon as ${n === 1 ? 'it is' : 'they are'} fixed. Nothing is calculated from values outside the tool's input limits.`,
      };
    }
    case 'FAIL': {
      const loadFails = g !== null && g.verdict === 'FAIL';
      if (!loadFails) {
        return {
          tone: 'fail',
          word,
          headline: 'Fails the lateral stability check',
          sentence: lateralFailSentence(r),
        };
      }
      const lateral = r.lateral.some((l) => l.status === 'UNSTABLE')
        ? ' A lateral mode may also lock in sideways (NA.2.44.7).'
        : '';
      const others = othersSentence(r, g);
      return {
        tone: 'fail',
        word,
        headline: 'Fails the comfort check',
        sentence:
          `${capital(caseSubject(r, g))} would shake the deck at ${accelText(g.aPeak)} m/s², ${utilText(g.utilisation)} times the comfort limit of ${limitText(g.aLimit)} m/s².` +
          (others ? ` ${others}` : '') +
          lateral,
      };
    }
    case 'PASS':
      return {
        tone: 'pass',
        word,
        headline: 'Passes the comfort check',
        sentence: g
          ? `The worst case, ${caseSubject(r, g)}, shakes the deck at ${accelText(g.aPeak)} m/s², ${utilText(g.utilisation)} times the comfort limit of ${limitText(g.aLimit)} m/s².`
          : STATUS_TEXT.PASS.detail,
      };
    case 'NOT-REQUIRED':
      return {
        tone: 'neutral',
        word,
        headline: 'No vertical check required',
        sentence: `The fundamental vertical frequency is ${fixed(r.vertical.fundamentalHz, 3)} Hz. At ${VERTICAL_TRIGGER_HZ} Hz or more the vertical comfort check is not required (NA+A1:2020, NA.2.44.6(1)).`,
      };
    case 'INCOMPLETE':
      return {
        tone: 'neutral',
        word,
        headline: 'Incomplete',
        sentence:
          r.missingInputs.length > 0
            ? `There is no PASS or FAIL yet. Still needed: ${r.missingInputs.join(', ')}.`
            : 'There is no PASS or FAIL, because part of the check cannot be worked out. The notes below say why.',
      };
    case 'AWAITING':
      return {
        tone: 'neutral',
        word,
        headline: 'Awaiting code data',
        sentence: STATUS_TEXT.AWAITING.detail,
      };
  }
}

export interface KeyNumber {
  label: string;
  value: string;
}

/**
 * Key numbers under the sentence: the mode the verdict is about (governing case, else the
 * lowest vertical mode, else the first mode) and the comfort limit.
 */
export function keyNumbers(r: CheckResult): KeyNumber[] {
  if (r.inputErrors.length > 0) return [];
  const mode =
    (r.governing && r.modes.find((m) => m.id === r.governing?.modeId)) ||
    verticalModes(r)[0] ||
    r.modes[0];
  const out: KeyNumber[] = [];
  if (mode) {
    out.push(
      { label: 'Natural frequency', value: `${fixed(mode.f, 3)} Hz` },
      { label: 'Modal mass', value: `${fixed(mode.M, 0)} kg` },
      { label: 'Damping', value: `${fixed(mode.zeta * 100, 2)} %` },
    );
  }
  out.push({
    label: 'Comfort limit',
    value: r.comfort ? `${limitText(r.comfort.aLimit)} m/s²` : '–',
  });
  return out;
}

export interface CaseBar {
  /** Bar length as a fraction of the track (0–1), the track being BAR_SCALE × a_limit. */
  fraction: number;
  /** True when the value is beyond the end of the track (the value is still shown). */
  clipped: boolean;
}

/** Bar for one load case, or null when it has no utilisation to draw. */
export function caseBar(c: LoadCaseResult): CaseBar | null {
  if (c.utilisation === null || !Number.isFinite(c.utilisation)) return null;
  const f = c.utilisation / BAR_SCALE;
  return { fraction: Math.max(0, Math.min(1, f)), clipped: f > 1 };
}

/** Where the comfort-limit line sits on the track (fraction of its length). */
export const LIMIT_AT = 1 / BAR_SCALE;

/** Text for the sticky phone bar: the status word and, where there is one, the utilisation. */
export function stickyText(r: CheckResult | null): { word: string; detail: string } {
  if (r === null) return { word: '', detail: 'Enter a bridge' };
  const word = STATUS_TEXT[r.status].word;
  const g = r.governing;
  if ((r.status === 'FAIL' || r.status === 'PASS') && g && g.utilisation !== null) {
    if (r.status === 'PASS' || g.verdict === 'FAIL') {
      return { word, detail: `${utilText(g.utilisation)} × the limit` };
    }
  }
  if (r.status === 'FAIL') return { word, detail: 'lateral lock-in' };
  if (r.status === 'INPUT-ERROR') {
    const n = r.inputErrors.length;
    return { word, detail: `${n} ${n === 1 ? 'value' : 'values'} to fix` };
  }
  return { word, detail: '' };
}
