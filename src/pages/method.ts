// Method page (SPEC §3): the equations with clause references, in our own words.
// Numbers are taken from the engine constants, so the page always matches the code.

import {
  BRIDGE_CLASSES,
  CROWD_DENSITY_CAP,
  CROWD_LOAD_FACTOR,
  JOGGING,
  WALKING,
} from '../engine/loads';
import type { BridgeClass } from '../engine/loads';
import {
  A_LIMIT_BASE,
  A_LIMIT_MAX,
  A_LIMIT_MIN,
  DAMPER_PROVISION_HZ,
  HORIZONTAL_ACCEL_LIMIT,
  K1,
  K2,
  K3,
  K4_DEFAULT,
  K4_MAX,
  K4_MIN,
  LATERAL_TRIGGER_HZ,
  VERTICAL_TRIGGER_HZ,
} from '../engine/limits';
import type { K1Key, K2Key } from '../engine/limits';
import { LOCK_IN_TRIGGER_HZ, PEDESTRIAN_MASS, RELIABLE_RANGE_HZ } from '../engine/lateral';
import {
  BEAM_DISPLAY_FREQ_LIMIT,
  BEAM_MODE_COUNT,
  FREQ_DISPLAY_DECIMALS,
  LAMBDA_FACTOR,
  SEFF_DIVISOR,
} from '../engine/modal';
import { DEFAULT_STEPS_PER_PERIOD, MIN_STEPS_PER_PERIOD } from '../engine/solver';
import {
  CLASS_LABELS,
  CROWD_SIGMA_NOTE,
  K1_LABELS,
  K2_LABELS,
  PD6688_NOTES,
} from '../share/wording';
import { h } from '../ui/dom';
import { dataTable, eq, link, list, page, section, startPage } from './common';

const root = startPage();

const classes = Object.keys(BRIDGE_CLASSES) as BridgeClass[];
const K3_LABELS: Record<keyof typeof K3, string> = {
  over8: 'More than 8 m',
  from4to8: '4 m to 8 m',
  under4: 'Less than 4 m',
};

root.replaceChildren(
  page(
    'Method',
    'How the checker works, step by step, with the clause of the UK National Annex to BS EN 1991-2 (NA+A1:2020) that each step comes from. Read it with the National Annex itself: this page summarises the method and does not reproduce the standard.',

    section(
      'Scope',
      'NA.2.44.1',
      h(
        'p',
        {},
        'The checker covers the vertical response of a footbridge to pedestrian groups and crowds, the vertical comfort limit, and the lateral lock-in stability check. It flags the frequency triggers for lateral and torsional modes, but does not yet calculate lateral or torsional accelerations. See ',
        link('limitations.html', 'Limitations'),
        ' for everything that is not covered.',
      ),
      h('p', {}, 'Units are SI throughout: m, kg, N, s, Hz, and accelerations in m/s².'),
    ),

    section(
      '1. Modal properties',
      'SPEC §2.1–2.2; NA.2.44.4 Figure NA.7',
      h(
        'p',
        {},
        `Mode shapes are scaled so their largest value is 1. The modal mass M is the mass that goes with that scaling. Damping is entered as a damping ratio ξ. The log decrement δ = 2πξ is worked out from it, because Figure NA.9 is drawn against δ.`,
      ),
      h('h3', {}, 'Beam mode: one simply supported span'),
      eq('φₙ(x) = sin(nπx / L)', 'fₙ = (n²π / 2L²) · √(EI / m)', 'Mₙ = m·L / 2'),
      h(
        'p',
        { class: 'eq-where' },
        `m is the mass per metre, including permanent and superimposed dead load. Modes n = 1 to ${BEAM_MODE_COUNT} are worked out, and those below ${BEAM_DISPLAY_FREQ_LIMIT} Hz are shown. The cut-off is applied to the frequency rounded to ${FREQ_DISPLAY_DECIMALS} decimal places, as displayed, so a mode shown as ${BEAM_DISPLAY_FREQ_LIMIT.toFixed(FREQ_DISPLAY_DECIMALS)} Hz is not kept. All beam modes are vertical.`,
      ),
      h('h3', {}, 'Modal mode: properties from a finite element model'),
      h(
        'p',
        {},
        'For each mode you enter f, M, ξ, the direction (vertical, lateral or torsional) and the shape: half-sine, full-sine, or an effective span Seff that you enter yourself.',
      ),
      h('h3', {}, 'Effective span and λ'),
      eq(`Seff = ∫|φ(x)| dx / (${SEFF_DIVISOR} · max|φ|)`, `λ = ${LAMBDA_FACTOR} · Seff / S`),
      h(
        'p',
        { class: 'eq-where' },
        `The constant is ${SEFF_DIVISOR} in NA+A1:2020 (the 2008 text used 0.634). For a half-sine mode, ∫|φ| dx = 2S/π, so Seff ≈ S.`,
      ),
    ),

    section(
      '2. Load parameters',
      'NA.2.44.2, Tables NA.7 and NA.8',
      h('p', {}, 'Group sizes and crowd density depend on the bridge class:'),
      dataTable(
        ['Class', 'Walking group N', 'Jogging group N', 'Crowd density ρ (persons/m²)'],
        classes.map((c) => [
          CLASS_LABELS[c],
          String(BRIDGE_CLASSES[c].groupWalking),
          String(BRIDGE_CLASSES[c].groupJogging),
          String(BRIDGE_CLASSES[c].crowdDensity),
        ]),
      ),
      dataTable(
        ['Activity', 'Reference load F₀ (N)', 'Crossing speed v (m/s)'],
        [
          ['Walking', String(WALKING.F0), String(WALKING.v)],
          ['Jogging', String(JOGGING.F0), String(JOGGING.v)],
        ],
      ),
      list([
        `In the crowd load, ρ is capped at ${CROWD_DENSITY_CAP.toFixed(1)} persons/m² (NA.2.44.5).`,
        'Jogging may be left out for an individual project (NA.2.44.2(3)). The choice is printed on the calc sheet.',
        'Group sizes and crowd density may be changed for a project (NA.2.44.2(2)). Changed values are printed in red on the calc sheet.',
      ]),
    ),

    section(
      '3. Factors read from the National Annex figures',
      'Figures NA.8 and NA.9',
      list([
        'k(f_v), Figure NA.8: a combined factor for the pedestrian population, the harmonics of the footfall and the sensitivity weighting. There are separate curves for walking and jogging. Read by straight-line interpolation, and taken as zero outside the digitised range.',
        'γ, Figure NA.9: a reduction factor for pedestrians who are not in step, read against δ. For groups the curve depends on Seff, so γ is interpolated in both δ and Seff. For crowds there is one curve, interpolated in δ.',
        'Below the smallest δ, or outside the Seff range, γ is read at the edge of the figure and a warning is shown. Above the largest δ (about 0.2) γ rises, so the edge value would under-estimate the response: those cases get no result, and the overall status is INCOMPLETE. Values are never extrapolated.',
      ]),
      h(
        'p',
        {},
        'The curves are the author’s own digitised readings of the figures in NA+A1:2020, not copies of the figures. The results page draws them from those numbers.',
      ),
    ),

    section(
      '4. Pedestrian groups: moving pulsating force',
      'NA.2.44.4',
      eq('F(t) = F₀ · k(f_v) · √(1 + γ(N − 1)) · sin(2π f_v t)', 'x(t) = v·t,  0 ≤ t ≤ S/v'),
      h(
        'p',
        {},
        'The force crosses the span at the walking or jogging speed. For each vertical mode the checker solves the single-mode equation of motion, starting from rest:',
      ),
      eq('M·q̈ + 2ξωM·q̇ + ω²M·q = F(t) · φ(x(t)),   ω = 2πf'),
      h(
        'p',
        { class: 'eq-where' },
        `The forcing frequency f_v is taken equal to the mode frequency f. The peak acceleration at the antinode is the largest |q̈| during the crossing, because max|φ| = 1. The solver is fourth-order Runge–Kutta with dt = 1/(${DEFAULT_STEPS_PER_PERIOD}f). The method requires dt ≤ 1/(${MIN_STEPS_PER_PERIOD}f). The Newmark average-acceleration method is used only as a cross-check (Validation, case N5).`,
      ),
      h(
        'p',
        {},
        'The moving load needs the mode shape along the span. A mode entered only as an effective span has no shape, so its group cases are not run.',
      ),
    ),

    section(
      '5. Crowds: steady-state distributed load',
      'NA.2.44.5',
      eq(
        `w(t) = ${CROWD_LOAD_FACTOR} · (F₀ / A) · k(f_v) · √(γN / λ) · sin(2π f_v t)   [N/m²]`,
        `N = ρ·A,  A = S·b,  ρ ≤ ${CROWD_DENSITY_CAP.toFixed(1)}`,
      ),
      h(
        'p',
        {},
        'The load acts in the direction of the mode shape at every point (NA.2.44.5(2)), so the modal force amplitude is:',
      ),
      eq('P₀ = W₀ · b · ∫|φ(x)| dx', 'a = P₀ / (2ξM)'),
      h(
        'p',
        { class: 'eq-where' },
        `W₀ is the amplitude of w(t), and a is the steady-state peak acceleration at resonance. Crowds use the walking k(f) curve and F₀ = ${WALKING.F0} N, because Table NA.7 gives a crowd density for walking only. For a mode entered as an effective span, ∫|φ| dx = ${SEFF_DIVISOR}·Seff.`,
      ),
      list(['NA.2.44.5(3) notes that this crowd model may be conservative.', CROWD_SIGMA_NOTE]),
    ),

    section(
      '6. Vertical comfort limit',
      'NA.2.44.6, Tables NA.9–NA.11',
      eq(
        `a_limit = ${A_LIMIT_BASE.toFixed(1)} · k1 · k2 · k3 · k4   [m/s²]`,
        `${A_LIMIT_MIN} ≤ a_limit ≤ ${A_LIMIT_MAX.toFixed(1)}`,
      ),
      dataTable(
        ['k1: site usage', 'Value'],
        (Object.keys(K1) as K1Key[]).map((k) => [K1_LABELS[k], K1[k].toFixed(1)]),
      ),
      dataTable(
        ['k2: route redundancy', 'Value'],
        (Object.keys(K2) as K2Key[]).map((k) => [K2_LABELS[k], K2[k].toFixed(1)]),
      ),
      dataTable(
        ['k3: height of structure', 'Value'],
        (Object.keys(K3) as (keyof typeof K3)[]).map((k) => [K3_LABELS[k], K3[k].toFixed(1)]),
      ),
      h(
        'p',
        {},
        `k4 is the exposure factor: ${K4_DEFAULT.toFixed(1)} by default, and between ${K4_MIN} and ${K4_MAX} if you justify it. The justification is printed on the calc sheet. The results show both the raw product and the limit after the bounds are applied. Each load case passes when a_peak ≤ a_limit. The verdict uses the unrounded values. On screen and in the calc sheet, a_peak and utilisation are rounded up and a_limit is rounded down, so a FAIL never looks as if it is within the limit.`,
      ),
    ),

    section(
      '7. Lateral lock-in stability',
      'NA.2.44.7, Figure NA.11',
      eq('D = m_bridge · ξ / m_pedestrian', `m_pedestrian = ρ · b · ${PEDESTRIAN_MASS} kg/m`),
      list([
        `Checked for every mode below ${LOCK_IN_TRIGGER_HZ} Hz with a significant lateral component. That means lateral modes, and torsional modes by default; you are asked to confirm that a torsional mode really has a lateral component.`,
        'ξ is the decimal damping ratio of the mode. ρ is the Table NA.7 value or your override, and is not capped: the 1.0 persons/m² cap applies to the crowd load only.',
        'The (f, D) point is compared with the Figure NA.11 boundary. Above the boundary the mode is stable. On or below it, divergent lateral response may occur, and the check fails.',
        `Figure NA.11 is based on test data from ${RELIABLE_RANGE_HZ[0]} to ${RELIABLE_RANGE_HZ[1]} Hz, so a caution is shown outside that range. Below the first digitised frequency the boundary cannot be read, so the result is “cannot assess”.`,
        'If the crowd density is zero, D is not defined. The result is “no crowd”, and it does not fail the bridge.',
      ]),
    ),

    section(
      '8. Frequency triggers',
      'NA.2.44.6',
      list([
        `Vertical mode below ${VERTICAL_TRIGGER_HZ} Hz: the vertical comfort check is needed (NA.2.44.6(1)). If the fundamental vertical frequency is ${VERTICAL_TRIGGER_HZ} Hz or more, the result is “not required”: any accelerations still worked out (modes between ${VERTICAL_TRIGGER_HZ} and ${BEAM_DISPLAY_FREQ_LIMIT} Hz) are shown for information only, with no pass or fail. The lateral and torsional checks below still apply.`,
        `Lateral or torsional mode below ${LATERAL_TRIGGER_HZ} Hz: the horizontal acceleration must not exceed ${HORIZONTAL_ACCEL_LIMIT} m/s² (NA.2.44.6(3)). This version flags the check but does not calculate it yet, so the overall result is “incomplete”.`,
        `Lateral or torsional mode below ${DAMPER_PROVISION_HZ} Hz: consider making provision for dampers (NA.2.44.6(4)).`,
      ]),
    ),

    section('Guidance from PD 6688-2:2011', null, list(PD6688_NOTES)),
  ),
);
