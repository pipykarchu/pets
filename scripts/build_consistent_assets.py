"""Build all browser poses from one consistent character sheet per pet."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from build_expression_assets import remove_green_screen, zero_runs, find_row_slices

ROOT = Path(__file__).resolve().parents[1]
CELL = (192, 208)


def isolate_character(tile):
    tile = tile.copy()
    alpha = np.asarray(tile.getchannel("A"))
    ys, xs = np.where(alpha > 100)
    if not len(xs):
        raise ValueError("Empty character cell")
    closest = np.argmin((xs - tile.width / 2) ** 2 + (ys - tile.height / 2) ** 2)
    mask = Image.fromarray(np.where(alpha > 70, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(mask, (int(xs[closest]), int(ys[closest])), 128)
    main = Image.fromarray(np.where(np.asarray(mask) == 128, 255, 0).astype(np.uint8))
    main = main.filter(ImageFilter.MaxFilter(7))
    tile.putalpha(Image.fromarray(np.minimum(alpha, np.asarray(main))))
    return tile


for pet in ("bixia", "tiger"):
    source = remove_green_screen(Image.open(ROOT / "artwork" / f"{pet}-consistent.png"))
    alpha = np.asarray(source.getchannel("A"))
    gaps = zero_runs((alpha > 70).sum(axis=1) > 8)
    row_edges = [0]
    for expected in (384, 768, 1152):
        choices = [(right - left - abs((left + right) / 2 - expected) * 0.15,
                    (left + right) // 2) for left, right in gaps
                   if abs((left + right) / 2 - expected) < 100 and right - left > 3]
        row_edges.append(max(choices)[1] if choices else expected)
    row_edges.append(source.height)
    tiles = []
    for row in range(4):
        top, bottom = row_edges[row:row + 2]
        for left, right in find_row_slices(alpha, top, bottom):
            tiles.append(isolate_character(source.crop((left, top, right, bottom))))
    boxes = [tile.getchannel("A").getbbox() for tile in tiles]
    scale = min(178 / max(b[2] - b[0] for b in boxes), 188 / max(b[3] - b[1] for b in boxes))
    frames = []
    for tile, box in zip(tiles, boxes):
        crop = tile.crop(box)
        crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", CELL)
        frame.alpha_composite(crop, ((CELL[0] - crop.width) // 2, 198 - crop.height))
        frames.append(frame)
    motion = Image.new("RGBA", (CELL[0] * 8, CELL[1] * 2))
    for row in range(2):
        for col in range(8):
            motion.alpha_composite(frames[row * 4 + col % 4], (col * CELL[0], row * CELL[1]))
    expression = Image.new("RGBA", (CELL[0] * 8, CELL[1]))
    for i in range(8):
        expression.alpha_composite(frames[8 + i], (i * CELL[0], 0))
    motion.save(ROOT / "pets" / pet / "locomotion.webp", lossless=True)
    expression.save(ROOT / "pets" / pet / "expressions.webp", lossless=True)
    contact = Image.new("RGBA", (CELL[0] * 4, CELL[1] * 4), "#edf2f7")
    for i, frame in enumerate(frames):
        contact.alpha_composite(frame, ((i % 4) * CELL[0], (i // 4) * CELL[1]))
    contact.convert("RGB").save(ROOT / "previews" / f"{pet}-consistent-contact.png")
    cycle = []
    for i in range(4):
        bg = Image.new("RGBA", (384, 220), "#edf2f7")
        bg.alpha_composite(frames[i], (0, 0))
        bg.alpha_composite(frames[4 + i], (192, 0))
        cycle.append(bg.convert("RGB"))
    cycle[0].save(ROOT / "previews" / f"{pet}-walk-run.gif", save_all=True,
                  append_images=cycle[1:], duration=150, loop=0, disposal=2)
    print(f"{pet}: 4 walk / 4 run / 8 expression poses, unified scale {scale:.3f}")
