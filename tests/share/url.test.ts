import { describe, expect, it } from 'vitest';
import { emptyFormValues, formToInputs, type FormValues } from '../../src/share/form-values';
import { decodeFormValues, encodeFormValues } from '../../src/share/url';

const beam: FormValues = {
  ...emptyFormValues(),
  project: 'River crossing, stage 2',
  name: 'Bridge A1 & co',
  inputMode: 'beam',
  L: '30',
  b: '2.5',
  height: '10',
  EI: '1.3131e9',
  m: '1000',
  damping: '0.5',
  bridgeClass: 'C',
  includeJogging: false,
  groupWalking: '10',
  k1: 'rural',
  k2: 'alternative',
  k4: '1.1',
  k4Justification: 'Low exposure: short crossing, see note 4.',
};

const modal: FormValues = {
  ...emptyFormValues(),
  inputMode: 'modal',
  L: '42',
  modes: [
    { f: '2.97', M: '25000', damping: '0.19', direction: 'vertical', shape: 'half-sine', Seff: '' },
    { f: '1.2', M: '30000', damping: '0.8', direction: 'lateral', shape: 'user-seff', Seff: '35' },
  ],
};

describe('share link encoding (SPEC §1.2 item 7, §4)', () => {
  it('round-trips beam inputs exactly, including text with symbols', () => {
    const { values, warnings } = decodeFormValues(encodeFormValues(beam));
    expect(warnings).toEqual([]);
    expect(values).toEqual(beam);
  });

  it('round-trips modal inputs with every mode row', () => {
    const { values, warnings } = decodeFormValues(encodeFormValues(modal));
    expect(warnings).toEqual([]);
    expect(values).toEqual(modal);
  });

  it('is versioned and leaves out blank fields', () => {
    const q = new URLSearchParams(encodeFormValues({ ...emptyFormValues(), L: '30' }));
    expect(q.get('v')).toBe('1');
    expect(q.get('L')).toBe('30');
    expect(q.has('EI')).toBe(false);
  });

  it('an empty query gives the default form with no warnings', () => {
    expect(decodeFormValues('')).toEqual({ values: emptyFormValues(), warnings: [] });
  });

  it('accepts a leading "?"', () => {
    const q = encodeFormValues(beam);
    expect(decodeFormValues(`?${q}`).values).toEqual(beam);
  });

  it('rejects unknown choices with a warning instead of using them', () => {
    const { values, warnings } = decodeFormValues('v=1&L=30&class=Z&k1=moon');
    expect(values.bridgeClass).toBe('');
    expect(values.k1).toBe('');
    expect(values.L).toBe('30');
    expect(warnings.length).toBe(2);
  });

  it('warns about an unsupported version and ignores the rest', () => {
    const { values, warnings } = decodeFormValues('v=99&L=30');
    expect(values).toEqual(emptyFormValues());
    expect(warnings.length).toBe(1);
  });

  it('warns about a malformed mode row', () => {
    // Mode fields are parallel lists; here M is missing for the second mode.
    const { values, warnings } = decodeFormValues('v=1&in=modal&mf=2&mf=3&mM=15000');
    expect(values.modes).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it('caps very long text', () => {
    const { values, warnings } = decodeFormValues(`v=1&name=${'x'.repeat(5000)}`);
    expect(values.name.length).toBeLessThanOrEqual(200);
    expect(warnings.length).toBe(1);
  });
});

describe('form values to engine inputs', () => {
  it('a blank bridge section gives null (nothing to check yet)', () => {
    expect(formToInputs(emptyFormValues())).toBeNull();
  });

  it('beam form converts to beam inputs with overrides and comfort', () => {
    const inputs = formToInputs(beam);
    expect(inputs?.bridge).toEqual({
      kind: 'beam',
      L: 30,
      EI: 1.3131e9,
      m: 1000,
      dampingPercent: 0.5,
    });
    expect(inputs?.usage).toEqual({
      bridgeClass: 'C',
      includeJogging: false,
      overrides: { groupWalking: 10 },
    });
    expect(inputs?.comfort).toEqual({
      k1: 'rural',
      k2: 'alternative',
      k4: 1.1,
      k4Justification: 'Low exposure: short crossing, see note 4.',
    });
    expect(inputs?.height).toBe(10);
  });

  it('modal form keeps Seff only for user-Seff modes', () => {
    const inputs = formToInputs(modal);
    expect(inputs?.bridge.kind).toBe('modal');
    if (inputs?.bridge.kind !== 'modal') return;
    expect(inputs.bridge.modes[0]?.Seff).toBeUndefined();
    expect(inputs.bridge.modes[1]?.Seff).toBe(35);
    expect(inputs.bridge.modes[1]?.direction).toBe('lateral');
  });

  it('blank optional numbers stay undefined, bad numbers become NaN for the engine to report', () => {
    const inputs = formToInputs({ ...beam, b: '', height: 'abc' });
    expect(inputs?.b).toBeUndefined();
    expect(Number.isNaN(inputs?.height)).toBe(true);
  });
});

describe('share link: review fixes', () => {
  it('drops the whole mode table when a mode direction or shape is unknown (never guessed)', () => {
    const q = new URLSearchParams(encodeFormValues(modal));
    q.set('mdir', 'sideways'); // replaces every mdir with one unknown value
    q.append('mdir', 'lateral');
    const { values, warnings } = decodeFormValues(q.toString());
    expect(values.modes).toEqual([]);
    expect(warnings.join(' ')).toMatch(/no modes were loaded/i);

    const bad = new URLSearchParams(encodeFormValues(modal));
    const shapes = bad.getAll('mshape');
    bad.delete('mshape');
    bad.append('mshape', shapes[0] as string);
    bad.append('mshape', 'triangle');
    const r = decodeFormValues(bad.toString());
    expect(r.values.modes).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/triangle/);
  });

  it('warns when a mode value is cut short', () => {
    const long = { ...modal, modes: [{ ...modal.modes[0]!, f: '1'.repeat(60) }] };
    const { values, warnings } = decodeFormValues(encodeFormValues(long));
    expect(values.modes[0]?.f.length).toBe(40);
    expect(warnings.length).toBe(1);
  });
});

describe('form values: number parsing', () => {
  it('accepts plain decimals and E-notation only', () => {
    for (const [raw, expected] of [
      ['30', 30],
      [' 2.5 ', 2.5],
      ['.5', 0.5],
      ['1.3131e9', 1.3131e9],
      ['1E-3', 0.001],
      ['-4', -4],
    ] as const) {
      expect(formToInputs({ ...beam, L: raw })?.bridge.L).toBe(expected);
    }
    for (const raw of ['0x1E', '1e', 'Infinity', '1,5', '3 m', '0b11']) {
      expect(Number.isNaN(formToInputs({ ...beam, L: raw })?.bridge.L)).toBe(true);
    }
  });
});
