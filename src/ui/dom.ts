// Small DOM helpers. Text always goes in through textContent, never innerHTML.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

export function append(parent: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** A "?" tip that shows its text on hover or keyboard focus, and is read by screen readers. */
export function tip(text: string): HTMLElement {
  return h(
    'span',
    { class: 'tip', tabindex: '0', role: 'note', 'aria-label': text, 'data-tip': text },
    '?',
  );
}

const THIN_SPACE = String.fromCharCode(0x2009);

/** Display formatting only (CLAUDE.md: the UI does no maths). Thin-space thousands. */
export function fixed(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const [int = '', frac] = value.toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}
