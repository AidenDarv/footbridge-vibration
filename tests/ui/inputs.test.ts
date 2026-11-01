// @vitest-environment happy-dom
// Inputs panel (design/DESIGN.md §3): example pills, segmented control, damping material
// select, class radio rows.

import { beforeEach, describe, expect, it } from 'vitest';
import { dampingOptions } from '../../src/share/damping-options';
import { EXAMPLES } from '../../src/share/examples';
import { emptyFormValues } from '../../src/share/form-values';
import { createInputForm, type InputForm } from '../../src/ui/inputs';

let form: InputForm;
let changes = 0;

const q = <T extends Element = HTMLElement>(sel: string) => {
  const el = form.element.querySelector<T & Element>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as T;
};
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const choose = (sel: HTMLSelectElement, value: string) => {
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  sel.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  document.body.replaceChildren();
  form = createInputForm();
  document.body.append(form.element);
  changes = 0;
  form.onChange(() => changes++);
});

describe('damping material select', () => {
  const steel = dampingOptions().find((o) => o.id === 'steel');
  const timber = dampingOptions().find((o) => o.id === 'timber');

  it('lists the six PD 6688-2 Table A.1 materials and Custom, with Custom selected at first', () => {
    const sel = q<HTMLSelectElement>('#in-damping-material');
    expect([...sel.options].map((o) => o.textContent)).toEqual(
      dampingOptions().map((o) => o.label),
    );
    expect(sel.value).toBe('custom');
  });

  it('picking a material fills the damping box and runs the check', () => {
    choose(q<HTMLSelectElement>('#in-damping-material'), 'timber');
    expect(q<HTMLInputElement>('#in-damping').value).toBe(timber?.value);
    expect(form.values().damping).toBe('0.95493');
    expect(changes).toBeGreaterThan(0);
  });

  it('editing the damping box switches the select to Custom', () => {
    const sel = q<HTMLSelectElement>('#in-damping-material');
    choose(sel, 'steel');
    type(q<HTMLInputElement>('#in-damping'), '0.5');
    expect(sel.value).toBe('custom');
  });

  it('picking Custom leaves the value alone', () => {
    const sel = q<HTMLSelectElement>('#in-damping-material');
    choose(sel, 'steel');
    choose(sel, 'custom');
    expect(q<HTMLInputElement>('#in-damping').value).toBe(steel?.value);
  });

  it('shows the material when a loaded value matches a suggestion', () => {
    form.loadExample('steel-box-40');
    expect(q<HTMLSelectElement>('#in-damping-material').value).toBe('steel');
    form.write({ ...emptyFormValues(), damping: '0.5', L: '30' });
    expect(q<HTMLSelectElement>('#in-damping-material').value).toBe('custom');
  });

  it('says where the values come from', () => {
    expect(q('#in-damping-hint').textContent).toMatch(/PD 6688-2 Table A\.1/);
    expect(q('#in-damping').getAttribute('aria-describedby')).toContain('in-damping-hint');
  });
});

describe('example pills', () => {
  const pills = () => [...form.element.querySelectorAll<HTMLButtonElement>('.pill')];

  it('one pill per example, none pressed at first', () => {
    expect(pills()).toHaveLength(EXAMPLES.length);
    expect(pills().every((p) => p.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('clicking a pill loads that example and presses only that pill', () => {
    const i = EXAMPLES.findIndex((e) => e.id === 'concrete-20');
    pills()[i]?.click();
    expect(form.values().L).toBe('20');
    expect(pills().map((p) => p.getAttribute('aria-pressed'))).toEqual(
      EXAMPLES.map((e) => String(e.id === 'concrete-20')),
    );
    expect(q('.example-note').textContent).toMatch(/Illustrative/);
  });

  it('un-presses when the bridge inputs no longer match the example', () => {
    form.loadExample('concrete-20');
    type(q<HTMLInputElement>('#in-L'), '21');
    expect(pills().every((p) => p.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});

describe('structure: segmented control', () => {
  it('switches between simple span and modes from an FE model', () => {
    const [beam, modal] = [
      ...form.element.querySelectorAll<HTMLButtonElement>('.segmented button'),
    ];
    expect(beam?.textContent).toBe('Simple span');
    expect(modal?.textContent).toBe('Modes from FE model');
    expect(beam?.getAttribute('aria-pressed')).toBe('true');
    modal?.click();
    expect(form.values().inputMode).toBe('modal');
    expect(modal?.getAttribute('aria-pressed')).toBe('true');
    expect(beam?.getAttribute('aria-pressed')).toBe('false');
    expect(form.element.dataset.mode).toBe('modal');
    expect(form.element.querySelectorAll('.mode-row')).toHaveLength(1);
    expect(changes).toBeGreaterThan(0);
  });
});

describe('usage: class radio rows', () => {
  it('four rows in plain English with the code class underneath, none chosen at first', () => {
    const rows = [...form.element.querySelectorAll<HTMLLabelElement>('.choice')];
    expect(rows.map((r) => r.querySelector('.choice-title')?.textContent)).toEqual([
      'Quiet, rural',
      'Suburban, occasional peaks',
      'Urban, busy every day',
      'Stadium or transport hub',
    ]);
    expect(rows.map((r) => r.querySelector('.choice-sub')?.textContent)).toEqual([
      'Class A · groups of 2',
      'Class B · groups of 4 · crowd 0.4 people/m²',
      'Class C · groups of 8 · crowd 0.8 people/m²',
      'Class D · groups of 16 · crowd 1.5 people/m²',
    ]);
    expect(form.values().bridgeClass).toBe('');
  });

  it('choosing a row sets the bridge class', () => {
    const c = q<HTMLInputElement>('input[name="bridgeClass"][value="C"]');
    c.click();
    expect(form.values().bridgeClass).toBe('C');
  });

  it('write() checks the matching row', () => {
    form.write({ ...emptyFormValues(), bridgeClass: 'B' });
    expect(q<HTMLInputElement>('input[name="bridgeClass"][value="B"]').checked).toBe(true);
    form.write({ ...emptyFormValues(), bridgeClass: '' });
    expect(form.element.querySelector('input[name="bridgeClass"]:checked')).toBeNull();
  });
});

describe('usage: setting and routes', () => {
  it('maps the plain-English selects to k1 and k2', () => {
    choose(q<HTMLSelectElement>('#in-k1'), 'rural');
    choose(q<HTMLSelectElement>('#in-k2'), 'alternative');
    expect(form.values()).toMatchObject({ k1: 'rural', k2: 'alternative' });
    expect([...q<HTMLSelectElement>('#in-k1').options].map((o) => o.value)).toEqual([
      '',
      'hospital',
      'school',
      'stadia',
      'urban',
      'suburban',
      'rural',
    ]);
  });

  it('keeps k4, its justification and the overrides inside the Advanced section', () => {
    const adv = q<HTMLDetailsElement>('details.advanced');
    expect(adv.open).toBe(false);
    for (const name of ['k4', 'k4Justification', 'groupWalking', 'groupJogging', 'crowdDensity']) {
      expect(adv.querySelector(`[name="${name}"]`), name).not.toBeNull();
    }
  });

  it('round-trips every value through write() and values()', () => {
    for (const ex of EXAMPLES) {
      form.loadExample(ex.id);
      const v = form.values();
      form.write(v);
      expect(form.values()).toEqual(v);
    }
  });
});
