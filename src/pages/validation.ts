// Validation page (SPEC §6): expected vs tool vs % difference, computed in the browser by the
// same engine code the checker uses. The numbers come from src/validation/rows.ts.

import cases from '../../validation/cases.json';
import { fixed, sig, signedPercent } from '../share/format';
import { h } from '../ui/dom';
import { validationGroups, type ValidationGroup, type ValidationRow } from '../validation/rows';
import { dataTable, link, list, page, section, startPage } from './common';

const REPO = 'https://github.com/AidenDarv/footbridge-vibration';
const root = startPage();

const results = h(
  'div',
  { class: 'page-results', 'aria-live': 'polite' },
  h('p', { class: 'note' }, 'Running the validation cases…'),
);

/** SPEC §6 Level 3 — published real bridges, not yet run. */
const COMING_SOON: { id: string; bridge: string; data: string; compare: string }[] = [
  {
    id: 'R1',
    bridge: 'Podgorica footbridge, Montenegro (Živanović 2012, J. Struct. Eng. 138(10))',
    data: 'Steel box girder, 78 m main span, f₁ = 2.04 Hz, modal mass 58 000 kg, ξ ≈ 0.26 %.',
    compare:
      'Class B and C predictions against peaks measured under normal traffic. The code method is expected to be conservative; the ratio will be reported and discussed.',
  },
  {
    id: 'R2',
    bridge: 'Eeklo footbridge, Belgium (Van Nimmen et al., J. Bridge Eng., ASCE)',
    data: 'Steel, 42 m central span, vertical mode 2.97 Hz with 0.19 % damping; crowd tests at about 0.25 and 0.5 persons/m².',
    compare:
      'Crowd prediction against the measured maximum. The modal mass is needed from the full paper or the dataset.',
  },
  {
    id: 'R3',
    bridge: 'Aberfeldy footbridge, Scotland (MDPI Materials 2023, 16, 2890)',
    data: 'GFRP cable-stayed, 63 m main span, vertical modes 1.64 Hz and 2.71 Hz.',
    compare:
      'The comfort limit (case A3 already matches the paper’s 1.46 m/s²), and predicted accelerations against the paper’s UK NA results.',
  },
];

function expectedText(r: ValidationRow): string {
  // Values from cases.json are shown as written there; computed references to 5 s.f.
  return r.reference === 'validation/cases.json' ? String(r.expected) : sig(r.expected, 5);
}

function groupSection(g: ValidationGroup): HTMLElement {
  const notes = [
    ...g.rows
      .filter((r) => r.reference !== 'validation/cases.json')
      .map((r) => `${r.id}, ${r.quantity}: expected value is ${r.reference}.`),
    ...g.rows.flatMap((r) => (r.note ? [`${r.id}: ${r.note}`] : [])),
    ...g.missing,
  ];
  return section(
    g.title,
    `Tolerance: ${g.tolerance}`,
    g.id === 'level2'
      ? h(
          'p',
          {},
          `Bridge A1 with ξ = ${cases.level2.bridge.zeta * 100} % and b = ${cases.level2.bridge.b} m. k and γ are injected test values, not readings from the National Annex figures, so these cases test the equations and the solver on their own.`,
        )
      : null,
    g.id === 'pd1'
      ? h(
          'p',
          {},
          `Bridge A1 (ξ = ${cases.level2.bridge.zeta * 100} %), one walker or one jogger, k = 1.0 injected. The simplified method is a = F′/M · φmax² · K · Ψ, with F′ = F₀·k·√(1 + γ(N − 1)), φmax = 1 for this tool’s mode shapes, and K = 1.0 for a single span.`,
        )
      : null,
    dataTable(
      ['Case', 'Quantity', 'Expected', 'Tool', 'Difference', 'Result'],
      g.rows.map((r) => [
        h('span', { title: r.check }, r.id),
        `${r.quantity}${r.unit === '–' ? '' : ` (${r.unit})`}`,
        h('span', { class: 'num' }, expectedText(r)),
        h('span', { class: 'num' }, sig(r.tool, 5)),
        h('span', { class: 'num' }, signedPercent(r.diffPercent)),
        h(
          'span',
          { class: `verdict ${r.pass ? 'verdict-pass' : 'verdict-fail'}` },
          r.pass ? 'PASS' : 'FAIL',
        ),
      ]),
    ),
    notes.length > 0 ? h('ul', { class: 'note-list' }, ...notes.map((n) => h('li', {}, n))) : null,
  );
}

function headline(groups: ValidationGroup[]): HTMLElement {
  const rows = groups.flatMap((g) => g.rows);
  const passed = rows.filter((r) => r.pass).length;
  const pd = (id: string) => groups.find((g) => g.id === 'pd1')?.rows.find((r) => r.id === id);
  const item = (label: string, value: string, sub: string) =>
    h(
      'div',
      { class: 'headline-item' },
      h('dt', {}, label),
      h('dd', {}, value, h('span', { class: 'headline-sub' }, sub)),
    );
  const pdItem = (id: string, label: string) => {
    const r = pd(id);
    return r
      ? item(
          label,
          signedPercent(r.diffPercent),
          `Tool ${fixed(r.tool, 3)} m/s² vs PD 6688-2 ${fixed(r.expected, 3)} m/s²`,
        )
      : null;
  };
  return h(
    'dl',
    { class: 'headline' },
    item(
      'Checks within tolerance',
      `${passed} of ${rows.length}`,
      'Level 1, Level 2 and PD1, run now in your browser',
    ),
    pdItem('PD1-walking', 'PD1 single walker'),
    pdItem('PD1-jogging', 'PD1 single jogger'),
  );
}

function render(): void {
  try {
    const groups = validationGroups();
    results.replaceChildren(headline(groups), ...groups.map(groupSection));
  } catch (e) {
    results.replaceChildren(
      h(
        'p',
        { class: 'flag flag-error' },
        `The validation cases could not be run: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }
}

root.replaceChildren(
  page(
    'Validation',
    'Every benchmark case in SPEC §6, run now in your browser by the same code the checker uses. The same cases also run in the automated test suite.',
    section(
      'How to read this page',
      null,
      list([
        'Expected: the reference value. Level 1 values are analytical or come from the code tables. Level 2 values come from an independent Python script. PD1 values come from the PD 6688-2 simplified method.',
        'Tool: the value this checker calculates.',
        'Difference: (tool − expected) / expected.',
        'Level 1 passes when both values round to the same 4 significant figures. Level 2 passes within 0.5 %. PD1 passes within 5 %, which allows for reading Ψ from a figure.',
      ]),
      h(
        'p',
        {},
        'The independent reference scripts are in ',
        link(`${REPO}/tree/main/validation/reference`, 'validation/reference'),
        ' and the case inputs are in ',
        link(`${REPO}/blob/main/validation/cases.json`, 'validation/cases.json'),
        '.',
      ),
    ),
    results,
    section(
      'Coming soon: published real bridges',
      'SPEC §6 Level 3',
      h(
        'p',
        {},
        'These cases will compare the tool with measurements and published results. They have not been run yet, so no results are shown.',
      ),
      h(
        'div',
        { class: 'soon' },
        ...COMING_SOON.map((c) =>
          h(
            'div',
            { class: 'soon-item' },
            h('h3', {}, `${c.id}: ${c.bridge}`),
            h(
              'dl',
              {},
              h('dt', {}, 'Published data'),
              h('dd', {}, c.data),
              h('dt', {}, 'Comparison'),
              h('dd', {}, c.compare),
            ),
          ),
        ),
      ),
    ),
  ),
);

// Let the page paint before the solver runs (a few hundred thousand time steps).
setTimeout(render, 0);
