// Result charts drawn with uPlot (SPEC §3 items 3–5). Loaded on demand by results.ts.
// No maths here (CLAUDE.md): the data come from src/share/charts.ts, which passes through the
// engine result and our own digitised points. Axis padding is presentation only.

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { KChartData, LateralChartData, TimeHistoryChartData } from '../share/charts';

type ReadyHistory = Extract<TimeHistoryChartData, { kind: 'ready' }>;

interface Theme {
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  sheet: string;
  walk: string;
  jog: string;
  pass: string;
  fail: string;
  accent: string;
  accentSoft: string;
  mono: string;
  sans: string;
}

function theme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    rule: v('--rule'),
    sheet: v('--sheet'),
    walk: v('--series-walk'),
    jog: v('--series-jog'),
    pass: v('--pass'),
    fail: v('--fail'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    mono: v('--mono'),
    sans: v('--sans'),
  };
}

const px = (n: number) => n * uPlot.pxRatio;

function axes(t: Theme, xLabel: string, yLabel: string): uPlot.Axis[] {
  const common = {
    stroke: t.ink2,
    font: `${px(11)}px ${t.mono}`,
    labelFont: `600 ${px(12)}px ${t.sans}`,
    grid: { stroke: t.rule, width: 1 },
    ticks: { stroke: t.rule, width: 1, size: 4 },
  };
  return [
    { ...common, label: xLabel, labelSize: 22 },
    { ...common, label: yLabel, labelSize: 22, size: 46 },
  ];
}

function chartHeight(): number {
  return window.matchMedia('(max-width: 640px)').matches ? 220 : 280;
}

/** Dashed straight line between two canvas points. */
function line(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colour: string,
  dash: number[] = [],
): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = px(1.5);
  ctx.setLineDash(dash.map(px));
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  t: Theme,
  align: CanvasTextAlign = 'left',
  colour = t.ink2,
): void {
  ctx.save();
  ctx.font = `${px(11)}px ${t.sans}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  // Surface-coloured halo so labels stay legible where they cross lines.
  ctx.strokeStyle = t.sheet;
  ctx.lineWidth = px(3);
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Marker with a 2px surface ring so it stays visible over the curves. */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, ring: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, px(5), 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.lineWidth = px(2);
  ctx.strokeStyle = ring;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Cross marker (unstable), so the result does not rely on colour alone. */
function cross(ctx: CanvasRenderingContext2D, x: number, y: number, colour: string, ring: string) {
  const r = px(5);
  for (const [stroke, w] of [
    [ring, 5],
    [colour, 2.5],
  ] as const) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = px(w);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
    ctx.restore();
  }
}

type Builder = (t: Theme, width: number) => { opts: uPlot.Options; data: uPlot.AlignedData };

function timeHistory(d: ReadyHistory): Builder {
  return (t, width) => {
    const lim = d.aLimit;
    const top = Math.max(d.aPeak, lim ?? 0) * 1.15;
    const series: uPlot.Series[] = [
      { label: 't (s)', value: (_u, v) => (v == null ? '–' : v.toFixed(2)) },
      {
        label: `a (m/s²), ${d.caseLabel.toLowerCase()}`,
        // One trace only, so it takes the accent colour (DESIGN.md §4.3).
        stroke: t.accent,
        width: 1.25,
        points: { show: false },
        value: (_u, v) => (v == null ? '–' : v.toFixed(3)),
      },
    ];
    const data: (number | null)[][] = [d.t, d.a];
    if (lim !== null) {
      // ±a_limit (NA.2.44.6), drawn as constant series so they appear in the legend.
      const plus = d.t.map(() => lim);
      const minus = d.t.map(() => -lim);
      const limitSeries = (name: string): uPlot.Series => ({
        label: name,
        stroke: t.ink,
        width: 1.5,
        dash: [6, 4],
        points: { show: false },
        value: (_u, v) => (v == null ? '–' : v.toFixed(3)),
      });
      series.push(limitSeries('+a_limit'), limitSeries('−a_limit'));
      data.push(plus, minus);
    }
    return {
      opts: {
        width,
        height: chartHeight(),
        scales: { x: { time: false }, y: { range: [-top, top] } },
        axes: axes(t, 'Time t (s)', 'Acceleration (m/s²)'),
        series,
        cursor: { y: false },
      },
      data: data as uPlot.AlignedData,
    };
  };
}

function kCurves(d: KChartData): Builder {
  return (t, width) => {
    const xs = (p: KChartData['curves']['walking']) => p.map((q) => q[0] as number);
    const ys = (p: KChartData['curves']['walking']) => p.map((q) => q[1] as number);
    const data = uPlot.join([
      [xs(d.curves.walking), ys(d.curves.walking)],
      [xs(d.curves.jogging), ys(d.curves.jogging)],
    ]);
    const lastX = Math.max(...data[0]);
    const xMax = Math.max(lastX, ...d.markers.map((m) => m.f * 1.05));
    const curve = (name: string, stroke: string): uPlot.Series => ({
      label: name,
      stroke,
      width: 2,
      spanGaps: true,
      points: { show: false },
      value: (_u, v) => (v == null ? '–' : v.toFixed(3)),
    });
    return {
      opts: {
        width,
        height: chartHeight(),
        scales: {
          x: { time: false, range: [0, xMax] },
          y: { range: (_u, _lo, hi) => [0, hi * 1.12] },
        },
        axes: axes(t, 'Mode frequency f_v (Hz)', 'k(f_v)'),
        series: [
          { label: 'f (Hz)', value: (_u, v) => (v == null ? '–' : v.toFixed(2)) },
          curve('Walking', t.walk),
          curve('Jogging', t.jog),
        ],
        cursor: { y: false },
        hooks: {
          draw: [
            (u) => {
              const { ctx, bbox } = u;
              for (const m of d.markers) {
                const x = u.valToPos(m.f, 'x', true);
                line(ctx, x, bbox.top, x, bbox.top + bbox.height, t.ink3, [4, 3]);
                // Label on the left of the line near the right edge, so it is not clipped.
                const right = x > bbox.left + bbox.width * 0.85;
                label(
                  ctx,
                  m.modeLabel,
                  x + px(right ? -4 : 4),
                  bbox.top + px(8),
                  t,
                  right ? 'right' : 'left',
                );
                for (const [k, colour] of [
                  [m.kWalking, t.walk],
                  [m.kJogging, t.jog],
                ] as const) {
                  if (k !== null) dot(ctx, x, u.valToPos(k, 'y', true), colour, t.sheet);
                }
              }
            },
          ],
        },
      },
      data,
    };
  };
}

function lateralBoundary(d: LateralChartData): Builder {
  return (t, width) => {
    const fx = d.boundary.map((p) => p[0] as number);
    const Dy = d.boundary.map((p) => p[1] as number);
    const yMax = Math.max(...Dy, ...d.points.map((p) => p.D)) * 1.15;
    const xMax = Math.max(1.8, ...d.points.map((p) => p.f * 1.1));
    const [lo, hi] = d.reliableRangeHz;
    return {
      opts: {
        width,
        height: chartHeight(),
        scales: { x: { time: false, range: [0, xMax] }, y: { range: [0, yMax] } },
        axes: axes(t, 'Lateral mode frequency f (Hz)', 'D'),
        series: [
          { label: 'f (Hz)', value: (_u, v) => (v == null ? '–' : v.toFixed(3)) },
          {
            label: 'Boundary D (Figure NA.11)',
            stroke: t.ink,
            width: 2,
            points: { show: false },
            value: (_u, v) => (v == null ? '–' : v.toFixed(3)),
          },
        ],
        cursor: { y: false },
        hooks: {
          drawClear: [
            (u) => {
              // Figure NA.11 test-data range, shaded.
              const { ctx, bbox } = u;
              const x0 = u.valToPos(lo, 'x', true);
              const x1 = u.valToPos(hi, 'x', true);
              ctx.save();
              ctx.fillStyle = t.accentSoft;
              ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height);
              ctx.restore();
            },
          ],
          draw: [
            (u) => {
              const { ctx, bbox } = u;
              const bottom = bbox.top + bbox.height;
              label(
                ctx,
                `Test data ${lo}–${hi} Hz`,
                u.valToPos((lo + hi) / 2, 'x', true),
                bbox.top + px(9),
                t,
                'center',
              );
              const x15 = u.valToPos(d.triggerHz, 'x', true);
              line(ctx, x15, bbox.top, x15, bottom, t.ink3, [4, 3]);
              label(ctx, `${d.triggerHz} Hz`, x15 + px(4), bbox.top + px(9), t);
              label(ctx, 'Stable above the line', x15 - px(6), bbox.top + px(26), t, 'right');
              label(ctx, 'Unstable below', bbox.left + px(6), bottom - px(10), t);
              for (const p of d.points) {
                const x = u.valToPos(p.f, 'x', true);
                const y = u.valToPos(p.D, 'y', true);
                const unstable = p.status === 'UNSTABLE';
                if (unstable) cross(ctx, x, y, t.fail, t.sheet);
                else dot(ctx, x, y, p.status === 'STABLE' ? t.pass : t.ink3, t.sheet);
                const word = p.status === 'OUTSIDE-FIGURE' ? 'CANNOT ASSESS' : p.status;
                const right = x > bbox.left + bbox.width * 0.65;
                label(
                  ctx,
                  `${p.modeLabel}: ${word}`,
                  x + px(right ? -10 : 10),
                  y - px(12),
                  t,
                  right ? 'right' : 'left',
                  t.ink,
                );
              }
            },
          ],
        },
      },
      data: [fx, Dy],
    };
  };
}

interface Live {
  host: HTMLElement;
  build: Builder;
  plot: uPlot;
  resize: ResizeObserver;
}

const live = new Set<Live>();

function destroy(c: Live): void {
  c.resize.disconnect();
  c.plot.destroy();
  live.delete(c);
}

function mount(host: HTMLElement, build: Builder): void {
  for (const c of [...live]) if (!c.host.isConnected) destroy(c);
  if (!host.isConnected) return;
  host.replaceChildren();
  host.removeAttribute('data-loading');
  const width = Math.max(200, host.clientWidth);
  const { opts, data } = build(theme(), width);
  const entry: Live = {
    host,
    build,
    plot: new uPlot(opts, data, host),
    resize: new ResizeObserver(() => {
      const w = Math.max(200, host.clientWidth);
      if (Math.abs(w - entry.plot.width) > 1 || entry.plot.height !== chartHeight()) {
        entry.plot.setSize({ width: w, height: chartHeight() });
      }
    }),
  };
  entry.resize.observe(host);
  live.add(entry);
}

/** Rebuild every chart with the current theme colours. */
function rethemeAll(): void {
  for (const c of [...live]) {
    destroy(c);
    mount(c.host, c.build);
  }
}

new MutationObserver(rethemeAll).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rethemeAll);

export function drawTimeHistory(host: HTMLElement, d: ReadyHistory): void {
  mount(host, timeHistory(d));
}

export function drawKChart(host: HTMLElement, d: KChartData): void {
  mount(host, kCurves(d));
}

export function drawLateralChart(host: HTMLElement, d: LateralChartData): void {
  mount(host, lateralBoundary(d));
}
