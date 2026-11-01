// Theme toggle, shared by every page.

/**
 * sessionStorage key for the chosen theme, so it carries over when the user moves between
 * pages. Session only: no cookies, nothing leaves the browser (CLAUDE.md). The same key is read
 * by public/theme-init.js before the first paint.
 */
export const THEME_KEY = 'fvc-theme';

type Theme = 'light' | 'dark';

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined; // storage blocked
  }
}

function read(storage: Storage | undefined): Theme | null {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Applies a theme chosen earlier in this session; with none, the system setting is used. */
export function applyStoredTheme(storage: Storage | undefined = session()): void {
  const theme = read(storage);
  if (theme) document.documentElement.dataset.theme = theme;
}

/** Light / dark toggle. Starts from the stored choice, else the system setting. */
export function mountThemeToggle(
  button: HTMLButtonElement,
  storage: Storage | undefined = session(),
): void {
  const rootEl = document.documentElement;
  applyStoredTheme(storage);
  const current = () =>
    rootEl.dataset.theme ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    button.textContent = next === 'dark' ? 'Dark theme' : 'Light theme';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    rootEl.dataset.theme = next;
    try {
      storage?.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the theme still changes on this page.
    }
    label();
  });
  label();
}
