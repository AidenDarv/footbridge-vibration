// Wires the input form to runCheck and the results panel. No maths here (CLAUDE.md).

import { runCheck } from '../engine/check';
import { buildReport } from '../report/model';
import { decodeFormValues, encodeFormValues } from '../share/url';
import { h } from './dom';
import { createInputForm } from './inputs';
import { renderResults } from './results';

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

  let loadedFromLink = false;
  const update = () => {
    const inputs = form.read();
    renderResults(results, inputs ? runCheck(inputs) : null, inputs?.name);
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
    update();
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
        'aside',
        { class: 'inputs-col', 'aria-label': 'Inputs' },
        h('h2', { class: 'col-title' }, 'Inputs'),
        notice,
        form.element,
      ),
      h(
        'section',
        { class: 'results-wrap', 'aria-label': 'Results' },
        h('h2', { class: 'col-title' }, 'Results'),
        h('div', { class: 'actions' }, pdfBtn, linkBtn, actionMsg, linkOut),
        results,
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
