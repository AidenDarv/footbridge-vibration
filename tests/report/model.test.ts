import { describe, expect, it } from 'vitest';
import { runCheck, type CodeData } from '../../src/engine/check';
import { emptyFormValues, formToInputs, type FormValues } from '../../src/share/form-values';
import { accelText } from '../../src/share/format';
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
  // No k(f) or γ supplied: exercises the "awaiting" printing. The default run is tested below.
  const r = build(values, {});

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
    // Mode 2 (7.99993 Hz) shows as 8.000 Hz, so it is above the cut-off (SPEC §2.1).
    expect(column(r.cases, 'N').map((c) => c.text)).toEqual(['8', '2', '60.0']);
  });

  it('explains a time-history chart that cannot be drawn yet (SPEC §7 item 5)', () => {
    expect(r.charts.map((c) => c.kind)).toEqual(['empty', 'k']);
    const th = r.charts[0];
    expect(th?.title).toMatch(/time history/i);
    expect(th?.caption).toMatch(/no group case/i);
  });

  it('draws the time-history and k(f) charts (SPEC §7 item 5)', () => {
    const d = build(values);
    expect(d.charts.map((c) => c.kind)).toEqual(['time-history', 'k']);
    const th = d.charts[0];
    if (th?.kind !== 'time-history') throw new Error('expected a time history');
    // Thinned for drawing, keeping the peak printed in the load case table.
    expect(th.data.t.length).toBeLessThanOrEqual(2 * 400);
    const peak = Math.max(...th.data.a.map(Math.abs));
    expect(peak).toBe(th.data.aPeak);
    expect(th.caption).toContain(`peak ${accelText(th.data.aPeak)} m/s²`);
    const k = d.charts[1];
    if (k?.kind !== 'k') throw new Error('expected a k(f) chart');
    expect(k.data.markers.map((mk) => mk.modeLabel)).toEqual(['Mode 1']);
  });

  it('adds the lateral stability chart when there is a lock-in check', () => {
    const d = build({
      ...values,
      inputMode: 'modal',
      mBridgeMin: '1000',
      modes: [
        { f: '2', M: '15000', damping: '0.5', direction: 'vertical', shape: 'half-sine', Seff: '' },
        { f: '1', M: '20000', damping: '0.5', direction: 'lateral', shape: 'half-sine', Seff: '' },
      ],
    });
    expect(d.charts.map((c) => c.kind)).toEqual(['time-history', 'k', 'lateral']);
  });

  it('uses the digitised Figures NA.8 and NA.9 by default, with their reading accuracy', () => {
    const d = build(values);
    expect(d.status.word).not.toBe('AWAITING DATA');
    for (const name of ['k(f)', 'γ', 'a_peak', 'Result']) {
      expect(column(d.cases, name).some((c) => c.awaiting)).toBe(false);
    }
    expect(
      d.method.some((l) => /Figures NA\.8 and NA\.9.*k ±0\.02.*gamma ±0\.01/.test(l.text)),
    ).toBe(true);
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
    expect(r.limitations).toContain(
      'This tool checks vibration serviceability only. It does not check strength, static deflection or stability, which must be verified separately.',
    );
    expect(r.flags.some((f) => f.text.includes('need k(f) and γ'))).toBe(true);
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

  it('no longer marks the crowd case [VERIFY] (confirmed against NA+A1:2020)', () => {
    const cases = column(r0(), 'Case').map((c) => c.text);
    expect(cases.filter((t) => t === 'Crowd').length).toBe(1);
    expect(cases.some((t) => t.includes('[VERIFY]'))).toBe(false);
    expect(cases.filter((t) => t === 'Walking group').length).toBe(1);
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
    expect(r.status.notes.join(' ')).toMatch(/acceleration.*not calculated/);
  });
});

describe('calc sheet model: lateral lock-in check (NA.2.44.7)', () => {
  const lateralRow = {
    f: '1.0',
    M: '20000',
    damping: '0.5',
    direction: 'lateral',
    shape: 'half-sine',
    Seff: '',
  } as const;
  const modal: FormValues = {
    ...values,
    inputMode: 'modal',
    mBridgeMin: '1000',
    modes: [
      { f: '2', M: '15000', damping: '0.5', direction: 'vertical', shape: 'half-sine', Seff: '' },
      lateralRow,
    ],
  };

  it('prints a lateral stability table with D, the boundary and the result in words', () => {
    const r = build(modal);
    expect(r.lateral).not.toBeNull();
    const t = r.lateral as NonNullable<ReportModel['lateral']>;
    expect(t.clause).toMatch(/NA\.2\.44\.7/);
    expect(column(t, 'D').map((c) => c.text)).toEqual(['0.0357']);
    expect(column(t, 'm_ped').map((c) => c.text)).toEqual(['140.0']);
    expect(column(t, 'Boundary').map((c) => c.text)).toEqual(['0.340']);
    const result = column(t, 'Result')[0];
    expect(result?.text).toBe('UNSTABLE');
    expect(result?.verdict).toBe('FAIL');
    expect(t.note).toMatch(/PD 6688-2 §A\.1/);
    expect(t.note).toMatch(/PD 6688-2 §A\.7/);
    expect(r.status.word).toBe('FAIL');
    expect(r.status.notes.join(' ')).toMatch(/divergent lateral response may occur/);
  });

  it('explains class A instead of printing a D value', () => {
    const r = build({ ...modal, bridgeClass: 'A' });
    const t = r.lateral as NonNullable<ReportModel['lateral']>;
    expect(column(t, 'D')[0]?.text).toBe('not defined');
    expect(column(t, 'Result')[0]?.text).toBe('NO CROWD');
    expect(t.note).toMatch(/class A/);
  });

  it('prints the lowest deck mass per metre in the inputs for modal mode', () => {
    const r = build(modal);
    const row = r.inputs.rows.find((x) => x[0]?.text.startsWith('Lowest deck mass per metre'));
    expect(row?.[1]?.text).toBe('1000');
    expect(row?.[3]?.text).toMatch(/PD 6688-2 §A\.7/);
  });

  it('states the lateral method and no longer lists the lock-in check as out of scope', () => {
    const r = build(modal);
    const line = r.method.find((l) => l.clause.includes('NA.2.44.7'));
    expect(line?.text).toMatch(/D = m_bridge·ξ\/m_pedestrian/);
    expect(line?.text).toMatch(/70/);
    const notCovered = r.limitations.filter((t) => t.startsWith('Not covered')).join(' ');
    expect(notCovered).not.toMatch(/lock-in/);
    expect(notCovered).toMatch(/lateral and torsional accelerations/i);
  });

  it('labels torsional rows and prints the confirm-lateral-component note', () => {
    const r = build({
      ...modal,
      modes: [modal.modes[0]!, { ...lateralRow, direction: 'torsional' }],
    });
    const t = r.lateral as NonNullable<ReportModel['lateral']>;
    expect(column(t, 'Mode')[0]?.text).toBe('Mode 2 (torsional)');
    expect(t.note).toMatch(
      /Mode 2: This is a torsional mode.*Confirm that it has a significant lateral component/,
    );
    const line = r.method.find((l) => l.clause.includes('NA.2.44.7'));
    expect(line?.text).toMatch(/torsional/);
  });

  it('has no lateral table for a beam-mode bridge', () => {
    expect(build(values).lateral).toBeNull();
  });
});

function r0(): ReportModel['cases'] {
  return build(values).cases;
}

describe('calc sheet model: PD 6688-2 notes', () => {
  const r = build(values);

  it('lists the PD 6688-2 guidance notes in the limitations', () => {
    const text = r.limitations.join('\n');
    expect(text).toMatch(/pedestrian damping.*lateral stability.*PD 6688-2 §A\.1/);
    expect(text).toMatch(/lowest.*mass per metre.*D.*PD 6688-2 §A\.7/);
    expect(text).toMatch(/γ.*each project.*PD 6688-2 §3\.20/);
  });

  it('states the response level of the crowd model in the method', () => {
    const crowd = r.method.find((l) => l.text.startsWith('Crowd'));
    expect(crowd?.text).toMatch(/2\.5σ/);
    expect(crowd?.text).toMatch(/Sétra.*4σ/);
    expect(crowd?.clause).toMatch(/PD 6688-2 §A\.3/);
  });
});

describe('calc sheet model: vertical check not required (NA.2.44.6(1); SPEC §2.10)', () => {
  const inj: CodeData = {
    k: () => ({ value: 1.0 }),
    gammaGroup: () => ({ value: 0.3 }),
    gammaCrowd: () => ({ value: 0.2 }),
  };
  // EI × 9 gives f1 = 3 × 2 Hz = 6 Hz on bridge A1; modes 2 and 3 are above 8 Hz.
  const r = build({ ...values, EI: String(1.3131e9 * 9) }, inj);

  it('prints NOT REQUIRED with the fundamental frequency and the beam-mode note', () => {
    expect(r.status.word).toBe('NOT REQUIRED');
    expect(r.status.governing).toBeNull();
    const info = r.status.info.join(' ');
    expect(info).toMatch(/6\.000 Hz/);
    expect(info).toMatch(/lateral and torsional modes were not assessed/i);
  });

  it('prints the accelerations for information only, with no verdict', () => {
    const results = column(r.cases, 'Result');
    expect(results.length).toBe(3);
    for (const c of results) {
      expect(c.text).toBe('INFO ONLY');
      expect(c.verdict).toBeUndefined();
    }
    expect(column(r.cases, 'a_peak').every((c) => c.text !== '–')).toBe(true);
  });
});

describe('status card wording for NOT REQUIRED', () => {
  // EI × 25 gives f1 = 10 Hz on bridge A1.
  const r = build({ ...values, EI: String(1.3131e9 * 25) });

  it('says "not required" once, and still gives the frequency', () => {
    const card = [r.status.detail, ...r.status.notes, ...r.status.info].join(' ');
    expect(card.match(/not required/gi)).toHaveLength(1);
    expect(card).toMatch(/10\.000 Hz/);
    expect(card).toMatch(/information only/);
  });

  it('keeps the full sentence in the flag, which is read on its own', () => {
    const flag = r.flags.find((f) => f.text.includes('10.000 Hz'));
    expect(flag?.text).toMatch(/not required/);
  });
});
