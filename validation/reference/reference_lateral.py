"""Independent reference values for the lateral lock-in check (SPEC §2.8, NA.2.44.7).

Reads the author's raw WebPlotDigitizer CSV for Figure NA.11 directly (not
src/data/lateral_boundary.json) and interpolates with numpy.interp, as a check on
src/engine/lateral.ts.

  D = m_bridge * zeta / m_pedestrian        zeta as a decimal damping ratio
  m_pedestrian = rho * b * 70 kg            rho from Table NA.7 (not capped at 1.0)
  Below the boundary: unstable. Above: stable.

The first two CSV points share f = 0.171 Hz (vertical part of the curve), so query points
here are all above that frequency, where numpy.interp is well defined.

Run: python reference_lateral.py   (needs numpy)
"""
import csv
import os

import numpy as np

DIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "digitising")
PEDESTRIAN_MASS = 70.0  # kg per pedestrian, NA.2.44.7


def boundary():
    with open(os.path.join(DIG, "na11_boundary.csv"), newline="") as fh:
        rows = [[float(v) for v in r] for r in csv.reader(fh) if r]
    a = np.array(rows)
    return a[:, 0], a[:, 1]


def d_boundary(f):
    x, y = boundary()
    assert x[1] < f <= x[-1]
    return float(np.interp(f, x[1:], y[1:]))


def d_param(m_bridge, zeta, rho, b):
    return m_bridge * zeta / (rho * b * PEDESTRIAN_MASS)


# Hand-checked case: m = 1000 kg/m, xi = 0.5 %, class C (rho = 0.8), b = 2.5 m.
#   m_ped = 0.8 * 2.5 * 70 = 140 kg/m;  D = 1000 * 0.005 / 140 = 0.035714...
print(f"H1: m_ped = {0.8 * 2.5 * PEDESTRIAN_MASS:.6f} kg/m")
print(f"H1: D = {d_param(1000, 0.005, 0.8, 2.5):.6f}")
# Class D uses the Table NA.7 value rho = 1.5, uncapped: m_ped = 1.5 * 2.5 * 70 = 262.5 kg/m.
print(f"H2: D (class D) = {d_param(1000, 0.005, 1.5, 2.5):.6f}")

for f in (0.3, 0.6, 1.0, 1.3, 1.45):
    print(f"boundary D at f = {f} Hz: {d_boundary(f):.6f}")
