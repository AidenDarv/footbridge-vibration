# Footbridge Vibration Checker — Build Specification

**Version:** 0.1 (draft for build)  **Author:** Aiden Darvell  **Date:** 28 Oct 2026

A free, browser-based tool that checks pedestrian-induced vibration of footbridges to the
UK National Annex to BS EN 1991-2 (NA.2.44), with the lateral and torsional additions from
DMRB CD 353. It produces a pass/fail result, response plots and a downloadable calc sheet.

> **Status of this document.** The method below was researched from the 2008 text of the
> NA (incorporating Corrigendum No. 1), DMRB CD 353 Rev 0 (March 2020) and published
> summaries of NA+A1:2020. Items marked **[VERIFY]** must be checked against the current
> **NA+A1:2020** copy (available through the Strathclyde library's British Standards Online)
> before the tool is called validated. The author has since checked the method in §2
> against NA+A1:2020 (see §9); no §2 item is now marked [VERIFY].

---

## 1. Purpose and scope

### 1.1 Who it is for
- Graduate and practising engineers doing a quick vibration serviceability check at
  concept or preliminary design stage, before (or instead of) building a full FE model.
- Checkers who want an independent hand-check of an FE result.

### 1.2 In scope (v1)
1. **Vertical response to pedestrian groups** (walking and jogging), modelled as a moving
   pulsating point force crossing the span (NA.2.44.4).
2. **Vertical response to crowds**, modelled as a steady-state pulsating distributed load
   (NA.2.44.5).
3. **Vertical comfort limit** `a_limit = 1.0·k1·k2·k3·k4`, bounded 0.5–2.0 m/s² (NA.2.44.6).
4. **Lateral lock-in stability check** using the pedestrian mass damping parameter `D`
   (NA.2.44.7).
5. **Frequency triggers and flags**: vertical modes < 5 Hz and lateral/torsional modes
   < 2.5 Hz need verification; lateral/torsional modes < 3 Hz trigger a "make provision for
   dampers" flag (per NA+A1:2020 as summarised in SCI AD 428A, and CD 353 4.4–4.5).
6. Two ways to describe the bridge:
   - **Beam mode:** single simply supported span, the tool computes frequency and modal mass.
   - **Modal mode:** user enters frequency, modal mass and damping per mode (e.g. from FE),
     plus a mode-shape choice.
7. Calc sheet export (PDF) and shareable URL with inputs encoded.

### 1.3 Out of scope (v1, list these on the site)
- Lateral acceleration calculation to CD 353 Appendix A (planned v2, see §10).
- Multi-span continuous beams, cable-stayed and suspension bridges in beam mode
  (users can still enter FE modal properties in modal mode).
- Closely spaced modes (NA.2.44.3 says more sophisticated analysis is needed).
- Mass gatherings, deliberate synchronisation and vandal loading (excluded by NA.2.44.1).
- Human–structure interaction, added pedestrian mass or damping.
- Wind buffeting, and anything other than pedestrian loading.

The tool must say clearly that it is a screening and checking aid, not a substitute for a
designer's judgement or a full dynamic analysis.

---

## 2. Method

All units SI: m, kg, N, s, Hz. Damping is entered as a damping ratio ξ (in %) and shown
alongside the log decrement δ = 2πξ, because the NA figures use δ.

### 2.1 Modal properties

**Beam mode (simply supported, uniform):**
- Mode shape: φ(x) = sin(nπx/L), normalised so max |φ| = 1.
- Natural frequency: fₙ = (n²π / 2L²) · √(EI / m)
- Modal mass (with unit-max normalisation): Mₙ = m·L/2
- Inputs: L (m), EI (N·m²), m (kg/m, **include** permanent and superimposed dead load),
  ξ (%), deck width b (m), height above ground (m).
- Compute modes n = 1, 2, 3 and keep those below 8 Hz for display.
- The 8 Hz cut-off is applied to the frequency rounded to 3 decimal places, the precision
  shown in the results and calc sheet, so a mode shown as "8.000 Hz" is not kept
  (author, 31 Oct 2026). Example: bridge A1 from `validation/cases.json` has
  f₂ = 7.99993 Hz, which is hidden.

**Modal mode:**
- For each mode: f (Hz), M (kg, modal mass for a unit-max-normalised mode shape), ξ (%),
  direction (vertical / lateral / torsional), and shape type (half-sine, full-sine,
  or "user Seff" where the user enters S_eff directly).
- Warn if the user's modal mass normalisation is unclear (tooltip with a diagram).

**Typical damping helper (PD 6688-2:2011, Table A.1).** Beside each damping input, show
these log decrements as suggestions, with the citation and the equivalent ξ = δ/2π. They
are never filled in automatically; the user still enters and justifies the value.
Data in `src/data/damping_pd6688.json`.

| Material | δ (PD 6688-2 Table A.1) | ξ = δ/2π |
|---|---|---|
| Steel | 0.03 | 0.48 % |
| Steel-concrete composite | 0.04 | 0.64 % |
| Concrete | 0.05 | 0.80 % |
| Timber | 0.06–0.12 | 0.95–1.91 % |
| Aluminium alloy | 0.02 | 0.32 % |
| GFRP | 0.04–0.08 | 0.64–1.27 % |

### 2.2 Effective span and λ
- S_eff = (area enclosed by |φ| along the span) / (0.637 · max|φ|)   (NA+A1:2020,
  NA.2.44.4, Figure NA.7; the 2008 text used 0.634)
- For a half-sine mode, area = 2L/π, so S_eff = 0.9994L ≈ L. (Note: 0.637 ≈ 2/π.)
- λ = 0.637 · S_eff / S   (NA.2.44.5)
- With max|φ| = 1, ∫|φ| ≤ S, so S_eff ≤ S/0.637.

### 2.3 Load parameters (Table NA.7 and Table NA.8)

| Bridge class | Usage (abbreviated) | Group N (walking) | Group N (jogging) | Crowd ρ (persons/m²) |
|---|---|---|---|---|
| A | Rural, seldom used | 2 | 0 | 0 |
| B | Suburban, occasional variation | 4 | 1 | 0.4 |
| C | Urban routes, significant daily variation | 8 | 2 | 0.8 |
| D | Primary access to stadia / major transport | 16 | 4 | 1.5 |

| Parameter | Walking | Jogging |
|---|---|---|
| Reference load F₀ (N) | 280 | 910 |
| Crossing speed v (m/s) | 1.7 | 3.0 |

- In the crowd load, ρ is capped at **1.0 persons/m²** (NA.2.44.5).
- Jogging cases may be neglected for an individual project (NA.2.44.2(3)); provide a toggle,
  default ON, and print the choice on the calc sheet.
- Allow the user to override group sizes and crowd density (NA.2.44.2(2) says these should
  be determined per project); print any override in red on the calc sheet.

### 2.4 Factors read from NA figures (digitised data, see §5)
- **k(f_v)** — Figure NA.8: combined factor for pedestrian population, harmonics and
  sensitivity weighting. Separate curves for walking and jogging. Linear interpolation;
  zero outside the digitised range.
- **γ** — Figure NA.9: reduction factor for unsynchronised actions, a function of log
  decrement δ, with separate curves for groups (depending on S_eff) and crowds.
  Bilinear interpolation in (δ, S_eff) for groups; linear in δ for crowds.
  Clamp at the figure's limits and show a warning when clamping happens, with one
  exception: above the largest digitised δ (≈ 0.2, ξ ≈ 3.2 %) γ is **not** clamped. γ rises
  with δ, so the edge value would under-estimate the response. The lookup gives no value,
  the cases that need γ are not run, and the overall status is INCOMPLETE with a plain note
  (author, 1 Nov 2026). Below the smallest δ the clamp stays, because γ is lower there.
  PD 6688-2 §3.20 recommends agreeing γ for each project; show this as a note.

### 2.5 Group load (NA.2.44.4) — moving pulsating force

F(t) = F₀ · k(f_v) · √(1 + γ·(N − 1)) · sin(2π f_v t)

- The force moves across the span at constant speed v, so its position is x(t) = v·t for
  0 ≤ t ≤ S/v.
- Solve the single-mode equation for the modal coordinate q:
  M·q̈ + 2ξωM·q̇ + ω²M·q = F(t)·φ(x(t)),  ω = 2πf
- Peak acceleration at the antinode is max|q̈| (because max|φ| = 1).
- Solver: Newmark average-acceleration or RK4. Time step ≤ 1/(40·f), and the test suite
  must show results converge (see §6, test N2).
- Run the analysis for each mode and each load case (walking group, jogging group).
- **Solver choice (M2 finding).** RK4 is the default solver, with dt = 1/(200·f).
  Newmark average acceleration (β = 1/4, γ = 1/2) is kept only as a cross-check (§6, N5).
  Newmark has no numerical damping, but it lengthens the period: its natural frequency
  comes out slightly low, while the forcing stays exactly at f. With ξ = 0.5 % the
  resonance peak is narrow, so this small detuning matters. For test N2 at dt = 1/(40f),
  Newmark gave 1.4762 m/s² against 1.4863 m/s² from RK4 and the reference (0.68 % low,
  outside the 0.5 % tolerance). At dt = 1/(200f) the two agree within 0.02 %. RK4 matches
  the reference at both step sizes. The default 1/(200f) also keeps the error from reading
  the peak only at time steps below about 0.02 %. The limit dt ≤ 1/(40f) is still enforced.
- **Mode shape needed.** The moving load needs φ(x) along the span. A mode entered as
  "user Seff" has no φ(x), so the group case is blocked for that mode, with a message
  asking the user to choose a mode shape. The crowd case still runs (see §2.6).

### 2.6 Crowd load (NA.2.44.5) — steady state

w(t) = 1.8 · (F₀ / A) · k(f_v) · √(γ·N / λ) · sin(2π f_v t)     [N/m²]

- Equation checked against NA+A1:2020 (NA.2.44.5). The group force equation in §2.5 was
  checked against NA.2.44.4 at the same time.
- N = ρ·A = ρ·S·b (with ρ ≤ 1.0), A = S·b.
- F₀ and k(f_v) are the walking values: F₀ = 280 N (Table NA.8) and the walking curve of
  Figure NA.8. Table NA.7 (NA.2.44.2) gives a crowd density for walking only, with no
  jogging crowd (author, 1 Nov 2026).
- The load direction follows the sign of the mode shape (NA.2.44.5(2)), so the generalised
  force amplitude is P₀ = W₀ · b · ∫|φ(x)| dx, where W₀ is the amplitude of w.
  For a half-sine mode, ∫|φ| dx = 2S/π.
  For a "user Seff" mode, ∫|φ| dx = 0.637·S_eff, from the definition of S_eff in §2.2
  with max|φ| = 1. The crowd case is allowed for these modes; the group case is not (§2.5).
- Steady-state resonant peak acceleration: a = P₀ / (2ξM).
- Show the note from NA.2.44.5(3) that this model may be conservative.
- Show the note that the NA crowd model is set to give a 2.5σ response, while the Sétra
  guide uses 4σ (PD 6688-2 §A.3).

### 2.7 Vertical comfort limit (NA.2.44.6)

a_limit = 1.0 · k1 · k2 · k3 · k4  [m/s²],  clamped to 0.5 ≤ a_limit ≤ 2.0

| k1 — site usage | value |
|---|---|
| Primary route for hospitals / high sensitivity | 0.6 |
| Primary route for school | 0.8 |
| Primary route for sports stadia / high usage | 0.8 |
| Major urban centres | 1.0 |
| Suburban crossings | 1.3 |
| Rural environments | 1.6 |

| k2 — route redundancy | value |
|---|---|
| Sole means of access | 0.7 |
| Primary route | 1.0 |
| Alternative routes readily available | 1.3 |

| k3 — structure height | value |
|---|---|
| Greater than 8 m | 0.7 |
| 4 m to 8 m | 1.0 |
| Less than 4 m | 1.1 |

- k4: exposure factor, default 1.0, user may set 0.8–1.2 with a justification text box
  that is printed on the calc sheet.
- Show both the raw product and the clamped value.

### 2.8 Lateral lock-in stability (NA.2.44.7)

- If no significant lateral mode is below 1.5 Hz → "Unstable lateral response not expected".
- Otherwise, for each lateral mode below 1.5 Hz:
  D = (m_bridge · ξ) / m_pedestrian
  - m_bridge: bridge mass per unit length (kg/m). For a deck whose mass varies along the
    span, use the lowest deck mass per metre (PD 6688-2 §A.7).
  - m_pedestrian: pedestrian mass per unit length = ρ · b · 70 kg (crowd density from the
    bridge class)
  - ξ: damping ratio of that mode. Do not add pedestrian damping when checking lateral
    stability (PD 6688-2 §A.1).
- Plot the (f, D) point on the digitised stability boundary of Figure NA.11. Below the
  boundary → "divergent lateral response may occur" (FAIL); above → stable.
- The form of D and the 1.5 Hz threshold are checked against NA+A1:2020 (NA.2.44.7).
  Figure NA.11 was digitised from NA+A1:2020.
- **Implementation decisions (M5, author, 31 Oct 2026).**
  - ξ in D is the decimal damping ratio (0.005 for 0.5 %).
  - ρ is the Table NA.7 value for the class, or the user's override. It is **not** capped at
    1.0: that cap applies to the crowd load only (NA.2.44.5). Class D uses ρ = 1.5.
  - Modes entered as "lateral" or "torsional" with f < 1.5 Hz are checked. NA.2.44.7
    covers all deck modes with a significant lateral component, so torsional modes are
    included by default, with a warning asking the user to confirm that the lateral
    component is significant (author, 31 Oct 2026; replaces "lateral modes only").
  - ρ = 0 (class A, or an override of 0): m_pedestrian = 0, so D is not defined. The result
    is "NO CROWD" with an explanation, and it does not fail the bridge.
  - Below the first digitised frequency of Figure NA.11 (0.171 Hz), the curve is off the top
    of the figure. The result is "CANNOT ASSESS" and the overall status is INCOMPLETE. No
    clamped boundary value is used.
  - Where the digitised curve is vertical (two points at 0.171 Hz), the higher D is used.
  - A point exactly on the boundary is UNSTABLE (only "above" is stable).
  - Outside 0.5–1.1 Hz (the Figure NA.11 test-data range), a caution flag is shown.
  - Modal mode has an input for the lowest deck mass per metre. Beam mode has no lateral
    modes, so it shows a note instead of running the check.
  - Overall status: UNSTABLE gives FAIL. A missing input or CANNOT ASSESS gives INCOMPLETE.
    A lateral mode below 2.5 Hz still gives INCOMPLETE, because its 0.2 m/s² acceleration
    check (NA.2.44.6(3)) is not calculated yet.
  - Reference: `validation/reference/reference_lateral.py`. Hand check H1: m = 1000 kg/m,
    ξ = 0.5 %, class C, b = 2.5 m gives m_pedestrian = 140 kg/m and D = 0.03571.

### 2.9 Frequency triggers and flags
All checked against NA+A1:2020.
- Vertical mode < 5 Hz → vertical comfort verification required (NA.2.44.6(1)).
- Lateral or torsional mode < 2.5 Hz → horizontal acceleration must not exceed 0.2 m/s²
  (NA.2.44.6(3)). v1 shows a flag that this check is needed; the lateral and torsional
  accelerations are not yet calculated (§10).
- Lateral or torsional mode < 3 Hz → flag "consider making provision for dampers"
  (NA.2.44.6(4)).

### 2.10 Result
For each mode × load case, report:
f, M, ξ, δ, S_eff, k(f), γ, N, force/load amplitude, peak acceleration, a_limit,
utilisation = a_peak / a_limit, PASS/FAIL. Governing case is highlighted.

**Vertical check not required (author, 31 Oct 2026).** Based on NA+A1:2020, NA.2.44.6(1).
- The fundamental vertical frequency is the lowest vertical mode frequency. In beam mode it
  is mode 1, even when that mode is at or above the 8 Hz display cut-off. In modal mode it is
  the lowest frequency among the modes entered as vertical. With no vertical mode entered,
  it is unknown and the rule below does not apply.
- If it is 5 Hz or more, the vertical comfort check is NOT REQUIRED. Overall status:
  NOT REQUIRED, with the fundamental frequency shown on the status card and calc sheet.
- Any vertical accelerations that are still computed (modes between 5 and 8 Hz) are shown
  for information only: utilisation is shown, but there is no PASS/FAIL verdict and no
  governing case.
- The comfort-limit inputs (k1, k2, height) are not asked for. The bridge class is asked
  for only when a lateral lock-in check needs it.
- The lateral and torsional rules still apply on top: an UNSTABLE lateral mode gives FAIL;
  a lateral or torsional mode below 2.5 Hz, or a lock-in check that needs input or cannot
  be assessed, gives INCOMPLETE.
- In beam mode, the status card and calc sheet always note that lateral and torsional
  modes were not assessed.

### 2.11 Input limits (author, 1 Nov 2026)
These are not code values. They keep the moving-load solver's work bounded, so a share link
or a typing slip cannot freeze the page, and they catch values entered in the wrong field.
- Span S ≤ 500 m (beam and modal mode).
- Vertical mode frequency ≤ 50 Hz in modal mode. Lateral and torsional modes have no limit,
  because they are not time-stepped.
- At most 10 modes in the mode table and in a share link. A link with more modes loads no
  modes, with a warning.
- The solver refuses a crossing that needs more than 3 000 000 time steps, as an input error.
  This is above the worst case the limits allow (≈ 2.94 million steps).
- A zero force amplitude (k = 0 outside Figure NA.8) gives zero response without stepping.

---

## 3. User interface

Single page, two columns on desktop, stacked on mobile.

**Left — inputs (grouped, with units and tooltips citing the clause):**
1. Bridge: name, input mode (Beam / Modal), span, width, mass per metre, EI or mode table,
   damping, height above ground.
2. Usage: bridge class A–D (with the usage descriptions), jogging toggle, overrides.
3. Comfort: k1, k2, k3 dropdowns, k4 with justification.
4. "Load example bridge" dropdown with the validation cases from §6.

**Right — results:**
1. Big status card: PASS / FAIL, governing utilisation, governing case.
2. Results table (§2.10).
3. Chart: acceleration time history at the antinode for the governing group case, with
   ±a_limit lines.
4. Chart: k(f) curve with the bridge's frequencies marked.
5. Chart: lateral stability boundary with the bridge's point (only if relevant).
6. Flags panel: frequency triggers, clamping warnings, out-of-scope warnings.
7. Buttons: "Download calc sheet (PDF)", "Copy link to these inputs".

**Other pages/tabs:** Method (equations with clause references), Validation (§6 results
table and plots), Limitations, About (author, LinkedIn, GitHub).

The Method page must include these notes (already shown in the crowd note and the PDF):
- The NA crowd model is set to give a 2.5σ response; the Sétra guide uses 4σ
  (PD 6688-2 §A.3).
- PD 6688-2 guidance: no pedestrian damping in the lateral stability check (§A.1); lowest
  deck mass per metre in D for non-uniform decks (§A.7); agree γ for each project (§3.20).

Design: clean engineering-calc look, not a generic dashboard. Monospace numbers, clear
units, light and dark themes, accessible colour contrast, no colour-only pass/fail
(always a word as well).

---

## 4. Technical design

- **Stack:** Vite + TypeScript, no backend. Charts: Chart.js or uPlot. PDF: jsPDF
  (+ jspdf-autotable). Tests: Vitest. Lint/format: ESLint + Prettier.
- **Hosting:** GitHub Pages via a GitHub Actions workflow that runs tests, then builds
  and deploys. A failing test blocks deployment.
- **Structure:**
  ```
  src/
    engine/            # pure calculation code, no DOM access
      modal.ts         # beam frequencies, modal mass, Seff, lambda
      loads.ts         # Table NA.7/NA.8, group and crowd load amplitudes
      solver.ts        # time integration of moving-load response
      limits.ts        # k1–k4, a_limit, frequency triggers
      lateral.ts       # D parameter and stability boundary check
      lookup.ts        # interpolation of digitised curves
      check.ts         # orchestrates everything → Result object
    data/
      k_fv.json        # digitised Figure NA.8 (with source metadata)
      gamma.json       # digitised Figure NA.9
      lateral_boundary.json  # digitised Figure NA.11
    ui/                # DOM, forms, charts
    report/            # PDF calc sheet
  tests/
    engine/*.test.ts
    validation/*.test.ts
  validation/
    cases.json         # benchmark bridge inputs and reference results
    reference/         # independent Python scripts used to produce reference values
  ```
- The engine is pure: `runCheck(inputs) → Result`. The UI never does maths.
- Every coefficient in code has a comment with its clause, table or figure reference.
- Every digitised JSON file has metadata: source (document, edition, figure), digitising
  tool, date, who digitised it, and estimated reading accuracy.
- The engine must allow k(f) and γ to be **injected** (overriding the lookup), so tests
  can check the equations independently of the digitised curves.
- Inputs serialise to a URL query string for sharing.

---

## 5. Digitising the NA figures (must be done by the author)

Figures NA.8 (k(f_v)), NA.9 (γ) and NA.11 (lateral stability boundary) are graphs, not
formulas, so the tool needs their data.

1. Get the current **NA+A1:2020 to BS EN 1991-2** from the Strathclyde library
   (British Standards Online). Also get **PD 6688-2** for background guidance.
2. Use WebPlotDigitizer (free) to digitise each curve at fine spacing, especially at peaks
   and kinks of the k(f) curves.
3. Save as JSON with the metadata from §4.
4. Check: re-plot the digitised data over the original figure and save a comparison image
   in `validation/digitising/` (`overlay.py`). Done for all four figures. The overlay images
   and screenshots are gitignored, not committed, because they contain BSI figures (step 5).
5. Do not copy the NA's text or figures into the public repo. Cite clause numbers and
   store only the numerical data needed to implement the method.

---

## 6. Validation plan (this is the "data collected" for LinkedIn)

Three levels. Each case lives in `validation/cases.json`, runs in CI, and appears on the
Validation page as "expected vs tool vs % difference".

### Level 1 — analytical and code-value checks
| ID | Check | Expected |
|---|---|---|
| A1 | SS beam L = 30 m, m = 1000 kg/m, EI = 1.3131×10⁹ N·m² | f₁ = 2.000 Hz, M = 15 000 kg |
| A2 | S_eff for half-sine, L = 30 m | 29.98 m; λ = 0.6366 (constant 0.637, NA+A1:2020) |
| A3 | a_limit with k1 = 1.6, k2 = 1.3, k3 = 0.7, k4 = 1.0 | 1.456 m/s² (matches the 1.46 m/s² reported for the Aberfeldy footbridge, MDPI Materials 2023, 16, 2890) |
| A4 | a_limit with k1 = 0.6, k2 = 0.7, k3 = 0.7 | raw 0.294 → clamped to 0.50 m/s² |
| A5 | a_limit with k1 = 1.6, k2 = 1.3, k3 = 1.1, k4 = 1.2 | raw 2.746 → clamped to 2.00 m/s² |
| A6 | Crowd ρ = 1.5 entered | ρ used in load = 1.0 |

### Level 2 — numerical checks (injected k and γ, not code values)
Bridge from A1, ξ = 0.5 %, b = 2.5 m.
| ID | Case | Reference (independent RK4 script, dt ≤ 0.001 s) |
|---|---|---|
| N1 | Crowd, ρ = 0.8, k = 1.0, γ = 0.2 injected | N = 60, W₀ = 29.18 N/m², P₀ = 1393.0 N, a = 9.287 m/s² |
| N2 | Group walking N = 8, k = 1.0, γ = 0.3 injected, v = 1.7 m/s | force amplitude 493.0 N, peak a = 1.486 m/s²; result must agree within 0.5 % for dt = 1/(40f) and 1/(200f) |
| N3 | Single walker, k = 1.0, γ irrelevant (N = 1) | peak a = 0.844 m/s² |
| N4 | Very long crossing (v → small) | peak tends to steady-state value F_amp/(2ξM) from below |
| N5 | Solver cross-check | Newmark and RK4 results agree within 0.5 % |

The reference values above were produced with an independent Python RK4 script; keep that
script in `validation/reference/` so anyone can rerun it.

### Code cross-check — PD 6688-2 simplified method
| ID | Case | Expected |
|---|---|---|
| PD1 | Bridge A1 (ξ = 0.5 %), single walker and single jogger, k = 1.0 injected. Compare the moving-load solver with the PD 6688-2 §A.4 simplified method a = F′/M · φmax² · K · Ψ | Solver and simplified method agree within 5 % (CI test). Author's hand check: single walker ≈ 0.84 m/s² against the tool's 0.844 m/s². |

- F′ = F₀·k·√(1 + γ(N − 1)), the NA group force amplitude. With N = 1, F′ = F₀·k.
- φmax is the largest mode-shape ordinate (written γmax in the PD); it is 1 with this
  tool's normalisation.
- K = 1.0 for a single span.
- Ψ is read from PD 6688-2 Figure A.4, digitised by the author into
  `validation/digitising/pd_figA4_walking.csv` and `pd_figA4_jogging.csv` (format in
  `validation/digitising/README.md`). Until those files exist, the PD1 tests are skipped
  with a reason. No placeholder Ψ values.
- The 5 % tolerance allows for reading Ψ from a figure.

### Level 3 — published real bridges
| ID | Bridge | Published data to use | What to compare |
|---|---|---|---|
| R1 | Podgorica footbridge, Montenegro (Živanović 2012, J. Struct. Eng. 138(10)) | Steel box girder, 78 m main span, f₁ = 2.04 Hz, modal mass 58 000 kg, ξ ≈ 0.26 % | Tool's class B/C predictions vs measured normal-traffic peaks (mean peak per 150 s 0.39–0.49 m/s², maximum instantaneous 0.59–0.80 m/s²). Expect the code to be conservative; report the ratio and discuss. |
| R2 | Eeklo footbridge, Belgium (Van Nimmen et al., J. Bridge Eng., ASCE) | Steel, 42 m central span, vertical mode 2.97 Hz with 0.19 % damping; crowd tests at about 0.25 and 0.5 persons/m² | Tool crowd prediction vs measured maximum below 0.5 m/s². Modal mass needs the full paper or dataset (free on request from KU Leuven). |
| R3 | Aberfeldy footbridge, Scotland (MDPI Materials 2023, 16, 2890) | GFRP cable-stayed, 63 m main span, vertical modes 1.64 Hz and 2.71 Hz | a_limit check (A3), and predicted accelerations vs the paper's UK NA results once read from the full paper. |
| R4 | Author's hand calculation | One case, fully worked by hand, scanned or typed | Tool matches the hand calc to 3 significant figures. |

Optional extra: run R1–R3 through the Sétra/HiVoSS method in a spreadsheet and show the
spread between methods. This makes a good LinkedIn talking point.

### Acceptance criteria
- All Level 1 and 2 tests pass in CI.
- Level 3 results are reported honestly, including where the tool is conservative or
  unconservative, with discussion on the Validation page.

---

## 7. Calc sheet (PDF)

A4, one to three pages:
1. Header: project, bridge name, date, tool version and git commit hash, "checked by" box.
2. Inputs table with units, including any overrides (in red).
3. Method summary with clause references.
4. Results table and governing case, PASS/FAIL.
5. Time-history chart and k(f) chart.
6. Flags, warnings and limitations.
7. Footer: "Screening tool. Verify against NA+A1:2020 to BS EN 1991-2 and project
   requirements. Not a substitute for engineering judgement."

---

## 8. Milestones

1. **M1 Engine core:** modal.ts, limits.ts, loads.ts with injected k/γ; Level 1 tests pass.
2. **M2 Solver:** solver.ts and crowd steady state; Level 2 tests pass.
3. **M3 Digitised data:** JSON for NA.8, NA.9, NA.11 with metadata and overlay images.
4. **M4 UI:** inputs, results table, status card, charts.
5. **M5 Lateral:** D check and stability plot; frequency flags.
6. **M6 Report:** PDF calc sheet and share link.
7. **M7 Validation page:** Level 3 cases written up.
8. **M8 Launch:** README, GitHub Pages deploy (base path `/footbridge-vibration/`),
   LinkedIn post with a screen recording, and the time-history and k(f) charts in the PDF
   calc sheet (§7 item 5; moved from M7, author, 31 Oct 2026).

---

## 9. Items to verify before launch
- [x] Checked by the author against NA+A1:2020: the group force equation (NA.2.44.4), the
      crowd load equation (NA.2.44.5) and Tables NA.7–NA.11. Changes from 2008 applied:
      the S_eff/λ constant is 0.637 (NA.2.44.4, Figure NA.7), and the statement that it is
      conservative to take S_eff = S was deleted.
- [x] Form of D = m_bridge·ζ/m_pedestrian and the 1.5 Hz threshold (NA.2.44.7), checked
      against NA+A1:2020. Figure NA.11 digitised from NA+A1:2020.
- [x] Lateral/torsional requirements checked against NA+A1:2020: 5 Hz vertical trigger
      (NA.2.44.6(1)), 0.2 m/s² horizontal limit for modes < 2.5 Hz (NA.2.44.6(3)), damper
      provision < 3 Hz (NA.2.44.6(4)).
- [x] Figures NA.8, NA.9 and NA.11 digitised from NA+A1:2020 and checked by overlay
      against the source figures (§5).
- [x] PD 6688-2 typical damping values (Table A.1), checked by the author on 28 Oct 2026;
      helper added (§2.1). Notes from §A.1, §A.3, §A.7 and §3.20 added (§2.4, §2.6, §2.8).
- [ ] PD 6688-2 guidance on modal mass, and whether to include pedestrian mass.
- [ ] Whether the second-generation Eurocode EN 1991-2:2023 and its UK NA change the
      method. Keep load models in their own module so a future method can be added.

---

## 10. Future versions
- v2: lateral and torsional accelerations to CD 353 Appendix A (F₀ = 70 N, k′(f_lat) from
  CD 353 Figure A.1, limit from EN 1990), with walking paths offset from the centreline.
  Note: NA+A1:2020 now requires lateral accelerations to be found from the same load models
  (NA.2.44.3) and checked against 0.2 m/s² for lateral/torsional modes below 2.5 Hz
  (NA.2.44.6(3)).
- v2: two-span and continuous beams in beam mode.
- v2: enter FE mode shape ordinates in modal mode, so the group (moving-load) case can
  run for modes that are not half-sine or full-sine (see §2.5).
- v3: Sétra/HiVoSS method alongside UK NA for comparison.
- v3: tuned mass damper sizing helper (Den Hartog) for failing cases.

---

## 11. References
- NA to BS EN 1991-2:2003 (incorporating Corrigendum No. 1), BSI 2008, clause NA.2.44;
  and NA+A1:2020 (current).
- BS EN 1990 Annex A2, A2.4.3.2, and its UK NA.
- PD 6688-2:2011, Guidance for the design of structures to BS EN 1991-2.
- DMRB CD 353 Rev 0, Design criteria for footbridges, March 2020.
- SCI Advisory Desk AD 428A, Lateral and torsional vibration of half-through truss
  footbridges.
- Živanović S. (2012) Benchmark footbridge for vibration serviceability assessment under
  the vertical component of pedestrian load. J. Struct. Eng. 138(10).
- Van Nimmen K. et al., Eeklo footbridge: benchmark dataset on pedestrian-induced
  vibrations. J. Bridge Eng. (ASCE).
- Vibration Serviceability of the Aberfeldy Footbridge under Various Human-Induced
  Loadings. Materials 2023, 16(7), 2890.
