// SPEC.md §6 Level 1 — analytical and code-value checks, exact to 4 significant figures.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { comfortLimit } from '../../src/engine/limits';
import { WALKING, crowdLoad } from '../../src/engine/loads';
import {
  absPhiIntegral,
  beamFrequency,
  beamModalMass,
  lambdaFactor,
  shapeEffectiveSpan,
} from '../../src/engine/modal';

type Level1Case = {
  id: string;
  inputs: Record<string, number | string>;
  expected: Record<string, number>;
};

const byId = new Map<string, Level1Case>(
  (cases.level1.cases as unknown as Level1Case[]).map((c) => [c.id, c]),
);

function get(id: string): Level1Case {
  const c = byId.get(id);
  if (!c) throw new Error(`Case ${id} missing from validation/cases.json`);
  return c;
}

function num(rec: Record<string, number | string>, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new Error(`Expected numeric "${key}"`);
  return v;
}

/** Equal when both round to the same 4 significant figures. */
function expect4sf(actual: number, expected: number): void {
  expect(Number(actual.toPrecision(4))).toBe(Number(expected.toPrecision(4)));
}

describe('Level 1 validation (SPEC §6)', () => {
  it('A1: SS beam f1 and modal mass', () => {
    const { inputs, expected } = get('A1');
    const L = num(inputs, 'L');
    const m = num(inputs, 'm');
    expect4sf(beamFrequency(1, L, num(inputs, 'EI'), m), num(expected, 'f1'));
    expect4sf(beamModalMass(L, m), num(expected, 'M'));
  });

  it('A2: Seff and lambda for half-sine', () => {
    const { inputs, expected } = get('A2');
    const L = num(inputs, 'L');
    const Seff = shapeEffectiveSpan('half-sine', L);
    expect4sf(Seff, num(expected, 'Seff'));
    expect4sf(lambdaFactor(Seff, L), num(expected, 'lambda'));
  });

  for (const id of ['A3', 'A4', 'A5']) {
    it(`${id}: comfort limit raw and clamped`, () => {
      const { inputs, expected } = get(id);
      const r = comfortLimit({
        k1: num(inputs, 'k1'),
        k2: num(inputs, 'k2'),
        k3: num(inputs, 'k3'),
        k4: typeof inputs.k4 === 'number' ? inputs.k4 : undefined,
      });
      expect4sf(r.raw, num(expected, 'raw'));
      expect4sf(r.aLimit, num(expected, 'aLimit'));
    });
  }

  it('A6: crowd density 1.5 is capped to 1.0 in the load', () => {
    const { inputs, expected } = get('A6');
    // Any valid bridge will do; the cap does not depend on geometry.
    const S = 30;
    const r = crowdLoad({
      F0: WALKING.F0,
      k: 1,
      gamma: 0.2,
      rho: num(inputs, 'rho'),
      S,
      b: 2.5,
      lambda_: lambdaFactor(shapeEffectiveSpan('half-sine', S), S),
      absPhiIntegral: absPhiIntegral('half-sine', S),
    });
    expect4sf(r.rhoUsed, num(expected, 'rhoUsed'));
  });
});
