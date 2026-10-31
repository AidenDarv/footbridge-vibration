// About page (SPEC §3): author, links, libraries, privacy.

import { h } from '../ui/dom';
import { link, list, page, section, startPage } from './common';

const REPO = 'https://github.com/AidenDarv/footbridge-vibration';
const LINKEDIN = 'https://www.linkedin.com/in/aidendarvell/';

const root = startPage();

root.replaceChildren(
  page(
    'About',
    'A free, browser-based check of pedestrian-induced footbridge vibration to the UK National Annex to BS EN 1991-2 (NA.2.44).',
    section(
      'Who it is for',
      null,
      list([
        'Engineers doing a quick vibration serviceability check at concept or preliminary design stage, before (or instead of) building a full FE model.',
        'Checkers who want an independent hand check of an FE result.',
      ]),
    ),
    section(
      'Author',
      null,
      h('p', {}, 'Built by Aiden Darvell.'),
      h(
        'dl',
        { class: 'about-links' },
        h('dt', {}, 'LinkedIn'),
        h('dd', {}, link(LINKEDIN, 'linkedin.com/in/aidendarvell')),
        h('dt', {}, 'Source code'),
        h('dd', {}, link(REPO, 'github.com/AidenDarv/footbridge-vibration')),
        h('dt', {}, 'Feedback'),
        h('dd', {}, link(`${REPO}/issues`, 'Report a problem or suggest a change on GitHub')),
      ),
    ),
    section(
      'Privacy',
      null,
      h(
        'p',
        {},
        'Everything runs in your browser. There is no server, no account, no analytics and no cookies. A share link carries your inputs in the address itself; nothing is stored online.',
      ),
    ),
    section(
      'Built with',
      null,
      list([
        h(
          'span',
          {},
          link('https://github.com/leeoniya/uPlot', 'uPlot'),
          ' for the charts (MIT licence).',
        ),
        h(
          'span',
          {},
          link('https://github.com/parallax/jsPDF', 'jsPDF'),
          ' and ',
          link('https://github.com/simonbengtsson/jsPDF-AutoTable', 'jsPDF-AutoTable'),
          ' for the calc sheet (MIT licence).',
        ),
        'Noto Sans in the calc sheet (SIL Open Font Licence).',
        'Vite and TypeScript, tested with Vitest.',
      ]),
      h('p', { class: 'note' }, `Version ${__APP_VERSION__}, commit ${__GIT_COMMIT__}.`),
    ),
  ),
);
