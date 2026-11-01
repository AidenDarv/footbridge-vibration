// Limitations page (SPEC §1.3, §3). Uses the same wording as the results page and calc sheet.

import { BOUNDARY_READING_ACCURACY, LOCK_IN_TRIGGER_HZ } from '../engine/lateral';
import { HORIZONTAL_ACCEL_LIMIT, LATERAL_TRIGGER_HZ } from '../engine/limits';
import { READING_ACCURACY } from '../engine/lookup';
import {
  LOCK_IN_RANGE_NOTE,
  METHOD_CHECK_NOTICE,
  OUT_OF_SCOPE,
  PD6688_NOTES,
  SCREENING_NOTICE,
} from '../share/wording';
import { h } from '../ui/dom';
import { dataTable, link, list, page, section, startPage } from './common';

const root = startPage();

root.replaceChildren(
  page(
    'Limitations',
    'What the checker does not cover, and how far to rely on its results.',
    section(
      'A screening tool',
      null,
      h('p', { class: 'status-detail' }, SCREENING_NOTICE),
      h('p', {}, METHOD_CHECK_NOTICE),
    ),
    section('Not covered in this version', 'SPEC §1.3', list(OUT_OF_SCOPE)),
    section(
      'What the results depend on',
      null,
      list([
        'Mode shapes must be scaled so their largest value is 1, and the modal mass must be for that scaling. A modal mass from FE software scaled another way (for example to unit modal mass) gives wrong accelerations.',
        'A mode entered only as an effective span Seff has no mode shape, so its group cases (the moving load) are not run. Its crowd case still runs.',
        'Beam mode is a single, uniform, simply supported span. Use modal mode for anything else.',
        'Each mode is checked on its own. Closely spaced modes need a more detailed analysis (NA.2.44.3).',
        `Lateral and torsional modes below ${LATERAL_TRIGGER_HZ} Hz need a horizontal acceleration check against ${HORIZONTAL_ACCEL_LIMIT} m/s² (NA.2.44.6(3)). That check is not calculated yet, so such a bridge cannot get an overall PASS.`,
        `The lateral lock-in check covers modes below ${LOCK_IN_TRIGGER_HZ} Hz only (NA.2.44.7). ${LOCK_IN_RANGE_NOTE}`,
        'Input limits: span up to 500 m, vertical modes up to 50 Hz in modal mode, and up to 10 modes. They keep the calculation quick and catch typing slips. They are not code limits.',
      ]),
    ),
    section(
      'Digitised figures',
      'SPEC §5',
      h(
        'p',
        {},
        'k(f), γ and the lateral stability boundary come from graphs in the National Annex, not formulas. The author read them with WebPlotDigitizer and checked the readings by overlaying them on the source figures. The estimated reading accuracy is:',
      ),
      dataTable(
        ['Figure', 'Quantity', 'Reading accuracy'],
        [
          ['NA.8', 'k(f_v)', READING_ACCURACY.k],
          ['NA.9', 'γ', READING_ACCURACY.gamma],
          ['NA.11', 'D boundary', BOUNDARY_READING_ACCURACY],
        ],
      ),
      h(
        'p',
        {},
        'Outside the range of a figure, k is taken as zero, and γ is read at the edge of the figure with a warning. Nothing is extrapolated.',
      ),
    ),
    section('Guidance from PD 6688-2:2011', null, list(PD6688_NOTES)),
    section(
      'Still to be reviewed',
      'SPEC §9',
      list([
        'PD 6688-2 guidance on modal mass, and on whether to include the mass of pedestrians.',
        'Whether the second-generation Eurocode EN 1991-2:2023 and its UK National Annex change the method.',
      ]),
      h(
        'p',
        {},
        'See ',
        link('validation.html', 'Validation'),
        ' for how the tool has been checked so far.',
      ),
    ),
  ),
);
