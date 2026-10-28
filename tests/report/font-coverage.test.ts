// Every character on the calc sheet must exist in the embedded fonts, or jsPDF prints a blank.
import { describe, expect, it } from 'vitest';
import { runCheck, type CodeData } from '../../src/engine/check';
import { buildReport } from '../../src/report/model';
import { emptyFormValues, formToInputs, type FormValues } from '../../src/share/form-values';
import boldUri from '../../src/report/fonts/NotoSans-Bold.ttf?inline';
import regularUri from '../../src/report/fonts/NotoSans-Regular.ttf?inline';

/** Bytes of a base64 data URI. */
function bytes(dataUri: string): Uint8Array {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (c) => c.charCodeAt(0));
}

/** Code points mapped by a TrueType font's Windows Unicode cmap (formats 4 and 12). */
function fontCodePoints(buf: Uint8Array): Set<number> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (at: number) => String.fromCharCode(...buf.subarray(at, at + 4));
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (tag(rec) === 'cmap') cmap = view.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error('No cmap table');

  const points = new Set<number>();
  const n = view.getUint16(cmap + 2);
  for (let i = 0; i < n; i++) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    if (platform !== 3) continue;
    const sub = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segX2 = view.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const offsets = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = view.getUint16(ends + s * 2);
        const start = view.getUint16(starts + s * 2);
        const delta = view.getInt16(deltas + s * 2);
        const rangeOffset = view.getUint16(offsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const g = view.getUint16(offsets + s * 2 + rangeOffset + (c - start) * 2);
            glyph = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(c);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let gi = 0; gi < groups; gi++) {
        const at = sub + 16 + gi * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        if (view.getUint32(at + 8) === 0) continue;
        for (let c = start; c <= end; c++) points.add(c);
      }
    }
  }
  return points;
}

function allText(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(allText);
  if (x && typeof x === 'object') return Object.values(x).flatMap(allText);
  return [];
}

const base: FormValues = {
  ...emptyFormValues(),
  project: 'Project',
  name: 'Bridge',
  L: '30',
  b: '2.5',
  height: '10',
  EI: '1.3131e9',
  m: '1000',
  damping: '0.5',
  bridgeClass: 'D',
  groupWalking: '10',
  k1: 'rural',
  k2: 'alternative',
  k4: '1.2',
};

const injected: CodeData = {
  k: () => ({ value: 1, warning: 'k clamped at the figure limit' }),
  gammaGroup: () => ({ value: 0.3 }),
  gammaCrowd: () => ({ value: 0.2 }),
};

/** Scenarios that between them produce every kind of row, flag and message. */
const scenarios: [string, FormValues, CodeData | undefined][] = [
  ['beam, awaiting', base, undefined],
  ['beam, computed with lookup warning', base, injected],
  ['beam, jogging excluded', { ...base, includeJogging: false }, undefined],
  ['input error', { ...base, L: '-1' }, undefined],
  [
    'partial inputs',
    { ...emptyFormValues(), L: '30', EI: '1e9', m: '500', damping: '1' },
    undefined,
  ],
  [
    'modal, all flags',
    {
      ...base,
      inputMode: 'modal',
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
          f: '1.2',
          M: '20000',
          damping: '0.8',
          direction: 'lateral',
          shape: 'half-sine',
          Seff: '',
        },
        {
          f: '2.8',
          M: '20000',
          damping: '0.8',
          direction: 'torsional',
          shape: 'full-sine',
          Seff: '',
        },
      ],
    },
    undefined,
  ],
];

describe('embedded PDF fonts cover every character on the calc sheet', () => {
  for (const [file, uri] of [
    ['NotoSans-Regular.ttf', regularUri],
    ['NotoSans-Bold.ttf', boldUri],
  ] as const) {
    const points = fontCodePoints(bytes(uri));
    it(`${file}: cmap parser sanity (fontTools counts 2965 code points; ≤ is absent)`, () => {
      expect(points.size).toBe(2965);
      expect(points.has('ξ'.codePointAt(0) as number)).toBe(true);
      expect(points.has('≤'.codePointAt(0) as number)).toBe(false);
    });
    for (const [label, values, codeData] of scenarios) {
      it(`${file}: ${label}`, () => {
        const inputs = formToInputs(values);
        if (!inputs) throw new Error('blank inputs');
        const report = buildReport({
          values,
          result: runCheck({ ...inputs, codeData }),
          date: new Date('2026-10-28T00:00:00Z'),
          version: '0.1.0',
          commit: 'abc1234',
        });
        const missing = new Set<string>();
        for (const t of allText(report)) {
          for (const ch of t) {
            const cp = ch.codePointAt(0) as number;
            if (cp >= 0x20 && !points.has(cp)) missing.add(ch);
          }
        }
        expect([...missing]).toEqual([]);
      });
    }
  }
});
