// @vitest-environment happy-dom
// Results column (design/DESIGN.md §4): verdict card, load cases against the limit, full
// calculation, and the "Check your inputs" card. Every number comes from the engine.

import { beforeEach, describe, expect, it } from 'vitest';
import { runCheck, type CheckInputs, type CheckResult } from '../../src/engine/check';
import { EXAMPLES, applyExample } from '../../src/share/examples';
import { accelText, utilText } from '../../src/share/format';
import { emptyFormValues, formToInputs } from '../../src/share/form-values';
import { verdictText } from '../../src/share/verdict';
import { renderResults } from '../../src/ui/results';

const a1 = (rest: Partial<CheckInputs> = {}, bridge: object = {}): CheckInputs => ({
  bridge: { kind: 'beam', L: 30, EI: 1.3131e9, m: 1000, dampingPercent: 0.5, ...bridge },
  b: 2.5,
  height: 10,
  usage: { bridgeClass: 'C' },
  comfort: { k1: 'rural', k2: 'alternative' },
  ...rest,
});

let box: HTMLElement;
const render = (r: CheckResult | null, name?: string) => {
  renderResults(box, r, name);
  return box;
};
const text = (sel: string) => box.querySelector(sel)?.textContent ?? null;

beforeEach(() => {
  document.body.replaceChildren();
  box = document.createElement('div');
  document.body.append(box);
});

describe('verdict card', () => {
  it('FAIL: name, headline in words, the sentence and the key numbers', () => {
    const r = runCheck(a1());
    render(r, 'Test bridge A1');
    const card = box.querySelector('.verdict-card') as HTMLElement;
    expect(card.classList.contains('tone-fail')).toBe(true);
    expect(card.id).toBe('result-card');
    expect(text('.verdict-for')).toBe('Result for Test bridge A1');
    expect(text('.verdict-title')).toBe('Fails the comfort check');
    expect(card.querySelector('svg')?.getAttribute('aria-label')).toBe('FAIL');
    expect(text('.verdict-sentence')).toBe(verdictText(r).sentence);
    const keys = [...card.querySelectorAll('.key-numbers dt')].map((d) => d.textContent);
    expect(keys).toEqual(['Natural frequency', 'Modal mass', 'Damping', 'Comfort limit']);
    expect(text('.key-number:last-child dd')).toBe('1.456 m/s²');
  });

  it('keeps the status notes as short lines under the sentence', () => {
    const r = runCheck(a1());
    render(r);
    const notes = [...box.querySelectorAll('.verdict-notes li')].map((li) => li.textContent);
    for (const n of [...r.statusNotes, ...r.statusInfo]) expect(notes).toContain(n);
    expect(notes.some((n) => /Beam mode gives vertical modes only/.test(n ?? ''))).toBe(true);
  });

  it('PASS and NOT REQUIRED cards use their own tone and headline', () => {
    render(runCheck(a1({ usage: { bridgeClass: 'A' } })));
    expect(box.querySelector('.verdict-card')?.classList.contains('tone-pass')).toBe(true);
    expect(text('.verdict-title')).toBe('Passes the comfort check');
    render(runCheck(a1({}, { EI: 1e11 })));
    expect(box.querySelector('.verdict-card')?.classList.contains('tone-neutral')).toBe(true);
    expect(text('.verdict-title')).toBe('No vertical check required');
  });

  it('a blank form asks for a bridge', () => {
    render(null);
    expect(text('.verdict-title')).toBe('Enter a bridge');
  });
});

describe('each load case against the limit', () => {
  const r = runCheck(a1());

  it('one row per case, with the governing case marked', () => {
    render(r);
    const rows = [...box.querySelectorAll('.bar-row')];
    expect(rows).toHaveLength(r.cases.length);
    const gov = rows.filter((row) => row.querySelector('.governs'));
    expect(gov).toHaveLength(1);
    expect(gov[0]?.querySelector('.bar-name')?.textContent).toMatch(/^Crowd/);
    expect(gov[0]?.querySelector('.governs')?.textContent).toBe('GOVERNS');
  });

  it('shows each value rounded up, with "× limit" and the verdict in words', () => {
    render(r);
    r.cases.forEach((c, i) => {
      const row = box.querySelectorAll('.bar-row')[i] as HTMLElement;
      expect(row.querySelector('.bar-a')?.textContent).toBe(accelText(c.aPeak));
      expect(row.querySelector('.bar-u')?.textContent).toBe(
        `${utilText(c.utilisation)} × limit · ${c.verdict}`,
      );
    });
  });

  it('draws bars to 3 × the limit, clipped, with the limit line a third of the way', () => {
    render(r);
    const crowd = box.querySelectorAll<HTMLElement>('.bar-row')[2] as HTMLElement;
    const fill = crowd.querySelector<HTMLElement>('.bar-fill');
    const u = r.cases[2]?.utilisation as number;
    expect(fill?.style.width).toBe(`${((u / 3) * 100).toFixed(2)}%`);
    expect(crowd.querySelector<HTMLElement>('.bar-limit')?.style.left).toBe('33.33%');
    expect(fill?.classList.contains('is-fail')).toBe(true);
  });

  it('says how the bars are scaled', () => {
    render(r);
    expect(text('.bar-legend')).toBe(
      'The vertical line is the comfort limit, 1.456 m/s². Bars are drawn to 3 × the limit.',
    );
  });
});

describe('full calculation and other panels', () => {
  it('"Show the full calculation" is closed and holds the existing tables', () => {
    render(runCheck(a1()));
    const d = box.querySelector<HTMLDetailsElement>('details.full-calc');
    expect(d?.open).toBe(false);
    expect(d?.querySelector('summary')?.textContent).toBe('Show the full calculation');
    const titles = [...(d?.querySelectorAll('h3') ?? [])].map((x) => x.textContent);
    expect(titles.some((t) => t?.startsWith('Modal properties'))).toBe(true);
    expect(titles.some((t) => t?.startsWith('Comfort limit'))).toBe(true);
    expect(titles.some((t) => t?.startsWith('Load cases'))).toBe(true);
  });

  it('shows the lateral stability table only when there is a lateral check', () => {
    render(runCheck(a1()));
    expect(box.querySelector('.lateral-panel')).toBeNull();
    const ex = EXAMPLES.find((e) => e.id === 'millennium');
    const inputs = formToInputs(applyExample(emptyFormValues(), ex!));
    render(runCheck(inputs!));
    expect(box.querySelector('.lateral-panel')).not.toBeNull();
    expect(box.querySelector('.lateral-panel')?.textContent).toMatch(/UNSTABLE/);
  });
});

describe('check your inputs', () => {
  const r = runCheck(a1({ b: 0.000001 }, { dampingPercent: 0.006 }));

  it('is a neutral card listing the problems, with no PASS or FAIL', () => {
    render(r, 'Test bridge A1');
    const card = box.querySelector('.verdict-card') as HTMLElement;
    expect(card.classList.contains('tone-neutral')).toBe(true);
    expect(text('.verdict-title')).toBe('Check your inputs');
    const items = [...card.querySelectorAll('.problem-list li')].map((li) => li.textContent);
    expect(items).toEqual(r.inputErrors);
    expect(box.textContent).not.toMatch(/\bPASS\b|\bFAIL\b|Passes|Fails/);
    expect(box.querySelector('.bar-row')).toBeNull();
  });

  it('links each problem to its field', () => {
    const field = document.createElement('input');
    field.id = 'in-b';
    document.body.append(field);
    render(r);
    const link = [...box.querySelectorAll<HTMLAnchorElement>('.problem-list a')].find((a) =>
      a.textContent?.startsWith('Deck width'),
    );
    expect(link?.getAttribute('href')).toBe('#in-b');
    link?.click();
    expect(document.activeElement).toBe(field);
  });
});
