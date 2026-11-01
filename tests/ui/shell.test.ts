// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mountMenu } from '../../src/ui/shell';

function setup() {
  document.body.innerHTML =
    '<button id="m" aria-expanded="false"></button><div id="n"><a href="#">Method</a></div>';
  const button = document.getElementById('m') as HTMLButtonElement;
  const nav = document.getElementById('n') as HTMLElement;
  mountMenu(button, nav);
  return { button, nav };
}

describe('phone menu button', () => {
  it('opens and closes the nav, and says which it will do', () => {
    const { button, nav } = setup();
    expect(button.getAttribute('aria-label')).toBe('Open menu');
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Close menu');
    expect(nav.classList.contains('is-open')).toBe(true);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('is-open')).toBe(false);
  });

  it('closes on Escape and returns focus to the button', () => {
    const { button, nav } = setup();
    button.click();
    nav
      .querySelector('a')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nav.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(button);
  });
});
