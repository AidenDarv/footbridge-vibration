// Theme toggle, shared by every page.

/** Light / dark toggle. Starts from the system setting; the choice is not stored. */
export function mountThemeToggle(button: HTMLButtonElement): void {
  const rootEl = document.documentElement;
  const current = () =>
    rootEl.dataset.theme ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    button.textContent = next === 'dark' ? 'Dark theme' : 'Light theme';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  button.addEventListener('click', () => {
    rootEl.dataset.theme = current() === 'dark' ? 'light' : 'dark';
    label();
  });
  label();
}
