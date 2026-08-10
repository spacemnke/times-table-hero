#!/usr/bin/env python3
"""Generate app icons for Times Table Hero (no external assets)."""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)

BRAND = (108, 76, 224)   # #6c4ce0
PINK = (255, 92, 138)    # #ff5c8a


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    """Diagonal purple->pink gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = lerp(BRAND, PINK, t)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def load_font(size):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_star(d, cx, cy, r, color, rot=-math.pi / 2):
    pts = []
    for i in range(10):
        ang = rot + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, fill=color)


def make(size, pad_ratio=0.0, radius_ratio=0.22):
    """pad_ratio > 0 keeps art inside a safe zone (for maskable icons)."""
    bg = gradient(size)
    d = ImageDraw.Draw(bg, "RGBA")

    inset = int(size * pad_ratio)
    art = size - 2 * inset
    cx = size / 2

    # big multiplication cross made of two rounded bars
    bar_len = art * 0.52
    bar_w = art * 0.135
    white = (255, 255, 255, 255)
    for ang in (45, -45):
        bar = Image.new("RGBA", (int(bar_len), int(bar_w)), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar)
        bd.rounded_rectangle([0, 0, bar_len - 1, bar_w - 1], radius=bar_w / 2, fill=white)
        bar = bar.rotate(ang, expand=True, resample=Image.BICUBIC)
        bg.paste(bar, (int(cx - bar.width / 2), int(size / 2 - bar.height / 2)), bar)

    # little sparkle stars
    d2 = ImageDraw.Draw(bg, "RGBA")
    draw_star(d2, inset + art * 0.20, inset + art * 0.20, art * 0.075, (255, 255, 255, 235))
    draw_star(d2, inset + art * 0.82, inset + art * 0.24, art * 0.05, (255, 255, 255, 200))
    draw_star(d2, inset + art * 0.80, inset + art * 0.80, art * 0.065, (255, 255, 255, 220))

    # rounded corners (skip for maskable -> full bleed square is fine)
    if radius_ratio > 0:
        mask = rounded_mask(size, int(size * radius_ratio))
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        return out
    return bg.convert("RGBA")


# Standard icons (rounded, transparent corners)
make(192).save(os.path.join(OUT, "icon-192.png"))
make(512).save(os.path.join(OUT, "icon-512.png"))

# Maskable: full-bleed square with generous safe padding
make(512, pad_ratio=0.16, radius_ratio=0.0).save(os.path.join(OUT, "icon-512-maskable.png"))

# Apple touch icon: iOS masks corners itself, so flat square, opaque background
apple = make(180, radius_ratio=0.0).convert("RGB")
apple.save(os.path.join(OUT, "apple-touch-icon.png"))

# Favicon-ish
make(32).save(os.path.join(OUT, "icon-192.png").replace("icon-192", "favicon-32"))

print("icons written to", OUT)
for f in sorted(os.listdir(OUT)):
    print(" ", f, os.path.getsize(os.path.join(OUT, f)), "bytes")
