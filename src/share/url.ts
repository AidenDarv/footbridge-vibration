// Share link: form values ⇄ URL query string (SPEC §1.2 item 7, §4). Pure, no DOM.
// Values are kept exactly as typed. Unknown choices are dropped with a warning, never guessed.

import {
  BRIDGE_CLASS_KEYS,
  DIRECTIONS,
  K1_KEYS,
  K2_KEYS,
  SHAPES,
  emptyFormValues,
  type FormValues,
  type ModeRowValues,
} from './form-values';

/** Format version. Bump it if the meaning of a key changes. */
export const SHARE_VERSION = '1';

const MAX_TEXT = 200;
const MAX_LONG_TEXT = 1000;
const MAX_NUMBER_TEXT = 40;

type TextKey = Exclude<
  keyof FormValues,
  'inputMode' | 'bridgeClass' | 'includeJogging' | 'k1' | 'k2' | 'modes'
>;

/** Query key and length cap for each free-text or number field. */
const TEXT_FIELDS: [TextKey, string, number][] = [
  ['project', 'project', MAX_TEXT],
  ['name', 'name', MAX_TEXT],
  ['L', 'L', MAX_NUMBER_TEXT],
  ['b', 'b', MAX_NUMBER_TEXT],
  ['height', 'h', MAX_NUMBER_TEXT],
  ['EI', 'EI', MAX_NUMBER_TEXT],
  ['m', 'm', MAX_NUMBER_TEXT],
  ['damping', 'd', MAX_NUMBER_TEXT],
  ['groupWalking', 'nw', MAX_NUMBER_TEXT],
  ['groupJogging', 'nj', MAX_NUMBER_TEXT],
  ['crowdDensity', 'rho', MAX_NUMBER_TEXT],
  ['k4', 'k4', MAX_NUMBER_TEXT],
  ['k4Justification', 'k4j', MAX_LONG_TEXT],
];

/** Parallel lists, one entry per mode row, in order. */
const MODE_FIELDS: [keyof ModeRowValues, string][] = [
  ['f', 'mf'],
  ['M', 'mM'],
  ['damping', 'md'],
  ['direction', 'mdir'],
  ['shape', 'mshape'],
  ['Seff', 'mSeff'],
];

export function encodeFormValues(v: FormValues): string {
  const q = new URLSearchParams();
  const defaults = emptyFormValues();
  q.set('v', SHARE_VERSION);
  if (v.inputMode !== defaults.inputMode) q.set('in', v.inputMode);
  for (const [field, key] of TEXT_FIELDS) {
    const value = v[field];
    if (value !== '' && value !== defaults[field]) q.set(key, value);
  }
  if (v.bridgeClass) q.set('class', v.bridgeClass);
  if (v.includeJogging !== defaults.includeJogging) q.set('jog', v.includeJogging ? '1' : '0');
  if (v.k1) q.set('k1', v.k1);
  if (v.k2) q.set('k2', v.k2);
  for (const row of v.modes) {
    for (const [field, key] of MODE_FIELDS) q.append(key, row[field]);
  }
  return q.toString();
}

function pick<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  label: string,
  warnings: string[],
): T | '' {
  if (raw === null || raw === '') return '';
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  warnings.push(
    `Link value for ${label} ("${raw.slice(0, 20)}") is not recognised and was ignored.`,
  );
  return '';
}

export interface DecodeResult {
  values: FormValues;
  warnings: string[];
}

export function decodeFormValues(query: string): DecodeResult {
  const q = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const values = emptyFormValues();
  const warnings: string[] = [];
  if ([...q.keys()].length === 0) return { values, warnings };

  const version = q.get('v');
  if (version !== SHARE_VERSION) {
    warnings.push(
      `This link uses format version "${version ?? 'none'}", which this version of the tool cannot read. Inputs were not loaded.`,
    );
    return { values, warnings };
  }

  const mode = pick(q.get('in'), ['beam', 'modal'] as const, 'input mode', warnings);
  if (mode) values.inputMode = mode;

  for (const [field, key, max] of TEXT_FIELDS) {
    const raw = q.get(key);
    if (raw === null) continue;
    if (raw.length > max) {
      warnings.push(`Link value for ${field} was longer than ${max} characters and was cut short.`);
    }
    values[field] = raw.slice(0, max);
  }

  values.bridgeClass = pick(q.get('class'), BRIDGE_CLASS_KEYS, 'bridge class', warnings);
  values.k1 = pick(q.get('k1'), K1_KEYS, 'k1', warnings);
  values.k2 = pick(q.get('k2'), K2_KEYS, 'k2', warnings);

  const jog = q.get('jog');
  if (jog === '0') values.includeJogging = false;
  else if (jog !== null && jog !== '1') {
    warnings.push(
      `Link value for jogging ("${jog.slice(0, 20)}") is not recognised and was ignored.`,
    );
  }

  const lists = MODE_FIELDS.map(([, key]) => q.getAll(key));
  const count = lists[0]?.length ?? 0;
  if (lists.some((l) => l.length !== count)) {
    warnings.push('The mode table in this link is incomplete, so no modes were loaded.');
  } else {
    // A mode with an unknown direction or shape cannot be guessed (a lateral mode must never
    // become a vertical one), so any unknown value drops the whole table.
    const rowWarnings: string[] = [];
    const rows: ModeRowValues[] = [];
    for (let i = 0; i < count; i++) {
      const at = (j: number) => lists[j]?.[i] ?? '';
      const numText = (j: number, label: string) => {
        const raw = at(j);
        if (raw.length > MAX_NUMBER_TEXT) {
          warnings.push(
            `Link value for mode ${i + 1} ${label} was longer than ${MAX_NUMBER_TEXT} characters and was cut short.`,
          );
        }
        return raw.slice(0, MAX_NUMBER_TEXT);
      };
      const direction = pick(at(3), DIRECTIONS, `mode ${i + 1} direction`, rowWarnings);
      const shape = pick(at(4), SHAPES, `mode ${i + 1} shape`, rowWarnings);
      if (!direction || !shape) {
        if (!direction && at(3) === '') rowWarnings.push(`Mode ${i + 1} has no direction.`);
        if (!shape && at(4) === '') rowWarnings.push(`Mode ${i + 1} has no shape.`);
        continue;
      }
      rows.push({
        f: numText(0, 'f'),
        M: numText(1, 'M'),
        damping: numText(2, 'damping'),
        direction,
        shape,
        Seff: numText(5, 'Seff'),
      });
    }
    if (rowWarnings.length > 0) {
      warnings.push(...rowWarnings, 'Because of this, no modes were loaded from the link.');
    } else {
      values.modes = rows;
    }
  }

  return { values, warnings };
}
