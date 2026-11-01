# Redesign brief: Footbridge Vibration Checker

Reference mockups in this folder (open them in a browser to view; they are static
design comps, not app code):

- `checker-desktop.html`: the checker page at desktop width
- `checker-phone.html`: the same page at 390 px
- `invalid-inputs.html`: how invalid inputs are highlighted

Numbers in the mockups are the real tool outputs for Bridge A1 with class C, rural,
alternative routes, height 10 m. In the app, every number comes from the engine.

**Scope: UI and styling only.** Do not change `src/engine/`, `src/data/`,
`validation/` or any calculation, rounding rule, status rule or test expectation for
results. The engine, PDF content and share-link format stay as they are, except where
this brief adds UI behaviour.

---

## 1. Visual style (replaces the dark navy grid-paper look)

- Light theme by default. Background `#FFFFFF`. Keep a dark theme, but make it a
  quiet near-black version of the same layout (no grid paper, no glow).
- Ink `#14171C`, secondary text `#3D444F`, muted text `#5A6270` (all pass 4.5:1 on white).
- Lines `#E3E6EA`. Input borders `#C9CED6`.
- Input panel ("workbench") background `#F4F5F7`, border `#E3E6EA`, radius 12 px.
- Accent (links, focus) `#1F4F8F`.
- Status colours: FAIL `#B42318` on `#FFF6F5` (border `#E8B4AE`); PASS `#1E7A46`
  with an equivalent pale green; INCOMPLETE / NOT REQUIRED / CHECK INPUTS use neutral
  grey (`#F8F9FA`, dashed `#B5BCC6` border). Status is always written in words too.
- Fonts: IBM Plex Sans (UI) and IBM Plex Mono (numbers, units, clause refs).
  The CSP currently blocks external requests, so **self-host the fonts** (woff2 in the
  repo, SIL OFL licence file included), or fall back to a system font stack. Do not
  loosen the CSP for Google Fonts.
- No gradients, glows, drop-shadow cards, left-border accent cards, all-caps headings
  or emoji. Sentence-case headings. Radius 6 px on inputs and buttons, 10–12 px on panels.
- Touch targets at least 44 px.

## 2. Layout of the checker page

- Header: bridge icon + "Footbridge Vibration Checker" on the left; nav on the right
  (Checker, Method, Validation, Limitations, About), active item underlined.
- Page intro: small mono overline "UK NATIONAL ANNEX TO BS EN 1991-2 · NA.2.44",
  H1 "Will people feel this footbridge move?", one sentence of explanation.
- Two columns on desktop, stacked on phones:
  - **Left: the inputs panel**, a grey "workbench" box headed "Your bridge" with a
    small INPUTS label. Inputs inside it are white so they stand out.
  - **Right: results on white**, headed "Result" with a small status dot and
    "Updates as you type" (grey dot and "Paused" when inputs are invalid).
- Footer: author line, GitHub and LinkedIn links.

## 3. Inputs panel

1. **"Start from an example"**: example bridges as pill buttons (`aria-pressed`)
   instead of a dropdown. The selected one is filled dark. On phones, the row scrolls
   sideways.
2. **01 The structure**
   - A segmented control: "Simple span" | "Modes from FE model" (current beam/modal toggle).
   - Two-column grid: Span (m), Deck width (m), Mass per metre (kg/m), Bending
     stiffness EI (N·m²). Units shown in grey next to the label, not in a separate box.
   - Damping: a material select (Steel δ 0.03, Concrete δ 0.05, Composite δ 0.04,
     Timber δ 0.06–0.12, Custom) beside the % input. Picking a material fills the
     input; editing the input switches the select to "Custom". Hint below:
     "Typical values from PD 6688-2 Table A.1. Use measured damping if you have it."
   - Modal mode keeps the existing mode table and lowest-deck-mass field, styled the same way.
3. **02 Where it is and who uses it**
   - "How busy is it?": four radio rows (white list box) in plain English, with the
     code class in small grey text underneath:
     - Quiet, rural · Class A · groups of 2
     - Suburban, occasional peaks · Class B · groups of 4 · crowd 0.4 people/m²
     - Urban, busy every day · Class C · groups of 8 · crowd 0.8 people/m²
     - Stadium or transport hub · Class D · groups of 16 · crowd 1.5 people/m²
     Selected row tinted `#EDF2F9`.
   - "Include joggers" checkbox.
   - "Setting" select (k1, plain-English options), "Other ways across?" select (k2),
     Height above ground (m), mapped to the existing k1/k2/k3 inputs.
   - "Advanced: exposure factor k₄, group sizes, crowd density" as a collapsed `<details>`.
4. Reduce the "?" icons. Keep help as short hint text under the fields that need it.
   Clause references stay, as small grey mono text, not in every label.

## 4. Results

1. **Verdict card**: "Result for <bridge name>", an icon plus a plain-English
   headline ("Fails the comfort check", "Passes the comfort check", "Check your
   inputs", "No vertical check required", "Incomplete"), then **one sentence built
   from the engine result**, e.g. "A crowd of 60 people would shake the deck at
   4.17 m/s², about 2.9 times the comfort limit of 1.46 m/s². Walking and jogging
   groups also exceed it." Then a row of key numbers: natural frequency, modal mass,
   damping, comfort limit. Keep all the existing status notes (lateral, < 1 Hz,
   beam-mode note) as short lines under the sentence.
2. **"Each load case against the limit"**: one row per case with label + people
   count, a horizontal bar scaled to 3 × the limit (clip beyond, with the value still
   shown), a black vertical line at the limit, and the value with "× limit". Bars use
   the status colour. The governing case is marked "GOVERNS". Use the existing display
   rounding rules (limit rounded down, values rounded up).
3. **Charts**: keep the uPlot charts, restyled to match (light grid, ink axes,
   accent trace, dashed ±limit lines).
4. **Lateral stability** table: keep it, restyled, shown only when relevant.
5. **"Show the full calculation"** `<details>`, closed by default, containing the
   existing modal properties table, comfort-limit factors, full load-case table and
   clause references.
6. Buttons: primary "Download calc sheet (PDF)" (dark fill), secondary "Copy link to
   these inputs" (outline).
7. A one-line screening notice under the buttons.

## 5. Phone layout

- Compact header with a menu button that opens the nav.
- Everything stacks: intro, inputs panel, then "Result".
- A **sticky bottom bar** showing the status word and governing utilisation
  (e.g. "FAIL · 2.86 × the limit") with "See result ↓" linking to the result card.
  Hide it when the result card is on screen.
- Use 16 px font in inputs (prevents iOS zoom).

## 6. Invalid inputs (see `invalid-inputs.html`)

- Validate **as the user types** (debounced), using the existing input limits and
  messages from the engine. Do not add new limits in the UI.
- An invalid field gets a 2 px `#B42318` border, background `#FFF8F7`,
  `aria-invalid="true"`, and an error line underneath, linked with `aria-describedby`
  ("Must be between 0.5 and 20 m.").
- Where the fix is obvious, offer a one-click button. Damping below 0.1 % gets
  "This box takes a percentage: did you mean X %?" and "Use X %", where X = value × 100.
- A summary box at the top of the inputs panel: "N values need checking" with links
  that move focus to each field.
- The result side switches to a neutral dashed "Check your inputs" card listing the
  problems, and the status dot reads "Paused". It never shows a stale PASS or FAIL.

## 7. Other pages

Method, Validation, Limitations and About get the same header, footer, typography and
colours: white page, max-width ~760 px for text, tables restyled to match.

## 8. Done means

- All existing tests still pass, with no engine or validation changes.
- New UI tests for: material select filling damping; live red-field validation with
  the summary and "Use X %" fix; the verdict sentence for PASS, FAIL, NOT REQUIRED,
  INCOMPLETE and CHECK INPUTS; the sticky phone bar.
- Playwright check of every page at 1280 px and 390 px in light and dark, no
  sideways scroll, no console errors, CSP still in place, built with
  `npm run build && npm run preview`.
