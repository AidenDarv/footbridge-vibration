import { describe, expect, it } from 'vitest';
import { runCheck, type CodeData } from '../../src/engine/check';
import { emptyFormValues, formToInputs, type FormValues } from '../../src/share/form-values';
import {
  PDF_UNSUPPORTED,
  buildReport,
  pdfSafe,
  type ReportCell,
  type ReportModel,
} from '../../src/report/model';

const values: FormValues = {
  ...emptyFormValues(),
  project: 'Test project',
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

const meta = { date: new Date('2026-10-28T12:00:00Z'), version: '0.1.0', commit: 'abc1234' };

function build(v: FormValues, codeData?: CodeData): ReportModel {
  const inputs = formToInputs(v);
  if (!inputs) throw new Error('blank inputs');
  return buildReport({ values: v, result: runCheck({ ...inputs, codeData }), ...meta });
}

/** Every string anywhere in the model. */
function allText(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(allText);
  if (x && typeof x === 'object') return Object.values(x).flatMap(allText);
  return [];
}

function column(table: { head: string[]; rows: ReportCell[][] }, name: string): ReportCell[] {
  const i = table.head.findIndex((hd) => hd.startsWith(name));
  if (i < 0) throw new Error(`No column ${name}`);
  return table.rows.map((r) => r[i] as ReportCell);
}

describe('calc sheet model (SPEC §7)', () => {
  const r = build(values);

  it('has the header fields', () => {
    expect(r.header).toEqual({
      project: 'Test project',
      bridge: 'Bridge A1',
      date: '2026-10-28',
      toolVersion: '0.1.0',
      commit: 'abc1234',
    });
  });

  it('shows awaiting data as "awaiting", never blank, zero or a number', () => {
    expect(r.status.word).toBe('AWAITING DATA');
    for (const name of ['k(f)', 'γ', 'Force', 'a_peak', 'Util', 'Result']) {
      for (const cell of column(r.cases, name)) {
        expect(cell.awaiting).toBe(true);
        expect(cell.text.toLowerCase()).toContain('awaiting');
      }
    }
  });

  it('still prints what can be calculated', () => {
    expect(column(r.modes, 'f')[0]?.text).toBe('2.000');
    expect(column(r.cases, 'a_limit').every((c) => c.text === '1.456')).toBe(true);
    expect(column(r.cases, 'N').map((c) => c.text)).toEqual(['8', '2', '60.0', '8', '2', '60.0']);
  });

  it('shows the awaiting charts with the figure they need', () => {
    expect(r.charts.length).toBeGreaterThanOrEqual(2);
    for (const c of r.charts) expect(c.status).toBe('awaiting');
  });

  it('prints the jogging choice and the k4 justification', () => {
    const rows = r.inputs.rows.map((row) => row.map((c) => c.text).join(' | '));
    expect(rows.some((t) => t.startsWith('Jogging cases | Included'))).toBe(true);
    const off = build({ ...values, includeJogging: false, k4: '1.1', k4Justification: 'Short' });
    const offRows = off.inputs.rows.map((row) => row.map((c) => c.text).join(' | '));
    expect(offRows.some((t) => t.startsWith('Jogging cases | Excluded'))).toBe(true);
    expect(offRows.some((t) => t.includes('Short'))).toBe(true);
  });

  it('marks overrides so they print in red', () => {
    const o = build({ ...values, groupWalking: '10' });
    const row = o.inputs.rows.find((rw) => rw[0]?.text === 'Walking group N');
    expect(row?.[1]?.text).toBe('10');
    expect(row?.[1]?.override).toBe(true);
    expect(row?.[3]?.text).toContain('8'); // the Table NA.7 value it replaced
    const plain = r.inputs.rows.find((rw) => rw[0]?.text === 'Walking group N');
    expect(plain?.[1]?.override).toBeFalsy();
  });

  it('always has the screening footer and the limitations', () => {
    expect(r.footer).toMatch(/^Screening tool\. Verify against NA\+A1:2020/);
    expect(r.limitations.length).toBeGreaterThan(3);
    expect(r.flags.some((f) => f.text.includes('digitised'))).toBe(true);
  });

  it('gives a PASS/FAIL verdict in words when code data is injected', () => {
    const inj: CodeData = {
      k: () => ({ value: 1 }),
      gammaGroup: () => ({ value: 0.3 }),
      gammaCrowd: () => ({ value: 0.2 }),
    };
    const f = build(values, inj);
    expect(f.status.word).toBe('FAIL');
    expect(column(f.cases, 'Result').map((c) => c.text)).toContain('FAIL');
    expect(column(f.cases, 'a_peak').some((c) => c.awaiting)).toBe(false);
    expect(f.status.governing).toMatch(/Mode 1, crowd/);
  });

  it('prints a blocked user-Seff group case as NOT RUN', () => {
    const m = build({
      ...values,
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
      ],
    });
    const results = column(m.cases, 'Result').map((c) => c.text);
    expect(results.slice(0, 2)).toEqual(['NOT RUN', 'NOT RUN']);
  });

  it('uses only characters the embedded font can print', () => {
    const m = build({ ...values, groupWalking: '-1' }); // input-error state
    for (const model of [r, m]) {
      for (const t of allText(model)) {
        for (const ch of PDF_UNSUPPORTED) expect(t).not.toContain(ch);
      }
    }
  });
});

describe('pdfSafe', () => {
  it('replaces symbols the font lacks', () => {
    expect(pdfSafe('0.5 ≤ a ≤ 2.0, √(x) ≈ y → z, N ≥ 1')).toBe(
      '0.5 <= a <= 2.0, sqrt(x) ~ y -> z, N >= 1',
    );
  });
});

describe('calc sheet model: review fixes', () => {
  it('shows chosen k1 and k2 even when the height is still blank', () => {
    const r = build({ ...values, height: '' });
    const k1 = r.inputs.rows.find((row) => row[0]?.text === 'k1 site usage');
    const k2 = r.inputs.rows.find((row) => row[0]?.text === 'k2 route redundancy');
    expect(k1?.[1]?.text).toBe('1.6');
    expect(k2?.[1]?.text).toBe('1.3');
  });

  it('a computed case with no limit says "needs limit", not "awaiting"', () => {
    const inj: CodeData = {
      k: () => ({ value: 1 }),
      gammaGroup: () => ({ value: 0.3 }),
      gammaCrowd: () => ({ value: 0.2 }),
    };
    const r = build({ ...values, height: '' }, inj);
    for (const cell of column(r.cases, 'Util')) {
      expect(cell.awaiting).toBeFalsy();
      expect(cell.text).toBe('needs limit');
    }
    expect(column(r.cases, 'a_peak').every((c) => !c.awaiting)).toBe(true);
  });

  it('marks the crowd case [VERIFY]', () => {
    const cases = column(r0(), 'Case').map((c) => c.text);
    expect(cases.filter((t) => t === 'Crowd [VERIFY]').length).toBe(2);
    expect(cases.filter((t) => t === 'Walking group').length).toBe(2);
  });

  it('prints status notes for an unchecked lateral mode', () => {
    const r = build({
      ...values,
      inputMode: 'modal',
      modes: [
        { f: '2', M: '15000', damping: '0.5', direction: 'vertical', shape: 'half-sine', Seff: '' },
        {
          f: '1.0',
          M: '20000',
          damping: '0.8',
          direction: 'lateral',
          shape: 'half-sine',
          Seff: '',
        },
      ],
    });
    expect(r.status.notes.join(' ')).toMatch(/not checked/);
  });
});

function r0(): ReportModel['cases'] {
  return build(values).cases;
}
