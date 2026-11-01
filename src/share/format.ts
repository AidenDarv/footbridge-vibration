// Number display. Formatting only, no maths (CLAUDE.md).

const THIN_SPACE = String.fromCharCode(0x2009);

/** Fixed decimals with thin-space thousands; '–' for missing values. */
export function fixed(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const [int = '', frac] = value.toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/** n significant figures, without exponent notation for the ranges shown in the tool. */
export function sig(value: number, n: number): string {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '0';
  const digits = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(value))));
  return fixed(value, digits);
}

/** Percentage with an explicit sign, e.g. "+0.49 %" or "−0.14 %" (true minus sign). */
export function signedPercent(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return `0.${'0'.repeat(digits)} %`;
  return `${value > 0 ? '+' : '−'}${text} %`;
}

/**
 * Values within this many units of the last shown digit count as exactly on a rounding step,
 * so floating-point noise (1.6·1.3·0.7 = 1.4559999…) does not move an exact value.
 */
const ROUND_TOL = 1e-9;

function stepped(value: number, digits: number, up: boolean): number {
  const scale = 10 ** digits;
  const x = value * scale;
  return (up ? Math.ceil(x - ROUND_TOL) : Math.floor(x + ROUND_TOL)) / scale;
}

/** Like `fixed`, but rounded up to the shown digits. */
export function fixedUp(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fixed(value, digits);
  return fixed(stepped(value, digits, true), digits);
}

/** Like `fixed`, but rounded down to the shown digits. */
export function fixedDown(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fixed(value, digits);
  return fixed(stepped(value, digits, false), digits);
}

// Verdict-related numbers: accelerations and utilisation are rounded up and the comfort limit
// down, so a FAIL never shows as at or below the limit (pre-release review, 1 Nov 2026).

/** Peak acceleration (m/s²), 3 dp, rounded up. */
export const accelText = (v: number | null | undefined): string => fixedUp(v, 3);
/** Comfort limit a_limit (m/s²), 3 dp, rounded down. */
export const limitText = (v: number | null | undefined): string => fixedDown(v, 3);
/** Utilisation a_peak / a_limit, 2 dp, rounded up. */
export const utilText = (v: number | null | undefined): string => fixedUp(v, 2);
