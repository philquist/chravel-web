#!/usr/bin/env python3
"""
Generate Chravel's Build-a-Brand kit (deterministic, in-repo).

Produces, into appstore/brand/:
  - palette.png       : the color system as labeled swatches (exact hexes)
  - brand-sheet.png    : one-page brand sheet (logo + palette + type + voice)
  - logo-primary.png   : canonical primary lockup (copied from public/)
  - icon.png           : app-icon mark (copied from public/)

This is the local, reproducible companion to the Pika "Build-a-Brand" skill
(see appstore/PIKA_FOUNDER_KIT.md). It locks every asset to Chravel's premium
dark/gold tokens so the kit stays on-brand without manual color picking.

Usage:  python3 appstore/scripts/generate_brand_kit.py
"""

import os
import shutil

from PIL import Image, ImageDraw, ImageFont

# --- Brand tokens (source of truth: chravel-design-language skill) -----------
BG_PRIMARY = "#0A0A0A"   # near-black, primary background
BG_WARM = "#1A1207"      # warm dark variant
BG_COOL = "#0D1117"      # cool dark variant
BG_RICH = "#170D06"      # rich dark variant
GOLD = "#c49746"         # gold primary (accents, brand marks, CTAs)
GOLD_GLOW = "#e8af48"    # gold glow / highlight
WHITE = "#FFFFFF"        # headline text
GRAY = "#9CA3AF"         # secondary text (gray-400)

PALETTE = [
    ("Near-black", BG_PRIMARY, "Primary background. Dark-first, always.", WHITE),
    ("Warm dark", BG_WARM, "Warm surface variant.", WHITE),
    ("Cool dark", BG_COOL, "Cool surface variant.", WHITE),
    ("Rich dark", BG_RICH, "Rich surface variant.", WHITE),
    ("Gold", GOLD, "Primary brand color. CTAs + marks. Use sparingly.", "#0A0A0A"),
    ("Gold glow", GOLD_GLOW, "Highlight / hover / glow accent.", "#0A0A0A"),
    ("White", WHITE, "Headlines + primary text on dark.", "#0A0A0A"),
    ("Gray", GRAY, "Secondary / supporting text.", "#0A0A0A"),
]

# --- Paths -------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "appstore", "brand")
LOGO_SRC = os.path.join(ROOT, "public", "chravel-logo.png")
ICON_SRC = os.path.join(ROOT, "public", "chravel-icon.png")

# DejaVu ships with the runner and matches the existing screenshot pipeline.
FONT_PATHS_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]
FONT_PATHS_REG = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]


def _find(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def font(size, bold=True):
    path = _find(FONT_PATHS_BOLD if bold else FONT_PATHS_REG)
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# --- Palette sheet -----------------------------------------------------------
def build_palette(path):
    W, cell_h, pad = 1600, 150, 40
    H = pad * 2 + cell_h * len(PALETTE) + 120
    img = Image.new("RGB", (W, H), hex_to_rgb(BG_PRIMARY))
    d = ImageDraw.Draw(img)

    d.text((pad, pad), "CHRAVEL — COLOR SYSTEM", font=font(54), fill=hex_to_rgb(GOLD))
    d.text((pad, pad + 64), "Premium dark / gold. Gold is reserved for CTAs + brand marks.",
           font=font(26, bold=False), fill=hex_to_rgb(GRAY))

    y = pad + 120
    for name, hex_val, usage, label_color in PALETTE:
        swatch_w = 520
        d.rounded_rectangle([pad, y, pad + swatch_w, y + cell_h - 16], radius=18,
                            fill=hex_to_rgb(hex_val), outline=hex_to_rgb(GRAY), width=1)
        d.text((pad + 30, y + 28), hex_val.upper(), font=font(40), fill=hex_to_rgb(label_color))
        tx = pad + swatch_w + 50
        d.text((tx, y + 18), name, font=font(40), fill=hex_to_rgb(WHITE))
        d.text((tx, y + 74), usage, font=font(26, bold=False), fill=hex_to_rgb(GRAY))
        y += cell_h

    img.save(path)
    return img.size


# --- One-page brand sheet ----------------------------------------------------
def build_brand_sheet(path):
    W, H = 1600, 2200
    img = Image.new("RGB", (W, H), hex_to_rgb(BG_PRIMARY))
    d = ImageDraw.Draw(img)
    pad = 80

    # Header
    d.text((pad, 70), "CHRAVEL", font=font(96), fill=hex_to_rgb(GOLD))
    d.text((pad, 190), "Brand Sheet", font=font(40, bold=False), fill=hex_to_rgb(GRAY))
    d.text((pad, 250), "Travel together, organized.", font=font(34), fill=hex_to_rgb(WHITE))

    # Primary lockup (existing logo on its native dark, framed)
    y = 360
    if os.path.exists(LOGO_SRC):
        logo = Image.open(LOGO_SRC).convert("RGB")
        target_w = W - pad * 2
        ratio = target_w / logo.width
        logo = logo.resize((target_w, int(logo.height * ratio)))
        d.rounded_rectangle([pad - 8, y - 8, pad + target_w + 8, y + logo.height + 8],
                            radius=24, outline=hex_to_rgb(GOLD), width=2)
        img.paste(logo, (pad, y))
        y += logo.height + 50
    d.text((pad, y), "PRIMARY LOCKUP — gold mark on near-black (#0A0A0A)",
           font=font(26, bold=False), fill=hex_to_rgb(GRAY))
    y += 70

    # Palette strip
    d.text((pad, y), "COLOR", font=font(40), fill=hex_to_rgb(GOLD)); y += 64
    sw = (W - pad * 2 - 7 * 16) // 8
    for i, (_, hex_val, _, _) in enumerate(PALETTE):
        x = pad + i * (sw + 16)
        d.rounded_rectangle([x, y, x + sw, y + sw], radius=14,
                            fill=hex_to_rgb(hex_val), outline=hex_to_rgb(GRAY), width=1)
        d.text((x, y + sw + 8), hex_val.upper().replace("#", ""),
               font=font(18, bold=False), fill=hex_to_rgb(GRAY))
    y += sw + 70

    # Type system
    d.text((pad, y), "TYPE", font=font(40), fill=hex_to_rgb(GOLD)); y += 64
    d.text((pad, y), "Headline — Bold, white, tight.", font=font(56), fill=hex_to_rgb(WHITE)); y += 80
    d.text((pad, y), "Descriptor — gold, supporting the verb.", font=font(38), fill=hex_to_rgb(GOLD)); y += 64
    d.text((pad, y), "Body — regular, gray, calm and spacious.",
           font=font(30, bold=False), fill=hex_to_rgb(GRAY)); y += 90

    # Voice
    d.text((pad, y), "VOICE", font=font(40), fill=hex_to_rgb(GOLD)); y += 64
    dos = ["Short, declarative, benefit-first.", "Action verbs. Calm confidence.",
           "A well-traveled friend with the logistics handled."]
    donts = ["No exclamation spam.", "No loud / gimmicky hype.",
             "Never gold on bright backgrounds."]
    col2 = W // 2
    d.text((pad, y), "DO", font=font(30), fill=hex_to_rgb(GOLD_GLOW))
    d.text((col2, y), "DON'T", font=font(30), fill=hex_to_rgb(GRAY)); y += 50
    for i in range(3):
        d.text((pad, y + i * 46), f"+  {dos[i]}", font=font(26, bold=False), fill=hex_to_rgb(WHITE))
        d.text((col2, y + i * 46), f"-  {donts[i]}", font=font(26, bold=False), fill=hex_to_rgb(GRAY))

    img.save(path)
    return img.size


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Copy canonical marks as source-of-truth into the brand folder.
    if os.path.exists(LOGO_SRC):
        shutil.copy(LOGO_SRC, os.path.join(OUT_DIR, "logo-primary.png"))
    if os.path.exists(ICON_SRC):
        shutil.copy(ICON_SRC, os.path.join(OUT_DIR, "icon.png"))

    p1 = os.path.join(OUT_DIR, "palette.png")
    p2 = os.path.join(OUT_DIR, "brand-sheet.png")
    s1 = build_palette(p1)
    s2 = build_brand_sheet(p2)
    print(f"palette.png      {s1}")
    print(f"brand-sheet.png  {s2}")
    print(f"logo-primary.png + icon.png copied -> {OUT_DIR}")


if __name__ == "__main__":
    main()
