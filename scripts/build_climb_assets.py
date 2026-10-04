"""Build gripping/pulling poses with explicit contact-point metadata."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from build_expression_assets import remove_green_screen, zero_runs, find_row_slices

ROOT = Path(__file__).resolve().parents[1]
layouts = {}
for pet in ("bixia", "tiger"):
    source = remove_green_screen(Image.open(ROOT / "artwork" / f"{pet}-climb.png"))
    alpha = np.asarray(source.getchannel("A"))
    gaps = zero_runs((alpha > 70).sum(axis=1) > 8)
    options = [(right - left - abs((right + left) / 2 - 512) * .15, (right + left) // 2)
               for left, right in gaps if abs((right + left) / 2 - 512) < 85 and right - left > 3]
    mid = max(options)[1] if options else 512
    tiles = []
    for top, bottom in ((0, mid), (mid, source.height)):
        for left, right in find_row_slices(alpha, top, bottom):
            tile = source.crop((left, top, right, bottom))
            a = np.asarray(tile.getchannel("A"))
            ys, xs = np.where(a > 100)
            near = np.argmin((xs - tile.width / 2) ** 2 + (ys - tile.height / 2) ** 2)
            mask = Image.fromarray(np.where(a > 70, 255, 0).astype(np.uint8)).copy()
            ImageDraw.floodfill(mask, (int(xs[near]), int(ys[near])), 128)
            main = Image.fromarray(np.where(np.asarray(mask) == 128, 255, 0).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
            tile.putalpha(Image.fromarray(np.minimum(a, np.asarray(main))))
            tiles.append(tile.crop(tile.getchannel("A").getbbox()))
    scale = min(176 / max(t.width for t in tiles), 180 / max(t.height for t in tiles))
    atlas = Image.new("RGBA", (1536, 208))
    contact = Image.new("RGBA", (768, 416), "#edf2f7")
    layout = []
    for i, tile in enumerate(tiles):
        pose = tile.resize((round(tile.width * scale), round(tile.height * scale)), Image.Resampling.LANCZOS)
        x = (192 - pose.width) // 2
        y = 18 if i in (2, 3, 4, 5) else 198 - pose.height
        frame = Image.new("RGBA", (192, 208))
        frame.alpha_composite(pose, (x, y))
        atlas.alpha_composite(frame, (i * 192, 0))
        contact.alpha_composite(frame, ((i % 4) * 192, (i // 4) * 208))
        grip_y = y + 3 if i in (2, 3, 4) else (y + round(pose.height * .38) if i == 5 else 198)
        layout.append({"sideX": x + pose.width - 4, "gripY": grip_y, "footY": 198})
    atlas.save(ROOT / "pets" / pet / "climbing.webp", lossless=True)
    contact.convert("RGB").save(ROOT / "previews" / f"{pet}-climb-contact.png")
    layouts[pet] = layout
    print(f"{pet}: 8 climbing poses and contact anchors")
(ROOT / "pets" / "climb-layout.js").write_text("const CLIMB_LAYOUT = " + json.dumps(layouts) + ";\n", encoding="utf-8")
