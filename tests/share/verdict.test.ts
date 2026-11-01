// Verdict sentence, key numbers, load-case bars and sticky-bar text (design/DESIGN.md §4–5).
// Numbers come from the engine result, shown with the existing rounding rules.

import { describe, expect, it } from 'vitest';
import { runCheck, type CheckInputs, type LoadCaseResult } from '../../src/engine/check';
import { EXAMPLES, applyExample } from '../../src/share/examples';
import { accelText, limitText, utilText } from '../../src/share/format';
import { emptyFormValues, formToInputs } from '../../src/share/form-values';
import {
  BAR_SCALE,
  LIMIT_AT,
  caseBar,
  keyNumbers,
  stickyText,
  verdictText,
} from '../../src/share/verdict';

/** Bridge A1 (SPEC §6) with class C, rural, alternative routes, 10 m high (DESIGN.md). */
const a1 = (rest: Partial<CheckInputs> = {}, bridge: object = {}): CheckInputs => ({
  bridge: { kind: 'beam', L: 30, EI: 1.3131e9, m: 1000, dampingPercent: 0.5, ...bridge },
  b: 2.5,
  height: 10,
  usage: { bridgeClass: 'C' },
  comfort: { k1: 'rural', k2: 'alternative' },
  ...rest,
});

function example(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`no example ${id}`);
  const inputs = formToInputs(applyExample(emptyFormValues(), ex));
  if (!inputs) throw new Error('blank example');
  return runCheck(inputs);
}

describe('verdict sentence: FAIL', () => {
  const r = runCheck(a1());
  const g = r.governing as LoadCaseResult;

  it('names the governing case and uses the rounding rules, without "about"', () => {
    const v = verdictText(r);
    expect(r.status).toBe('FAIL');
    expect(v.tone).toBe('fail');
    expect(v.word).toBe('FAIL');
    expect(v.headline).toBe('Fails the comfort check');
    expect(g.kind).toBe('crowd');
    expect(v.sentence).toBe(
      `A crowd of 60 people would shake the deck at ${accelText(g.aPeak)} m/s², ${utilText(g.utilisation)} times the comfort limit of ${limitText(g.aLimit)} m/s². Walking and jogging groups also exceed it.`,
    );
    expect(v.sentence).not.toMatch(/about/);
  });

  it('says when only one other case exceeds the limit', () => {
    const v = verdictText(example('steel-box-40'));
    expect(v.sentence).toMatch(/The jogging group also exceeds it\.$/);
  });

  it('a lateral lock-in failure gets its own headline and sentence', () => {
    const lat = example('millennium');
    const v = verdictText(lat);
    expect(lat.status).toBe('FAIL');
    expect(v.headline).toBe('Fails the lateral stability check');
    expect(v.sentence).toMatch(/^Mode 1 may lock in sideways under a crowd: D = 0\.0319 is below/);
    expect(v.sentence).toMatch(/\(NA\.2\.44\.7\)\.$/);
  });

  it('adds the lateral note when a load case and a lateral mode both fail', () => {
    const both = example('suspension-modal');
    expect(both.lateral.some((l) => l.status === 'UNSTABLE')).toBe(true);
    expect(verdictText(both).sentence).toMatch(/A lateral mode may also lock in sideways/);
  });
});

describe('verdict sentence: other statuses', () => {
  it('PASS names the worst case', () => {
    const r = runCheck(a1({ usage: { bridgeClass: 'A' } }));
    const g = r.governing as LoadCaseResult;
    const v = verdictText(r);
    expect(r.status).toBe('PASS');
    expect(v.tone).toBe('pass');
    expect(v.headline).toBe('Passes the comfort check');
    expect(v.sentence).toBe(
      `The worst case, a walking group of 2 people, shakes the deck at ${accelText(g.aPeak)} m/s², ${utilText(g.utilisation)} times the comfort limit of ${limitText(g.aLimit)} m/s².`,
    );
  });

  it('NOT REQUIRED gives the fundamental frequency and the clause', () => {
    const r = runCheck(a1({}, { EI: 1e11 }));
    const v = verdictText(r);
    expect(r.status).toBe('NOT-REQUIRED');
    expect(v.tone).toBe('neutral');
    expect(v.word).toBe('NOT REQUIRED');
    expect(v.headline).toBe('No vertical check required');
    expect(v.sentence).toBe(
      `The fundamental vertical frequency is ${r.vertical.fundamentalHz?.toFixed(3)} Hz. At 5 Hz or more the vertical comfort check is not required (NA+A1:2020, NA.2.44.6(1)).`,
    );
  });

  it('INCOMPLETE lists the inputs still needed', () => {
    const r = runCheck(a1({ comfort: { k1: 'rural' } }));
    const v = verdictText(r);
    expect(r.status).toBe('INCOMPLETE');
    expect(v.headline).toBe('Incomplete');
    expect(v.sentence).toBe('There is no PASS or FAIL yet. Still needed: k2.');
  });

  it('INCOMPLETE without missing inputs points to the notes', () => {
    // Damping above the largest delta of Figure NA.9: no gamma, so INCOMPLETE (SPEC §2.4).
    const r = runCheck(a1({}, { dampingPercent: 5 }));
    expect(r.status).toBe('INCOMPLETE');
    expect(r.missingInputs).toEqual([]);
    expect(verdictText(r).sentence).toMatch(/The notes below say why\.$/);
  });

  it('CHECK INPUTS counts the values to fix', () => {
    const r = runCheck(a1({ b: 0.000001 }, { dampingPercent: 0.006 }));
    const v = verdictText(r);
    expect(v.word).toBe('CHECK INPUTS');
    expect(v.tone).toBe('neutral');
    expect(v.headline).toBe('Check your inputs');
    expect(v.sentence).toMatch(/^2 values need checking\. The check runs again as soon as they/);
    expect(verdictText(runCheck(a1({ b: 0 }))).sentence).toMatch(/^1 value needs checking\./);
  });

  it('a blank form asks for a bridge', () => {
    expect(verdictText(null)).toMatchObject({ tone: 'neutral', headline: 'Enter a bridge' });
  });

  it('never gives a pass or fail tone without the matching status', () => {
    for (const ex of EXAMPLES) {
      const inputs = formToInputs(applyExample(emptyFormValues(), ex));
      if (!inputs) continue;
      const r = runCheck(inputs);
      const tone = verdictText(r).tone;
      expect(tone).toBe(r.status === 'PASS' ? 'pass' : r.status === 'FAIL' ? 'fail' : 'neutral');
    }
  });
});

describe('key numbers', () => {
  it('shows the governing mode and the comfort limit', () => {
    expect(keyNumbers(runCheck(a1()))).toEqual([
      { label: 'Natural frequency', value: '2.000 Hz' },
      { label: 'Modal mass', value: '15 000 kg' }, // thin-space thousands
      { label: 'Damping', value: '0.50 %' },
      { label: 'Comfort limit', value: '1.456 m/s²' },
    ]);
  });

  it('shows a dash for a comfort limit that cannot be worked out yet', () => {
    const k = keyNumbers(runCheck(a1({ comfort: { k1: 'rural' } })));
    expect(k.at(-1)).toEqual({ label: 'Comfort limit', value: '–' });
  });

  it('has none for invalid inputs', () => {
    expect(keyNumbers(runCheck(a1({ b: 0 })))).toEqual([]);
  });
});

describe('load-case bars', () => {
  const bar = (u: number | null) => caseBar({ utilisation: u } as LoadCaseResult);

  it('are drawn to 3 × the limit, with the limit line a third of the way along', () => {
    expect(BAR_SCALE).toBe(3);
    expect(LIMIT_AT).toBeCloseTo(1 / 3, 12);
    expect(bar(1.5)).toEqual({ fraction: 0.5, clipped: false });
    expect(bar(3)).toEqual({ fraction: 1, clipped: false });
  });

  it('clip beyond the end of the track', () => {
    expect(bar(4.2)).toEqual({ fraction: 1, clipped: true });
  });

  it('are not drawn without a utilisation', () => {
    expect(bar(null)).toBeNull();
  });
});

describe('sticky phone bar text', () => {
  it('FAIL: the word and the governing utilisation', () => {
    const r = runCheck(a1());
    expect(stickyText(r)).toEqual({
      word: 'FAIL',
      detail: `${utilText(r.governing?.utilisation)} × the limit`,
    });
  });

  it('PASS: the word and the governing utilisation', () => {
    const r = runCheck(a1({ usage: { bridgeClass: 'A' } }));
    expect(stickyText(r).word).toBe('PASS');
    expect(stickyText(r).detail).toMatch(/^0\.\d\d × the limit$/);
  });

  it('lateral-only FAIL says so', () => {
    expect(stickyText(example('millennium'))).toEqual({ word: 'FAIL', detail: 'lateral lock-in' });
  });

  it('CHECK INPUTS counts the values; other statuses show the word alone', () => {
    expect(stickyText(runCheck(a1({ b: 0 })))).toEqual({
      word: 'CHECK INPUTS',
      detail: '1 value to fix',
    });
    expect(stickyText(runCheck(a1({}, { EI: 1e11 })))).toEqual({
      word: 'NOT REQUIRED',
      detail: '',
    });
    expect(stickyText(null)).toEqual({ word: '', detail: 'Enter a bridge' });
  });
});
