// Wires the input form to runCheck and the results panel. No maths here (CLAUDE.md).

import { runCheck } from '../engine/check';
import { h } from './dom';
import { createInputForm } from './inputs';
import { renderResults } from './results';

export function mountApp(root: HTMLElement): void {
  const form = createInputForm();
  const results = h('div', { class: 'results-col', id: 'results' });

  const update = () => {
    const inputs = form.read();
    renderResults(results, inputs ? runCheck(inputs) : null, inputs?.name);
  };
  form.onChange(update);

  root.replaceChildren(
    h(
      'div',
      { class: 'layout' },
      h(
        'aside',
        { class: 'inputs-col', 'aria-label': 'Inputs' },
        h('h2', { class: 'col-title' }, 'Inputs'),
        form.element,
      ),
      h(
        'section',
        { class: 'results-wrap', 'aria-label': 'Results' },
        h('h2', { class: 'col-title' }, 'Results'),
        results,
      ),
    ),
  );
  update();
}

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
