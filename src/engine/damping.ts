// Typical damping values offered as suggestions (PD 6688-2:2011, Table A.1).
// The user still enters the damping; nothing here is used in a calculation.

import data from '../data/damping_pd6688.json';

export interface DampingSuggestion {
  id: string;
  label: string;
  /** PD 6688-2 Table A.1 — log decrement δ (lower and upper value of the range). */
  deltaMin: number;
  deltaMax: number;
  /** Damping ratio ξ = δ/2π, as a percentage for the input field. */
  zetaPercentMin: number;
  zetaPercentMax: number;
}

/** Citation shown beside the suggestions. */
export const DAMPING_SOURCE = `${data.source.document}, ${data.source.location}`;

/** ξ = δ/2π (CLAUDE.md: δ is derived from ξ and vice versa, never stored twice). */
function deltaToZetaPercent(delta: number): number {
  return (delta / (2 * Math.PI)) * 100;
}

export function typicalDamping(): DampingSuggestion[] {
  return data.materials.map((m) => ({
    id: m.id,
    label: m.label,
    deltaMin: m.deltaMin,
    deltaMax: m.deltaMax,
    zetaPercentMin: deltaToZetaPercent(m.deltaMin),
    zetaPercentMax: deltaToZetaPercent(m.deltaMax),
  }));
}
