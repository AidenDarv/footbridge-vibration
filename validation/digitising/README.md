# Digitised figures

Numerical data read from figures by the author (SPEC §5). Only the numbers needed for the
method are stored here; the figures themselves are not copied into the repo.

## PD 6688-2 Figure A.4 (Ψ) — validation case PD1 (SPEC §6)

Files: `pd_figA4_walking.csv` and `pd_figA4_jogging.csv`.

Format: comma-separated, one header row, three columns:

1. the curve parameter (one value per digitised curve),
2. the horizontal-axis variable,
3. `psi`, the value read off the vertical axis.

Columns 1 and 2 must be named with one of these headers, matching what Figure A.4 plots:

| Header | Quantity | Unit |
|---|---|---|
| `delta` | log decrement δ | – |
| `S_m` | span | m |
| `f_Hz` | natural frequency | Hz |

Example layout (values are illustrative only, not data):

```
delta,S_m,psi
0.03,10,...
0.03,20,...
0.05,10,...
```

Lines starting with `#` are comments; use them for the source metadata (SPEC §4):
document, edition, figure, digitising tool, date, who digitised it and estimated reading
accuracy.

The PD1 test interpolates linearly along each curve and then between curves. If Bridge A1
falls outside the digitised range the test fails rather than extrapolating. If Figure A.4
uses an axis not in the table above, the test fails with a message naming the header:
add the quantity to `tests/validation/pd1.test.ts` and `validation/reference/reference_cases.py`.
