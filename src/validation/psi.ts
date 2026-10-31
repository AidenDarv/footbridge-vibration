// Ψ from PD 6688-2:2011 Figure A.4, digitised by the author (validation/digitising/README.md).
// Used only by the PD1 cross-check (SPEC §6): the test suite and the Validation page.
// Linear along each curve, then linear between curves. Never extrapolates: a value outside
// the digitised data throws, so no placeholder Ψ is ever used.

/** Values of the quantities Figure A.4 may be plotted against, for the case bridge. */
export type PsiKnown = Record<'delta' | 'S_m' | 'f_Hz', number>;

export interface PsiCurves {
  curveName: string;
  xName: string;
  /** Curve parameter value → points sorted by x. */
  curves: Map<number, { x: number; psi: number }[]>;
}

export function parsePsiCsv(text: string, file: string): PsiCurves {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim());
  if (header.length !== 3 || header[2] !== 'psi') {
    throw new Error(`${file}: header must be "<curve>,<x>,psi" (got "${header.join(',')}")`);
  }
  const [curveName, xName] = header as [string, string, string];
  const curves = new Map<number, { x: number; psi: number }[]>();
  for (const [i, line] of lines.entries()) {
    const cells = line.split(',').map((c) => Number(c.trim()));
    if (cells.length !== 3 || cells.some((c) => !Number.isFinite(c))) {
      throw new Error(`${file}: row ${i + 2} is not three numbers: "${line}"`);
    }
    const [c, x, psi] = cells as [number, number, number];
    const list = curves.get(c) ?? [];
    list.push({ x, psi });
    curves.set(c, list);
  }
  for (const list of curves.values()) list.sort((a, b) => a.x - b.x);
  return { curveName, xName, curves };
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/** Linear along one curve; throws outside the digitised range (no extrapolation). */
function alongCurve(points: { x: number; psi: number }[], x: number, what: string): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || x < first.x || x > last.x) {
    throw new Error(`${what}: x = ${x} is outside the digitised range ${first?.x}–${last?.x}`);
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; psi: number };
    const b = points[i] as { x: number; psi: number };
    if (x <= b.x) return lerp(x, a.x, b.x, a.psi, b.psi);
  }
  return last.psi;
}

/** Ψ for the case bridge: linear along each curve, then linear between curves. */
export function psiAt(data: PsiCurves, known: PsiKnown, file: string): number {
  const value = (name: string): number => {
    if (!(name in known)) {
      throw new Error(
        `${file}: unknown axis "${name}". Expected one of ${Object.keys(known).join(', ')}.`,
      );
    }
    return known[name as keyof PsiKnown];
  };
  const c = value(data.curveName);
  const x = value(data.xName);
  const params = [...data.curves.keys()].sort((a, b) => a - b);
  if (params.length === 1) {
    return alongCurve(data.curves.get(params[0] as number) ?? [], x, file);
  }
  const lo = params.filter((p) => p <= c).pop();
  const hi = params.find((p) => p >= c);
  if (lo === undefined || hi === undefined) {
    throw new Error(
      `${file}: ${data.curveName} = ${c} is outside the digitised curves ${params[0]}–${params[params.length - 1]}`,
    );
  }
  const psiLo = alongCurve(data.curves.get(lo) ?? [], x, file);
  const psiHi = alongCurve(data.curves.get(hi) ?? [], x, file);
  return lerp(c, lo, hi, psiLo, psiHi);
}
