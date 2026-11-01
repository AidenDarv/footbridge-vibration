// @vitest-environment happy-dom
// Theme toggle: the choice carries over to the next page (bug: switching pages went back to
// light). Kept in sessionStorage only: no cookies, nothing leaves the browser.

import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY, applyStoredTheme, mountThemeToggle } from '../../src/ui/theme';

const root = document.documentElement;

beforeEach(() => {
  sessionStorage.clear();
  delete root.dataset.theme;
  document.body.innerHTML = '<button id="t"></button>';
});

const button = () => document.getElementById('t') as HTMLButtonElement;

describe('theme toggle', () => {
  it('stores the choice when the button is pressed', () => {
    mountThemeToggle(button());
    button().click();
    const chosen = root.dataset.theme;
    expect(chosen === 'dark' || chosen === 'light').toBe(true);
    expect(sessionStorage.getItem(THEME_KEY)).toBe(chosen);
  });

  it('the next page starts in the chosen theme', () => {
    root.dataset.theme = 'light';
    mountThemeToggle(button());
    button().click(); // → dark
    expect(root.dataset.theme).toBe('dark');

    // A new page load: the attribute is gone, the stored choice is not.
    delete root.dataset.theme;
    applyStoredTheme();
    expect(root.dataset.theme).toBe('dark');
    mountThemeToggle(button());
    expect(button().textContent).toBe('Light theme');
    expect(button().getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('follows the system setting when nothing is stored', () => {
    applyStoredTheme();
    expect(root.dataset.theme).toBeUndefined();
  });

  it('ignores anything that is not light or dark', () => {
    sessionStorage.setItem(THEME_KEY, 'purple');
    applyStoredTheme();
    expect(root.dataset.theme).toBeUndefined();
  });

  it('still works when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => applyStoredTheme(blocked)).not.toThrow();
    root.dataset.theme = 'light';
    mountThemeToggle(button(), blocked);
    expect(() => button().click()).not.toThrow();
    expect(root.dataset.theme).toBe('dark');
  });
});
