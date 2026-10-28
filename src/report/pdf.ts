// A4 calc sheet (SPEC §7) drawn from a ReportModel. Draws text only; all wording and numbers
// come from report/model.ts. Loaded on demand, so jsPDF is not in the main page bundle.

import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable';
import type { ReportCell, ReportModel, ReportTable } from './model';

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

const STATUS_COLOUR: Record<string, RGB> = {
  PASS,
  FAIL,
  'AWAITING DATA': WAIT,
  INCOMPLETE: WAIT,
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

    s.heading('Charts');
    s.table(
      ['Chart', 'Status', 'Needs'],
      m.charts.map((c) => [
        { text: `${c.title} (${c.clause})` },
        { text: 'awaiting digitised code data', awaiting: true },
        { text: c.note },
      ]),
      { columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 44 } } },
    );
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
