// Wires the input form to runCheck and the results panel. No maths here (CLAUDE.md).

import { runCheck, type CheckResult } from '../engine/check';
import { buildReport } from '../report/model';
import { decodeFormValues, encodeFormValues } from '../share/url';
import { h } from './dom';
import { createInputForm } from './inputs';
import { limitationsPanel, renderResults } from './results';
import { STATUS_TEXT } from '../share/wording';

/** One-line notice under the buttons (DESIGN.md §4.7); the full limitations follow it. */
const SCREENING_LINE =
  'Screening tool for vibration serviceability only. It does not check strength, static deflection or stability. Verify against NA+A1:2020 to BS EN 1991-2 and the project’s requirements.';

/** Pause after the last keystroke before the check runs again (ms). UI timing, not a code value. */
export const UPDATE_DELAY_MS = 200;

/** Safe file name part: letters, digits and dashes. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'bridge'
  );
}

export function mountApp(root: HTMLElement): void {
  const form = createInputForm();
  const results = h('div', { class: 'results-col', id: 'results' });

  const pdfBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary', id: 'download-pdf' },
    'Download calc sheet (PDF)',
  );
  const linkBtn = h(
    'button',
    { type: 'button', class: 'btn', id: 'copy-link' },
    'Copy link to these inputs',
  );
  const actionMsg = h('p', { class: 'action-msg', role: 'status', 'aria-live': 'polite' });
  const linkOut = h('input', {
    type: 'text',
    class: 'link-out',
    readonly: true,
    'aria-label': 'Link to these inputs',
    hidden: true,
  });
  const notice = h('div', { class: 'link-notice', hidden: true });
  // The results are rebuilt on every keystroke, so they are not a live region themselves.
  // This region announces the result only when the status word changes (review #14).
  const announcer = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  let announced = '';
  const liveText = h('span', {});
  const liveState = h(
    'span',
    { class: 'live-state' },
    h('span', { class: 'live-dot', 'aria-hidden': 'true' }),
    liveText,
  );
  /** "Updates as you type", or "Paused" while inputs are invalid (DESIGN.md §2, §6). */
  const setLive = (r: CheckResult | null) => {
    const state = r === null ? 'waiting' : r.inputErrors.length > 0 ? 'paused' : 'live';
    liveState.dataset.state = state;
    liveText.textContent =
      state === 'paused'
        ? 'Paused'
        : state === 'waiting'
          ? 'Waiting for inputs'
          : 'Updates as you type';
  };

  let loadedFromLink = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(timer);
    timer = undefined;
    const inputs = form.read();
    const r = inputs ? runCheck(inputs) : null;
    form.showErrors(r?.inputErrorDetails ?? []);
    renderResults(results, r, inputs?.name);
    setLive(r);
    results.removeAttribute('aria-busy');
    const word = r ? STATUS_TEXT[r.status].word : '';
    if (word !== announced) {
      announced = word;
      announcer.textContent = word ? `Result: ${word}` : '';
    }
    pdfBtn.disabled = inputs === null;
    linkOut.hidden = true;
    actionMsg.textContent = '';
  };
  form.onChange(() => {
    // Once the inputs are edited, a share link in the address bar no longer matches them.
    if (loadedFromLink) {
      history.replaceState(null, '', location.pathname);
      loadedFromLink = false;
    }
    // Validate and recalculate as the user types, after a short pause (DESIGN.md §6).
    clearTimeout(timer);
    timer = setTimeout(update, UPDATE_DELAY_MS);
    results.setAttribute('aria-busy', 'true');
  });

  pdfBtn.addEventListener('click', async () => {
    const values = form.values();
    const inputs = form.read();
    if (!inputs) return;
    pdfBtn.disabled = true;
    actionMsg.textContent = 'Preparing the calc sheet…';
    try {
      const date = new Date();
      const model = buildReport({
        values,
        result: runCheck(inputs),
        date,
        version: __APP_VERSION__,
        commit: __GIT_COMMIT__,
      });
      const { downloadCalcSheet } = await import('../report/pdf');
      await downloadCalcSheet(
        model,
        `calc-sheet-${slug(values.name)}-${date.toISOString().slice(0, 10)}.pdf`,
      );
      actionMsg.textContent = 'Calc sheet downloaded.';
    } catch (e) {
      actionMsg.textContent = `Could not create the PDF: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      pdfBtn.disabled = false;
    }
  });

  linkBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?${encodeFormValues(form.values())}`;
    history.replaceState(null, '', url);
    loadedFromLink = true;
    try {
      await navigator.clipboard.writeText(url);
      actionMsg.textContent =
        'Link copied. Anyone with it sees these inputs; nothing is stored online.';
    } catch {
      linkOut.value = url;
      linkOut.hidden = false;
      linkOut.select();
      actionMsg.textContent = 'Copy this link:';
    }
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'layout' },
      h(
        'section',
        { class: 'workbench', 'aria-labelledby': 'inputs-h' },
        h(
          'div',
          { class: 'wb-head' },
          h('h2', { id: 'inputs-h' }, 'Your bridge'),
          h('span', { class: 'ref', 'aria-hidden': 'true' }, 'INPUTS'),
        ),
        notice,
        form.element,
      ),
      h(
        'section',
        { class: 'results-wrap', 'aria-labelledby': 'results-h' },
        h('div', { class: 'results-head' }, h('h2', { id: 'results-h' }, 'Result'), liveState),
        announcer,
        results,
        h('div', { class: 'actions' }, pdfBtn, linkBtn, actionMsg, linkOut),
        h('p', { class: 'screening-line' }, SCREENING_LINE),
        limitationsPanel(),
      ),
    ),
  );

  // Inputs from a share link (SPEC §1.2 item 7).
  if (location.search) {
    const { values, warnings } = decodeFormValues(location.search);
    form.write(values);
    loadedFromLink = true;
    if (warnings.length > 0) {
      notice.hidden = false;
      notice.replaceChildren(
        h('p', {}, 'Some values in this link could not be used:'),
        h('ul', {}, ...warnings.map((w) => h('li', {}, w))),
      );
    }
  }
  update();
}
