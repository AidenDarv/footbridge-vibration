// Example bridges for the "Load example bridge" dropdown. Pure data, no DOM.
// Bridge A1 is the SPEC §6 validation beam. The Podgorica footbridge (Level 3 case R1) and the
// London Millennium Bridge (R5) are based on published data (validation/cases.json). The others are illustrative inputs supplied
// by the author (31 Oct 2026): they are not real structures and not code values. Their damping is the
// PD 6688-2 Table A.1 log decrement for the material, converted to ξ by the damping helper.

import cases from '../../validation/cases.json';
import { typicalDamping } from '../engine/damping';
import { emptyFormValues, emptyModeRow, type FormValues } from './form-values';
import { ILLUSTRATIVE_LABEL } from './wording';

export interface ExampleBridge {
  id: string;
  /** Text in the dropdown. */
  label: string;
  /** True for the author's illustrative inputs, which are not real structures. */
  illustrative: boolean;
  /**
   * Values written into the form. Every example sets every field, so loading one replaces the
   * whole form and gives the same result whatever was loaded before. Bridge A1 leaves usage
   * and comfort blank for the user to choose.
   */
  values: Partial<FormValues>;
}

/** ξ (%) for a PD 6688-2 Table A.1 material, at its lower δ, as typed in the form (6 s.f.). */
function tableDamping(id: string): string {
  const m = typicalDamping().find((x) => x.id === id);
  if (!m) throw new Error(`PD 6688-2 Table A.1 has no material "${id}"`);
  return String(Number(m.zetaPercentMin.toPrecision(6)));
}

/** Bridge A1 from SPEC §6 (validation/cases.json). Usage and comfort are blank, for the user. */
function exampleA1(): ExampleBridge {
  const a1 = cases.level1.cases.find((c) => c.id === 'A1');
  const { bridge } = cases.level2;
  const inputs = (a1?.inputs ?? {}) as Record<string, number>;
  return {
    id: 'A1',
    label: 'Bridge A1: 30 m simply supported test beam (SPEC §6)',
    illustrative: false,
    values: {
      ...emptyFormValues(),
      inputMode: 'beam',
      name: 'Bridge A1 (validation beam)',
      L: String(inputs.L),
      EI: String(inputs.EI),
      m: String(inputs.m),
      damping: String(bridge.zeta * 100),
      b: String(bridge.b),
    },
  };
}

/** Level 3 case R5 (validation/cases.json): based on published data, not illustrative. */
/** A Level 3 case from cases.json, or an error if it is missing. */
function level3Case(id: string) {
  const c = cases.level3.cases.find((x) => x.id === id);
  if (!c) throw new Error(`Case ${id} missing from validation/cases.json`);
  return c;
}

/** ξ (%) as typed in the form, from a decimal damping ratio in cases.json. */
const percentText = (zeta: number) => String(Number((zeta * 100).toPrecision(6)));

/**
 * Level 3 case R1 (validation/cases.json): based on published data. The deck width, height,
 * class and comfort inputs are not published, so they are left blank for the user.
 */
function examplePodgorica(): ExampleBridge {
  const c = level3Case('R1');
  const i = c.inputs as { S: number; f: number; M: number; zeta: number };
  return {
    id: 'podgorica',
    label: 'Podgorica footbridge: based on published data (SPEC §6 R1)',
    illustrative: false,
    values: {
      ...emptyFormValues(),
      inputMode: 'modal',
      name: `Podgorica footbridge (based on published data: ${c.source})`,
      L: String(i.S),
      modes: [
        {
          ...emptyModeRow(),
          f: String(i.f),
          M: String(i.M),
          damping: percentText(i.zeta),
          direction: 'vertical',
          shape: 'half-sine',
        },
      ],
    },
  };
}

function exampleMillennium(): ExampleBridge {
  const c = level3Case('R5');
  const i = c.inputs as {
    S: number;
    b: number;
    mBridgeMin: number;
    f: number;
    M: number;
    zeta: number;
  };
  return {
    id: 'millennium',
    label: 'London Millennium Bridge, central span: based on published data (SPEC §6 R5)',
    illustrative: false,
    values: {
      ...emptyFormValues(),
      inputMode: 'modal',
      name: `London Millennium Bridge, central span (based on published data: ${c.source})`,
      L: String(i.S),
      b: String(i.b),
      mBridgeMin: String(i.mBridgeMin),
      bridgeClass: 'D',
      modes: [
        {
          ...emptyModeRow(),
          f: String(i.f),
          M: String(i.M),
          damping: percentText(i.zeta),
          direction: 'lateral',
        },
      ],
    },
  };
}

function illustrative(id: string, title: string, values: Partial<FormValues>): ExampleBridge {
  return {
    id,
    label: `${title}: ${ILLUSTRATIVE_LABEL}`,
    illustrative: true,
    values: { ...emptyFormValues(), ...values, name: `${title} (${ILLUSTRATIVE_LABEL})` },
  };
}

export const EXAMPLES: readonly ExampleBridge[] = [
  exampleA1(),
  examplePodgorica(),
  exampleMillennium(),
  illustrative('steel-box-40', 'Steel box girder, 40 m', {
    inputMode: 'beam',
    L: '40',
    m: '2000',
    EI: '1.004e10',
    damping: tableDamping('steel'), // δ = 0.03
    b: '3',
    height: '6',
    bridgeClass: 'C',
    k1: 'urban',
    k2: 'primary',
  }),
  illustrative('concrete-20', 'Concrete beam, 20 m', {
    inputMode: 'beam',
    L: '20',
    m: '5000',
    EI: '6.566e9',
    damping: tableDamping('concrete'), // δ = 0.05
    b: '3',
    height: '5',
    bridgeClass: 'C',
    k1: 'urban',
    k2: 'primary',
  }),
  illustrative('stiff-concrete-15', 'Stiff concrete span, 15 m', {
    inputMode: 'beam',
    L: '15',
    m: '5000',
    EI: '3.693e9',
    damping: tableDamping('concrete'), // δ = 0.05
    b: '3',
    height: '3',
    bridgeClass: 'B',
    k1: 'suburban',
    k2: 'primary',
  }),
  illustrative('timber-25', 'Timber footbridge, 25 m', {
    inputMode: 'beam',
    L: '25',
    m: '800',
    EI: '8.56e8',
    damping: tableDamping('timber'), // δ = 0.06, the lower Table A.1 value
    b: '2.5',
    height: '3',
    bridgeClass: 'B',
    k1: 'rural',
    k2: 'alternative',
  }),
  illustrative('suspension-modal', 'Long-span suspension bridge (modal)', {
    inputMode: 'modal',
    L: '100',
    b: '4',
    height: '10',
    mBridgeMin: '1500',
    bridgeClass: 'D',
    k1: 'urban',
    k2: 'primary',
    modes: [
      { ...emptyModeRow(), f: '1.1', M: '60000', damping: '0.5', direction: 'vertical' },
      // The lateral modal mass is not used by the lock-in check (NA.2.44.7); the form needs one.
      { ...emptyModeRow(), f: '0.8', M: '60000', damping: '0.5', direction: 'lateral' },
    ],
  }),
];

/**
 * Bridge inputs (SPEC §3, group 1, apart from the name). Usage and comfort are not bridge
 * inputs: Bridge A1 leaves them blank for the user to choose.
 */
const BRIDGE_FIELDS = [
  'inputMode',
  'L',
  'b',
  'height',
  'EI',
  'm',
  'damping',
  'mBridgeMin',
] as const;

/**
 * True while the form still describes the loaded example's bridge. Fields the example leaves
 * blank (A1's height, Podgorica's unpublished width) are for the user to fill in, so filling
 * them does not count as a change. The mode table must match row for row.
 */
export function bridgeMatchesExample(v: FormValues, ex: ExampleBridge): boolean {
  const e = ex.values;
  for (const f of BRIDGE_FIELDS) {
    const set = e[f];
    if (set !== undefined && set !== '' && v[f] !== set) return false;
  }
  const rows = e.modes ?? [];
  return (
    v.modes.length === rows.length &&
    v.modes.every((r, i) => JSON.stringify(r) === JSON.stringify(rows[i]))
  );
}

/**
 * The bridge name to keep after an edit. When the form no longer describes the loaded
 * example's bridge, the example's name is cleared so a result is never labelled with the wrong
 * bridge. A name the user typed is never changed.
 */
export function nameAfterEdit(v: FormValues, loaded: ExampleBridge | null): string {
  if (loaded === null || v.name !== loaded.values.name) return v.name;
  return bridgeMatchesExample(v, loaded) ? v.name : '';
}

/** Form values after loading an example over the current ones. */
export function applyExample(current: FormValues, ex: ExampleBridge): FormValues {
  return { ...current, ...ex.values };
}
