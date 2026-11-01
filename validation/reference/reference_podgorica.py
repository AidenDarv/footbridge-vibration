"""Independent reference for Level 3 case R1, Podgorica footbridge (SPEC.md section 6).

Published data (Zivanovic 2012, J. Struct. Eng. 138(10)): vertical half-sine mode,
f = 2.04 Hz, M = 58 000 kg, xi = 0.26 %, S = 78 m. Walking-group predictions for bridge
classes B, C and D (Table NA.7: N = 4, 8, 16), with k(f) and gamma read from the author's
raw WebPlotDigitizer CSVs (not src/data/*.json) and plain RK4 for the moving load
(NA.2.44.4). Report only: compared with measured normal-traffic peaks, no pass/fail.

Run: python reference_podgorica.py   (needs numpy)
"""
import csv
import math
import os

import numpy as np

DIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "digitising")
SEFFS = [10, 12, 15, 20, 30, 40, 60, 100, 200, 300]

S, f, M, zeta = 78.0, 2.04, 58000.0, 0.0026
F0, v = 280.0, 1.7                    # Table NA.8, walking
delta = 2 * math.pi * zeta
seff = (2 * S / math.pi) / 0.637      # NA+A1:2020, NA.2.44.4, Figure NA.7


def xy(name):
    with open(os.path.join(DIG, name), newline="") as fh:
        a = np.array([[float(x) for x in r] for r in csv.reader(fh) if r])
    return a[:, 0], a[:, 1]


def k_walking(freq):
    x, y = xy("na8_walking.csv")
    assert x[0] <= freq <= x[-1]
    return float(np.interp(freq, x, y))


def gamma_group(d, s):
    vals = []
    for c in SEFFS:
        x, y = xy(f"na9_Seff_{c}.csv")
        assert x[0] <= d <= x[-1]
        vals.append(float(np.interp(d, x, y)))
    return float(np.interp(s, SEFFS, vals))


def peak(f_amp, dt):
    om = 2 * math.pi * f

    def rhs(t, y):
        x = v * t
        phi = math.sin(math.pi * x / S) if 0 <= x <= S else 0.0
        return np.array([y[1], (f_amp * math.sin(om * t) * phi - 2 * zeta * om * M * y[1]
                                - om * om * M * y[0]) / M])

    y, t, a_max = np.zeros(2), 0.0, 0.0
    for _ in range(int(round((S / v) / dt))):
        k1 = rhs(t, y)
        k2 = rhs(t + dt / 2, y + dt / 2 * k1)
        k3 = rhs(t + dt / 2, y + dt / 2 * k2)
        k4 = rhs(t + dt, y + dt * k3)
        y = y + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t += dt
        a_max = max(a_max, abs(rhs(t, y)[1]))
    return a_max


k = k_walking(f)
g = gamma_group(delta, seff)
print(f"R1: delta = {delta:.6f}, Seff = {seff:.4f} m, k = {k:.6f}, gamma = {g:.6f}")
for cls, n in (("B", 4), ("C", 8), ("D", 16)):
    f_amp = F0 * k * math.sqrt(1 + g * (n - 1))
    a1, a2 = peak(f_amp, 0.0005), peak(f_amp, 0.00025)
    print(f"R1 class {cls}: N = {n}, force amp = {f_amp:.2f} N, peak a = {a1:.4f} m/s2 "
          f"(dt/2: {a2:.4f})")
