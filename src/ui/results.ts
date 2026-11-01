// Results column (design/DESIGN.md §4). Displays a CheckResult; all numbers come from the
// engine and the wording from share/verdict and share/wording (CLAUDE.md: no maths here).

import type {
  CheckResult,
  Flag,
  LateralCheckResult,
  LoadCaseResult,
  ModeResult,
} from '../engine/check';
import {
  kChartData,
  kChartSummary,
  lateralChartData,
  lateralChartSummary,
  lateralNotPlotted,
  timeHistoryChartData,
  timeHistorySummary,
} from '../share/charts';
import { accelText, fixed, limitText, utilText } from '../share/format';
import {
  BAR_SCALE,
  LIMIT_AT,
  caseBar,
  keyNumbers,
  people,
  verdictText,
  type VerdictTone,
} from '../share/verdict';
import {
  CROWD_SIGMA_NOTE,
  FLAG_WORD,
  INFO_ONLY_WORD,
  OUT_OF_SCOPE,
  PD6688_NOTES,
  SCREENING_NOTICE,
  SERVICEABILITY_ONLY_NOTICE,
  METHOD_CHECK_NOTICE,
  LOCK_IN_WORD,
  caseLabel,
  lockInModeLabel,
  lockInNotes,
} from '../share/wording';
import { h } from './dom';
import { fieldControl } from './field-errors';

const SHAPE_LABEL: Record<ModeResult['shape'], string> = {
  sine: 'sine',
  'half-sine': 'half-sine',
  'full-sine': 'full-sine',
  'user-seff': 'Seff entered',
};

const AWAITING = () => h('span', { class: 'awaiting', title: 'Awaiting k(f) or γ' }, 'awaiting');

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Status icon: a cross for FAIL, a tick for PASS, an exclamation mark otherwise. */
function statusIcon(tone: VerdictTone, word: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    width: '28',
    height: '28',
    viewBox: '0 0 28 28',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'verdict-icon',
  };
  if (word) {
    attrs.role = 'img';
    attrs['aria-label'] = word;
  } else {
    attrs['aria-hidden'] = 'true';
  }
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '14');
  circle.setAttribute('cy', '14');
  circle.setAttribute('r', '12');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    tone === 'fail'
      ? 'M9.5 9.5l9 9M18.5 9.5l-9 9'
      : tone === 'pass'
        ? 'M8.5 14.5l3.5 3.5 7.5-8'
        : 'M14 8v8M14 19.5v0.5',
  );
  svg.append(circle, path);
  return svg;
}

/** Focuses the field an anchor points at (summary and problem links). */
function focusLink(a: HTMLAnchorElement): HTMLAnchorElement {
  a.addEventListener('click', (e) => {
    const target = document.getElementById(a.getAttribute('href')?.slice(1) ?? '');
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.scrollIntoView?.({ block: 'center' });
  });
  return a;
}

function verdictCard(r: CheckResult | null, name: string | undefined): HTMLElement {
  const v = verdictText(r);
  const notes = r && r.inputErrors.length === 0 ? [...r.statusNotes, ...r.statusInfo] : [];
  const keys = r ? keyNumbers(r) : [];
  const problems =
    r && r.inputErrors.length > 0
      ? h(
          'ul',
          { class: 'problem-list' },
          ...r.inputErrorDetails.map((e) => {
            const control = fieldControl(document.body, e);
            return h(
              'li',
              {},
              control?.id ? focusLink(h('a', { href: `#${control.id}` }, e.message)) : e.message,
            );
          }),
        )
      : null;
  return h(
    'section',
    {
      class: `verdict-card tone-${v.tone}`,
      id: 'result-card',
      'aria-labelledby': 'result-h',
    },
    h(
      'p',
      { class: 'verdict-for', id: 'result-h' },
      name ? 'Result for ' : 'Result',
      name ? h('span', { class: 'verdict-name' }, name) : null,
    ),
    h(
      'div',
      { class: 'verdict-headline' },
      statusIcon(v.tone, v.word),
      h('p', { class: 'verdict-title' }, v.headline),
    ),
    h('p', { class: 'verdict-sentence' }, v.sentence),
    notes.length > 0
      ? h('ul', { class: 'verdict-notes' }, ...notes.map((n) => h('li', {}, n)))
      : null,
    problems,
    keys.length > 0
      ? h(
          'dl',
          { class: 'key-numbers' },
          ...keys.map((k) =>
            h(
              'div',
              { class: 'key-number' },
              h('dt', {}, k.label),
              h('dd', { class: 'num' }, k.value),
            ),
          ),
        )
      : null,
  );
}

function modeLabel(r: CheckResult, id: string): string {
  return r.modes.find((m) => m.id === id)?.label ?? id;
}

/** A panel with its own heading level: h2 on the results column, h3 inside the details. */
function panel(
  title: string,
  clause: string | null,
  level: 'h2' | 'h3',
  ...children: (Node | null)[]
): HTMLElement {
  return h(
    'section',
    { class: level === 'h2' ? 'panel' : 'calc-part' },
    h(
      level,
      { class: 'panel-head' },
      title,
      clause ? h('span', { class: 'clause' }, clause) : null,
    ),
    ...children,
  );
}

// ---------- Each load case against the limit ----------

const CASE_WORD: Record<Exclude<LoadCaseResult['status'], 'computed'>, string> = {
  'awaiting-data': 'AWAITING',
  blocked: 'NOT RUN',
  'needs-input': 'NEEDS INPUT',
  'not-applicable': 'N/A',
};

function barRow(r: CheckResult, c: LoadCaseResult, many: boolean): HTMLElement {
  const governs = r.governing === c;
  const name = many ? `${modeLabel(r, c.modeId)} · ${caseLabel(c)}` : caseLabel(c);
  const count = c.N === null ? '' : `${people(c.N)} ${c.N === 1 ? 'person' : 'people'}`;
  const bar = c.status === 'computed' ? caseBar(c) : null;
  const word = c.informationOnly ? INFO_ONLY_WORD : (c.verdict ?? '');
  const tone = c.informationOnly
    ? 'is-info'
    : c.verdict === 'FAIL'
      ? 'is-fail'
      : c.verdict === 'PASS'
        ? 'is-pass'
        : 'is-info';

  let value: HTMLElement;
  if (c.status !== 'computed') {
    value = h('p', { class: 'bar-value' }, h('span', { class: 'bar-word' }, CASE_WORD[c.status]));
  } else if (c.aPeak === null) {
    value = h('p', { class: 'bar-value' }, h('span', { class: 'bar-word' }, 'AWAITING'));
  } else {
    value = h(
      'p',
      { class: `bar-value ${tone}` },
      h('span', { class: 'bar-a num' }, accelText(c.aPeak)),
      ' ',
      h('span', { class: 'bar-unit' }, 'm/s²'),
      c.utilisation === null
        ? h('span', { class: 'bar-u' }, 'needs limit')
        : h('span', { class: 'bar-u' }, `${utilText(c.utilisation)} × limit · ${word}`),
    );
  }

  return h(
    'div',
    { class: `bar-row${governs ? ' is-governing' : ''}` },
    h(
      'div',
      { class: 'bar-label' },
      h(
        'p',
        { class: 'bar-name' },
        name,
        governs ? h('span', { class: 'governs' }, 'GOVERNS') : null,
      ),
      count ? h('p', { class: 'bar-sub' }, count) : null,
    ),
    h(
      'div',
      { class: 'bar-track', 'aria-hidden': 'true' },
      bar
        ? h('div', {
            class: `bar-fill ${tone}${bar.clipped ? ' is-clipped' : ''}`,
            style: `width: ${(bar.fraction * 100).toFixed(2)}%`,
          })
        : null,
      h('div', { class: 'bar-limit', style: `left: ${(LIMIT_AT * 100).toFixed(2)}%` }),
    ),
    value,
  );
}

function casesCard(r: CheckResult): HTMLElement | null {
  if (r.cases.length === 0) return null;
  const many = new Set(r.cases.map((c) => c.modeId)).size > 1;
  const limit = r.comfort ? limitText(r.comfort.aLimit) : null;
  return h(
    'section',
    { class: 'panel cases-card' },
    h(
      'h2',
      { class: 'panel-head' },
      'Each load case against the limit',
      h('span', { class: 'clause' }, 'NA.2.44.4–NA.2.44.6'),
    ),
    h('div', { class: 'bar-rows' }, ...r.cases.map((c) => barRow(r, c, many))),
    h(
      'p',
      { class: 'bar-legend' },
      h('span', { class: 'bar-legend-line', 'aria-hidden': 'true' }),
      limit
        ? `The vertical line is the comfort limit, ${limit} m/s². Bars are drawn to ${BAR_SCALE} × the limit.`
        : `The vertical line is the comfort limit. Bars are drawn to ${BAR_SCALE} × the limit.`,
    ),
  );
}

// ---------- Full calculation ----------

function table(
  headers: [string, string?][],
  rows: (string | Node)[][],
  opts: { highlight?: number } = {},
): HTMLElement {
  const thead = h(
    'thead',
    {},
    h(
      'tr',
      {},
      ...headers.map(([t, unit]) =>
        h('th', { scope: 'col' }, t, unit ? h('span', { class: 'th-unit' }, unit) : null),
      ),
    ),
  );
  const tbody = h(
    'tbody',
    {},
    ...rows.map((cells, i) =>
      h(
        'tr',
        { class: i === opts.highlight ? 'governing' : undefined },
        ...cells.map((c, j) => {
          const [t, unit] = headers[j] ?? ['', ''];
          return h('td', { 'data-label': unit ? `${t} (${unit})` : t }, c);
        }),
      ),
    ),
  );
  return h('div', { class: 'table-wrap' }, h('table', { class: 'results' }, thead, tbody));
}

function modesPanel(r: CheckResult): HTMLElement {
  return panel(
    'Modal properties',
    'SPEC §2.1–2.2; NA.2.44.4 Fig. NA.7',
    'h3',
    table(
      [
        ['Mode'],
        ['Direction'],
        ['f', 'Hz'],
        ['M', 'kg'],
        ['ξ', '%'],
        ['δ'],
        ['Shape'],
        ['Seff', 'm'],
        ['λ'],
      ],
      r.modes.map((m) => [
        m.label,
        m.direction,
        fixed(m.f, 3),
        fixed(m.M, 0),
        fixed(m.zeta * 100, 2),
        fixed(m.delta, 4),
        SHAPE_LABEL[m.shape],
        fixed(m.Seff, 2),
        fixed(m.lambda_, 4),
      ]),
    ),
    h(
      'p',
      { class: 'note' },
      'Mode shapes are scaled so their largest value is 1; M is the modal mass for that scaling. δ = 2πξ is the log decrement used by Figure NA.9.',
    ),
  );
}

function comfortPanel(r: CheckResult): HTMLElement {
  const c = r.comfort;
  if (!c) {
    return panel(
      'Comfort limit',
      'NA.2.44.6',
      'h3',
      h(
        'p',
        { class: 'note' },
        'Choose the setting and other ways across, and enter the height above ground, to see a_limit.',
      ),
    );
  }
  const row = (label: string, value: string, extra?: Node | null) =>
    h('div', { class: 'kv' }, h('dt', {}, label), h('dd', { class: 'num' }, value, extra ?? null));
  return panel(
    'Comfort limit',
    'NA.2.44.6',
    'h3',
    h(
      'dl',
      { class: 'kv-list' },
      row('k1 site usage', fixed(c.k1, 1)),
      row('k2 route redundancy', fixed(c.k2, 1)),
      row('k3 height', fixed(c.k3, 1)),
      row('k4 exposure', fixed(c.k4, 2)),
      row('1.0·k1·k2·k3·k4', `${fixed(c.raw, 3)} m/s²`),
      row(
        'a_limit (0.5 to 2.0)',
        `${limitText(c.aLimit)} m/s²`,
        c.clamped
          ? h('span', { class: 'tag' }, c.clamped === 'lower' ? 'raised to 0.5' : 'reduced to 2.0')
          : null,
      ),
    ),
    c.k4Justification ? h('p', { class: 'note' }, `k4 justification: ${c.k4Justification}`) : null,
  );
}

function caseCells(r: CheckResult, c: LoadCaseResult): (string | Node)[] {
  const statusCell = (): Node => {
    switch (c.status) {
      case 'computed':
        if (c.informationOnly) {
          return h(
            'span',
            { class: 'verdict verdict-na', title: 'Vertical comfort check not required' },
            INFO_ONLY_WORD,
          );
        }
        return c.verdict
          ? h('span', { class: `verdict verdict-${c.verdict.toLowerCase()}` }, c.verdict)
          : h('span', { class: 'verdict' }, 'no limit');
      case 'awaiting-data':
        return h('span', { class: 'verdict verdict-awaiting' }, 'AWAITING');
      case 'blocked':
        return h('span', { class: 'verdict verdict-blocked' }, 'NOT RUN');
      case 'needs-input':
        return h('span', { class: 'verdict verdict-blocked' }, 'NEEDS INPUT');
      case 'not-applicable':
        return h('span', { class: 'verdict verdict-na' }, 'N/A');
    }
  };
  const inactive =
    c.status === 'not-applicable' || c.status === 'blocked' || c.status === 'needs-input';
  const dash = '–';
  const awaitingOr = (v: number | null, d: number | ((x: number) => string)) =>
    inactive ? dash : v === null ? AWAITING() : typeof d === 'number' ? fixed(v, d) : d(v);

  const nText = c.N === null ? dash : c.kind === 'crowd' ? fixed(c.N, 1) : fixed(c.N, 0);
  const gammaCell = !c.gammaNeeded
    ? h('span', { class: 'muted', title: 'Not needed when N = 1' }, 'n/a')
    : inactive
      ? dash
      : c.gamma === null
        ? AWAITING()
        : fixed(c.gamma, 3);

  return [
    modeLabel(r, c.modeId),
    caseLabel(c),
    nText,
    c.status === 'blocked' || c.status === 'not-applicable' || c.status === 'needs-input'
      ? dash
      : c.k === null
        ? AWAITING()
        : fixed(c.k, 3),
    gammaCell,
    awaitingOr(c.forceAmplitude, 1),
    awaitingOr(c.aPeak, accelText),
    limitText(c.aLimit ?? r.comfort?.aLimit),
    c.status === 'computed' && c.utilisation === null
      ? h(
          'span',
          { class: 'muted', title: 'Enter k1, k2 and the height to get a_limit' },
          'needs limit',
        )
      : awaitingOr(c.utilisation, utilText),
    statusCell(),
  ];
}

function casesPanel(r: CheckResult): HTMLElement {
  if (r.cases.length === 0) {
    const reason = r.modes.some((m) => m.direction === 'vertical')
      ? 'Choose how busy the bridge is to see the load cases.'
      : r.vertical.required === false
        ? 'No vertical mode below 8 Hz to show, and the vertical comfort check is not required (NA.2.44.6(1)).'
        : 'No vertical modes, so there are no vertical load cases.';
    return panel('Load cases', 'NA.2.44.4–NA.2.44.5', 'h3', h('p', { class: 'note' }, reason));
  }
  const highlight = r.governing ? r.cases.indexOf(r.governing) : undefined;
  const notes = r.cases
    .filter((c) => c.message && c.status !== 'blocked')
    .map((c) => `${modeLabel(r, c.modeId)}, ${c.label.toLowerCase()}: ${c.message}`);
  const verify = [
    ...new Set(r.cases.flatMap((c) => (c.verify ? [`${c.label} [VERIFY]: ${c.verify}`] : []))),
  ];
  notes.push(...verify);
  return panel(
    'Load cases',
    'NA.2.44.4–NA.2.44.5',
    'h3',
    table(
      [
        ['Mode'],
        ['Case'],
        ['N'],
        ['k(f)'],
        ['γ'],
        ['Force', 'N'],
        ['a_peak', 'm/s²'],
        ['a_limit', 'm/s²'],
        ['Util.'],
        ['Result'],
      ],
      r.cases.map((c) => caseCells(r, c)),
      { highlight },
    ),
    h(
      'p',
      { class: 'note' },
      'Group: moving pulsating force crossing the span at the walking or jogging speed (NA.2.44.4). Crowd: steady-state distributed load following the mode shape; force is the modal force P₀ (NA.2.44.5). NA.2.44.5(3) notes the crowd model may be conservative. ' +
        CROWD_SIGMA_NOTE,
    ),
    notes.length > 0 ? h('ul', { class: 'note-list' }, ...notes.map((n) => h('li', {}, n))) : null,
  );
}

function fullCalculation(r: CheckResult): HTMLElement {
  return h(
    'details',
    { class: 'full-calc' },
    h('summary', {}, 'Show the full calculation'),
    h(
      'p',
      { class: 'note' },
      'Modal properties, the comfort-limit factors, k(f) and γ read from Figures NA.8 and NA.9, and every load case with its clause.',
    ),
    modesPanel(r),
    comfortPanel(r),
    casesPanel(r),
  );
}

// ---------- Lateral stability ----------

const LOCK_IN_CLASS: Record<LateralCheckResult['status'], string> = {
  STABLE: 'verdict-pass',
  UNSTABLE: 'verdict-fail',
  'NO-CROWD': 'verdict-na',
  'OUTSIDE-FIGURE': 'verdict-blocked',
  'needs-input': 'verdict-blocked',
};

function lateralPanel(r: CheckResult): HTMLElement | null {
  if (r.lateral.length === 0) return null;
  const dash = '–';
  const p = panel(
    'Lateral stability (lock-in)',
    'NA.2.44.7, Figure NA.11',
    'h2',
    table(
      [
        ['Mode'],
        ['f', 'Hz'],
        ['m_bridge', 'kg/m'],
        ['ξ', '%'],
        ['ρ', 'persons/m²'],
        ['b', 'm'],
        ['m_ped', 'kg/m'],
        ['D'],
        ['Boundary D'],
        ['Result'],
      ],
      r.lateral.map((l) => [
        lockInModeLabel(r, l),
        fixed(l.f, 3),
        fixed(l.mBridge, 0),
        fixed(l.zeta * 100, 2),
        l.rho === null ? dash : String(l.rho),
        fixed(l.b, 2),
        fixed(l.mPedestrian, 1),
        l.status === 'NO-CROWD'
          ? h('span', { class: 'muted', title: 'm_pedestrian = 0' }, 'not defined')
          : fixed(l.D, 4),
        l.status === 'OUTSIDE-FIGURE' ? 'cannot be read' : fixed(l.DBoundary, 3),
        h('span', { class: `verdict ${LOCK_IN_CLASS[l.status]}` }, LOCK_IN_WORD[l.status]),
      ]),
    ),
    h('ul', { class: 'note-list' }, ...lockInNotes(r).map((n) => h('li', {}, n))),
  );
  p.classList.add('lateral-panel');
  return p;
}

// ---------- Charts ----------

type ChartsModule = typeof import('./charts');
let chartsModule: Promise<ChartsModule> | null = null;

/** uPlot is loaded on demand, the first time a chart is shown. */
function withCharts(draw: (m: ChartsModule) => void): void {
  chartsModule ??= import('./charts');
  chartsModule.then(draw).catch(() => {
    for (const el of document.querySelectorAll('.chart-plot[data-loading]')) {
      el.textContent = 'The chart could not be loaded. The values are in the tables.';
    }
  });
}

/** A chart panel: title, clause, written summary (also the canvas's text alternative). */
function chartPanel(
  title: string,
  clause: string,
  summary: string,
  extra: (Node | null)[] = [],
): { figure: HTMLElement; plot: HTMLElement } {
  const plot = h(
    'div',
    {
      class: 'chart-plot',
      role: 'img',
      'aria-label': `${title}. ${summary}`,
      'data-loading': true,
    },
    'Loading chart…',
  );
  return {
    figure: h(
      'figure',
      { class: 'panel chart' },
      h('figcaption', {}, title, h('span', { class: 'clause' }, clause)),
      h('p', { class: 'chart-summary' }, summary),
      plot,
      ...extra,
    ),
    plot,
  };
}

function emptyChart(title: string, clause: string, reason: string): HTMLElement {
  return h(
    'figure',
    { class: 'panel chart chart-empty' },
    h('figcaption', {}, title, h('span', { class: 'clause' }, clause)),
    h('p', { class: 'chart-summary' }, reason),
  );
}

const ACTIVITY_NOUN = { walking: 'walking group', jogging: 'jogging group' } as const;

function charts(r: CheckResult): HTMLElement[] {
  const figures: HTMLElement[] = [];
  const draws: ((m: ChartsModule) => void)[] = [];

  const th = timeHistoryChartData(r);
  if (th.kind === 'ready') {
    const title = `Deck movement as the ${ACTIVITY_NOUN[th.activity]} crosses`;
    const { figure, plot } = chartPanel(title, 'NA.2.44.4', timeHistorySummary(th));
    figures.push(figure);
    draws.push((m) => m.drawTimeHistory(plot, th));
  } else {
    figures.push(
      emptyChart('Deck movement as the governing group crosses', 'NA.2.44.4', th.reason),
    );
  }

  const k = kChartData(r);
  const kTitle = 'k(f) with this bridge’s vertical modes';
  if (k.markers.length === 0) {
    const reason =
      r.vertical.required === false
        ? 'No vertical mode below 8 Hz to mark.'
        : 'No vertical modes to mark.';
    figures.push(emptyChart(kTitle, 'Figure NA.8', reason));
  } else {
    const { figure, plot } = chartPanel(kTitle, 'Figure NA.8', kChartSummary(k));
    figures.push(figure);
    draws.push((m) => m.drawKChart(plot, k));
  }

  const lat = lateralChartData(r);
  if (lat) {
    const notPlotted = lateralNotPlotted(lat);
    const latTitle = 'Lateral stability boundary';
    const clause = 'NA.2.44.7, Figure NA.11';
    if (lat.points.length === 0) {
      figures.push(emptyChart(latTitle, clause, notPlotted.join(' ')));
    } else {
      const { figure, plot } = chartPanel(latTitle, clause, lateralChartSummary(lat), [
        notPlotted.length
          ? h('ul', { class: 'note-list' }, ...notPlotted.map((n) => h('li', {}, n)))
          : null,
      ]);
      figures.push(figure);
      draws.push((m) => m.drawLateralChart(plot, lat));
    }
  }

  if (draws.length > 0) {
    withCharts((m) => {
      for (const d of draws) d(m);
    });
  }
  return figures;
}

// ---------- Flags and limitations ----------

function flagsPanel(r: CheckResult): HTMLElement | null {
  if (r.flags.length === 0) return null;
  const order: Flag['level'][] = ['error', 'warning', 'info'];
  const flags = [...r.flags].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return panel(
    'Notes and warnings',
    null,
    'h2',
    h(
      'ul',
      { class: 'flags' },
      ...flags.map((f) =>
        h(
          'li',
          { class: `flag flag-${f.level}` },
          h('span', { class: 'flag-word' }, FLAG_WORD[f.level]),
          h(
            'span',
            { class: 'flag-text' },
            f.message,
            f.clause ? h('span', { class: 'clause' }, f.clause) : null,
          ),
        ),
      ),
    ),
  );
}

/** Screening-tool notice and limitations, always shown under the results (CLAUDE.md). */
export function limitationsPanel(): HTMLElement {
  return h(
    'section',
    { class: 'limitations', 'aria-labelledby': 'limitations-h' },
    h('h2', { id: 'limitations-h' }, 'Limitations of this screening tool'),
    h('p', {}, SCREENING_NOTICE),
    h('p', {}, SERVICEABILITY_ONLY_NOTICE),
    h('p', {}, METHOD_CHECK_NOTICE),
    h('p', {}, 'Guidance from PD 6688-2:2011:'),
    h('ul', {}, ...PD6688_NOTES.map((t) => h('li', {}, t))),
    h('p', {}, 'Not covered in this version:'),
    h('ul', {}, ...OUT_OF_SCOPE.map((t) => h('li', {}, t))),
  );
}

export function renderResults(
  container: HTMLElement,
  r: CheckResult | null,
  name: string | undefined,
): void {
  container.replaceChildren();
  container.append(verdictCard(r, r ? name : undefined));
  if (r === null || r.inputErrors.length > 0) return;
  container.append(
    ...[casesCard(r), ...charts(r), lateralPanel(r), flagsPanel(r), fullCalculation(r)].filter(
      (p): p is HTMLElement => p !== null,
    ),
  );
}
