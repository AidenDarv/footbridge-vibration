import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import { runCheck } from '../../src/engine/check';
import { buildReport } from '../../src/report/model';
import { renderCalcSheet } from '../../src/report/pdf';
import { emptyFormValues, formToInputs, type FormValues } from '../../src/share/form-values';
import boldUri from '../../src/report/fonts/NotoSans-Bold.ttf?inline';
import regularUri from '../../src/report/fonts/NotoSans-Regular.ttf?inline';

const fonts = {
  regular: regularUri.slice(regularUri.indexOf(',') + 1),
  bold: boldUri.slice(boldUri.indexOf(',') + 1),
};

const a1: FormValues = {
  ...emptyFormValues(),
  project: 'Test',
  name: 'Bridge A1',
  L: '30',
  b: '2.5',
  height: '10',
  EI: '1.3131e9',
  m: '1000',
  damping: '0.5',
  bridgeClass: 'C',
  k1: 'rural',
  k2: 'alternative',
};

function pages(values: FormValues): number {
  const inputs = formToInputs(values);
  if (!inputs) throw new Error('blank inputs');
  const model = buildReport({
    values,
    result: runCheck(inputs),
    date: new Date('2026-10-28T00:00:00Z'),
    version: '0.1.0',
    commit: 'abc1234',
  });
  const doc = renderCalcSheet(model, fonts);
  expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  return doc.getNumberOfPages();
}

describe('PDF calc sheet (SPEC §7: A4, one to three pages)', () => {
  it('Bridge A1, awaiting data', () => {
    const n = pages(a1);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });

  it('modal bridge with three modes and every flag', () => {
    const n = pages({
      ...a1,
      inputMode: 'modal',
      groupWalking: '10',
      includeJogging: false,
      k4: '1.2',
      k4Justification: 'Exposure reduced: sheltered valley site, see design note 7.',
      modes: [
        {
          f: '2',
          M: '15000',
          damping: '0.5',
          direction: 'vertical',
          shape: 'user-seff',
          Seff: '25',
        },
        {
          f: '3.1',
          M: '18000',
          damping: '0.5',
          direction: 'vertical',
          shape: 'full-sine',
          Seff: '',
        },
        {
          f: '1.2',
          M: '20000',
          damping: '0.8',
          direction: 'lateral',
          shape: 'half-sine',
          Seff: '',
        },
      ],
    });
    expect(n).toBeLessThanOrEqual(3);
  });

  it('input-error sheet still renders', () => {
    expect(pages({ ...a1, L: '-1' })).toBeGreaterThanOrEqual(1);
  });
});

/** Render the sheet and return the jsPDF document. */
function render(values: FormValues): jsPDF {
  const inputs = formToInputs(values);
  if (!inputs) throw new Error('blank inputs');
  const model = buildReport({
    values,
    result: runCheck(inputs),
    date: new Date('2026-10-28T00:00:00Z'),
    version: '0.1.0',
    commit: 'abc1234',
  });
  return renderCalcSheet(model, fonts);
}

/**
 * True when `text` is drawn in the given style. With an embedded font, jsPDF writes text as
 * hex glyph ids (<002f0044...> Tj), so the string is encoded with the font's own cmap.
 */
function drawn(doc: jsPDF, text: string, style: 'normal' | 'bold'): boolean {
  doc.setFont('NotoSans', style);
  const font = doc.getFont() as unknown as {
    metadata: { cmap: { unicode: { codeMap: Record<number, number> } } };
  };
  const map = font.metadata.cmap.unicode.codeMap;
  const hex = [...text]
    .map((ch) => (map[ch.codePointAt(0) as number] ?? 0).toString(16).padStart(4, '0'))
    .join('');
  const pagesText = (doc.internal as unknown as { pages: (string[] | null)[] }).pages
    .flatMap((p) => p ?? [])
    .join('\n');
  return pagesText.includes(`<${hex}`);
}

describe('PDF calc sheet: lateral lock-in (NA.2.44.7)', () => {
  const lateral: FormValues = {
    ...a1,
    inputMode: 'modal',
    mBridgeMin: '1000',
    modes: [
      { f: '2', M: '15000', damping: '0.5', direction: 'vertical', shape: 'half-sine', Seff: '' },
      { f: '1.0', M: '20000', damping: '0.5', direction: 'lateral', shape: 'half-sine', Seff: '' },
    ],
  };

  // Headings are drawn in capitals.
  it('draws the lateral stability table with the result in words, within three pages', () => {
    const doc = render(lateral);
    expect(drawn(doc, 'LATERAL STABILITY (LOCK-IN)', 'bold')).toBe(true);
    expect(drawn(doc, 'UNSTABLE', 'normal') || drawn(doc, 'UNSTABLE', 'bold')).toBe(true);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(3);
  });

  it('leaves the table out for a beam-mode bridge', () => {
    expect(drawn(render(a1), 'LATERAL STABILITY (LOCK-IN)', 'bold')).toBe(false);
  });
});
