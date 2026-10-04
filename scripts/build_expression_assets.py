from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
CELL_SIZE = (192, 208)
SHEET_SIZE = (1536, 1024)

PETS = {
    "bixia": {
        "source": ROOT / "artwork" / "emotions" / "bixia-expression-sheet-greenscreen.png",
        "labels": ["idle", "food", "steal", "brush-no", "short-hug", "escape", "destroy", "innocent"],
    },
    "tiger": {
        "source": ROOT / "artwork" / "emotions" / "tiger-expression-sheet-greenscreen.png",
        "labels": ["human-sit", "pitiful", "cuddle", "scheming", "open-door", "hide", "computer", "lick"],
    },
}


def remove_green_screen(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    green_excess = np.minimum(green - red, green - blue)

    strong_key = (green > 140) & (green_excess > 55)
    expanded = np.asarray(
        Image.fromarray((strong_key * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    edge_key = expanded & ~strong_key & (green_excess > 12)

    alpha = rgba[:, :, 3].astype(np.int16)
    alpha[strong_key] = 0
    edge_alpha = 255 - np.clip((green_excess - 12) * 255 / 43, 0, 255)
    alpha[edge_key] = np.minimum(alpha[edge_key], edge_alpha[edge_key].astype(np.int16))

    edge_color = edge_key & (alpha > 0)
    neutral_green = np.maximum(red, blue) + 8
    rgba[:, :, 1][edge_color] = np.minimum(green[edge_color], neutral_green[edge_color]).astype(np.uint8)
    rgba[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def zero_runs(occupied: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, is_occupied in enumerate(occupied):
        if not is_occupied and start is None:
            start = index
        elif is_occupied and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(occupied)))
    return runs


def find_row_slices(alpha: np.ndarray, top: int, bottom: int) -> list[tuple[int, int]]:
    occupied = (alpha[top:bottom] > 20).any(axis=0)
    gaps = zero_runs(occupied)
    separators: list[int] = []
    for target in (384, 768, 1152):
        candidates = []
        for left, right in gaps:
            midpoint = (left + right) / 2
            if target - 190 <= midpoint <= target + 190 and right - left >= 3:
                score = (right - left) - abs(midpoint - target) * 0.08
                candidates.append((score, int(midpoint)))
        separators.append(max(candidates)[1] if candidates else target)

    if not separators[0] < separators[1] < separators[2]:
        raise RuntimeError(f"Could not find four ordered poses in row {top}:{bottom}: {separators}")
    edges = [0, *separators, alpha.shape[1]]
    return list(zip(edges, edges[1:]))


def fit_pose(pose: Image.Image) -> Image.Image:
    bbox = pose.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("Expression pose is empty after chroma removal")
    left, top, right, bottom = bbox
    left = max(0, left - 6)
    top = max(0, top - 6)
    right = min(pose.width, right + 6)
    bottom = min(pose.height, bottom + 6)
    cropped = pose.crop((left, top, right, bottom))
    scale = min(184 / cropped.width, 198 / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", CELL_SIZE, (0, 0, 0, 0))
    x = (CELL_SIZE[0] - resized.width) // 2
    y = CELL_SIZE[1] - resized.height - 5
    frame.alpha_composite(resized, (x, y))
    return frame


def make_contact_sheet(frames: list[Image.Image], labels: list[str], output: Path) -> None:
    tile_w, tile_h = 240, 250
    sheet = Image.new("RGBA", (tile_w * 4, tile_h * 2), (238, 242, 247, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (frame, label) in enumerate(zip(frames, labels, strict=True)):
        col, row = index % 4, index // 4
        x = col * tile_w + (tile_w - CELL_SIZE[0]) // 2
        y = row * tile_h + 8
        sheet.alpha_composite(frame, (x, y))
        draw.text((col * tile_w + 12, row * tile_h + 224), f"{index + 1}. {label}", fill=(37, 49, 66, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output, quality=94)


def build_pet(pet_id: str, config: dict[str, object]) -> None:
    source = Path(config["source"])
    labels = list(config["labels"])
    image = Image.open(source).convert("RGBA")
    if image.size != SHEET_SIZE:
        raise RuntimeError(f"{source} is {image.size}, expected {SHEET_SIZE}")

    cleaned = remove_green_screen(image)
    alpha = np.asarray(cleaned.getchannel("A"))
    frames: list[Image.Image] = []
    for row, (top, bottom) in enumerate(((0, 512), (512, 1024))):
        for left, right in find_row_slices(alpha, top, bottom):
            frames.append(fit_pose(cleaned.crop((left, top, right, bottom))))

    if len(frames) != 8:
        raise RuntimeError(f"{pet_id} produced {len(frames)} frames, expected 8")

    atlas = Image.new("RGBA", (CELL_SIZE[0] * 8, CELL_SIZE[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * CELL_SIZE[0], 0))

    pet_dir = ROOT / "pets" / pet_id
    pet_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(pet_dir / "expressions.webp", format="WEBP", lossless=True, method=6)
    make_contact_sheet(frames, labels, ROOT / "previews" / f"{pet_id}-expressions-contact-sheet.png")
    print(f"{pet_id}: built {len(frames)} expressions -> {pet_dir / 'expressions.webp'}")


def main() -> None:
    for pet_id, config in PETS.items():
        build_pet(pet_id, config)


if __name__ == "__main__":
    main()
