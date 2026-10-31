// A4 calc sheet (SPEC §7) drawn from a ReportModel. Draws text only; all wording and numbers
// come from report/model.ts. Loaded on demand, so jsPDF is not in the main page bundle.

import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable';
import type { ReportCell, ReportChart, ReportModel, ReportTable } from './model';

export interface PdfFonts {
  /** Base64 TrueType data. */
  regular: string;
  bold: string;
}

const FONT = 'NotoSans';
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const FOOTER_H = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = PAGE_H - MARGIN - FOOTER_H;

type RGB = [number, number, number];
const INK: RGB = [26, 29, 33];
const INK_3: RGB = [107, 113, 122];
const RULE: RGB = [200, 196, 186];
const ACCENT: RGB = [31, 79, 143];
const PASS: RGB = [27, 107, 58];
const FAIL: RGB = [176, 38, 28];
const WAIT: RGB = [125, 83, 0];
const WAIT_SOFT: RGB = [251, 240, 214];
const HEAD_FILL: RGB = [238, 237, 232];
// Chart colours: the light-theme series colours of the results page (styles.css).
const WALK: RGB = [31, 79, 143];
const JOG: RGB = [194, 98, 10];
const BAND: RGB = [230, 237, 247];
const GRID: RGB = [226, 223, 214];

const STATUS_COLOUR: Record<string, RGB> = {
  PASS,
  FAIL,
  'AWAITING DATA': WAIT,
  INCOMPLETE: WAIT,
  'NOT REQUIRED': INK_3,
  'CHECK INPUTS': FAIL,
};

class Sheet {
  y = MARGIN;
  constructor(readonly doc: jsPDF) {}

  ensure(height: number): void {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  text(
    t: string,
    opts: { size?: number; bold?: boolean; colour?: RGB; gap?: number; indent?: number } = {},
  ): void {
    const size = opts.size ?? 9;
    const indent = opts.indent ?? 0;
    this.doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.colour ?? INK));
    const lines = this.doc.splitTextToSize(t, CONTENT_W - indent) as string[];
    const lineH = size * 0.42;
    for (const line of lines) {
      this.ensure(lineH);
      this.doc.text(line, MARGIN + indent, this.y + lineH * 0.8);
      this.y += lineH;
    }
    this.y += opts.gap ?? 1.5;
  }

  heading(title: string, clause = ''): void {
    this.ensure(12);
    this.y += 2;
    this.doc.setDrawColor(...RULE);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 1.5;
    this.doc.setFont(FONT, 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(...INK);
    this.doc.text(title.toUpperCase(), MARGIN, this.y + 3.6);
    if (clause) {
      const w = this.doc.getTextWidth(title.toUpperCase());
      this.doc.setFont(FONT, 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...INK_3);
      this.doc.text(clause, MARGIN + w + 3, this.y + 3.6);
    }
    this.y += 6;
  }

  table(
    head: string[] | null,
    rows: ReportCell[][],
    opts: { columnStyles?: Record<number, { cellWidth?: number }>; fontSize?: number } = {},
  ): void {
    const body: RowInput[] = rows.map((r) => r.map((c) => c.text));
    autoTable(this.doc, {
      startY: this.y,
      head: head ? [head] : undefined,
      body,
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + FOOTER_H },
      styles: {
        font: FONT,
        fontStyle: 'normal',
        fontSize: opts.fontSize ?? 8,
        cellPadding: 1.4,
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0.2,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: HEAD_FILL, textColor: INK, fontStyle: 'bold' },
      columnStyles: opts.columnStyles,
      didParseCell: (data: CellHookData) => {
        if (data.section !== 'body') return;
        const c = rows[data.row.index]?.[data.column.index];
        if (!c) return;
        if (c.awaiting) {
          data.cell.styles.textColor = WAIT;
          data.cell.styles.fillColor = WAIT_SOFT;
          data.cell.styles.fontStyle = 'bold';
        }
        if (c.override) {
          // SPEC §2.3 — overrides printed in red on the calc sheet.
          data.cell.styles.textColor = FAIL;
          data.cell.styles.fontStyle = 'bold';
        }
        if (c.verdict) {
          data.cell.styles.textColor = c.verdict === 'PASS' ? PASS : FAIL;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    this.y =
      (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
  }

  reportTable(t: ReportTable, opts: Parameters<Sheet['table']>[2] = {}): void {
    this.heading(t.title, t.clause);
    if (t.rows.length > 0) this.table(t.head, t.rows, opts);
    if (t.note) this.text(t.note, { size: 7.5, colour: INK_3 });
  }
}

function header(s: Sheet, m: ReportModel): void {
  const { doc } = s;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ACCENT);
  doc.text('UK NA TO BS EN 1991-2 · NA.2.44', MARGIN, s.y + 3);
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text('Footbridge vibration check: calc sheet', MARGIN, s.y + 10);
  s.y += 14;

  const h = m.header;
  const c = (text: string): ReportCell => ({ text });
  s.table(
    null,
    [
      [c('Project'), c(h.project), c('Checked by'), c('')],
      [c('Bridge'), c(h.bridge), c('Date checked'), c('')],
      [c('Date'), c(h.date), c('Signature'), c('')],
      [
        c('Tool'),
        c(`Footbridge Vibration Checker v${h.toolVersion}, commit ${h.commit}`),
        c(''),
        c(''),
      ],
    ],
    {
      columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 24 }, 3: { cellWidth: 40 } },
      fontSize: 8.5,
    },
  );
}

function statusBox(s: Sheet, m: ReportModel): void {
  const colour = STATUS_COLOUR[m.status.word] ?? INK;
  const { doc } = s;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  const detail = [
    m.status.detail,
    m.status.missing,
    ...m.status.notes,
    ...m.status.info,
    m.status.governing && `Governing case: ${m.status.governing}`,
  ].filter((x): x is string => Boolean(x));
  const lines = detail.flatMap((d) => doc.splitTextToSize(d, CONTENT_W - 10) as string[]);
  const height = 12 + lines.length * 3.9;
  s.ensure(height + 2);
  doc.setDrawColor(...colour);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, s.y, CONTENT_W, height);
  doc.setFillColor(...colour);
  doc.rect(MARGIN, s.y, 2.5, height, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...colour);
  doc.text(m.status.word, MARGIN + 6, s.y + 8);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  lines.forEach((line, i) => doc.text(line, MARGIN + 6, s.y + 13.5 + i * 3.9));
  s.y += height + 3;
}

// ---------- Charts (SPEC §7 item 5) ----------
// Vector line drawings of the same data as the results page. Axis ranges and tick steps are
// presentation only; every plotted value comes from the report model.

/** A tick step of 1, 2 or 5 × 10ⁿ giving about `target` intervals over `span`. */
function tickStep(span: number, target = 5): number {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function tickLabel(v: number, step: number): string {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return (Math.abs(v) < step / 1e6 ? 0 : v).toFixed(d);
}

interface Frame {
  x0: number;
  y0: number;
  w: number;
  h: number;
  xr: [number, number];
  yr: [number, number];
}

const px = (f: Frame, x: number) => f.x0 + ((x - f.xr[0]) / (f.xr[1] - f.xr[0])) * f.w;
const py = (f: Frame, y: number) => f.y0 + f.h - ((y - f.yr[0]) / (f.yr[1] - f.yr[0])) * f.h;

function axesFrame(doc: jsPDF, f: Frame, xLabel: string, yLabel: string): void {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...INK_3);
  doc.setLineWidth(0.15);
  for (const [axis, r] of [
    ['x', f.xr],
    ['y', f.yr],
  ] as const) {
    const step = tickStep(r[1] - r[0]);
    for (let v = Math.ceil(r[0] / step - 1e-9) * step; v <= r[1] + step * 1e-6; v += step) {
      doc.setDrawColor(...GRID);
      if (axis === 'x') {
        const x = px(f, v);
        doc.line(x, f.y0, x, f.y0 + f.h);
        doc.text(tickLabel(v, step), x, f.y0 + f.h + 3, { align: 'center' });
      } else {
        const y = py(f, v);
        doc.line(f.x0, y, f.x0 + f.w, y);
        doc.text(tickLabel(v, step), f.x0 - 1.2, y + 1, { align: 'right' });
      }
    }
  }
  doc.setDrawColor(...INK_3);
  doc.setLineWidth(0.25);
  doc.rect(f.x0, f.y0, f.w, f.h);
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(xLabel, f.x0 + f.w / 2, f.y0 + f.h + 6.5, { align: 'center' });
  doc.text(yLabel, f.x0 - 8.5, f.y0 + f.h / 2, { angle: 90, align: 'center' });
}

function polyline(
  doc: jsPDF,
  f: Frame,
  pts: readonly (readonly number[])[],
  colour: RGB,
  width = 0.35,
  dash?: number[],
): void {
  doc.setDrawColor(...colour);
  doc.setLineWidth(width);
  if (dash) doc.setLineDashPattern(dash, 0);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as readonly number[];
    const b = pts[i] as readonly number[];
    doc.line(
      px(f, a[0] as number),
      py(f, a[1] as number),
      px(f, b[0] as number),
      py(f, b[1] as number),
    );
  }
  if (dash) doc.setLineDashPattern([], 0);
}

/** Small label, kept inside the plot frame when one is given. */
function chartLabel(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right' | 'center',
  f?: Frame,
) {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  const w = doc.getTextWidth(text);
  let left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  if (f) left = Math.min(Math.max(left, f.x0 + 0.8), f.x0 + f.w - 0.8 - w);
  doc.text(text, left, y);
}

function marker(doc: jsPDF, x: number, y: number, colour: RGB, cross = false): void {
  doc.setDrawColor(...colour);
  doc.setFillColor(...colour);
  if (cross) {
    doc.setLineWidth(0.5);
    doc.line(x - 1.2, y - 1.2, x + 1.2, y + 1.2);
    doc.line(x - 1.2, y + 1.2, x + 1.2, y - 1.2);
  } else {
    doc.circle(x, y, 0.9, 'F');
  }
}

/** Draw one chart's plot inside the frame. */
function plot(doc: jsPDF, c: ReportChart, area: Omit<Frame, 'xr' | 'yr'>): void {
  if (c.kind === 'time-history') {
    const d = c.data;
    const top = Math.max(d.aPeak, d.aLimit ?? 0) * 1.15;
    const f: Frame = { ...area, xr: [0, d.t[d.t.length - 1] ?? 1], yr: [-top, top] };
    axesFrame(doc, f, 'Time t (s)', 'a (m/s²)');
    polyline(
      doc,
      f,
      d.t.map((t, i) => [t, d.a[i] as number]),
      d.activity === 'jogging' ? JOG : WALK,
      0.25,
    );
    if (d.aLimit !== null) {
      for (const sign of [1, -1]) {
        const y = sign * d.aLimit;
        polyline(
          doc,
          f,
          [
            [f.xr[0], y],
            [f.xr[1], y],
          ],
          INK,
          0.3,
          [1.5, 1],
        );
      }
      // Top left, where the response is still small, so the label stays clear of the signal.
      chartLabel(doc, '±a_limit', f.x0 + 1, py(f, d.aLimit) - 1, 'left');
    }
    return;
  }
  if (c.kind === 'k') {
    const d = c.data;
    const lastX = Math.max(
      ...[...d.curves.walking, ...d.curves.jogging].map((p) => p[0] as number),
    );
    const xMax = Math.max(lastX, ...d.markers.map((m) => m.f * 1.05));
    const yMax = Math.max(...[...d.curves.walking, ...d.curves.jogging].map((p) => p[1] as number));
    const f: Frame = { ...area, xr: [0, xMax], yr: [0, yMax * 1.12] };
    axesFrame(doc, f, 'Mode frequency f_v (Hz)', 'k(f_v)');
    polyline(doc, f, d.curves.walking, WALK);
    polyline(doc, f, d.curves.jogging, JOG);
    for (const m of d.markers) {
      polyline(
        doc,
        f,
        [
          [m.f, f.yr[0]],
          [m.f, f.yr[1]],
        ],
        INK_3,
        0.25,
        [1, 0.8],
      );
      const right = px(f, m.f) > f.x0 + f.w * 0.85;
      chartLabel(
        doc,
        m.modeLabel,
        px(f, m.f) + (right ? -1 : 1),
        f.y0 + 3,
        right ? 'right' : 'left',
        f,
      );
      if (m.kWalking !== null) marker(doc, px(f, m.f), py(f, m.kWalking), WALK);
      if (m.kJogging !== null) marker(doc, px(f, m.f), py(f, m.kJogging), JOG);
    }
    // Key, so the curves do not rely on colour alone.
    const kx = f.x0 + f.w - 22;
    for (const [i, [name, colour]] of (
      [
        ['Walking', WALK],
        ['Jogging', JOG],
      ] as const
    ).entries()) {
      const y = f.y0 + 7 + i * 3.4;
      doc.setDrawColor(...colour);
      doc.setLineWidth(0.6);
      doc.line(kx, y - 0.8, kx + 4, y - 0.8);
      chartLabel(doc, name, kx + 5, y, 'left');
    }
    return;
  }
  if (c.kind === 'lateral') {
    const d = c.data;
    const yMax = Math.max(...d.boundary.map((p) => p[1] as number), ...d.points.map((p) => p.D));
    const xMax = Math.max(1.8, ...d.points.map((p) => p.f * 1.1));
    const f: Frame = { ...area, xr: [0, xMax], yr: [0, yMax * 1.15] };
    const [lo, hi] = d.reliableRangeHz;
    doc.setFillColor(...BAND);
    doc.rect(px(f, lo), f.y0, px(f, hi) - px(f, lo), f.h, 'F');
    axesFrame(doc, f, 'Lateral mode frequency f (Hz)', 'D');
    polyline(doc, f, d.boundary, INK, 0.45);
    polyline(
      doc,
      f,
      [
        [d.triggerHz, f.yr[0]],
        [d.triggerHz, f.yr[1]],
      ],
      INK_3,
      0.25,
      [1, 0.8],
    );
    chartLabel(doc, `Test data ${lo}–${hi} Hz`, px(f, (lo + hi) / 2), f.y0 + 3, 'center', f);
    chartLabel(doc, 'Stable above the line', px(f, d.triggerHz) - 1, f.y0 + 7, 'right', f);
    for (const [i, p] of d.points.entries()) {
      const unstable = p.status === 'UNSTABLE';
      const x = px(f, p.f);
      const y = py(f, p.D);
      marker(doc, x, y, unstable ? FAIL : p.status === 'STABLE' ? PASS : INK_3, unstable);
      const word = p.status === 'OUTSIDE-FIGURE' ? 'CANNOT ASSESS' : p.status;
      const right = x > f.x0 + f.w * 0.65;
      // Labels are stacked in point order so that points close together stay readable.
      chartLabel(
        doc,
        `${p.modeLabel}: ${word}`,
        x + (right ? -2.5 : 2.5),
        y - 2 - i * 3.2,
        right ? 'right' : 'left',
        f,
      );
    }
  }
}

/** The charts in one row of two or three: title, plot and written summary for each. */
function charts(s: Sheet, list: ReportChart[]): void {
  const { doc } = s;
  const gap = 5;
  // Three charts share one row so the sheet stays within three pages (SPEC §7).
  const perRow = Math.min(Math.max(list.length, 2), 3);
  const cellW = (CONTENT_W - gap * (perRow - 1)) / perRow;
  const plotH = perRow === 3 ? 36 : 40;
  const titleLines = (c: ReportChart) => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8);
    return doc.splitTextToSize(c.title, cellW) as string[];
  };
  const headH = Math.max(...list.map((c) => titleLines(c).length)) * 3.4 + 4.6;
  const capLines = (c: ReportChart) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    return doc.splitTextToSize(c.caption, cellW) as string[];
  };
  for (let i = 0; i < list.length; i += perRow) {
    const row = list.slice(i, i + perRow);
    const height = Math.max(
      ...row.map((c) => (c.kind === 'empty' ? headH : headH + plotH + 10) + capLines(c).length * 3),
    );
    // Keep the section heading on the same page as the first row.
    if (i === 0) {
      s.ensure(height + 14);
      s.heading('Charts', 'SPEC §7 item 5');
    }
    s.ensure(height + 2);
    row.forEach((c, j) => {
      const x = MARGIN + j * (cellW + gap);
      let y = s.y;
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      const title = titleLines(c);
      title.forEach((line, k) => doc.text(line, x, y + 3 + k * 3.4));
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...INK_3);
      doc.text(c.clause, x, y + 2.9 + title.length * 3.4);
      y += headH;
      if (c.kind !== 'empty') {
        plot(doc, c, { x0: x + 11, y0: y + 1, w: cellW - 12, h: plotH });
        y += plotH + 10;
      }
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...INK);
      capLines(c).forEach((line, k) => doc.text(line, x, y + 2.4 + k * 3));
    });
    s.y += height + 3;
  }
}

function footers(doc: jsPDF, footer: string): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    const top = PAGE_H - MARGIN - FOOTER_H + 4;
    doc.line(MARGIN, top, PAGE_W - MARGIN, top);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_3);
    const lines = doc.splitTextToSize(footer, CONTENT_W - 25) as string[];
    lines.forEach((line, i) => doc.text(line, MARGIN, top + 4 + i * 3.3));
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, top + 4, { align: 'right' });
  }
}

/** Draw the calc sheet. Fonts are passed in so this runs the same in tests and the browser. */
export function renderCalcSheet(m: ReportModel, fonts: PdfFonts): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFont('NotoSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Bold.ttf', FONT, 'bold');
  doc.setProperties({
    title: `Footbridge vibration calc sheet: ${m.header.bridge}`,
    subject: 'Screening check to the UK NA to BS EN 1991-2, NA.2.44',
    creator: `Footbridge Vibration Checker v${m.header.toolVersion} (${m.header.commit})`,
  });

  const s = new Sheet(doc);
  header(s, m);
  statusBox(s, m);

  if (m.inputErrors.length > 0) {
    s.heading('Inputs to fix');
    for (const e of m.inputErrors) s.text(`• ${e}`, { colour: FAIL, indent: 2 });
  }

  s.reportTable(m.inputs, {
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 48 }, 2: { cellWidth: 18 } },
  });

  s.heading('Method', 'clause references');
  s.table(
    null,
    m.method.map((l) => [{ text: l.text }, { text: l.clause }]),
    { columnStyles: { 1: { cellWidth: 48 } }, fontSize: 7.5 },
  );

  if (m.inputErrors.length === 0) {
    s.reportTable(m.modes);
    s.reportTable(m.comfort, { columnStyles: { 0: { cellWidth: 60 } } });
    s.reportTable(m.cases, { fontSize: 7.5 });
    if (m.lateral) s.reportTable(m.lateral, { fontSize: 7.5 });

    charts(s, m.charts);
  }

  s.heading('Flags');
  if (m.flags.length === 0) s.text('No flags.');
  else
    s.table(
      null,
      m.flags.map((f) => [
        { text: f.level },
        { text: f.clause ? `${f.text} (${f.clause})` : f.text },
      ]),
      { columnStyles: { 0: { cellWidth: 18 } }, fontSize: 7.5 },
    );

  s.heading('Limitations');
  for (const l of m.limitations) s.text(`• ${l}`, { size: 8, indent: 2, gap: 0.8 });

  footers(doc, m.footer);
  return doc;
}

async function fontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the PDF font (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Load the fonts, draw the sheet and save it. */
export async function downloadCalcSheet(m: ReportModel, filename: string): Promise<void> {
  const [regularUrl, boldUrl] = await Promise.all([
    import('./fonts/NotoSans-Regular.ttf?url').then((x) => x.default),
    import('./fonts/NotoSans-Bold.ttf?url').then((x) => x.default),
  ]);
  const [regular, bold] = await Promise.all([fontBase64(regularUrl), fontBase64(boldUrl)]);
  renderCalcSheet(m, { regular, bold }).save(filename);
}
