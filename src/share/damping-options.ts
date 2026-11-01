// Damping material select (SPEC §2.1) and the "did you mean X %?" fix (design/DESIGN.md §6).
// Pure: no DOM. Picking a material fills a PD 6688-2 Table A.1 suggestion; the user remains
// responsible for the damping used.

import { MAX_DAMPING_PERCENT, MIN_DAMPING_PERCENT } from '../engine/check';
import { typicalDamping } from '../engine/damping';
import { fixed } from './format';

export const CUSTOM_DAMPING = 'custom';

export interface DampingOption {
  id: string;
  label: string;
  /** Text written into the % box, or '' for Custom. */
  value: string;
}

/**
 * ξ (%) for a PD 6688-2 Table A.1 material, as typed in the form: the lower δ of the range
 * (conservative, SPEC §2.1), converted by the damping helper and given to 6 s.f.
 */
export function tableDampingText(id: string): string {
  const m = typicalDamping().find((x) => x.id === id);
  if (!m) throw new Error(`PD 6688-2 Table A.1 has no material "${id}"`);
  return String(Number(m.zetaPercentMin.toPrecision(6)));
}

/** The material options, in data-file order, then Custom. */
export function dampingOptions(): DampingOption[] {
  const opts = typicalDamping().map((m) => {
    const lo = fixed(m.deltaMin, 2);
    const delta = m.deltaMin === m.deltaMax ? lo : `${lo}–${fixed(m.deltaMax, 2)} (uses ${lo})`;
    return { id: m.id, label: `${m.label} · δ ${delta}`, value: tableDampingText(m.id) };
  });
  return [...opts, { id: CUSTOM_DAMPING, label: 'Custom value', value: '' }];
}

/** The material whose suggestion is exactly this text, else Custom. */
export function materialForDamping(text: string): string {
  const t = text.trim();
  if (t === '') return CUSTOM_DAMPING;
  return dampingOptions().find((o) => o.value === t)?.id ?? CUSTOM_DAMPING;
}

const NUMBER = /^\+?(\d+\.?\d*|\.\d+)([eE]([+-]?\d+))?$/;

/**
 * The value × 100, for a damping ratio typed into the % box (e.g. 0.006 → 0.6). The decimal
 * point is moved in the text, so there is no floating-point noise. Null unless the typed value
 * is below the 0.1 % input limit and the moved value is inside the 0.1–10 % limits.
 */
export function percentFix(raw: string): string | null {
  const m = NUMBER.exec(raw.trim());
  if (!m) return null;
  const value = Number(raw.trim());
  if (!(value > 0 && value < MIN_DAMPING_PERCENT)) return null;
  const exponent = Number(m[3] ?? '0') + 2;
  const moved = Number(`${m[1]}e${exponent}`);
  if (!(moved >= MIN_DAMPING_PERCENT && moved <= MAX_DAMPING_PERCENT)) return null;
  return String(moved);
}
