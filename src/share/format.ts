// Number display. Formatting only, no maths (CLAUDE.md).

const THIN_SPACE = String.fromCharCode(0x2009);

/** Fixed decimals with thin-space thousands; '–' for missing values. */
export function fixed(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const [int = '', frac] = value.toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}
