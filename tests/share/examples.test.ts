import { describe, expect, it } from 'vitest';
import { runCheck } from '../../src/engine/check';
import { typicalDamping } from '../../src/engine/damping';
import { buildReport } from '../../src/report/model';
import {
  EXAMPLES,
  applyExample,
  bridgeMatchesExample,
  nameAfterEdit,
} from '../../src/share/examples';
import { emptyFormValues, formToInputs } from '../../src/share/form-values';
import { ILLUSTRATIVE_LABEL } from '../../src/share/wording';

function load(id: string, over = emptyFormValues()) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`no example ${id}`);
  const values = applyExample(over, ex);
  const inputs = formToInputs(values);
  if (!inputs) throw new Error(`${id}: blank inputs`);
  return { values, result: runCheck(inputs) };
}

describe('example bridges', () => {
  it('keeps Bridge A1 as the validation example, not marked illustrative', () => {
    const a1 = EXAMPLES[0];
    expect(a1?.id).toBe('A1');
    expect(a1?.illustrative).toBe(false);
    expect(a1?.label).not.toContain(ILLUSTRATIVE_LABEL);
  });

  for (const ex of EXAMPLES) {
    it(`${ex.id} loads and runs without input errors`, () => {
      const { result } = load(ex.id);
      expect(result.inputErrors).toEqual([]);
      expect(result.status).not.toBe('INPUT-ERROR');
    });
  }

  it('labels every illustrative example in the dropdown, the results and the PDF', () => {
    const ill = EXAMPLES.filter((e) => e.illustrative);
    expect(ill).toHaveLength(5);
    for (const ex of ill) {
      expect(ex.label).toContain(ILLUSTRATIVE_LABEL);
      // The bridge name carries the label onto the status card ("Result for …") and the PDF.
      expect(ex.values.name).toContain(ILLUSTRATIVE_LABEL);
      const { values, result } = load(ex.id);
      const report = buildReport({
        values,
        result,
        date: new Date('2026-10-31T00:00:00Z'),
        version: '0.1.0',
        commit: 'abc1234',
      });
      expect(report.header.bridge).toContain(ILLUSTRATIVE_LABEL);
    }
  });

  it('an illustrative example replaces the whole form, whatever was loaded before', () => {
    for (const before of EXAMPLES) {
      for (const ex of EXAMPLES.filter((e) => e.illustrative)) {
        const fromBlank = load(ex.id).values;
        const afterOther = load(ex.id, load(before.id).values).values;
        expect(afterOther).toEqual(fromBlank);
      }
    }
  });

  it('Bridge A1 resets usage and comfort, so it always gives the same result', () => {
    const fromBlank = load('A1');
    expect(fromBlank.result.status).toBe('INCOMPLETE');
    expect(fromBlank.result.missingInputs).toEqual([
      'height above ground',
      'k1',
      'k2',
      'bridge class',
    ]);
    for (const before of EXAMPLES) {
      const after = load('A1', load(before.id).values);
      expect(after.values).toEqual(fromBlank.values);
      expect(after.result.status).toBe('INCOMPLETE');
    }
  });

  it('takes damping from PD 6688-2 Table A.1 (δ = 0.03 steel, 0.05 concrete, 0.06 timber)', () => {
    const delta = (id: string) => load(id).result.modes[0]?.delta;
    expect(delta('steel-box-40')).toBeCloseTo(0.03, 6);
    expect(delta('concrete-20')).toBeCloseTo(0.05, 6);
    expect(delta('stiff-concrete-15')).toBeCloseTo(0.05, 6);
    expect(delta('timber-25')).toBeCloseTo(0.06, 6);
    expect(typicalDamping().find((m) => m.id === 'timber')?.deltaMin).toBe(0.06);
  });

  it('stiff concrete span: f1 = 6.00 Hz, so the vertical check is NOT REQUIRED', () => {
    const { result } = load('stiff-concrete-15');
    expect(result.vertical.fundamentalHz).toBeCloseTo(6.0, 2);
    expect(result.status).toBe('NOT-REQUIRED');
  });

  it('suspension bridge: the 0.8 Hz lateral mode is UNSTABLE, so the result is FAIL', () => {
    const { result } = load('suspension-modal');
    expect(result.lateral).toHaveLength(1);
    expect(result.lateral[0]?.status).toBe('UNSTABLE');
    expect(result.status).toBe('FAIL');
  });
});

describe('example: London Millennium Bridge (published data, Level 3 case R5)', () => {
  it('is labelled as based on published data, not as illustrative', () => {
    const ex = EXAMPLES.find((e) => e.id === 'millennium');
    expect(ex?.illustrative).toBe(false);
    expect(ex?.label).toMatch(/based on published data/);
    expect(ex?.label).not.toContain(ILLUSTRATIVE_LABEL);
  });

  it('gives the same result as case R5: D = 0.0319, UNSTABLE, overall FAIL', () => {
    const { result } = load('millennium');
    expect(result.lateral[0]?.D).toBeCloseTo(0.0319, 4);
    expect(result.lateral[0]?.status).toBe('UNSTABLE');
    expect(result.status).toBe('FAIL');
  });

  it('replaces the whole form, whatever was loaded before', () => {
    const fromBlank = load('millennium').values;
    for (const before of EXAMPLES) {
      expect(load('millennium', load(before.id).values).values).toEqual(fromBlank);
    }
  });
});

describe('example name is cleared when the bridge inputs change (bug report)', () => {
  const ex = (id: string) => EXAMPLES.find((e) => e.id === id)!;

  it('matches straight after loading, for every example', () => {
    for (const e of EXAMPLES) {
      const values = load(e.id).values;
      expect(bridgeMatchesExample(values, e)).toBe(true);
      expect(nameAfterEdit(values, e)).toBe(e.values.name);
    }
  });

  it('switching to modal and entering modes clears the example name', () => {
    const values = {
      ...load('concrete-20').values,
      inputMode: 'modal' as const,
      modes: [
        {
          f: '2',
          M: '15000',
          damping: '0.5',
          direction: 'vertical' as const,
          shape: 'half-sine' as const,
          Seff: '',
        },
      ],
    };
    expect(bridgeMatchesExample(values, ex('concrete-20'))).toBe(false);
    expect(nameAfterEdit(values, ex('concrete-20'))).toBe('');
  });

  it('any one bridge input (span, width, height, EI, mass, damping, lowest deck mass, a mode) clears it', () => {
    const base = load('suspension-modal').values;
    const e = ex('suspension-modal');
    for (const field of ['L', 'b', 'height', 'mBridgeMin'] as const) {
      expect(nameAfterEdit({ ...base, [field]: `${base[field]}9` }, e), field).toBe('');
    }
    const beam = load('steel-box-40').values;
    for (const field of ['EI', 'm', 'damping'] as const) {
      expect(nameAfterEdit({ ...beam, [field]: `${beam[field]}9` }, ex('steel-box-40'))).toBe('');
    }
    const modes = base.modes.map((r, i) => (i === 1 ? { ...r, f: '0.9' } : r));
    expect(nameAfterEdit({ ...base, modes }, e)).toBe('');
  });

  it('usage, comfort and fields the example left blank (A1 height) keep the name', () => {
    const values = {
      ...load('A1').values,
      bridgeClass: 'C' as const,
      k1: 'urban' as const,
      k2: 'primary' as const,
      height: '10',
    };
    expect(nameAfterEdit(values, ex('A1'))).toBe(ex('A1').values.name);
  });

  it('a name the user typed is never cleared', () => {
    const values = { ...load('concrete-20').values, name: 'My bridge', L: '25' };
    expect(nameAfterEdit(values, ex('concrete-20'))).toBe('My bridge');
  });

  it('with no example loaded the name is left alone', () => {
    const values = { ...load('concrete-20').values, L: '25' };
    expect(nameAfterEdit(values, null)).toBe(values.name);
  });
});

describe('example: Podgorica footbridge (published data, Level 3 case R1)', () => {
  it('is labelled as based on published data and loads the published mode', () => {
    const ex = EXAMPLES.find((e) => e.id === 'podgorica');
    expect(ex?.illustrative).toBe(false);
    expect(ex?.label).toMatch(/based on published data/);
    const { values, result } = load('podgorica');
    expect(values.inputMode).toBe('modal');
    expect(values.b).toBe(''); // width not published
    expect(result.inputErrors).toEqual([]);
    expect(result.modes[0]).toMatchObject({ f: 2.04, M: 58000, direction: 'vertical' });
    expect(result.modes[0]?.zeta).toBeCloseTo(0.0026, 12);
  });
});

describe('filling a field the example left blank keeps its name', () => {
  it('Podgorica: the width is not published, so entering one keeps the name', () => {
    const e = EXAMPLES.find((x) => x.id === 'podgorica')!;
    expect(nameAfterEdit({ ...load('podgorica').values, b: '3' }, e)).toBe(e.values.name);
  });
});
