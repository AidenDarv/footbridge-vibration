# CLAUDE.md — Footbridge Vibration Checker

Browser tool that checks pedestrian-induced footbridge vibration to the UK National Annex
to BS EN 1991-2 (NA.2.44). The full requirements are in `SPEC.md`. Read it before starting
any task, and follow its section numbers when you refer to the method.

## What matters most
This is an engineering tool. A wrong number is worse than a missing feature.
- Never invent, guess or "fill in" a code value, coefficient, curve point or limit. If a
  value is not in `SPEC.md` or in `src/data/*.json`, stop and ask me.
- Every coefficient in code gets a comment citing its source, e.g.
  `// NA.2.44.6, Table NA.11 — structure height factor k3`.
- Do not change values in `src/data/` or `validation/cases.json` unless I ask. If a test
  fails, fix the code, not the expected value. If you think an expected value is wrong,
  tell me why and wait.
- Items marked [VERIFY] in `SPEC.md` are not confirmed. Do not present them as confirmed
  in the UI or README.

## Units and conventions
- SI throughout: m, kg, N, s, Hz. Accelerations in m/s².
- Damping is stored as a damping ratio ξ (decimal, e.g. 0.005). Log decrement δ = 2πξ is
  derived, never stored separately.
- Mode shapes are normalised so max |φ| = 1, and modal mass is defined for that
  normalisation.
- Variable names follow the code symbols where possible: `F0`, `fv`, `gamma`, `Seff`,
  `lambda_`, `k1`…`k4`, `aLimit`.

## Architecture rules
- `src/engine/` is pure TypeScript: no DOM, no globals, no randomness. Functions take
  inputs and return results.
- `src/ui/` never does maths. It calls `runCheck(inputs)` and displays the result.
- k(f) and γ must be injectable so tests can bypass the digitised curves.
- Interpolation clamps at the data limits and returns a warning, never silently
  extrapolates.
- Keep load models in their own module so another method (Sétra/HiVoSS, new Eurocode)
  can be added later.

## Workflow
- For any new engine feature: write or update the tests first (`tests/`), then the code.
- Run `npm test` after every change to `src/engine/`. Do not say a task is done while
  tests fail.
- For changes that touch more than two files, show me a short plan first.
- Small commits with clear messages, e.g. `engine: add crowd steady-state response`.
- When unsure whether something is in scope, check `SPEC.md` §1.2 and §1.3, then ask.

## Commands
- `npm install` — install dependencies
- `npm run dev` — local dev server
- `npm test` — run Vitest once
- `npm run test:watch` — Vitest in watch mode
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint + Prettier check

## Validation
- Level 1 and 2 cases in `SPEC.md` §6 are CI tests. Use these tolerances: Level 1 exact to
  4 significant figures; Level 2 within 0.5 %.
- Independent reference scripts live in `validation/reference/` (Python). If you add a
  new numerical feature, also add an independent reference calculation for it.

## UI and writing
- Plain, clear English on the site. Short sentences. Explain each input in a tooltip with
  its clause reference.
- PASS/FAIL is always shown in words as well as colour.
- Always show the limitations and the "screening tool" notice on the results and in the
  PDF.
- Do not copy text or figures from BSI or other standards into the repo or site. Cite
  clause numbers and use only the numerical data needed to implement the method.

## Don'ts
- Don't add a backend, accounts, analytics or cookies.
- Don't add dependencies without saying why.
- Don't refactor working, tested engine code unless I ask.
