"""Independent reference values for the digitised-figure lookups (SPEC §2.4).

Reads the author's raw WebPlotDigitizer CSVs directly (not src/data/*.json) and
interpolates with numpy.interp, as a check on src/engine/lookup.ts:
  k(f)       Figure NA.8   linear in f
  gamma      Figure NA.9   groups: linear in delta along each Seff curve, then linear in Seff
                           crowd:  linear in delta
All query points are inside the digitised ranges (clamping is tested separately in TS).

Run: python reference_lookup.py   (needs numpy)
"""
import csv
import math
import os

import numpy as np

DIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "digitising")
SEFFS = [10, 12, 15, 20, 30, 40, 60, 100, 200, 300]


def xy(name):
    with open(os.path.join(DIG, name), newline="") as fh:
        rows = [[float(v) for v in r] for r in csv.reader(fh) if r]
    a = np.array(rows)
    return a[:, 0], a[:, 1]


def k(activity, f):
    x, y = xy(f"na8_{activity}.csv")
    assert x[0] <= f <= x[-1]
    return float(np.interp(f, x, y))


def gamma_group(delta, seff):
    assert SEFFS[0] <= seff <= SEFFS[-1]
    vals = []
    for s in SEFFS:
        x, y = xy(f"na9_Seff_{s}.csv")
        assert x[0] <= delta <= x[-1]
        vals.append(float(np.interp(delta, x, y)))
    return float(np.interp(seff, SEFFS, vals))


def gamma_crowd(delta):
    x, y = xy("na9_crowd.csv")
    assert x[0] <= delta <= x[-1]
    return float(np.interp(delta, x, y))


# Bridge A1 (SPEC §6): f = 2.0 Hz, xi = 0.5 %, half-sine Seff = (2L/pi)/0.634 with L = 30 m.
L, f, zeta = 30.0, 2.0, 0.005
delta = 2 * math.pi * zeta
seff = (2 * L / math.pi) / 0.634
print(f"A1: delta = {delta:.6f}, Seff = {seff:.6f} m")
print(f"A1: k walking(2.0) = {k('walking', f):.6f}")
print(f"A1: k jogging(2.0) = {k('jogging', f):.6f}")
print(f"A1: gamma group(delta, Seff) = {gamma_group(delta, seff):.6f}")
print(f"A1: gamma crowd(delta) = {gamma_crowd(delta):.6f}")

# Other points spread over the figures.
for a, ff in (("walking", 3.3), ("jogging", 3.3), ("walking", 5.0), ("jogging", 1.2)):
    print(f"k {a}({ff}) = {k(a, ff):.6f}")
for d, s in ((0.1, 12.5), (0.05, 75.0), (0.15, 250.0), (0.01, 10.0)):
    print(f"gamma group(delta = {d}, Seff = {s}) = {gamma_group(d, s):.6f}")
print(f"gamma crowd(0.12) = {gamma_crowd(0.12):.6f}")
