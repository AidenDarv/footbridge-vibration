// @vitest-environment happy-dom
// Sticky phone bar (design/DESIGN.md §5): status word and governing utilisation, a link to the
// result card, hidden while the result card is on screen.

import { beforeEach, describe, expect, it } from 'vitest';
import { runCheck, type CheckInputs } from '../../src/engine/check';
import { utilText } from '../../src/share/format';
import { createStickyBar } from '../../src/ui/sticky-bar';

/** Stand-in for IntersectionObserver: the test says when the card is on screen. */
class FakeObserver {
  static last: FakeObserver | null = null;
  observed: Element[] = [];
  constructor(private cb: (entries: { isIntersecting: boolean; target: Element }[]) => void) {
    FakeObserver.last = this;
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.observed = [];
  }
  fire(isIntersecting: boolean) {
    this.cb(this.observed.map((target) => ({ isIntersecting, target })));
  }
}

const a1 = (rest: Partial<CheckInputs> = {}): CheckInputs => ({
  bridge: { kind: 'beam', L: 30, EI: 1.3131e9, m: 1000, dampingPercent: 0.5 },
  b: 2.5,
  height: 10,
  usage: { bridgeClass: 'C' },
  comfort: { k1: 'rural', k2: 'alternative' },
  ...rest,
});

let card: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  card = document.createElement('section');
  card.id = 'result-card';
  document.body.append(card);
});

const make = () => createStickyBar(FakeObserver as unknown as typeof IntersectionObserver);

describe('sticky phone bar', () => {
  it('shows the status word and the governing utilisation, linking to the result', () => {
    const bar = make();
    const r = runCheck(a1());
    bar.update(r, card);
    expect(bar.element.getAttribute('href')).toBe('#result-card');
    expect(bar.element.querySelector('.sticky-word')?.textContent).toBe('FAIL');
    expect(bar.element.querySelector('.sticky-word')?.classList.contains('tone-fail')).toBe(true);
    expect(bar.element.querySelector('.sticky-detail')?.textContent).toBe(
      `${utilText(r.governing?.utilisation)} × the limit`,
    );
    expect(bar.element.querySelector('.sticky-link')?.textContent).toBe('See result ↓');
  });

  it('is hidden while the result card is on screen, and back when it scrolls away', () => {
    const bar = make();
    bar.update(runCheck(a1()), card);
    expect(FakeObserver.last?.observed).toEqual([card]);
    expect(bar.element.hidden).toBe(false);
    FakeObserver.last?.fire(true);
    expect(bar.element.hidden).toBe(true);
    FakeObserver.last?.fire(false);
    expect(bar.element.hidden).toBe(false);
  });

  it('watches the new card after the results are redrawn', () => {
    const bar = make();
    bar.update(runCheck(a1()), card);
    const next = document.createElement('section');
    bar.update(runCheck(a1({ usage: { bridgeClass: 'A' } })), next);
    expect(FakeObserver.last?.observed).toEqual([next]);
    expect(bar.element.querySelector('.sticky-word')?.textContent).toBe('PASS');
    expect(bar.element.querySelector('.sticky-word')?.classList.contains('tone-pass')).toBe(true);
  });

  it('shows CHECK INPUTS for invalid inputs, never a stale PASS or FAIL', () => {
    const bar = make();
    bar.update(runCheck(a1()), card);
    bar.update(runCheck(a1({ b: 0 })), card);
    expect(bar.element.querySelector('.sticky-word')?.textContent).toBe('CHECK INPUTS');
    expect(bar.element.querySelector('.sticky-word')?.classList.contains('tone-neutral')).toBe(
      true,
    );
    expect(bar.element.querySelector('.sticky-detail')?.textContent).toBe('1 value to fix');
  });

  it('works without IntersectionObserver (stays shown)', () => {
    const bar = createStickyBar(undefined);
    bar.update(null, card);
    expect(bar.element.hidden).toBe(false);
    expect(bar.element.querySelector('.sticky-detail')?.textContent).toBe('Enter a bridge');
  });
});
