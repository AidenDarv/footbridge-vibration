"""Draw the digitised points over the author's screenshots of the figures (SPEC §5 step 4).

Reads the converted data (src/data/*.json and pd_figA4_*.csv), so the overlay checks what
the tool actually uses. Writes overlay_<figure>.png in this folder.

The screenshots and overlays show figures from BSI publications, so they are gitignored
and must not be committed (CLAUDE.md, SPEC §5 step 5).

Pixel calibration: the plot frame and major gridlines were located in each screenshot
(dark-pixel line detection), and each axis is mapped linearly between two gridlines.
If a screenshot is replaced, re-measure CAL below. The overlay draws the calibration
gridlines in blue, so a calibration error shows as a blue line off the printed gridline.

Needs Pillow.  Run from the repo root:  python validation/digitising/overlay.py
"""
import csv
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "..", "src", "data"))

# figure: (x0 value, x0 px, x1 value, x1 px, y0 value, y0 px, y1 value, y1 px, check lines)
CAL = {
    "na8": (0, 168.5, 8, 765.5, 0, 372.5, 1.4, 59.5,
            ([1, 2, 3, 4, 5, 6, 7], [0.2, 0.4, 0.6, 0.8, 1.0, 1.2])),
    "na9": (0, 154, 0.2, 642, 0, 683, 0.8, 190,
            ([0.04, 0.08, 0.12, 0.16], [0.2, 0.4, 0.6])),
    "na11": (0, 215, 1.8, 712.5, 0, 605, 2, 50.5,
             ([0.4, 0.8, 1.2, 1.6], [0.4, 0.8, 1.2, 1.6])),
    "pd_figA4": (0, 169, 50, 572, 0, 592, 60, 52,
                 ([10, 20, 30, 40], [10, 34, 40, 50])),
}

COLOURS = ["#e6194b", "#3cb44b", "#f58231", "#911eb4", "#46f0f0", "#f032e6",
           "#008080", "#9a6324", "#800000", "#808000", "#000075"]


def mapper(c):
    x0, px0, x1, px1, y0, py0, y1, py1, _ = c
    return lambda x, y: (px0 + (x - x0) * (px1 - px0) / (x1 - x0),
                         py0 + (y - y0) * (py1 - py0) / (y1 - y0))


def draw(fig, series, out):
    img = Image.open(os.path.join(HERE, f"{fig}.png")).convert("RGB")
    d = ImageDraw.Draw(img)
    to_px = mapper(CAL[fig])
    xs, ys = CAL[fig][8]
    x0, x1 = CAL[fig][0], CAL[fig][2]
    y0, y1 = CAL[fig][4], CAL[fig][6]
    for gx in xs:  # calibration check lines
        d.line([to_px(gx, y0), to_px(gx, y1)], fill="#1f6feb", width=1)
    for gy in ys:
        d.line([to_px(x0, gy), to_px(x1, gy)], fill="#1f6feb", width=1)
    legend_y = 8
    for i, (label, pts) in enumerate(series):
        col = COLOURS[i % len(COLOURS)]
        px = [to_px(x, y) for x, y in pts]
        d.line(px, fill=col, width=1)
        for (u, v) in px:
            d.ellipse([u - 2.5, v - 2.5, u + 2.5, v + 2.5], outline=col, width=1)
        tw = d.textlength(label)
        W = img.width
        d.rectangle([W - tw - 30, legend_y - 1, W - 4, legend_y + 11], fill="white")
        d.line([W - tw - 26, legend_y + 5, W - tw - 12, legend_y + 5], fill=col, width=2)
        d.text((W - tw - 8, legend_y), label, fill=col)
        legend_y += 13
    img.save(os.path.join(HERE, out))
    print(f"wrote {out}")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


k = load("k_fv.json")
draw("na8", [(a, c["points"]) for a, c in k["curves"].items()], "overlay_na8.png")

g = load("gamma.json")
draw("na9", [(f"Seff {gr['Seff']:g}", gr["points"]) for gr in g["groups"]]
     + [("crowd", g["crowd"]["points"])], "overlay_na9.png")

b = load("lateral_boundary.json")
draw("na11", [("boundary", b["boundary"]["points"])], "overlay_na11.png")

series = []
for activity in ("walking", "jogging"):
    curves = {}
    with open(os.path.join(HERE, f"pd_figA4_{activity}.csv"), encoding="utf-8") as fh:
        rows = [r for r in csv.reader(fh) if r and not r[0].startswith("#")][1:]
    for d_, x, y in rows:
        curves.setdefault(float(d_), []).append((float(x), float(y)))
    series += [(f"{activity} d={d_:g}", pts) for d_, pts in sorted(curves.items())]
draw("pd_figA4", series, "overlay_pd_figA4.png")
