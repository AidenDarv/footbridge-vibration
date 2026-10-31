// Shared start-up for the content pages (Method, Validation, Limitations, About).

import '../ui/styles.css';
import { mountThemeToggle } from '../ui/theme';
import { h } from '../ui/dom';

type Child = Node | string | null | undefined | false;

/** Mounts the theme toggle and returns the page's main element. */
export function startPage(): HTMLElement {
  const toggle = document.getElementById('theme-toggle');
  if (toggle instanceof HTMLButtonElement) mountThemeToggle(toggle);
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');
  return root;
}

/** Page wrapper with its <h1> and a lead paragraph. */
export function page(title: string, lead: string, ...children: Child[]): HTMLElement {
  return h(
    'article',
    { class: 'page' },
    h('h1', { class: 'page-title' }, title),
    h('p', { class: 'page-lead' }, lead),
    ...children,
  );
}

/** A titled panel with prose content. */
export function section(title: string, clause: string | null, ...children: Child[]): HTMLElement {
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, title, clause ? h('span', { class: 'clause' }, clause) : null),
    h('div', { class: 'prose' }, ...children),
  );
}

/** Equation block, written in plain text with Unicode symbols. */
export function eq(...lines: string[]): HTMLElement {
  return h('p', { class: 'eq' }, lines.join('\n'));
}

export function list(items: readonly (string | Node)[]): HTMLElement {
  return h('ul', {}, ...items.map((t) => h('li', {}, t)));
}

/** Simple data table; stacks into cards on phones like the results tables. */
export function dataTable(headers: string[], rows: (string | Node)[][]): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'results' },
      h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', { scope: 'col' }, t)))),
      h(
        'tbody',
        {},
        ...rows.map((cells) =>
          h('tr', {}, ...cells.map((c, j) => h('td', { 'data-label': headers[j] ?? '' }, c))),
        ),
      ),
    ),
  );
}

export function link(href: string, text: string): HTMLElement {
  const external = /^https?:/.test(href);
  return h('a', { href, ...(external ? { rel: 'noopener' } : {}) }, text);
}
