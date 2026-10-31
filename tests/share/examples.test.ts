import { describe, expect, it } from 'vitest';
import { runCheck } from '../../src/engine/check';
import { typicalDamping } from '../../src/engine/damping';
import { buildReport } from '../../src/report/model';
import { EXAMPLES, applyExample } from '../../src/share/examples';
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
