"""Convert the author's WebPlotDigitizer CSVs into the tool's data files (SPEC §4, §5).

Inputs (this folder, one CSV per curve, "x, y", no header; see notes.txt):
  na8_walking.csv, na8_jogging.csv          Figure NA.8   x = f_v (Hz), y = k(f_v)
  na9_Seff_<S>.csv, na9_crowd.csv           Figure NA.9   x = delta, y = gamma
  na11_boundary.csv                         Figure NA.11  x = f (Hz), y = D
  pd_figA4_<walk|jog>_d0<NN>.csv            PD 6688-2 Figure A.4  x = span (m), y = Psi

Outputs:
  src/data/k_fv.json, src/data/gamma.json, src/data/lateral_boundary.json
  validation/digitising/pd_figA4_walking.csv, pd_figA4_jogging.csv  (format in README.md)

Values are copied exactly as digitised: no rounding, smoothing, sorting or clipping.
The script stops if a curve's x values do not increase (NA.11 is allowed one vertical
segment where the curve leaves the top of the plot).

Run from the repo root:  python validation/digitising/convert.py
"""
import csv
import glob
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "src", "data")

# notes.txt — who, when, tool and reading accuracy (SPEC §4 metadata).
DIGITISED_BY = "Aiden Darvell"
DATE = "2026-10-31"
TOOL = "WebPlotDigitizer (automeris.io), web version 5"
NA_DOC = "NA+A1:2020 to BS EN 1991-2:2003"
PD_DOC = "PD 6688-2:2011"


JSON_NUMBER = re.compile(r"-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?")


class Num(float):
    """A number that remembers its text in the CSV, so it is written out unchanged."""

    def __new__(cls, text):
        text = text.strip()
        if not JSON_NUMBER.fullmatch(text):
            raise SystemExit(f"not a plain number: {text!r}")
        n = super().__new__(cls, text)
        n.raw = text
        return n


def read_xy(name):
    path = os.path.join(HERE, name)
    pts = []
    with open(path, newline="") as fh:
        for i, row in enumerate(csv.reader(fh), start=1):
            if not row or not "".join(row).strip():
                continue
            if len(row) != 2:
                raise SystemExit(f"{name} row {i}: expected two values, got {row}")
            x, y = (Num(v) for v in row)
            if not (math.isfinite(x) and math.isfinite(y)):
                raise SystemExit(f"{name} row {i}: not a finite number: {row}")
            pts.append([x, y])
    if len(pts) < 2:
        raise SystemExit(f"{name}: fewer than two points")
    return pts


def check_increasing(name, pts, allow_equal_first=False):
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        if dx > 0 or (dx == 0 and allow_equal_first and i == 1):
            continue
        raise SystemExit(f"{name}: x does not increase at point {i + 1} ({pts[i - 1][0]} -> {pts[i][0]})")


def source(figure, x, y, accuracy, extra=None):
    s = {
        "document": NA_DOC,
        "figure": figure,
        "x": x,
        "y": y,
        "digitisingTool": TOOL,
        "digitisedBy": DIGITISED_BY,
        "date": DATE,
        "readingAccuracy": accuracy,
        "axes": "linear",
        "note": "Values as digitised by the author, not copied from the standard. Check against the figure before relying on them.",
    }
    if extra:
        s.update(extra)
    return s


def write_json(name, obj):
    path = os.path.join(DATA, name)
    def mark(o):  # digitised numbers go out as their CSV text, via a placeholder string
        if isinstance(o, Num):
            return f"@@{o.raw}@@"
        if isinstance(o, dict):
            return {k: mark(v) for k, v in o.items()}
        if isinstance(o, list):
            return [mark(v) for v in o]
        return o

    text = json.dumps(mark(obj), indent=2, ensure_ascii=False)
    text = re.sub(r'"@@([^@"]+)@@"', r"\1", text)
    # One [x, y] pair per line, as Prettier formats it (npm run lint checks src/data).
    text = re.sub(r"\[\s+([-\d.eE+]+),\s+([-\d.eE+]+)\s+\]", r"[\1, \2]", text)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text + "\n")
    print(f"wrote {os.path.relpath(path, ROOT)}")


# --- Figure NA.8: k(f_v) -------------------------------------------------------------
k_curves = {}
for activity in ("walking", "jogging"):
    name = f"na8_{activity}.csv"
    pts = read_xy(name)
    check_increasing(name, pts)
    k_curves[activity] = {"file": name, "points": pts}
write_json(
    "k_fv.json",
    {
        "source": source(
            "Figure NA.8 (clause NA.2.44.4)",
            "Mode frequency f_v (Hz)",
            "Combined population and harmonic factor k(f_v)",
            "k ±0.02",
            {"outsideRange": "k = 0 outside the digitised frequency range (SPEC §2.4)"},
        ),
        "curves": k_curves,
    },
)

# --- Figure NA.9: gamma ----------------------------------------------------------------
groups = []
for path in glob.glob(os.path.join(HERE, "na9_Seff_*.csv")):
    name = os.path.basename(path)
    seff = float(re.fullmatch(r"na9_Seff_(\d+)\.csv", name).group(1))
    pts = read_xy(name)
    check_increasing(name, pts)
    groups.append({"Seff": seff, "file": name, "points": pts})
groups.sort(key=lambda g: g["Seff"])
crowd = read_xy("na9_crowd.csv")
check_increasing("na9_crowd.csv", crowd)
write_json(
    "gamma.json",
    {
        "source": source(
            "Figure NA.9 (clauses NA.2.44.4 and NA.2.44.5)",
            "Structural damping, logarithmic decrement delta",
            "Reduction factor gamma",
            "gamma ±0.01",
            {
                "groupsNote": "One curve per effective span Seff (m), solid lines. Seff is taken from the curve label.",
                "crowdNote": "Crowd loading curve (dashed line).",
                "digitisingNote": "Added at conversion: the first Seff 30 point is at delta = -0.0002, a reading error of the curve start at delta = 0; kept as digitised.",
            },
        ),
        "groups": groups,
        "crowd": {"file": "na9_crowd.csv", "points": crowd},
    },
)

# --- Figure NA.11: lateral stability boundary ------------------------------------------
boundary = read_xy("na11_boundary.csv")
check_increasing("na11_boundary.csv", boundary, allow_equal_first=True)
write_json(
    "lateral_boundary.json",
    {
        "source": source(
            "Figure NA.11 (clause NA.2.44.7)",
            "Frequency of lateral mode f (Hz)",
            "Pedestrian mass damping parameter D",
            "D ±0.02",
            {
                "regions": "Below the boundary: unstable. Above: stable.",
                "reliableRangeHz": [0.5, 1.1],
                "reliableRangeNote": "The figure's note says test data cover lateral frequencies of 0.5 to 1.1 Hz only; the boundary outside that range is theoretical (dashed in the figure) and should be used with caution.",
                "digitisingNote": "The first two points share f = 0.171 Hz: the curve is vertical where it leaves the top of the plot at D = 2.",
                "status": "Form of D = m_bridge·ζ/m_pedestrian and the 1.5 Hz threshold checked against NA+A1:2020 (NA.2.44.7). Used from milestone M5.",
            },
        ),
        "boundary": {"file": "na11_boundary.csv", "points": boundary},
    },
)

# --- PD 6688-2 Figure A.4: Psi, for validation case PD1 --------------------------------
for activity, tag, line in (("walking", "walk", "solid"), ("jogging", "jog", "dashed")):
    rows = []
    for path in sorted(glob.glob(os.path.join(HERE, f"pd_figA4_{tag}_d*.csv"))):
        name = os.path.basename(path)
        # File d002 is the curve labelled delta = 0,02 in Figure A.4 (and so on).
        digits = re.fullmatch(rf"pd_figA4_{tag}_d(\d+)\.csv", name).group(1)
        delta = int(digits) / 10 ** (len(digits) - 1)
        pts = read_xy(name)
        check_increasing(name, pts)
        rows += [(delta, x, y) for x, y in pts]
    out = os.path.join(HERE, f"pd_figA4_{activity}.csv")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"# Source: {PD_DOC}, Figure A.4, dynamic response factor Psi, {activity} ({line} lines)\n")
        fh.write(f"# Digitised by {DIGITISED_BY}, {DATE}, with {TOOL}. Linear axes.\n")
        fh.write("# Curve parameter delta = logarithmic decrement, from the curve labels. x = main span (m).\n")
        fh.write("# Estimated reading accuracy: Psi ±1. Generated by convert.py from pd_figA4_" + tag + "_d0*.csv.\n")
        fh.write("delta,S_m,psi\n")
        for d, x, y in rows:
            fh.write(f"{d},{x.raw},{y.raw}\n")
    print(f"wrote {os.path.relpath(out, ROOT)}")
