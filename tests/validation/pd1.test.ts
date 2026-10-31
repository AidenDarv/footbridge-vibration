// SPEC.md §6 PD1 — moving-load solver vs the PD 6688-2 §A.4 simplified method, within 5 %.
// Ψ comes from PD 6688-2 Figure A.4, digitised by the author. Until the CSV files exist the
// tests are skipped with a reason: no placeholder Ψ values.
import { describe, expect, it } from 'vitest';
import cases from '../../validation/cases.json';
import { groupForceAmplitude } from '../../src/engine/loads';
import { modeShapeFunction } from '../../src/engine/modal';
import { movingLoadResponse } from '../../src/engine/solver';
import { parsePsiCsv, psiAt, type PsiKnown } from '../../src/validation/psi';

/** SPEC §6 PD1 — tolerance allows for reading Ψ from a figure. */
const TOL = 0.05;

const csvFiles = import.meta.glob('../../validation/digitising/pd_figA4_*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const { bridge } = cases.level2;
const known: PsiKnown = {
  delta: 2 * Math.PI * bridge.zeta, // δ = 2πξ
  S_m: bridge.L,
  f_Hz: bridge.f,
};

describe('PD1: solver vs PD 6688-2 §A.4 simplified method (SPEC §6)', () => {
  for (const c of cases.codeCrossCheck.cases) {
    const file = c.psiFile.replace(/^validation\//, '../../validation/');
    const text = csvFiles[file];

    if (text === undefined) {
      it.skip(`${c.id}: awaiting ${c.psiFile} (PD 6688-2 Figure A.4, to be digitised)`, () => {});
      continue;
    }

    it(`${c.id}: ${c.check}`, () => {
      const { F0, v, N, k, K, phiMax } = c.inputs;
      // F′ = F₀·k·√(1 + γ(N − 1)); γ is irrelevant for N = 1.
      const Fprime = groupForceAmplitude({ F0, k, gamma: 0, N });
      const psi = psiAt(parsePsiCsv(text, c.psiFile), known, c.psiFile);
      // PD 6688-2 §A.4 — a = F′/M · φmax² · K · Ψ.
      const aPD = (Fprime / bridge.M) * phiMax ** 2 * K * psi;

      const aTool = movingLoadResponse({
        f: bridge.f,
        M: bridge.M,
        zeta: bridge.zeta,
        Famp: Fprime,
        v,
        S: bridge.L,
        phi: modeShapeFunction('half-sine', bridge.L),
      }).peakAccel;

      expect(Math.abs(aTool - aPD) / aPD).toBeLessThanOrEqual(TOL);
    });
  }
});
