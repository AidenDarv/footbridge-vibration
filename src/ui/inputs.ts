// Input form. Holds raw strings as typed; conversion to engine inputs is in share/form-values.
// No maths here (CLAUDE.md).

import type { CheckInputs, Direction } from '../engine/check';
import type { K1Key, K2Key } from '../engine/limits';
import type { BridgeClass } from '../engine/loads';
import type { ShapeType } from '../engine/modal';
import cases from '../../validation/cases.json';
import {
  emptyFormValues,
  formToInputs,
  type FormValues,
  type ModeRowValues,
} from '../share/form-values';
import { DAMPING_SOURCE, typicalDamping } from '../engine/damping';
import { fixed } from '../share/format';
import { CLASS_LABELS, K1_LABELS, K2_LABELS } from '../share/wording';
import { h, tip } from './dom';

const K1_OPTIONS = Object.entries(K1_LABELS) as [K1Key, string][];
const K2_OPTIONS = Object.entries(K2_LABELS) as [K2Key, string][];
const CLASS_OPTIONS = Object.entries(CLASS_LABELS) as [BridgeClass, string][];

const DIRECTIONS: [Direction, string][] = [
  ['vertical', 'Vertical'],
  ['lateral', 'Lateral'],
  ['torsional', 'Torsional'],
];

const SHAPES: [ShapeType, string][] = [
  ['half-sine', 'Half-sine'],
  ['full-sine', 'Full-sine'],
  ['user-seff', 'Enter Seff'],
];

export interface ExampleBridge {
  id: string;
  label: string;
  values: Partial<FormValues>;
}

/** Bridge A1 from SPEC §6 (validation/cases.json). Usage and comfort are left for the user. */
function exampleA1(): ExampleBridge {
  const a1 = cases.level1.cases.find((c) => c.id === 'A1');
  const { bridge } = cases.level2;
  const inputs = (a1?.inputs ?? {}) as Record<string, number>;
  return {
    id: 'A1',
    label: 'Bridge A1: 30 m simply supported test beam (SPEC §6)',
    values: {
      inputMode: 'beam',
      name: 'Bridge A1 (validation beam)',
      L: String(inputs.L),
      EI: String(inputs.EI),
      m: String(inputs.m),
      damping: String(bridge.zeta * 100),
      b: String(bridge.b),
    },
  };
}

export const EXAMPLES: ExampleBridge[] = [exampleA1()];

function field(
  name: string,
  label: string,
  unit: string,
  help: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  const id = `in-${name}`;
  return h(
    'div',
    { class: 'field', 'data-field': name },
    h('label', { for: id }, label, ' ', tip(help)),
    h(
      'div',
      { class: 'input-unit' },
      h('input', {
        id,
        name,
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        ...attrs,
      }),
      unit ? h('span', { class: 'unit' }, unit) : null,
    ),
  );
}

function select(
  name: string,
  label: string,
  help: string,
  options: [string, string][],
  placeholder: string | null,
): HTMLElement {
  const id = `in-${name}`;
  const sel = h('select', { id, name });
  if (placeholder !== null) sel.append(h('option', { value: '' }, placeholder));
  for (const [value, text] of options) sel.append(h('option', { value }, text));
  return h('div', { class: 'field' }, h('label', { for: id }, label, ' ', tip(help)), sel);
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('fieldset', { class: 'group' }, h('legend', {}, title), ...children);
}

/** Tooltip text for each mode-row input, with its clause (review #11). */
const MODE_TIPS: Record<'f' | 'M' | 'damping' | 'direction' | 'shape' | 'Seff', string> = {
  f: 'Natural frequency of this mode from your FE model (SPEC §2.1). A vertical mode below 5 Hz needs the comfort check (NA.2.44.6(1)).',
  M: 'Modal mass for this mode, with the shape scaled so its largest value is 1, not mass-normalised (SPEC §2.1).',
  damping:
    'Damping ratio as a percentage of critical. The log decrement δ = 2πξ is used to read γ (NA.2.44.4, Figure NA.9).',
  direction:
    'Vertical modes get the group and crowd cases (NA.2.44.4, NA.2.44.5). Lateral and torsional modes get the frequency flags (NA.2.44.6(3), (4)) and, below 1.5 Hz, the lock-in check (NA.2.44.7).',
  shape:
    'Half-sine or full-sine sets φ(x) and Seff (NA.2.44.4, Figure NA.7). "Enter Seff" runs the crowd case only, because the group case needs φ(x) (SPEC §2.5).',
  Seff: 'Effective span, used only with "Enter Seff". It cannot be more than S/0.637 (NA.2.44.4, Figure NA.7).',
};

function modeRow(index: number, onRemove: (row: HTMLElement) => void): HTMLElement {
  const cell = (name: keyof typeof MODE_TIPS, label: string, el: HTMLElement) =>
    h(
      'label',
      { class: 'mode-cell' },
      h('span', { class: 'mode-cell-label' }, label, ' ', tip(MODE_TIPS[name])),
      el,
    );
  const num = (name: 'f' | 'M' | 'damping' | 'Seff', label: string) =>
    cell(
      name,
      label,
      h('input', {
        name,
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        'aria-label': `Mode ${index}: ${label}`,
      }),
    );
  const opts = (name: 'direction' | 'shape', label: string, options: [string, string][]) => {
    const sel = h('select', { name, 'aria-label': `Mode ${index}: ${label}` });
    for (const [v, t] of options) sel.append(h('option', { value: v }, t));
    return cell(name, label, sel);
  };
  const remove = h(
    'button',
    { type: 'button', class: 'btn-icon', 'aria-label': `Remove mode ${index}` },
    '×',
  );
  const row = h(
    'div',
    { class: 'mode-row' },
    h('span', { class: 'mode-index' }, `${index}`),
    num('f', 'f (Hz)'),
    num('M', 'M (kg)'),
    num('damping', 'ξ (%)'),
    opts('direction', 'Direction', DIRECTIONS),
    opts('shape', 'Shape', SHAPES),
    num('Seff', 'Seff (m)'),
    remove,
  );
  remove.addEventListener('click', () => onRemove(row));
  return row;
}

/** PD 6688-2 Table A.1 suggestions. Shown only; the user still types the value. */
function dampingSuggestions(): HTMLElement {
  const range = (lo: number, hi: number, d: number) =>
    lo === hi ? fixed(lo, d) : `${fixed(lo, d)}–${fixed(hi, d)}`;
  return h(
    'details',
    { class: 'suggestions' },
    h('summary', {}, 'Typical values (PD 6688-2 Table A.1)'),
    h(
      'table',
      { class: 'suggest-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Material'), h('th', {}, 'δ'), h('th', {}, 'ξ (%)'))),
      h(
        'tbody',
        {},
        ...typicalDamping().map((s) =>
          h(
            'tr',
            {},
            h('td', {}, s.label),
            h('td', {}, range(s.deltaMin, s.deltaMax, 2)),
            h('td', {}, range(s.zetaPercentMin, s.zetaPercentMax, 2)),
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'note' },
      `Suggestions only, from ${DAMPING_SOURCE}. Enter the damping you can justify for your structure.`,
    ),
  );
}

export interface InputForm {
  element: HTMLFormElement;
  /** Current inputs, or null when the bridge section is still blank. */
  read(): CheckInputs | null;
  /** The raw values as typed (for the share link and calc sheet). */
  values(): FormValues;
  /** Fill the form from values, e.g. from a share link. */
  write(values: FormValues): void;
  loadExample(id: string): void;
  onChange(cb: () => void): void;
}

export function createInputForm(): InputForm {
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((cb) => cb());

  const modesList = h('div', { class: 'modes-list' });
  const renumber = () => {
    modesList.querySelectorAll<HTMLElement>('.mode-row').forEach((row, i) => {
      const idx = row.querySelector('.mode-index');
      if (idx) idx.textContent = `${i + 1}`;
    });
  };
  const removeRow = (row: HTMLElement) => {
    row.remove();
    renumber();
    changed();
  };
  const addRow = () => {
    modesList.append(modeRow(modesList.children.length + 1, removeRow));
    syncSeffFields();
  };
  const addBtn = h('button', { type: 'button', class: 'btn' }, '+ Add mode');
  addBtn.addEventListener('click', () => {
    addRow();
    changed();
  });

  const exampleSel = h('select', { id: 'in-example', name: 'example' });
  exampleSel.append(h('option', { value: '' }, 'Choose an example…'));
  for (const ex of EXAMPLES) exampleSel.append(h('option', { value: ex.id }, ex.label));

  const modeToggle = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Bridge input mode' },
    h(
      'label',
      {},
      h('input', { type: 'radio', name: 'inputMode', value: 'beam', checked: true }),
      h('span', {}, 'Beam'),
    ),
    h(
      'label',
      {},
      h('input', { type: 'radio', name: 'inputMode', value: 'modal' }),
      h('span', {}, 'Modal (from FE)'),
    ),
  );

  const beamFields = h(
    'div',
    { class: 'beam-only grid-2' },
    field(
      'EI',
      'Bending stiffness EI',
      'N·m²',
      'Vertical flexural rigidity of the deck. Used for the simply supported frequencies (SPEC §2.1). E-notation is fine, e.g. 1.3e9.',
    ),
    field(
      'm',
      'Mass per metre',
      'kg/m',
      'Include permanent and superimposed dead load. Used for frequency and modal mass M = mL/2 (SPEC §2.1).',
    ),
    field(
      'damping',
      'Damping ratio ξ',
      '%',
      'Damping ratio as a percentage of critical. The log decrement δ = 2πξ is shown in the results, because the NA figures use δ (NA.2.44.4, Figure NA.9).',
    ),
    dampingSuggestions(),
  );

  const modalFields = h(
    'div',
    { class: 'modal-only' },
    h(
      'p',
      { class: 'note' },
      'Enter each mode from your FE model. Modal mass must match a mode shape scaled so its largest value is 1 (not mass-normalised). ',
      tip(
        'If your FE output is mass-normalised (M = 1), rescale: divide the shape by its largest value, and use M = 1/φmax². The tool assumes max |φ| = 1 (SPEC §2.1).',
      ),
    ),
    h(
      'p',
      { class: 'note' },
      'Shape "Enter Seff" runs the crowd case only. The group case needs a mode shape. ',
      tip(
        'The moving-load group case needs φ(x) along the span. With only Seff it cannot run, so choose half-sine or full-sine if that describes the mode (NA.2.44.4, SPEC §2.5).',
      ),
    ),
    modesList,
    addBtn,
    dampingSuggestions(),
    field(
      'mBridgeMin',
      'Lowest deck mass per metre',
      'kg/m',
      'Bridge mass per metre m_bridge in the lateral lock-in check, D = m_bridge·ξ/m_pedestrian (NA.2.44.7). Needed when a lateral or torsional mode is below 1.5 Hz. If the deck mass varies along the span, use the lowest value (PD 6688-2 §A.7).',
    ),
  );

  const k4Just = h('textarea', {
    id: 'in-k4Justification',
    name: 'k4Justification',
    rows: '2',
    placeholder: 'Needed if k4 is not 1.0. Printed on the calc sheet.',
  });

  const form = h(
    'form',
    { class: 'inputs', novalidate: true, autocomplete: 'off' },
    h(
      'div',
      { class: 'field example' },
      h('label', { for: 'in-example' }, 'Load example bridge'),
      exampleSel,
    ),
    section(
      '1  Bridge',
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'in-project' }, 'Project'),
        h('input', { id: 'in-project', name: 'project', type: 'text', autocomplete: 'off' }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'in-name' }, 'Bridge name'),
        h('input', { id: 'in-name', name: 'name', type: 'text', autocomplete: 'off' }),
      ),
      modeToggle,
      h(
        'div',
        { class: 'grid-2' },
        field(
          'L',
          'Span S',
          'm',
          'Length of the span crossed by pedestrians. Used for the moving load, deck area and Seff (NA.2.44.4, NA.2.44.5).',
        ),
        field(
          'b',
          'Deck width b',
          'm',
          'Walkway width. Sets the deck area A = S·b and the crowd size N = ρ·A (NA.2.44.5).',
        ),
        field(
          'height',
          'Height above ground',
          'm',
          'Height of the deck above the ground or water below. Sets the height factor k3 (NA.2.44.6, Table NA.11).',
        ),
      ),
      beamFields,
      modalFields,
    ),
    section(
      '2  Usage',
      select(
        'bridgeClass',
        'Bridge class',
        'Sets group sizes and crowd density (NA.2.44.2, Table NA.7). The descriptions here are shortened; check the NA for the full wording.',
        CLASS_OPTIONS,
        'Choose a class…',
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', name: 'includeJogging', checked: true }),
        h('span', {}, 'Include jogging groups'),
        ' ',
        tip(
          'Jogging cases may be left out for a particular project (NA.2.44.2(3)). The choice is printed on the calc sheet.',
        ),
      ),
      h(
        'details',
        { class: 'overrides' },
        h('summary', {}, 'Override group sizes or crowd density'),
        h(
          'p',
          { class: 'note' },
          'Leave blank to use Table NA.7. Values should be set for the project (NA.2.44.2(2)). Overrides are flagged and printed in red on the calc sheet.',
        ),
        h(
          'div',
          { class: 'grid-3' },
          field('groupWalking', 'Walking group N', '', 'Number of people in a walking group.', {
            inputmode: 'numeric',
          }),
          field('groupJogging', 'Jogging group N', '', 'Number of people in a jogging group.', {
            inputmode: 'numeric',
          }),
          field(
            'crowdDensity',
            'Crowd density ρ',
            'p/m²',
            'Persons per square metre. Capped at 1.0 in the crowd load (NA.2.44.5).',
          ),
        ),
      ),
    ),
    section(
      '3  Comfort limit',
      select('k1', 'Site usage, k1', 'NA.2.44.6, Table NA.9.', K1_OPTIONS, 'Choose site usage…'),
      select(
        'k2',
        'Route redundancy, k2',
        'NA.2.44.6, Table NA.10.',
        K2_OPTIONS,
        'Choose route redundancy…',
      ),
      field(
        'k4',
        'Exposure factor k4',
        '',
        'Default 1.0. You may use 0.8 to 1.2 with a justification (NA.2.44.6).',
        { value: '1.0' },
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'in-k4Justification' }, 'k4 justification'),
        k4Just,
      ),
    ),
  );

  const el = <T extends HTMLElement = HTMLInputElement>(name: string) =>
    form.querySelector(`[name="${name}"]`) as T;
  const text = (name: string) => el<HTMLInputElement>(name).value;
  const setText = (name: string, value: string) => {
    el<HTMLInputElement>(name).value = value;
  };
  const inputMode = () =>
    (form.querySelector<HTMLInputElement>('input[name="inputMode"]:checked')?.value ?? 'beam') as
      'beam' | 'modal';

  function syncMode() {
    form.dataset.mode = inputMode();
    if (inputMode() === 'modal' && modesList.children.length === 0) addRow();
  }

  function syncSeffFields() {
    modesList.querySelectorAll<HTMLElement>('.mode-row').forEach((row) => {
      const shape = row.querySelector<HTMLSelectElement>('select[name="shape"]')?.value;
      const seff = row.querySelector<HTMLInputElement>('input[name="Seff"]');
      if (seff) seff.disabled = shape !== 'user-seff';
    });
  }

  const SCALAR_TEXT = [
    'project',
    'name',
    'L',
    'b',
    'height',
    'EI',
    'm',
    'damping',
    'mBridgeMin',
    'groupWalking',
    'groupJogging',
    'crowdDensity',
    'k4',
    'k4Justification',
  ] as const;

  function values(): FormValues {
    const v = emptyFormValues();
    v.inputMode = inputMode();
    for (const name of SCALAR_TEXT) v[name] = text(name);
    v.bridgeClass = text('bridgeClass') as BridgeClass | '';
    v.includeJogging = el<HTMLInputElement>('includeJogging').checked;
    v.k1 = text('k1') as K1Key | '';
    v.k2 = text('k2') as K2Key | '';
    v.modes = [...modesList.querySelectorAll<HTMLElement>('.mode-row')].map((row) => {
      const get = (n: keyof ModeRowValues) =>
        row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`)?.value ?? '';
      return {
        f: get('f'),
        M: get('M'),
        damping: get('damping'),
        direction: get('direction') as Direction,
        shape: get('shape') as ShapeType,
        Seff: get('Seff'),
      };
    });
    return v;
  }

  function write(v: FormValues) {
    const radio = form.querySelector<HTMLInputElement>(
      `input[name="inputMode"][value="${v.inputMode}"]`,
    );
    if (radio) radio.checked = true;
    for (const name of SCALAR_TEXT) setText(name, v[name]);
    setText('bridgeClass', v.bridgeClass);
    el<HTMLInputElement>('includeJogging').checked = v.includeJogging;
    setText('k1', v.k1);
    setText('k2', v.k2);
    modesList.replaceChildren();
    v.modes.forEach((mv, i) => {
      const row = modeRow(i + 1, removeRow);
      for (const [n, value] of Object.entries(mv)) {
        const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`);
        if (input) input.value = value;
      }
      modesList.append(row);
    });
    exampleSel.value = '';
    syncMode();
    syncSeffFields();
    changed();
  }

  function loadExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    write({ ...values(), ...ex.values });
    exampleSel.value = id;
  }

  form.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target === exampleSel) return;
    if (target instanceof HTMLSelectElement && target.name === 'shape') syncSeffFields();
    if (target instanceof HTMLInputElement && target.name === 'inputMode') syncMode();
    changed();
  });
  exampleSel.addEventListener('change', () => loadExample(exampleSel.value));
  form.addEventListener('submit', (e) => e.preventDefault());
  syncMode();

  return {
    element: form,
    read: () => formToInputs(values()),
    values,
    write,
    loadExample,
    onChange: (cb) => listeners.push(cb),
  };
}
