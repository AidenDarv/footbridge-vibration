// Sticky bar at the bottom of the screen on phones (design/DESIGN.md §5): the status word and
// governing utilisation, with a link down to the result card. Hidden while the card is on
// screen; CSS hides it on wider screens.

import type { CheckResult } from '../engine/check';
import { stickyText, verdictText } from '../share/verdict';
import { h } from './dom';

export interface StickyBar {
  element: HTMLAnchorElement;
  /** Show this result, and watch `card` (the freshly drawn result card). */
  update(r: CheckResult | null, card: HTMLElement | null): void;
}

export function createStickyBar(
  Observer: typeof IntersectionObserver | undefined = globalThis.IntersectionObserver,
): StickyBar {
  const word = h('span', { class: 'sticky-word' });
  const detail = h('span', { class: 'sticky-detail' });
  const element = h(
    'a',
    { class: 'sticky-bar', href: '#result-card' },
    h('span', { class: 'sticky-status' }, word, detail),
    h('span', { class: 'sticky-link' }, 'See result ↓'),
  );
  const observer = Observer
    ? new Observer((entries) => {
        for (const e of entries) element.hidden = e.isIntersecting;
      })
    : null;

  return {
    element,
    update(r, card) {
      const t = stickyText(r);
      word.textContent = t.word;
      word.hidden = t.word === '';
      word.className = `sticky-word tone-${verdictText(r).tone}`;
      detail.textContent = t.detail;
      if (observer) {
        observer.disconnect();
        if (card) observer.observe(card);
      }
    },
  };
}
