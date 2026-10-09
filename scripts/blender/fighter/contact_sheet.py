"""Tile PNGs into one contact sheet: python3 contact_sheet.py out.png a.png b.png ..."""
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert("RGB") for f in files]
h = 600
ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
cols = min(4, len(ims))
rows = (len(ims) + cols - 1) // cols
w = max(im.width for im in ims)
sheet = Image.new("RGB", (w * cols, h * rows), "white")
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    d.text((x + 6, y + 6), f.split("/")[-1], fill=(200, 0, 0))
sheet.save(out)
