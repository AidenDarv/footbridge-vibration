"""Independent reference values for SPEC.md section 6, Levels 1 and 2.

Uses plain RK4 integration of the single-mode equation. k and gamma are INJECTED test
values, not values read from the National Annex figures.

Run: python3 reference_cases.py   (needs numpy)
"""
import math
import numpy as np

# Bridge A1: simply supported, uniform
L = 30.0        # span (m)
m = 1000.0      # mass per unit length (kg/m)
f = 2.0         # target first frequency (Hz)
zeta = 0.005    # damping ratio
b = 2.5         # deck width (m)

EI = m * (2 * L**2 * f / math.pi) ** 2   # from f1 = (pi / 2L^2) sqrt(EI/m)
M = m * L / 2                            # modal mass, unit-max half-sine
w = 2 * math.pi * f

Seff = (2 * L / math.pi) / 0.637         # NA+A1:2020, NA.2.44.4, Figure NA.7
lam = 0.637 * Seff / L                   # NA+A1:2020, NA.2.44.5

print(f"A1: EI = {EI:.4e} N m2, M = {M:.1f} kg")
print(f"A2: Seff = {Seff:.3f} m, lambda = {lam:.4f}")

# N1: crowd steady state (NA.2.44.5), injected k = 1.0, gamma = 0.2
k, gam, rho, F0 = 1.0, 0.2, 0.8, 280.0
N = rho * L * b
A = L * b
W0 = 1.8 * (F0 / A) * k * math.sqrt(gam * N / lam)
P0 = W0 * b * (2 * L / math.pi)          # integral of |phi| for half-sine = 2L/pi
a_crowd = P0 / (2 * zeta * M)
print(f"N1: N = {N:.1f}, W0 = {W0:.4f} N/m2, P0 = {P0:.2f} N, a = {a_crowd:.4f} m/s2")


def moving_group(n_ped, gamma, k_f, F0, v, dt):
    """NA.2.44.4 moving pulsating force; returns (force amplitude, peak antinode accel)."""
    f_amp = F0 * k_f * math.sqrt(1 + gamma * (n_ped - 1))
    steps = int(round((L / v) / dt))

    def rhs(t, y):
        x = v * t
        phi = math.sin(math.pi * x / L) if 0 <= x <= L else 0.0
        p = f_amp * math.sin(w * t) * phi
        q, qd = y
        qdd = (p - 2 * zeta * w * M * qd - w * w * M * q) / M
        return np.array([qd, qdd])

    y, t, a_max = np.zeros(2), 0.0, 0.0
    for _ in range(steps):
        k1 = rhs(t, y)
        k2 = rhs(t + dt / 2, y + dt / 2 * k1)
        k3 = rhs(t + dt / 2, y + dt / 2 * k2)
        k4 = rhs(t + dt, y + dt * k3)
        y = y + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t += dt
        a_max = max(a_max, abs(rhs(t, y)[1]))
    return f_amp, a_max


for dt in (0.005, 0.001, 0.0005):
    fa, a = moving_group(8, 0.3, 1.0, 280.0, 1.7, dt)
    print(f"N2: dt = {dt}: force amp = {fa:.2f} N, peak a = {a:.4f} m/s2")

fa, a = moving_group(1, 0.0, 1.0, 280.0, 1.7, 0.0005)
print(f"N3: single walker: force amp = {fa:.1f} N, peak a = {a:.4f} m/s2")

# N4: slow crossings approach the steady-state resonant value F_amp / (2 zeta M) from below.
# dt = 1/(40 f) keeps the long runs quick; N2 above shows RK4 has converged at that step.
fa = 280.0 * math.sqrt(1 + 0.3 * 7)
a_ss = fa / (2 * zeta * M)
print(f"N4: steady state F_amp/(2 zeta M) = {a_ss:.4f} m/s2")
for v in (1.7, 0.5, 0.2, 0.05, 0.02):
    _, a = moving_group(8, 0.3, 1.0, 280.0, v, 1 / (40 * f))
    print(f"N4: v = {v}: peak a = {a:.4f} m/s2, ratio to steady state = {a / a_ss:.4f}")

print(f"A3: a_limit = {1.6 * 1.3 * 0.7 * 1.0:.3f} m/s2")


# PD1: PD 6688-2 section A.4 simplified method, a = F'/M * phi_max^2 * K * Psi, against RK4.
# Psi comes from Figure A.4, digitised by the author (validation/digitising/README.md).
# phi_max = 1 (unit-max mode shape), K = 1.0 (single span), k = 1.0 injected, N = 1.
import csv
import os

DIGITISING = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "digitising")
KNOWN = {"delta": 2 * math.pi * zeta, "S_m": L, "f_Hz": f}


def read_psi(path):
    with open(path, newline="") as fh:
        rows = [r for r in csv.reader(fh) if r and not r[0].strip().startswith("#")]
    head = [h.strip() for h in rows[0]]
    curves = {}
    for r in rows[1:]:
        c, x, psi = (float(v) for v in r)
        curves.setdefault(c, []).append((x, psi))
    return head[0], head[1], {c: sorted(p) for c, p in curves.items()}


def interp(points, x):
    xs = [p[0] for p in points]
    if not xs[0] <= x <= xs[-1]:
        raise ValueError(f"x = {x} outside digitised range {xs[0]}-{xs[-1]}")
    return float(np.interp(x, xs, [p[1] for p in points]))


def psi_at(path):
    cname, xname, curves = read_psi(path)
    c, x = KNOWN[cname], KNOWN[xname]
    keys = sorted(curves)
    if len(keys) == 1:
        return interp(curves[keys[0]], x)
    if not keys[0] <= c <= keys[-1]:
        raise ValueError(f"{cname} = {c} outside digitised curves {keys[0]}-{keys[-1]}")
    values = [interp(curves[kk], x) for kk in keys]
    return float(np.interp(c, keys, values))


for name, F0_case, v_case in (("walking", 280.0, 1.7), ("jogging", 910.0, 3.0)):
    path = os.path.join(DIGITISING, f"pd_figA4_{name}.csv")
    if not os.path.exists(path):
        print(f"PD1 {name}: awaiting {os.path.relpath(path)} (PD 6688-2 Figure A.4)")
        continue
    psi = psi_at(path)
    a_pd = F0_case / M * 1.0**2 * 1.0 * psi
    _, a_rk4 = moving_group(1, 0.0, 1.0, F0_case, v_case, 0.0005)
    print(f"PD1 {name}: Psi = {psi:.2f}, PD a = {a_pd:.4f} m/s2, RK4 a = {a_rk4:.4f} m/s2, "
          f"diff = {100 * (a_rk4 - a_pd) / a_pd:+.2f} %")
