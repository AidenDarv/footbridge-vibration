// @vitest-environment happy-dom
// UI tests run in happy-dom, a small DOM for Node (devDependency, used only by tests/ui).

import { describe, expect, it } from 'vitest';
import { h } from '../../src/ui/dom';

describe('h()', () => {
  it('sets attributes and puts text in as text, never HTML', () => {
    const el = h('p', { class: 'note', hidden: false, 'aria-live': 'polite' }, '<b>x</b>');
    expect(el.className).toBe('note');
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent).toBe('<b>x</b>');
    expect(el.querySelector('b')).toBeNull();
  });
});
