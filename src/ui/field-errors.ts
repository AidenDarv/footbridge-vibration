// Marks the fields named in the engine's input errors (design/DESIGN.md §6). The limits and
// messages are the engine's own; nothing here decides what is valid.

import type { InputError } from '../engine/check';
import { percentFix } from '../share/damping-options';
import { h } from './dom';

const LABEL: Record<Exclude<InputError['field'], `mode-${string}`>, string> = {
  L: 'Span',
  EI: 'Bending stiffness EI',
  m: 'Mass per metre',
  damping: 'Damping',
  b: 'Deck width',
  height: 'Height above ground',
  mBridgeMin: 'Lowest deck mass per metre',
  groupWalking: 'Walking group',
  groupJogging: 'Jogging group',
  crowdDensity: 'Crowd density',
  k4: 'Exposure factor k₄',
  modes: 'Mode table',
  general: '',
};

const MODE_LABEL: Record<string, string> = {
  'mode-f': 'frequency',
  'mode-M': 'modal mass',
  'mode-damping': 'damping',
  'mode-Seff': 'Seff',
};

/** Short name of a field, for the summary links. */
export function fieldLabel(e: InputError): string {
  if (e.field in MODE_LABEL) return `Mode ${(e.modeIndex ?? 0) + 1} ${MODE_LABEL[e.field]}`;
  return LABEL[e.field as keyof typeof LABEL] ?? e.field;
}

/** The control an error belongs to, or null (e.g. 'general'). */
export function fieldControl(form: HTMLElement, e: InputError): HTMLElement | null {
  if (e.field === 'general') return null;
  if (e.field === 'modes') return form.querySelector('.modal-only .btn-small');
  if (e.field.startsWith('mode-')) {
    const name = e.field.slice('mode-'.length);
    return form.querySelector(`#in-mode-${e.modeIndex ?? 0}-${name}`);
  }
  return form.querySelector(`#in-${e.field}`);
}

const alertIcon = (size: number) => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    width: String(size),
    height: String(size),
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'aria-hidden': 'true',
    class: 'alert-icon',
  })) {
    svg.setAttribute(k, v);
  }
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '10');
  circle.setAttribute('cy', '10');
  circle.setAttribute('r', '8.5');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M10 5.5v5.5M10 14v0.5');
  svg.append(circle, path);
  return svg;
};

/** Box for a field's error lines, straight under the input (above its hint). */
function fieldMessages(control: HTMLElement): HTMLElement {
  const anchor = control.closest('.damping-row') ?? control;
  const next = anchor.nextElementSibling;
  if (next instanceof HTMLElement && next.classList.contains('field-msgs')) return next;
  const box = h('div', { class: 'field-msgs' });
  anchor.after(box);
  return box;
}

/** Removes every mark made by the last call. */
function clear(form: HTMLElement): void {
  for (const el of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    el.removeAttribute('aria-invalid');
    const base = el.dataset.describedbyBase;
    if (base) el.setAttribute('aria-describedby', base);
    else el.removeAttribute('aria-describedby');
    delete el.dataset.describedbyBase;
  }
  for (const el of form.querySelectorAll('.is-invalid')) el.classList.remove('is-invalid');
  for (const el of form.querySelectorAll('.field-msgs, .field-error, .fix-hint, .fix-btn'))
    el.remove();
}

export interface ShownError {
  error: InputError;
  control: HTMLElement;
}

/**
 * Marks each error's control: red border, aria-invalid, an error line linked with
 * aria-describedby and, for a damping ratio typed into the % box, a "Use X %" button.
 * `show` decides which controls are marked (the user has reached them). Returns the marked
 * errors in form order.
 */
export function markFields(
  form: HTMLElement,
  errors: readonly InputError[],
  show: (control: HTMLElement) => boolean,
  onFix: (control: HTMLInputElement, value: string) => void,
): ShownError[] {
  clear(form);
  const shown: ShownError[] = [];
  for (const error of errors) {
    const control = fieldControl(form, error);
    if (!control || !show(control)) continue;
    shown.push({ error, control });
    const id = `${control.id}-err`;
    // Two errors on one control (e.g. a vertical frequency): one line each.
    const existing = form.querySelectorAll(`[id^="${id}"]`).length;
    const lineId = existing === 0 ? id : `${id}-${existing}`;
    const line = h('p', { class: 'field-error', id: lineId }, error.message);
    line.prepend(alertIcon(14));
    const isMode = error.field.startsWith('mode-') || error.field === 'modes';
    const host = isMode
      ? (control.closest('.mode-row')?.querySelector('.mode-errors') ?? control.parentElement)
      : fieldMessages(control);
    host?.append(line);
    (isMode ? control.closest('.mode-cell') : control.closest('.field'))?.classList.add(
      'is-invalid',
    );
    if (control.getAttribute('aria-invalid') !== 'true') {
      const base = control.getAttribute('aria-describedby');
      if (base) control.dataset.describedbyBase = base;
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', base ? `${lineId} ${base}` : lineId);
    } else {
      control.setAttribute(
        'aria-describedby',
        `${control.getAttribute('aria-describedby') ?? ''} ${lineId}`.trim(),
      );
    }
    if (
      (error.field === 'damping' || error.field === 'mode-damping') &&
      control instanceof HTMLInputElement
    ) {
      const fix = percentFix(control.value);
      if (fix !== null) {
        host?.append(
          h(
            'p',
            { class: 'fix-hint', id: `${control.id}-fix` },
            `This box takes a percentage: did you mean ${fix} %?`,
          ),
        );
        const btn = h('button', { type: 'button', class: 'fix-btn' }, `Use ${fix} %`);
        btn.addEventListener('click', () => onFix(control, fix));
        host?.append(btn);
      }
    }
    // A field inside the closed Advanced section would be red but out of sight.
    const details = control.closest('details');
    if (details) details.open = true;
  }
  return shown.sort((a, b) =>
    a.control === b.control
      ? 0
      : a.control.compareDocumentPosition(b.control) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
  );
}

/** "N values need checking" with a link to each marked field. Null when nothing is marked. */
export function errorSummary(shown: readonly ShownError[]): HTMLElement | null {
  const controls = [...new Map(shown.map((s) => [s.control, s])).values()];
  if (controls.length === 0) return null;
  const n = controls.length;
  const links: (Node | string)[] = [];
  controls.forEach(({ error, control }, i) => {
    if (i > 0) links.push(' · ');
    const a = h('a', { href: `#${control.id}` }, fieldLabel(error));
    a.addEventListener('click', (e) => {
      e.preventDefault();
      // Look the field up again: rows may have been rebuilt since the summary was drawn.
      const target = document.getElementById(control.id) ?? control;
      target.focus();
      target.scrollIntoView?.({ block: 'center' });
    });
    links.push(a);
  });
  return h(
    'div',
    { class: 'error-summary', role: 'alert' },
    alertIcon(18),
    h(
      'div',
      {},
      h(
        'p',
        { class: 'error-summary-title' },
        `${n} ${n === 1 ? 'value needs' : 'values need'} checking`,
      ),
      h('p', { class: 'error-summary-links' }, ...links),
    ),
  );
}
