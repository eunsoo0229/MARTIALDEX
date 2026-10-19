"""Tile the frames written by extract_frames.py into one contact sheet per fixture."""
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHEETS = os.path.join(ROOT, ".devtools", "fixtures-form", "sheets")
FRAMES = os.path.join(SHEETS, "_frames")

with open(os.path.join(FRAMES, "decoded.json")) as fh:
    decoded = json.load(fh)
W, H = 320, 240
for name, info in decoded.items():
    picks = info["frames_picked"]
    sheet = Image.new("RGB", (W * len(picks), H + 22), "white")
    d = ImageDraw.Draw(sheet)
    d.text((6, H + 5), f"{name}  ({info['frames']} f @ {info['fps']} fps, {info['size'][0]}x{info['size'][1]})", fill=(0, 0, 0))
    for i, f in enumerate(picks):
        im = Image.open(os.path.join(FRAMES, f"{name}_{f:03d}.png")).convert("RGB").resize((W, H))
        sheet.paste(im, (i * W, 0))
        d.rectangle([i * W, 0, i * W + 52, 14], fill=(255, 255, 255))
        d.text((i * W + 3, 2), f"f{f}", fill=(200, 0, 0))
    sheet.save(os.path.join(SHEETS, f"{name}.png"))
    print("sheet", name)
