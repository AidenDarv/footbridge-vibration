// Raw form values (strings, as typed) and their conversion to engine inputs.
// Pure: no DOM. Shared by the input form, the share link and the calc sheet.

import type { CheckInputs, Direction, ModalModeInput } from '../engine/check';
import { K1, K2, type K1Key, type K2Key } from '../engine/limits';
import { BRIDGE_CLASSES, type BridgeClass, type BridgeClassData } from '../engine/loads';
import type { ShapeType } from '../engine/modal';

export interface ModeRowValues {
  f: string;
  M: string;
  damping: string;
  direction: Direction;
  shape: ShapeType;
  Seff: string;
}

export interface FormValues {
  project: string;
  name: string;
  inputMode: 'beam' | 'modal';
  L: string;
  b: string;
  height: string;
  EI: string;
  m: string;
  damping: string;
  bridgeClass: BridgeClass | '';
  includeJogging: boolean;
  groupWalking: string;
  groupJogging: string;
  crowdDensity: string;
  k1: K1Key | '';
  k2: K2Key | '';
  k4: string;
  k4Justification: string;
  modes: ModeRowValues[];
}

export const DIRECTIONS: readonly Direction[] = ['vertical', 'lateral', 'torsional'];
export const SHAPES: readonly ShapeType[] = ['half-sine', 'full-sine', 'user-seff'];
export const BRIDGE_CLASS_KEYS = Object.keys(BRIDGE_CLASSES) as BridgeClass[];
export const K1_KEYS = Object.keys(K1) as K1Key[];
export const K2_KEYS = Object.keys(K2) as K2Key[];

/** Form state before anything is typed. k4 starts at its NA.2.44.6 default of 1.0. */
export function emptyFormValues(): FormValues {
  return {
    project: '',
    name: '',
    inputMode: 'beam',
    L: '',
    b: '',
    height: '',
    EI: '',
    m: '',
    damping: '',
    bridgeClass: '',
    includeJogging: true, // NA.2.44.2(3) toggle, default ON (SPEC §2.3)
    groupWalking: '',
    groupJogging: '',
    crowdDensity: '',
    k1: '',
    k2: '',
    k4: '1.0',
    k4Justification: '',
    modes: [],
  };
}

export function emptyModeRow(): ModeRowValues {
  return { f: '', M: '', damping: '', direction: 'vertical', shape: 'half-sine', Seff: '' };
}

/** Blank → undefined. Anything else → Number (NaN is reported by the engine as an input error). */
function optNum(raw: string): number | undefined {
  const t = raw.trim();
  return t === '' ? undefined : Number(t);
}

function num(raw: string): number {
  return Number(raw.trim());
}

/** Engine inputs from the form, or null while the bridge section is still blank. */
export function formToInputs(v: FormValues): CheckInputs | null {
  const blank =
    v.inputMode === 'beam'
      ? [v.L, v.EI, v.m, v.damping].every((s) => s.trim() === '')
      : v.L.trim() === '' && v.modes.every((md) => md.f.trim() === '');
  if (blank) return null;

  const modes: ModalModeInput[] = v.modes.map((md) => ({
    f: num(md.f),
    M: num(md.M),
    dampingPercent: num(md.damping),
    direction: md.direction,
    shape: md.shape,
    Seff: md.shape === 'user-seff' ? optNum(md.Seff) : undefined,
  }));

  const bridge: CheckInputs['bridge'] =
    v.inputMode === 'beam'
      ? { kind: 'beam', L: num(v.L), EI: num(v.EI), m: num(v.m), dampingPercent: num(v.damping) }
      : { kind: 'modal', L: num(v.L), modes };

  const overrides: Partial<BridgeClassData> = {};
  for (const key of ['groupWalking', 'groupJogging', 'crowdDensity'] as const) {
    const n = optNum(v[key]);
    if (n !== undefined) overrides[key] = n;
  }

  return {
    name: v.name.trim() || undefined,
    bridge,
    b: optNum(v.b),
    height: optNum(v.height),
    usage:
      v.bridgeClass === ''
        ? undefined
        : { bridgeClass: v.bridgeClass, includeJogging: v.includeJogging, overrides },
    comfort: {
      k1: v.k1 || undefined,
      k2: v.k2 || undefined,
      k4: optNum(v.k4),
      k4Justification: v.k4Justification.trim() || undefined,
    },
  };
}
