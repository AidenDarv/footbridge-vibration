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
