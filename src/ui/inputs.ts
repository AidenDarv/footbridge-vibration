// Inputs panel ("Your bridge", design/DESIGN.md §3). Holds raw strings as typed; conversion to
// engine inputs is in share/form-values. No maths here (CLAUDE.md).

import type { CheckInputs, Direction, InputError } from '../engine/check';
import type { K1Key, K2Key } from '../engine/limits';
import { BRIDGE_CLASSES, type BridgeClass } from '../engine/loads';
import type { ShapeType } from '../engine/modal';
import {
  MAX_MODES,
  emptyFormValues,
  formToInputs,
  type FormValues,
  type ModeRowValues,
} from '../share/form-values';
import { DAMPING_SOURCE, typicalDamping } from '../engine/damping';
import { CUSTOM_DAMPING, dampingOptions, materialForDamping } from '../share/damping-options';
import { EXAMPLES, applyExample, nameAfterEdit, type ExampleBridge } from '../share/examples';
import { fixed } from '../share/format';
import { CLASS_LABELS } from '../share/wording';
import { h, tip } from './dom';
import { errorSummary, markFields } from './field-errors';

/** Short names for the example pills; the full label is shown under them when pressed. */
const PILL_LABEL: Record<string, string> = {
  A1: 'Test bridge A1',
  podgorica: 'Podgorica',
  millennium: 'Millennium Bridge',
  'steel-box-40': 'Steel girder, 40 m',
  'concrete-20': 'Concrete beam, 20 m',
  'stiff-concrete-15': 'Stiff concrete, 15 m',
  'timber-25': 'Timber, 25 m',
  'suspension-modal': 'Suspension, modal',
};

/** "How busy is it?" rows: plain English, with the Table NA.7 class underneath. */
const CLASS_TITLE: Record<BridgeClass, string> = {
  A: 'Quiet, rural',
  B: 'Suburban, occasional peaks',
  C: 'Urban, busy every day',
  D: 'Stadium or transport hub',
};

/** "Setting" options for k1 (NA.2.44.6, Table NA.9), in plain English. */
const K1_PLAIN: [K1Key, string][] = [
  ['hospital', 'Hospital route'],
  ['school', 'School route'],
  ['stadia', 'Stadium or other high-usage route'],
  ['urban', 'Major urban centre'],
  ['suburban', 'Suburban'],
  ['rural', 'Rural'],
];

/** "Other ways across?" options for k2 (NA.2.44.6, Table NA.10). */
const K2_PLAIN: [K2Key, string][] = [
  ['sole', 'No, it is the only way across'],
  ['primary', 'It is the main route'],
  ['alternative', 'Yes, easily'],
];

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

/** A label with its unit in grey next to it. */
function labelFor(id: string, text: string, unit: string): HTMLLabelElement {
  return h(
    'label',
    { class: 'lbl', for: id },
    text,
    unit ? h('span', { class: 'lbl-unit' }, unit) : null,
  );
}

function textInput(name: string, attrs: Record<string, string> = {}): HTMLInputElement {
  return h('input', {
    id: `in-${name}`,
    name,
    class: 'inp',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    ...attrs,
  });
}

/** A labelled number field, with an optional hint underneath. */
function field(
  name: string,
  label: string,
  unit: string,
  hint?: string,
  attrs: Record<string, string> = {},
) {
  const id = `in-${name}`;
  const hintId = `${id}-hint`;
  const input = textInput(name, hint ? { 'aria-describedby': hintId, ...attrs } : attrs);
  return h(
    'div',
    { class: 'field', 'data-field': name },
    labelFor(id, label, unit),
    input,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
  );
}

function selectField(
  name: string,
  label: string,
  options: [string, string][],
  placeholder: string,
  hint?: string,
): HTMLElement {
  const id = `in-${name}`;
  const hintId = `${id}-hint`;
  const sel = h('select', {
    id,
    name,
    class: 'sel',
    'aria-describedby': hint ? hintId : undefined,
  });
  sel.append(h('option', { value: '' }, placeholder));
  for (const [value, text] of options) sel.append(h('option', { value }, text));
  return h(
    'div',
    { class: 'field', 'data-field': name },
    labelFor(id, label, ''),
    sel,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
  );
}

/** A numbered step of the form: the steps are filled in order. */
function step(num: string, title: string, ...children: (Node | null)[]): HTMLElement {
  return h(
    'fieldset',
    { class: 'step' },
    h(
      'legend',
      { class: 'step-legend' },
      h('span', { class: 'step-num' }, num),
      h('span', { class: 'step-title' }, title),
    ),
    ...children,
  );
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

const MODE_NUM_FIELDS = ['f', 'M', 'damping', 'Seff'] as const;

function modeRow(index: number, onRemove: (row: HTMLElement) => void): HTMLElement {
  const cell = (name: keyof typeof MODE_TIPS, label: string, el: HTMLElement) =>
    h(
      'div',
      { class: 'mode-cell', 'data-cell': name },
      h('label', { class: 'mode-cell-label', for: el.id }, label),
      ' ',
      tip(MODE_TIPS[name]),
      el,
    );
  const num = (name: (typeof MODE_NUM_FIELDS)[number], label: string) =>
    cell(
      name,
      label,
      h('input', {
        name,
        class: 'inp',
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': `Mode ${index}: ${label}`,
      }),
    );
  const opts = (name: 'direction' | 'shape', label: string, options: [string, string][]) => {
    const sel = h('select', { name, class: 'sel', 'aria-label': `Mode ${index}: ${label}` });
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
    h('div', { class: 'mode-head' }, h('span', { class: 'mode-index' }, `Mode ${index}`), remove),
    h(
      'div',
      { class: 'mode-grid' },
      num('f', 'f (Hz)'),
      num('M', 'M (kg)'),
      num('damping', 'ξ (%)'),
      opts('direction', 'Direction', DIRECTIONS),
      opts('shape', 'Shape', SHAPES),
      num('Seff', 'Seff (m)'),
    ),
    h('div', { class: 'mode-errors' }),
  );
  remove.addEventListener('click', () => onRemove(row));
  return row;
}

/** PD 6688-2 Table A.1, for the mode table (each mode has its own damping). */
function dampingTable(): HTMLElement {
  const range = (lo: number, hi: number, d: number) =>
    lo === hi ? fixed(lo, d) : `${fixed(lo, d)}–${fixed(hi, d)}`;
  return h(
    'details',
    { class: 'suggestions' },
    h('summary', {}, 'Typical damping (PD 6688-2 Table A.1)'),
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
      { class: 'hint' },
      `Suggestions only, from ${DAMPING_SOURCE}. Use measured damping if you have it.`,
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
  /** Marks the fields named in the engine's input errors, with a summary at the top. */
  showErrors(errors: readonly InputError[]): void;
}

export function createInputForm(): InputForm {
  const listeners: (() => void)[] = [];
  /** The example last loaded, while the bridge inputs still match it. */
  let loaded: ExampleBridge | null = null;
  let mode: 'beam' | 'modal' = 'beam';
  const nameNote = h('p', { class: 'hint', id: 'in-name-note', 'aria-live': 'polite' });

  // ---------- Examples ----------
  const pills = EXAMPLES.map((ex) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'pill',
        'aria-pressed': 'false',
        'data-example': ex.id,
        title: ex.label,
      },
      PILL_LABEL[ex.id] ?? ex.label,
    );
    b.addEventListener('click', () => loadExample(ex.id));
    return b;
  });
  const exampleNote = h('p', { class: 'hint example-note', 'aria-live': 'polite' });
  const syncPills = () => {
    for (const p of pills) p.setAttribute('aria-pressed', String(loaded?.id === p.dataset.example));
    exampleNote.textContent = loaded ? loaded.label : '';
  };

  /**
   * Once the bridge inputs no longer match the loaded example, its name is cleared, so a result
   * is never labelled with the wrong bridge (nameAfterEdit).
   */
  const syncExampleName = () => {
    if (loaded === null) return;
    const v = values();
    if (v.name !== loaded.values.name) {
      loaded = null; // the user renamed it
    } else if (nameAfterEdit(v, loaded) === '') {
      el('name').value = '';
      nameNote.textContent =
        'The example’s name was removed because the bridge inputs no longer match it. Enter a name for your bridge.';
      loaded = null;
    }
    syncPills();
  };
  const changed = () => {
    syncExampleName();
    listeners.forEach((cb) => cb());
  };

  // ---------- Modes table ----------
  const modesList = h('div', { class: 'modes-list' });
  const renumber = () => {
    modesList.querySelectorAll<HTMLElement>('.mode-row').forEach((row, i) => {
      const n = i + 1;
      const idx = row.querySelector('.mode-index');
      if (idx) idx.textContent = `Mode ${n}`;
      row.dataset.modeIndex = String(i);
      row.querySelector('.btn-icon')?.setAttribute('aria-label', `Remove mode ${n}`);
      for (const name of [...MODE_NUM_FIELDS, 'direction', 'shape']) {
        const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
        if (!input) continue;
        input.id = `in-mode-${i}-${name}`;
        const label = row.querySelector(`[data-cell="${name}"] .mode-cell-label`);
        label?.setAttribute('for', input.id);
        input.setAttribute('aria-label', `Mode ${n}: ${label?.textContent ?? name}`);
      }
    });
    // A share link carries at most MAX_MODES rows, so the table stops there too.
    addBtn.disabled = modesList.children.length >= MAX_MODES;
  };
  const removeRow = (row: HTMLElement) => {
    row.remove();
    renumber();
    changed();
  };
  const addRow = () => {
    if (modesList.children.length >= MAX_MODES) return;
    modesList.append(modeRow(modesList.children.length + 1, removeRow));
    renumber();
    syncSeffFields();
  };
  const addBtn = h(
    'button',
    { type: 'button', class: 'btn btn-small', title: `Up to ${MAX_MODES} modes` },
    '+ Add mode',
  );
  addBtn.addEventListener('click', () => {
    addRow();
    changed();
  });

  // ---------- Structure ----------
  const segBeam = h(
    'button',
    { type: 'button', 'aria-pressed': 'true', 'data-mode': 'beam' },
    'Simple span',
  );
  const segModal = h(
    'button',
    { type: 'button', 'aria-pressed': 'false', 'data-mode': 'modal' },
    'Modes from FE model',
  );
  const segmented = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'How to describe the bridge' },
    segBeam,
    segModal,
  );
  for (const b of [segBeam, segModal]) {
    b.addEventListener('click', () => {
      const next = b.dataset.mode as 'beam' | 'modal';
      if (next === mode) return;
      setMode(next);
      changed();
    });
  }

  const dampingSelect = h('select', {
    id: 'in-damping-material',
    class: 'sel',
    'aria-label': 'Typical damping by material (PD 6688-2 Table A.1)',
  });
  for (const o of dampingOptions()) dampingSelect.append(h('option', { value: o.id }, o.label));
  dampingSelect.value = CUSTOM_DAMPING;

  const dampingInput = textInput('damping', { 'aria-describedby': 'in-damping-hint' });
  const dampingField = h(
    'div',
    { class: 'field beam-only', 'data-field': 'damping' },
    labelFor('in-damping', 'Damping', '%'),
    h(
      'div',
      { class: 'damping-row' },
      dampingSelect,
      h(
        'div',
        { class: 'pct-wrap' },
        dampingInput,
        h('span', { class: 'pct', 'aria-hidden': 'true' }, '%'),
      ),
    ),
    h(
      'p',
      { class: 'hint', id: 'in-damping-hint' },
      'Damping ratio ξ in %. Typical values from PD 6688-2 Table A.1; a range fills its lower, conservative value. Use measured damping if you have it. ',
      h('span', { class: 'ref' }, 'δ = 2πξ, Figure NA.9'),
    ),
  );
  dampingSelect.addEventListener('change', () => {
    const opt = dampingOptions().find((o) => o.id === dampingSelect.value);
    if (!opt || opt.id === CUSTOM_DAMPING) return;
    dampingInput.value = opt.value;
    changed();
  });

  const structureGrid = h(
    'div',
    { class: 'grid-2' },
    field('L', 'Span', 'm'),
    field('b', 'Deck width', 'm'),
    h(
      'div',
      { class: 'beam-only contents' },
      field('m', 'Mass per metre', 'kg/m'),
      field('EI', 'Bending stiffness EI', 'N·m²'),
    ),
  );

  const modalFields = h(
    'div',
    { class: 'modal-only' },
    h(
      'p',
      { class: 'hint' },
      'Enter each mode from your FE model, with the mode shape scaled so its largest value is 1 (not mass-normalised). "Enter Seff" runs the crowd case only. ',
      tip(
        'If your FE output is mass-normalised (M = 1), rescale: divide the shape by its largest value, and use M = 1/φmax². The moving-load group case needs φ(x) along the span, so it cannot run with only Seff (SPEC §2.1, §2.5).',
      ),
    ),
    modesList,
    addBtn,
    dampingTable(),
    field(
      'mBridgeMin',
      'Lowest deck mass per metre',
      'kg/m',
      'For the lateral lock-in check, D = m·ξ/m_pedestrian. Needed when a lateral or torsional mode is below 1.5 Hz. Use the lowest value if the mass varies (NA.2.44.7; PD 6688-2 §A.7).',
    ),
  );

  // ---------- Usage ----------
  const classRows = (Object.keys(BRIDGE_CLASSES) as BridgeClass[]).map((cls) => {
    const d = BRIDGE_CLASSES[cls];
    const sub = [`Class ${cls}`, `groups of ${d.groupWalking}`];
    if (d.crowdDensity > 0) sub.push(`crowd ${d.crowdDensity} people/m²`);
    return h(
      'label',
      { class: 'choice', title: CLASS_LABELS[cls] },
      h('input', { type: 'radio', name: 'bridgeClass', value: cls }),
      h(
        'span',
        { class: 'choice-text' },
        h('span', { class: 'choice-title' }, CLASS_TITLE[cls]),
        h('span', { class: 'choice-sub' }, sub.join(' · ')),
      ),
    );
  });
  const classGroup = h(
    'fieldset',
    { class: 'choice-group', 'aria-describedby': 'in-class-hint' },
    h('legend', { class: 'lbl' }, 'How busy is it?'),
    h('div', { class: 'choice-list' }, ...classRows),
    h(
      'p',
      { class: 'hint', id: 'in-class-hint' },
      'Sets the group sizes and crowd density. Descriptions are shortened. ',
      h('span', { class: 'ref' }, 'NA.2.44.2, Table NA.7'),
    ),
  );

  const k4Just = h('textarea', {
    id: 'in-k4Justification',
    name: 'k4Justification',
    class: 'inp',
    rows: '2',
    placeholder: 'Needed if k₄ is not 1.0. Printed on the calc sheet.',
  });

  const advanced = h(
    'details',
    { class: 'advanced' },
    h('summary', {}, 'Advanced: exposure factor k₄, group sizes, crowd density'),
    h(
      'div',
      { class: 'advanced-body' },
      field(
        'k4',
        'Exposure factor k₄',
        '',
        'Default 1.0. You may use 0.8 to 1.2 with a justification (NA.2.44.6).',
        {
          value: '1.0',
        },
      ),
      h('div', { class: 'field' }, labelFor('in-k4Justification', 'k₄ justification', ''), k4Just),
      h(
        'p',
        { class: 'hint' },
        'Leave the overrides blank to use Table NA.7. Set them for the project if you can (NA.2.44.2(2)). Overrides are flagged and printed in red on the calc sheet.',
      ),
      h(
        'div',
        { class: 'grid-3' },
        field('groupWalking', 'Walking group', 'people', undefined, { inputmode: 'numeric' }),
        field('groupJogging', 'Jogging group', 'people', undefined, { inputmode: 'numeric' }),
        field('crowdDensity', 'Crowd density', 'people/m²'),
      ),
      h('p', { class: 'hint' }, 'Crowd density is capped at 1.0 in the crowd load (NA.2.44.5).'),
    ),
  );

  const form = h(
    'form',
    { class: 'inputs', novalidate: true, autocomplete: 'off', 'aria-labelledby': 'inputs-h' },
    h('div', { class: 'error-summary-slot' }),
    h(
      'div',
      { class: 'examples' },
      h('p', { class: 'lbl', id: 'examples-label' }, 'Start from an example'),
      h('div', { class: 'pills', role: 'group', 'aria-labelledby': 'examples-label' }, ...pills),
      exampleNote,
    ),
    step(
      '01',
      'The structure',
      segmented,
      structureGrid,
      h(
        'p',
        { class: 'hint beam-only' },
        'Simply supported span. Include permanent and superimposed dead load in the mass. E-notation is fine for EI, e.g. 1.3e9. ',
        h('span', { class: 'ref' }, 'SPEC §2.1'),
      ),
      dampingField,
      modalFields,
    ),
    step(
      '02',
      'Where it is and who uses it',
      classGroup,
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', name: 'includeJogging', checked: true }),
        h('span', {}, 'Include joggers'),
      ),
      h(
        'div',
        { class: 'grid-2' },
        selectField('k1', 'Setting', K1_PLAIN, 'Choose…', 'Site usage, k₁ (Table NA.9)'),
        selectField(
          'k2',
          'Other ways across?',
          K2_PLAIN,
          'Choose…',
          'Route redundancy, k₂ (Table NA.10)',
        ),
        field('height', 'Height above ground', 'm', 'Sets k₃ (Table NA.11)'),
      ),
      advanced,
    ),
    step(
      '03',
      'For the calc sheet',
      h(
        'div',
        { class: 'grid-2' },
        h(
          'div',
          { class: 'field' },
          labelFor('in-project', 'Project', ''),
          h('input', {
            id: 'in-project',
            name: 'project',
            class: 'inp inp-text',
            type: 'text',
            autocomplete: 'off',
          }),
        ),
        h(
          'div',
          { class: 'field' },
          labelFor('in-name', 'Bridge name', ''),
          h('input', {
            id: 'in-name',
            name: 'name',
            class: 'inp inp-text',
            type: 'text',
            autocomplete: 'off',
            'aria-describedby': 'in-name-note',
          }),
          nameNote,
        ),
      ),
    ),
  );

  const el = <T extends HTMLElement = HTMLInputElement>(name: string) =>
    form.querySelector(`[name="${name}"]`) as T;
  const text = (name: string) => el<HTMLInputElement>(name).value;
  const setText = (name: string, value: string) => {
    el<HTMLInputElement>(name).value = value;
  };

  function setMode(next: 'beam' | 'modal') {
    mode = next;
    form.dataset.mode = mode;
    segBeam.setAttribute('aria-pressed', String(mode === 'beam'));
    segModal.setAttribute('aria-pressed', String(mode === 'modal'));
    if (mode === 'modal' && modesList.children.length === 0) addRow();
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
    v.inputMode = mode;
    for (const name of SCALAR_TEXT) v[name] = text(name);
    v.bridgeClass = (form.querySelector<HTMLInputElement>('input[name="bridgeClass"]:checked')
      ?.value ?? '') as BridgeClass | '';
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
    loaded = null;
    nameNote.textContent = '';
    for (const name of SCALAR_TEXT) setText(name, v[name]);
    for (const r of form.querySelectorAll<HTMLInputElement>('input[name="bridgeClass"]')) {
      r.checked = r.value === v.bridgeClass;
    }
    el<HTMLInputElement>('includeJogging').checked = v.includeJogging;
    setText('k1', v.k1);
    setText('k2', v.k2);
    dampingSelect.value = materialForDamping(v.damping);
    modesList.replaceChildren();
    v.modes.forEach((mv, i) => {
      const row = modeRow(i + 1, removeRow);
      for (const [n, value] of Object.entries(mv)) {
        const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`);
        if (input) input.value = value;
      }
      modesList.append(row);
    });
    renumber();
    setMode(v.inputMode);
    syncSeffFields();
    syncPills();
    // Values loaded from an example or a link are shown with their errors straight away.
    for (const c of form.querySelectorAll<HTMLElement>('input[id], select[id], textarea[id]')) {
      touched.add(c.id);
    }
    changed();
  }

  /** Controls the user has typed in or left; only these (or non-blank ones) turn red. */
  const touched = new Set<string>();
  const reached = (c: HTMLElement) =>
    touched.has(c.id) || (c instanceof HTMLInputElement && c.value.trim() !== '');
  const summarySlot = form.querySelector('.error-summary-slot') as HTMLElement;
  let summaryKey = '';

  function showErrors(errors: readonly InputError[]) {
    const shown = markFields(form, errors, reached, (control, value) => {
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.focus();
    });
    // Redraw the summary only when it changes, so the alert is not announced on every key.
    const key = shown.map((s) => `${s.control.id}:${s.error.message}`).join('|');
    if (key !== summaryKey) {
      summaryKey = key;
      const box = errorSummary(shown);
      summarySlot.replaceChildren(...(box ? [box] : []));
    }
  }

  function loadExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    write(applyExample(values(), ex));
    loaded = ex;
    syncPills();
  }

  form.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target === dampingSelect) return; // handled on change
    if (target === dampingInput) dampingSelect.value = CUSTOM_DAMPING;
    if (target instanceof HTMLInputElement && target.name === 'name') nameNote.textContent = '';
    if (target instanceof HTMLSelectElement && target.name === 'shape') syncSeffFields();
    if (target.id) touched.add(target.id);
    changed();
  });
  form.addEventListener('focusout', (e) => {
    const t = e.target as HTMLElement;
    if (t.id && t.matches('input, select, textarea')) touched.add(t.id);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  setMode('beam');

  return {
    element: form,
    read: () => formToInputs(values()),
    values,
    write,
    loadExample,
    onChange: (cb) => listeners.push(cb),
    showErrors,
  };
}
