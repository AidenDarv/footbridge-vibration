// Page chrome shared by every page: theme toggle and the phone menu button.

import { mountThemeToggle } from './theme';

/** Menu button that shows and hides the site nav on phones (hidden by CSS on wider screens). */
export function mountMenu(button: HTMLButtonElement, nav: HTMLElement): void {
  const set = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      set(false);
      button.focus();
    }
  });
  set(false);
}

export function mountShell(): void {
  const toggle = document.getElementById('theme-toggle');
  if (toggle instanceof HTMLButtonElement) mountThemeToggle(toggle);
  const menu = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');
  if (menu instanceof HTMLButtonElement && nav) mountMenu(menu, nav);
}
