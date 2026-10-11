"""Cut the monanimal cast sheet (five characters on white) into a sprite atlas.

python tools/cut_cast.py notes/lore-art/monanimals.png
Writes packages/client/public/sprites/monanimals.webp and .json, frames in sheet order:
molandak, moyaki, mouch, salmonad, mongrod.
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAMES = ["molandak", "moyaki", "mouch", "salmonad", "mongrod"]
FRAME = 300

src = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(src).astype(int)

# background = near-white connected to the image border; keeps white inside the art
white = a.min(axis=2) >= 228
lab, _ = ndimage.label(white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
fg = ~bg

# the five biggest figure blobs, left to right (small bits like wings join via closing)
close = max(1, min(fg.shape) // 250)  # small gaps only; scales with the sheet size
blobs, n = ndimage.label(ndimage.binary_closing(fg, iterations=close))
sizes = ndimage.sum(fg, blobs, range(1, n + 1))
boxes = ndimage.find_objects(blobs)
keep = sorted((int(i) + 1 for i in np.argsort(sizes)[::-1][: len(NAMES)]), key=lambda b: boxes[b - 1][1].start)
if len(keep) < len(NAMES):
    sys.exit(f"found {len(keep)} figures, expected {len(NAMES)}")

alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
rgba = src.convert("RGBA")
rgba.putalpha(alpha)

atlas = Image.new("RGBA", (FRAME * len(NAMES), FRAME), (0, 0, 0, 0))
frames = {}
for i, (name, b) in enumerate(zip(NAMES, keep)):
    sy, sx = boxes[b - 1]
    cut = rgba.crop((sx.start, sy.start, sx.stop, sy.stop))
    mask = Image.fromarray(((blobs[sy, sx] == b) * 255).astype(np.uint8))
    cut.putalpha(Image.fromarray(np.minimum(np.asarray(cut.getchannel("A")), np.asarray(mask))))
    scale = min((FRAME - 10) / cut.width, (FRAME - 10) / cut.height)
    cut = cut.resize((int(cut.width * scale), int(cut.height * scale)), Image.LANCZOS)
    atlas.alpha_composite(cut, (i * FRAME + (FRAME - cut.width) // 2, FRAME - cut.height - 4))
    frames[name] = {"x": i * FRAME, "y": 0, "w": FRAME, "h": FRAME}
    print(name, cut.size)

out = ROOT / "packages/client/public/sprites"
atlas.save(out / "monanimals.webp", "WEBP", quality=90, method=6)  # WebP: a fifth of the PNG size
json.dump({"frames": frames, "source": sys.argv[1]}, open(out / "monanimals.json", "w"), indent=1)
print("wrote", out / "monanimals.webp")
