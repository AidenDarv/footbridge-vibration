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

Seff = (2 * L / math.pi) / 0.634         # NA.2.44.4, Figure NA.7
lam = 0.634 * Seff / L                   # NA.2.44.5

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
