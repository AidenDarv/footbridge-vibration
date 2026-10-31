// Results panel. Displays a CheckResult; all numbers come from the engine (CLAUDE.md).

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
import { fixed } from '../share/format';
import {
  CROWD_SIGMA_NOTE,
  FLAG_WORD,
  INFO_ONLY_WORD,
  OUT_OF_SCOPE,
  PD6688_NOTES,
  SCREENING_NOTICE,
  STATUS_TEXT,
  METHOD_CHECK_NOTICE,
  LOCK_IN_WORD,
  caseLabel,
  lockInModeLabel,
  lockInNotes,
} from '../share/wording';
import { h } from './dom';

const SHAPE_LABEL: Record<ModeResult['shape'], string> = {
  sine: 'sine',
  'half-sine': 'half-sine',
  'full-sine': 'full-sine',
  'user-seff': 'Seff entered',
};

const AWAITING = () => h('span', { class: 'awaiting', title: 'Awaiting k(f) or γ' }, 'awaiting');

function statusCard(r: CheckResult, name: string | undefined): HTMLElement {
  const s = STATUS_TEXT[r.status];
  const g = r.governing;
  return h(
    'section',
    { class: `status status-${r.status.toLowerCase()}` },
    h('p', { class: 'status-label' }, name ? `Result for ${name}` : 'Result'),
    h('p', { class: 'status-word' }, s.word),
    h('p', { class: 'status-detail' }, s.detail),
    r.missingInputs.length > 0
      ? h('p', { class: 'status-detail' }, `Still needed: ${r.missingInputs.join(', ')}.`)
      : null,
    ...r.statusNotes.map((n) => h('p', { class: 'status-detail' }, n)),
    ...r.statusInfo.map((n) => h('p', { class: 'status-detail status-info' }, n)),
    g
      ? h(
          'dl',
          { class: 'status-gov' },
          h('dt', {}, 'Governing case'),
          h(
            'dd',
            {},
            `${modeLabel(r, g.modeId)}, ${g.label.toLowerCase()}${g.verify ? ' [VERIFY]' : ''}`,
          ),
          h('dt', {}, 'Utilisation'),
          h('dd', { class: 'num' }, fixed(g.utilisation, 2)),
        )
      : null,
  );
}

function modeLabel(r: CheckResult, id: string): string {
  return r.modes.find((m) => m.id === id)?.label ?? id;
}

function panel(title: string, clause: string | null, ...children: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, title, clause ? h('span', { class: 'clause' }, clause) : null),
    ...children,
  );
}

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
      h('p', { class: 'note' }, 'Choose k1, k2 and enter the height above ground to see a_limit.'),
    );
  }
  const row = (label: string, value: string, extra?: Node | null) =>
    h('div', { class: 'kv' }, h('dt', {}, label), h('dd', { class: 'num' }, value, extra ?? null));
  return panel(
    'Comfort limit',
    'NA.2.44.6',
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
        `${fixed(c.aLimit, 3)} m/s²`,
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
  const awaitingOr = (v: number | null, d: number) =>
    inactive ? dash : v === null ? AWAITING() : fixed(v, d);

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
    awaitingOr(c.aPeak, 3),
    fixed(c.aLimit ?? r.comfort?.aLimit, 3),
    c.status === 'computed' && c.utilisation === null
      ? h(
          'span',
          { class: 'muted', title: 'Enter k1, k2 and the height to get a_limit' },
          'needs limit',
        )
      : awaitingOr(c.utilisation, 2),
    statusCell(),
  ];
}

function casesPanel(r: CheckResult): HTMLElement {
  if (r.cases.length === 0) {
    const reason = r.modes.some((m) => m.direction === 'vertical')
      ? 'Choose a bridge class to see the load cases.'
      : r.vertical.required === false
        ? 'No vertical mode below 8 Hz to show, and the vertical comfort check is not required (NA.2.44.6(1)).'
        : 'No vertical modes, so there are no vertical load cases.';
    return panel('Load cases', 'NA.2.44.4–NA.2.44.5', h('p', { class: 'note' }, reason));
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
  return panel(
    'Lateral stability (lock-in)',
    'NA.2.44.7, Figure NA.11',
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
}

type ChartsModule = typeof import('./charts');
let chartsModule: Promise<ChartsModule> | null = null;

/** uPlot is loaded on demand, the first time a chart is shown. */
function withCharts(draw: (m: ChartsModule) => void): void {
  chartsModule ??= import('./charts');
  chartsModule.then(draw).catch(() => {
    for (const el of document.querySelectorAll('.chart-plot[data-loading]')) {
      el.textContent = 'The chart could not be loaded. The values are in the tables above.';
    }
  });
}

/** A chart figure: title, clause, written summary (also the canvas's text alternative). */
function chartFigure(
  title: string,
  clause: string,
  summary: string,
  extra: (Node | null)[] = [],
): { figure: HTMLElement; plot: HTMLElement | null } {
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
      { class: 'chart' },
      h('figcaption', {}, title, h('span', { class: 'clause' }, clause)),
      plot,
      h('p', { class: 'chart-summary' }, summary),
      ...extra,
    ),
    plot,
  };
}

function emptyFigure(title: string, clause: string, reason: string): HTMLElement {
  return h(
    'figure',
    { class: 'chart chart-empty' },
    h('figcaption', {}, title, h('span', { class: 'clause' }, clause)),
    h('p', { class: 'chart-summary' }, reason),
  );
}

function chartsPanel(r: CheckResult): HTMLElement {
  const figures: HTMLElement[] = [];
  const draws: ((m: ChartsModule) => void)[] = [];

  const th = timeHistoryChartData(r);
  const thTitle = 'Acceleration time history, governing group case';
  if (th.kind === 'ready') {
    const { figure, plot } = chartFigure(thTitle, 'NA.2.44.4', timeHistorySummary(th));
    figures.push(figure);
    if (plot) draws.push((m) => m.drawTimeHistory(plot, th));
  } else {
    figures.push(emptyFigure(thTitle, 'NA.2.44.4', th.reason));
  }

  const k = kChartData(r);
  const kTitle = 'k(f) with this bridge’s vertical modes';
  if (k.markers.length === 0) {
    const reason =
      r.vertical.required === false
        ? 'No vertical mode below 8 Hz to mark.'
        : 'No vertical modes to mark.';
    figures.push(emptyFigure(kTitle, 'Figure NA.8', reason));
  } else {
    const { figure, plot } = chartFigure(kTitle, 'Figure NA.8', kChartSummary(k));
    figures.push(figure);
    if (plot) draws.push((m) => m.drawKChart(plot, k));
  }

  const lat = lateralChartData(r);
  if (lat) {
    const notPlotted = lateralNotPlotted(lat);
    const latTitle = 'Lateral stability boundary';
    const clause = 'NA.2.44.7, Figure NA.11';
    if (lat.points.length === 0) {
      figures.push(emptyFigure(latTitle, clause, notPlotted.join(' ')));
    } else {
      const { figure, plot } = chartFigure(latTitle, clause, lateralChartSummary(lat), [
        notPlotted.length
          ? h('ul', { class: 'note-list' }, ...notPlotted.map((n) => h('li', {}, n)))
          : null,
      ]);
      figures.push(figure);
      if (plot) draws.push((m) => m.drawLateralChart(plot, lat));
    }
  }

  if (draws.length > 0) {
    withCharts((m) => {
      for (const d of draws) d(m);
    });
  }
  return panel('Charts', null, h('div', { class: 'charts' }, ...figures));
}

function flagsPanel(r: CheckResult): HTMLElement {
  const order: Flag['level'][] = ['error', 'warning', 'info'];
  const flags = [...r.flags].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return panel(
    'Flags',
    null,
    flags.length === 0
      ? h('p', { class: 'note' }, 'No flags.')
      : h(
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

export function limitationsPanel(): HTMLElement {
  return h(
    'section',
    { class: 'panel limitations' },
    h('h2', {}, 'Screening tool: limitations'),
    h('p', {}, SCREENING_NOTICE),
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
  if (r === null) {
    container.append(
      h(
        'section',
        { class: 'status status-empty' },
        h('p', { class: 'status-word' }, 'Enter a bridge'),
        h(
          'p',
          { class: 'status-detail' },
          'Fill in the bridge details on the left, or load the example bridge to see how the check works.',
        ),
      ),
      limitationsPanel(),
    );
    return;
  }
  if (r.inputErrors.length > 0) {
    container.append(
      statusCard(r, name),
      panel(
        'Inputs to fix',
        null,
        h(
          'ul',
          { class: 'flags' },
          ...r.inputErrors.map((e) =>
            h(
              'li',
              { class: 'flag flag-error' },
              h('span', { class: 'flag-word' }, 'Error'),
              h('span', { class: 'flag-text' }, e),
            ),
          ),
        ),
      ),
      limitationsPanel(),
    );
    return;
  }
  container.append(
    statusCard(r, name),
    modesPanel(r),
    comfortPanel(r),
    casesPanel(r),
    ...[lateralPanel(r)].filter((p) => p !== null),
    chartsPanel(r),
    flagsPanel(r),
    limitationsPanel(),
  );
}
