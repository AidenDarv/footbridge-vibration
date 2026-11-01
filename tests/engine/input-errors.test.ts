// Every input error carries the field it belongs to, so the form can mark that field
// (design/DESIGN.md §6). The message text is unchanged and `inputErrors` still lists it.

import { describe, expect, it } from 'vitest';
import {
  runCheck,
  type CheckInputs,
  type InputError,
  type ModalModeInput,
} from '../../src/engine/check';

const beam = (
  bridge: Partial<{ L: number; EI: number; m: number; dampingPercent: number }> = {},
  rest: Partial<CheckInputs> = {},
): CheckInputs => ({
  bridge: { kind: 'beam', L: 30, EI: 1.3131e9, m: 1000, dampingPercent: 0.5, ...bridge },
  b: 2.5,
  height: 10,
  usage: { bridgeClass: 'C' },
  comfort: { k1: 'rural', k2: 'alternative' },
  ...rest,
});

const mode = (m: Partial<ModalModeInput> = {}): ModalModeInput => ({
  f: 2,
  M: 15000,
  dampingPercent: 0.5,
  direction: 'vertical',
  shape: 'half-sine',
  ...m,
});

const modal = (modes: ModalModeInput[], rest: Partial<CheckInputs> = {}, L = 30): CheckInputs => ({
  ...beam({}, rest),
  bridge: { kind: 'modal', L, modes },
});

/** The one error a run gives, as { field, modeIndex, message }. */
function only(inputs: CheckInputs): InputError {
  const r = runCheck(inputs);
  expect(r.status).toBe('INPUT-ERROR');
  expect(r.inputErrorDetails).toHaveLength(1);
  // The plain list is the same messages, in the same order.
  expect(r.inputErrors).toEqual(r.inputErrorDetails.map((e) => e.message));
  return r.inputErrorDetails[0] as InputError;
}

describe('input errors: field ids (beam mode and shared inputs)', () => {
  const cases: [string, CheckInputs, InputError['field'], RegExp][] = [
    ['span not a number', beam({ L: Number.NaN }), 'L', /^Span must be a positive number\.$/],
    ['span out of range', beam({ L: 1 }), 'L', /^Span must be between 2 and 500 m/],
    ['EI not positive', beam({ EI: 0 }), 'EI', /^EI must be a positive number\.$/],
    ['mass not a number', beam({ m: Number.NaN }), 'm', /^Mass per metre must be a positive/],
    ['mass out of range', beam({ m: 10 }), 'm', /^Mass per metre must be between 50 and 50 000/],
    [
      'damping not positive',
      beam({ dampingPercent: 0 }),
      'damping',
      /^Damping must be a positive number\.$/,
    ],
    [
      'damping below 0.1 %',
      beam({ dampingPercent: 0.006 }),
      'damping',
      /^Damping must be between 0\.1 % and 10 %.*ratio instead of a percentage/,
    ],
    ['damping above 10 %', beam({ dampingPercent: 12 }), 'damping', /^Damping must be between/],
    ['deck width', beam({}, { b: 0.000001 }), 'b', /^Deck width must be between 0\.5 and 20 m/],
    ['height', beam({}, { height: -1 }), 'height', /^Height above ground must be between 0/],
    [
      'walking group override',
      beam({}, { usage: { bridgeClass: 'C', overrides: { groupWalking: 2.5 } } }),
      'groupWalking',
      /^Walking group size override must be a whole number/,
    ],
    [
      'jogging group override',
      beam({}, { usage: { bridgeClass: 'C', overrides: { groupJogging: -1 } } }),
      'groupJogging',
      /^Jogging group size override/,
    ],
    [
      'crowd density override',
      beam({}, { usage: { bridgeClass: 'C', overrides: { crowdDensity: Number.NaN } } }),
      'crowdDensity',
      /^Crowd density override must be a number/,
    ],
    [
      'k4 out of range',
      beam({}, { comfort: { k1: 'rural', k2: 'alternative', k4: 1.5 } }),
      'k4',
      /^k4 must be between 0\.8 and 1\.2\.$/,
    ],
  ];
  for (const [what, inputs, field, message] of cases) {
    it(`${what} → ${field}`, () => {
      const e = only(inputs);
      expect(e.field).toBe(field);
      expect(e.modeIndex).toBeUndefined();
      expect(e.message).toMatch(message);
    });
  }
});

describe('input errors: field ids (modal mode)', () => {
  it('no modes → modes', () => {
    const e = only(modal([]));
    expect(e).toEqual({ field: 'modes', message: 'Enter at least one mode.' });
  });

  const cases: [string, ModalModeInput, InputError['field'], RegExp][] = [
    ['frequency', mode({ f: 0 }), 'mode-f', /^Mode 2: frequency must be a positive number\.$/],
    [
      'vertical frequency above 50 Hz',
      mode({ f: 60 }),
      'mode-f',
      /^Mode 2: frequency must be 50 Hz or less/,
    ],
    ['modal mass', mode({ M: 10 }), 'mode-M', /^Mode 2: modal mass must be between 50 and/],
    [
      'damping',
      mode({ dampingPercent: 0.005 }),
      'mode-damping',
      /^Mode 2: damping must be between 0\.1 % and 10 %/,
    ],
    [
      'Seff missing',
      mode({ shape: 'user-seff' }),
      'mode-Seff',
      /^Mode 2: Seff must be a positive number\.$/,
    ],
    [
      'Seff below the minimum span',
      mode({ shape: 'user-seff', Seff: 1 }),
      'mode-Seff',
      /^Mode 2: Seff must be at least 2 m/,
    ],
    [
      'Seff above S/0.637',
      mode({ shape: 'user-seff', Seff: 100 }),
      'mode-Seff',
      /^Mode 2: Seff cannot be more than S\/0\.637 = 47\.10 m/,
    ],
  ];
  for (const [what, bad, field, message] of cases) {
    it(`${what} → ${field}, mode index 1`, () => {
      const e = only(modal([mode(), bad]));
      expect(e.field).toBe(field);
      expect(e.modeIndex).toBe(1);
      expect(e.message).toMatch(message);
    });
  }

  it('lowest deck mass per metre → mBridgeMin', () => {
    const e = only(modal([mode()], { mBridgeMin: 20 }));
    expect(e.field).toBe('mBridgeMin');
    expect(e.message).toMatch(/^Lowest deck mass per metre must be between 50 and 50 000 kg\/m/);
  });

  it('a span error in modal mode is still on L', () => {
    expect(only(modal([mode()], {}, 600)).field).toBe('L');
  });
});

describe('input errors: several at once', () => {
  it('keeps the validator order and gives each its field', () => {
    const r = runCheck(beam({ dampingPercent: 0.006 }, { b: 0.000001 }));
    expect(r.inputErrorDetails.map((e) => e.field)).toEqual(['damping', 'b']);
    expect(r.inputErrors).toEqual(r.inputErrorDetails.map((e) => e.message));
  });

  it('a valid run has no error details', () => {
    expect(runCheck(beam()).inputErrorDetails).toEqual([]);
  });
});
