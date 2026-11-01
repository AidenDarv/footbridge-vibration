// @vitest-environment happy-dom
// Live red-field validation (design/DESIGN.md §6): the engine's input errors, each on its own
// field, a summary with links, and a one-click "Use X %" fix for a ratio typed as a percentage.

import { beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../src/engine/check';
import { emptyFormValues } from '../../src/share/form-values';
import { createInputForm, type InputForm } from '../../src/ui/inputs';

let form: InputForm;

const input = (id: string) => {
  const el = form.element.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};
const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
/** Run the check on the form's inputs and show its errors, as the app does. */
const check = () => {
  const inputs = form.read();
  form.showErrors(inputs ? runCheck(inputs).inputErrorDetails : []);
};
const summary = () => form.element.querySelector<HTMLElement>('.error-summary');

beforeEach(() => {
  document.body.replaceChildren();
  form = createInputForm();
  document.body.append(form.element);
  form.loadExample('A1'); // valid beam inputs
  check();
});

describe('a field outside the input limits', () => {
  beforeEach(() => {
    type(input('in-b'), '0.000001');
    check();
  });

  it('is marked invalid and linked to its error line', () => {
    const b = input('in-b');
    expect(b.getAttribute('aria-invalid')).toBe('true');
    const errId = b.getAttribute('aria-describedby')?.split(' ')[0] ?? '';
    const err = document.getElementById(errId);
    expect(err?.classList.contains('field-error')).toBe(true);
    expect(err?.textContent).toBe(
      'Deck width must be between 0.5 and 20 m (input limit of this tool).',
    );
    expect(b.closest('.field')?.classList.contains('is-invalid')).toBe(true);
  });

  it('is listed in the summary, whose link moves focus to the field', () => {
    const s = summary();
    expect(s?.getAttribute('role')).toBe('alert');
    expect(s?.querySelector('.error-summary-title')?.textContent).toBe('1 value needs checking');
    const links = [...(s?.querySelectorAll('a') ?? [])];
    expect(links.map((a) => a.textContent)).toEqual(['Deck width']);
    links[0]?.click();
    expect(document.activeElement).toBe(input('in-b'));
  });

  it('clears when the value is fixed', () => {
    type(input('in-b'), '2.5');
    check();
    expect(input('in-b').hasAttribute('aria-invalid')).toBe(false);
    expect(form.element.querySelector('.field-error')).toBeNull();
    expect(summary()).toBeNull();
  });
});

describe('damping typed as a ratio', () => {
  beforeEach(() => {
    type(input('in-damping'), '0.006');
    type(input('in-b'), '0.000001');
    check();
  });

  it('counts both problems in the summary, in form order', () => {
    expect(summary()?.querySelector('.error-summary-title')?.textContent).toBe(
      '2 values need checking',
    );
    expect([...(summary()?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      'Deck width',
      'Damping',
    ]);
  });

  it('asks whether a percentage was meant and offers "Use 0.6 %"', () => {
    const field = input('in-damping').closest('.field') as HTMLElement;
    expect(field.querySelector('.fix-hint')?.textContent).toBe(
      'This box takes a percentage: did you mean 0.6 %?',
    );
    const fix = field.querySelector<HTMLButtonElement>('.fix-btn');
    expect(fix?.textContent).toBe('Use 0.6 %');
    expect(input('in-damping').getAttribute('aria-describedby')).toContain('in-damping-err');
  });

  it('the fix fills 0.6, runs the check and clears the damping error', () => {
    let changes = 0;
    form.onChange(() => changes++);
    form.element.querySelector<HTMLButtonElement>('.fix-btn')?.click();
    expect(input('in-damping').value).toBe('0.6');
    expect(changes).toBeGreaterThan(0);
    check();
    expect(input('in-damping').hasAttribute('aria-invalid')).toBe(false);
    expect(form.element.querySelector('.fix-btn')).toBeNull();
    expect(summary()?.querySelector('.error-summary-title')?.textContent).toBe(
      '1 value needs checking',
    );
    expect(document.activeElement).toBe(input('in-damping'));
  });

  it('offers no fix when moving the decimal point would not help', () => {
    type(input('in-damping'), '0.0001');
    check();
    expect(input('in-damping').getAttribute('aria-invalid')).toBe('true');
    expect(form.element.querySelector('.fix-btn')).toBeNull();
  });
});

describe('fields the user has not reached yet', () => {
  it('are not marked red while blank and untouched', () => {
    form.write(emptyFormValues());
    // A fresh form: the user has typed only the span.
    const fresh = createInputForm();
    document.body.replaceChildren(fresh.element);
    form = fresh;
    type(input('in-L'), '30');
    check();
    expect(input('in-EI').hasAttribute('aria-invalid')).toBe(false);
    expect(summary()).toBeNull();
  });

  it('are marked once the user has left them', () => {
    const fresh = createInputForm();
    document.body.replaceChildren(fresh.element);
    form = fresh;
    type(input('in-L'), '30');
    input('in-EI').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    check();
    expect(input('in-EI').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('errors inside the closed Advanced section', () => {
  it('open the section so the red field can be seen', () => {
    const adv = form.element.querySelector<HTMLDetailsElement>('details.advanced');
    expect(adv?.open).toBe(false);
    form.write({
      ...form.values(),
      k4: '1.5',
      bridgeClass: 'C',
      k1: 'rural',
      k2: 'alternative',
      height: '10',
    });
    check();
    expect(input('in-k4').getAttribute('aria-invalid')).toBe('true');
    expect(adv?.open).toBe(true);
  });
});

describe('mode table errors', () => {
  it('mark the input in the right row', () => {
    form.write({
      ...emptyFormValues(),
      inputMode: 'modal',
      L: '30',
      modes: [
        { f: '2', M: '15000', damping: '0.5', direction: 'vertical', shape: 'half-sine', Seff: '' },
        {
          f: '3',
          M: '15000',
          damping: '0.005',
          direction: 'vertical',
          shape: 'half-sine',
          Seff: '',
        },
      ],
    });
    check();
    const bad = input('in-mode-1-damping');
    expect(bad.getAttribute('aria-invalid')).toBe('true');
    expect(input('in-mode-0-damping').hasAttribute('aria-invalid')).toBe(false);
    const err = document.getElementById(bad.getAttribute('aria-describedby')?.split(' ')[0] ?? '');
    expect(err?.textContent).toMatch(/^Mode 2: damping must be between 0\.1 % and 10 %/);
    expect([...(summary()?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      'Mode 2 damping',
    ]);
    expect(bad.closest('.mode-row')?.querySelector('.fix-btn')?.textContent).toBe('Use 0.5 %');
  });
});
