from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


CELL_W = 192
CELL_H = 208
COLS = 8
ROWS = 9


@dataclass(frozen=True)
class RowSpec:
    state: str
    row: int
    frames: int
    durations: list[int]


ROW_SPECS = [
    RowSpec("idle", 0, 6, [280, 110, 110, 140, 140, 320]),
    RowSpec("running-right", 1, 8, [120, 120, 120, 120, 120, 120, 120, 220]),
    RowSpec("running-left", 2, 8, [120, 120, 120, 120, 120, 120, 120, 220]),
    RowSpec("waving", 3, 4, [140, 140, 140, 280]),
    RowSpec("jumping", 4, 5, [140, 140, 140, 140, 280]),
    RowSpec("failed", 5, 8, [140, 140, 140, 140, 140, 140, 140, 240]),
    RowSpec("waiting", 6, 6, [150, 150, 150, 150, 150, 260]),
    RowSpec("running", 7, 6, [120, 120, 120, 120, 120, 220]),
    RowSpec("review", 8, 6, [150, 150, 150, 150, 150, 280]),
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def source_root() -> Path:
    return Path(__file__).resolve().parents[2]


def safe_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                pass
    return ImageFont.load_default()


def load_rgba(path: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path)).convert("RGBA")


def make_canvas() -> Image.Image:
    return Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))


def center_crop_fit(img: Image.Image, box: tuple[int, int], centering: tuple[float, float]) -> Image.Image:
    return ImageOps.fit(img, box, method=Image.Resampling.LANCZOS, centering=centering)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def stickerize(
    source: Path,
    *,
    mirror: bool = False,
    scale: float = 1.0,
    rotate: float = 0.0,
    lift: int = 0,
    drift_x: int = 0,
    crop_box: tuple[int, int] = (150, 172),
    centering: tuple[float, float] = (0.5, 0.42),
    border: tuple[int, int, int, int] = (255, 255, 255, 220),
    shade: tuple[int, int, int, int] = (0, 0, 0, 35),
    tint: tuple[int, int, int] | None = None,
) -> Image.Image:
    img = load_rgba(source)
    if mirror:
        img = ImageOps.mirror(img)

    fitted = center_crop_fit(img, crop_box, centering)
    if scale != 1.0:
        new_size = (max(1, int(fitted.width * scale)), max(1, int(fitted.height * scale)))
        fitted = fitted.resize(new_size, Image.Resampling.LANCZOS)
    if rotate:
        fitted = fitted.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=True)

    if tint is not None:
        overlay = Image.new("RGBA", fitted.size, (*tint, 28))
        fitted = Image.alpha_composite(fitted, overlay)

    canvas = make_canvas()
    x = (CELL_W - fitted.width) // 2 + drift_x
    y = (CELL_H - fitted.height) // 2 + lift
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def motion_params(pet_id: str, state: str, frame: int, frames: int) -> dict:
    t = frame / max(frames - 1, 1)
    bob = round(math.sin(t * math.pi * 2) * 2)
    wiggle = round(math.sin((t * math.pi * 2) + 0.7) * 3)
    if pet_id == "bixia":
        if state == "idle":
            return {"lift": bob, "drift_x": wiggle // 2, "scale": 1.0 + (0.01 if frame in {1, 4} else 0.0), "rotate": wiggle * 0.35}
        if state == "running-right":
            return {"lift": 4 + bob, "drift_x": -10 + frame * 2, "scale": 0.99 + frame * 0.004, "rotate": -7 + frame * 1.6}
        if state == "running-left":
            return {"lift": 4 + bob, "drift_x": 10 - frame * 2, "scale": 0.99 + frame * 0.004, "rotate": 7 - frame * 1.6}
        if state == "waving":
            return {"lift": bob, "drift_x": -1 + frame % 2, "scale": 1.0, "rotate": [-4, -1, 3, 0][frame]}
        if state == "jumping":
            lifts = [18, 2, -24, -10, 10]
            scales = [0.98, 1.0, 1.03, 1.0, 0.98]
            rots = [-5, -2, 2, 1, 0]
            return {"lift": lifts[frame], "drift_x": 0, "scale": scales[frame], "rotate": rots[frame]}
        if state == "failed":
            return {"lift": 6 + bob, "drift_x": -2 if frame % 2 else 1, "scale": 0.98, "rotate": -2 + frame * 0.4}
        if state == "waiting":
            return {"lift": 2 + bob, "drift_x": 0, "scale": 1.0, "rotate": 0}
        if state == "running":
            return {"lift": 3 + bob, "drift_x": -2 + frame, "scale": 0.995 + frame * 0.003, "rotate": -3 + frame * 0.9}
        if state == "review":
            return {"lift": bob, "drift_x": 0, "scale": 1.0 + (0.015 if frame in {2, 3} else 0.0), "rotate": wiggle * 0.2}
    else:
        if state == "idle":
            return {"lift": bob, "drift_x": wiggle // 2, "scale": 1.0 + (0.008 if frame in {2, 4} else 0.0), "rotate": wiggle * 0.25}
        if state == "running-right":
            return {"lift": 2 + bob, "drift_x": -12 + frame * 3, "scale": 0.99 + frame * 0.003, "rotate": -6 + frame * 1.1}
        if state == "running-left":
            return {"lift": 2 + bob, "drift_x": 12 - frame * 3, "scale": 0.99 + frame * 0.003, "rotate": 6 - frame * 1.1}
        if state == "waving":
            return {"lift": bob, "drift_x": -1 if frame % 2 else 1, "scale": 1.0, "rotate": [-3, 2, 5, 0][frame]}
        if state == "jumping":
            lifts = [16, 0, -22, -9, 8]
            scales = [0.99, 1.0, 1.025, 1.0, 0.98]
            rots = [-3, -1, 2, 1, 0]
            return {"lift": lifts[frame], "drift_x": 0, "scale": scales[frame], "rotate": rots[frame]}
        if state == "failed":
            return {"lift": 5 + bob, "drift_x": 1 if frame % 2 else -1, "scale": 0.98, "rotate": -1 + frame * 0.35}
        if state == "waiting":
            return {"lift": 1 + bob, "drift_x": 0, "scale": 1.0, "rotate": 0}
        if state == "running":
            return {"lift": 3 + bob, "drift_x": -1 + frame, "scale": 0.995 + frame * 0.003, "rotate": -2 + frame * 0.8}
        if state == "review":
            return {"lift": bob, "drift_x": 0, "scale": 1.0 + (0.012 if frame in {2, 3} else 0.0), "rotate": wiggle * 0.18}
    return {"lift": bob, "drift_x": 0, "scale": 1.0, "rotate": 0}


def draw_frame(
    source: Path,
    *,
    pet_id: str,
    state: str,
    frame: int,
    frames: int,
    mirror: bool = False,
    tint: tuple[int, int, int] | None = None,
) -> Image.Image:
    params = motion_params(pet_id, state, frame, frames)
    lift = params.get("lift", 0)
    drift_x = params.get("drift_x", 0)
    scale = params.get("scale", 1.0)
    rotate = params.get("rotate", 0.0)

    crop_box = (152, 174)
    centering = (0.5, 0.43)
    if pet_id == "tiger":
        crop_box = (156, 176)
        centering = (0.5, 0.42)
    if state == "jumping":
        crop_box = (150, 168)
    if state == "running-right" or state == "running-left":
        crop_box = (160, 170)

    return stickerize(
        source,
        mirror=mirror,
        scale=scale,
        rotate=rotate,
        lift=lift,
        drift_x=drift_x,
        crop_box=crop_box,
        centering=centering,
        tint=tint,
    )


PETS = {
    "bixia": {
        "display_name": "陛下",
        "description": "银渐层馋猫，傻傻的，爱抢吃的，喜欢粉色毛绒东西，脾气里带点破坏欲。",
        "source_map": {
            "idle": "artwork/cartoon/bixia-chibi-cutout.png",
            "running-right": "artwork/cartoon/bixia-chibi-cutout.png",
            "running-left": "artwork/cartoon/bixia-chibi-cutout.png",
            "waving": "artwork/cartoon/bixia-chibi-cutout.png",
            "jumping": "artwork/cartoon/bixia-chibi-cutout.png",
            "failed": "artwork/cartoon/bixia-chibi-cutout.png",
            "waiting": "artwork/cartoon/bixia-chibi-cutout.png",
            "running": "artwork/cartoon/bixia-chibi-cutout.png",
            "review": "artwork/cartoon/bixia-chibi-cutout.png",
        },
        "tint": None,
    },
    "tiger": {
        "display_name": "Tiger",
        "description": "狸花麒麟猫，短尾，黏人，聪明，腹黑，会开门，会趴电脑前，还爱装可怜。",
        "source_map": {
            "idle": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "running-right": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "running-left": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "waving": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "jumping": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "failed": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "waiting": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "running": "artwork/cartoon/tiger-chibi-desktop-pet.png",
            "review": "artwork/cartoon/tiger-chibi-desktop-pet.png",
        },
        "tint": None,
    },
}


def write_manifest(repo: Path) -> None:
    (repo / "profiles").mkdir(parents=True, exist_ok=True)
    profile_path = repo / "profiles" / "cats.json"
    if profile_path.exists():
        return
    profile_path.write_text(
        json.dumps(
            {
                "cats": [
                    {
                        "id": "bixia",
                        "name": "陛下",
                        "species": "银渐层",
                        "role": "馋猫 / 破坏王 / 粉色毛绒控",
                    },
                    {
                        "id": "tiger",
                        "name": "Tiger",
                        "species": "狸花麒麟猫",
                        "role": "黏人 / 聪明 / 腹黑 / 玻璃心",
                    },
                ]
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def build_sheet(repo: Path, pet_id: str) -> None:
    data = PETS[pet_id]
    sheet = Image.new("RGBA", (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))

    for spec in ROW_SPECS:
        rel_source = data["source_map"][spec.state]
        source = repo / rel_source
        if not source.exists():
            source = source_root() / rel_source
        if not source.exists():
            raise FileNotFoundError(f"Missing source image for {pet_id}:{spec.state}: {source}")
        mirror = spec.state == "running-left"
        for frame in range(spec.frames):
            img = draw_frame(source, pet_id=pet_id, state=spec.state, frame=frame, frames=spec.frames, mirror=mirror, tint=data["tint"])
            sheet.alpha_composite(img, (frame * CELL_W, spec.row * CELL_H))

    out_dir = repo / "pets" / pet_id
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / "spritesheet.webp", "WEBP", lossless=True, method=6)
    pet_json = {
        "id": pet_id,
        "displayName": data["display_name"],
        "description": data["description"],
        "spritesheetPath": "spritesheet.webp",
    }
    (out_dir / "pet.json").write_text(json.dumps(pet_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_preview(repo: Path, pet_id: str) -> None:
    sheet = Image.open(repo / "pets" / pet_id / "spritesheet.webp").convert("RGBA")
    labels = [spec.state for spec in ROW_SPECS]
    preview_w = 1536 + 220
    preview_h = 9 * 208 + 30
    canvas = Image.new("RGBA", (preview_w, preview_h), (248, 250, 252, 255))
    draw = ImageDraw.Draw(canvas)
    font = safe_font(20)
    small = safe_font(14)
    for y, label in enumerate(labels):
        draw.rounded_rectangle((12, 12 + y * 208, 196, 12 + y * 208 + 176), radius=16, fill=(235, 239, 245, 255))
        draw.text((24, 12 + y * 208 + 70), f"{y:02d}", fill=(57, 65, 77), font=font)
        draw.text((72, 12 + y * 208 + 66), label, fill=(39, 47, 61), font=small)
        row_crop = sheet.crop((0, y * 208, 1536, (y + 1) * 208))
        canvas.alpha_composite(row_crop, (220, y * 208 + 12))
    (repo / "previews").mkdir(parents=True, exist_ok=True)
    canvas.save(repo / "previews" / f"{pet_id}-contact-sheet.png")


def build_web_index(repo: Path) -> None:
    (repo / "index.html").write_text(
        """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>陛下和 Tiger 桌宠</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="app-shell">
    <section class="stage" id="stage">
      <div class="desktop-prop desktop-prop--desk"></div>
      <div class="desktop-prop desktop-prop--food"></div>
      <div class="desktop-prop desktop-prop--door"></div>
      <div class="desktop-prop desktop-prop--laptop"></div>
      <div class="pet pet--bixia" id="pet-bixia" aria-label="陛下">
        <div class="pet-sprite"></div>
        <div class="pet-tail"></div>
        <div class="pet-badge">陛下</div>
        <div class="pet-bubble"></div>
      </div>
      <div class="pet pet--tiger" id="pet-tiger" aria-label="Tiger">
        <div class="pet-sprite"></div>
        <div class="pet-tail"></div>
        <div class="pet-badge">Tiger</div>
        <div class="pet-bubble"></div>
      </div>
      <div class="stage-hint" id="stage-hint">拖一拖，点一下按钮，看看两只猫会怎么演。</div>
    </section>

    <aside class="panel">
      <header class="panel-header">
        <h1>陛下 / Tiger 档案</h1>
        <p>一只银渐层，一只狸花麒麟猫。左边爱吃爱拆，右边黏人腹黑还会开门。</p>
      </header>

      <section class="controls">
        <button data-action="feed">喂陛下</button>
        <button data-action="brush">梳毛试试</button>
        <button data-action="hug">抱一会儿</button>
        <button data-action="door">开门</button>
        <button data-action="hide">捉迷藏</button>
        <button data-action="computer">趴电脑前</button>
        <button data-action="fight">打起来</button>
        <button data-action="rest">都歇会儿</button>
      </section>

      <section class="profiles">
        <article class="profile-card" id="profile-bixia">
          <h2>陛下</h2>
          <p class="tagline">馋猫 / 破坏王 / 粉色毛绒控</p>
          <ul></ul>
        </article>
        <article class="profile-card" id="profile-tiger">
          <h2>Tiger</h2>
          <p class="tagline">黏人 / 短尾 / 会开门</p>
          <ul></ul>
        </article>
      </section>

      <section class="log">
        <div class="log-title">当前事件</div>
        <div class="log-line" id="log-line">两只猫正在看着你。</div>
      </section>
    </aside>
  </main>

  <script src="./app.js"></script>
</body>
</html>
""",
        encoding="utf-8",
    )

    (repo / "styles.css").write_text(
        """* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; }
body {
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 196, 208, 0.18), transparent 26%),
    radial-gradient(circle at 88% 12%, rgba(255, 214, 128, 0.14), transparent 20%),
    linear-gradient(180deg, #e9eef4 0%, #d8e1ea 100%);
  color: #1d2430;
}
.app-shell {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1.45fr 0.72fr;
  gap: 14px;
  padding: 14px;
}
.stage, .panel {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(248, 250, 252, 0.76);
  border: 1px solid rgba(96, 112, 136, 0.16);
  box-shadow: 0 18px 50px rgba(35, 46, 64, 0.10);
  backdrop-filter: blur(12px);
}
.stage {
  min-height: 720px;
  display: block;
}
.desktop-prop {
  position: absolute;
  pointer-events: none;
  opacity: 0.92;
}
.desktop-prop--desk {
  left: 10%;
  right: 8%;
  bottom: 12%;
  height: 24%;
  border-radius: 26px 26px 18px 18px;
  background: linear-gradient(180deg, #8c9ab0 0%, #64748b 100%);
  box-shadow: 0 20px 50px rgba(26, 38, 54, 0.22);
}
.desktop-prop--food {
  left: 11%;
  bottom: 11.7%;
  width: 104px;
  height: 82px;
  border-radius: 22px;
  background: radial-gradient(circle at 50% 30%, #ffd1df 0%, #ff9fb8 56%, #d94e7b 100%);
  box-shadow: inset 0 0 0 7px rgba(255,255,255,0.55);
}
.desktop-prop--door {
  right: 7%;
  bottom: 18%;
  width: 64px;
  height: 168px;
  border-radius: 14px 14px 12px 12px;
  background: linear-gradient(180deg, #d4d8de 0%, #aeb8c5 100%);
  box-shadow: inset 0 0 0 6px rgba(255,255,255,0.55);
}
.desktop-prop--laptop {
  right: 16%;
  bottom: 13%;
  width: 220px;
  height: 132px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, #0f172a 0%, #111827 100%);
  box-shadow: 0 20px 45px rgba(10, 14, 28, 0.28);
}
.desktop-prop--laptop::before {
  content: "";
  position: absolute;
  inset: 12px 18px 28px 18px;
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(97, 139, 255, 0.75), rgba(255, 164, 198, 0.78)),
    radial-gradient(circle at 70% 30%, rgba(255,255,255,0.7), transparent 30%);
}
.desktop-prop--laptop::after {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: -10px;
  height: 16px;
  border-radius: 0 0 18px 18px;
  background: #1f2937;
}
.pet {
  position: absolute;
  width: 192px;
  height: 208px;
  transform: translate3d(var(--x, 0px), var(--y, 0px), 0);
  transition: transform 150ms linear;
  will-change: transform;
  cursor: grab;
}
.pet:active { cursor: grabbing; }
.pet-sprite {
  width: 192px;
  height: 208px;
  background-repeat: no-repeat;
  background-size: 1536px 1872px;
  image-rendering: auto;
  filter: saturate(1.02) contrast(1.01);
}
.pet-tail {
  position: absolute;
  width: 16px;
  height: 36px;
  right: 18px;
  bottom: 28px;
  border-radius: 12px;
  background: rgba(94, 78, 56, 0.65);
  transform-origin: top center;
  opacity: 0;
}
.pet--tiger .pet-tail {
  opacity: 1;
}
.pet--tiger .pet-tail::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent);
}
.pet-badge {
  position: absolute;
  left: 12px;
  top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.82);
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.02em;
}
.pet-bubble {
  position: absolute;
  left: 8px;
  right: 8px;
  top: -12px;
  min-height: 28px;
  padding: 6px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  box-shadow: 0 6px 18px rgba(30, 41, 59, 0.12);
  opacity: 0;
  transition: opacity 180ms ease, transform 180ms ease;
  transform: translateY(-4px);
}
.pet.show-bubble .pet-bubble {
  opacity: 1;
  transform: translateY(0);
}
.pet-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  background: inherit;
  transform: rotate(45deg);
  border-radius: 2px;
}
.stage-hint {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.68);
  color: #415063;
  font-size: 13px;
}
.panel {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 12px;
  padding: 16px;
}
.panel-header h1 {
  margin: 0 0 6px;
  font-size: 21px;
}
.panel-header p {
  margin: 0;
  color: #556375;
  line-height: 1.45;
}
.controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.controls button {
  border: 0;
  border-radius: 14px;
  padding: 11px 12px;
  background: linear-gradient(180deg, #ffffff 0%, #eef2f7 100%);
  color: #1f2937;
  box-shadow: inset 0 0 0 1px rgba(122, 140, 165, 0.20);
  font: inherit;
  cursor: pointer;
}
.controls button:hover { background: linear-gradient(180deg, #fff 0%, #e8eef6 100%); }
.profiles {
  display: grid;
  gap: 10px;
  align-content: start;
}
.profile-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(122, 140, 165, 0.18);
  padding: 14px;
}
.profile-card h2 {
  margin: 0 0 4px;
  font-size: 18px;
}
.tagline {
  margin: 0 0 10px;
  font-size: 13px;
  color: #607086;
}
.profile-card ul {
  margin: 0;
  padding-left: 18px;
  color: #334155;
}
.profile-card li { margin: 4px 0; }
.log {
  border-radius: 16px;
  background: rgba(17, 24, 39, 0.92);
  color: #f8fafc;
  padding: 14px;
}
.log-title {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}
.log-line {
  margin-top: 8px;
  line-height: 1.45;
}
@media (max-width: 1100px) {
  .app-shell { grid-template-columns: 1fr; }
  .stage { min-height: 560px; }
}
@keyframes tiger-tail {
  0%, 100% { transform: rotate(14deg); }
  50% { transform: rotate(-18deg); }
}
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes wiggle {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(-2deg); }
  70% { transform: rotate(3deg); }
}
.pet.idle .pet-sprite { animation: bob 2.8s ease-in-out infinite; }
.pet.review .pet-sprite { animation: wiggle 1.8s ease-in-out infinite; }
.pet.running .pet-sprite { animation: bob 0.8s ease-in-out infinite; }
.pet.waving .pet-sprite { animation: wiggle 0.7s ease-in-out infinite; }
.pet.jump .pet-sprite { animation: bob 0.55s ease-in-out infinite; }
.pet.failed .pet-sprite { animation: bob 1.5s ease-in-out infinite; filter: saturate(0.9) contrast(0.95); }
.pet.mad .pet-sprite { animation: wiggle 0.35s ease-in-out infinite; }
.pet--tiger.running .pet-tail,
.pet--tiger.review .pet-tail,
.pet--tiger.idle .pet-tail { animation: tiger-tail 0.8s ease-in-out infinite; }
""",
        encoding="utf-8",
    )

    (repo / "app.js").write_text(
        """const CELL_W = 192;
const CELL_H = 208;
const ROWS = {
  idle: 0,
  "running-right": 1,
  "running-left": 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8,
};

const TIMINGS = {
  idle: [280, 110, 110, 140, 140, 320],
  "running-right": [120, 120, 120, 120, 120, 120, 120, 220],
  "running-left": [120, 120, 120, 120, 120, 120, 120, 220],
  waving: [140, 140, 140, 280],
  jumping: [140, 140, 140, 140, 280],
  failed: [140, 140, 140, 140, 140, 140, 140, 240],
  waiting: [150, 150, 150, 150, 150, 260],
  running: [120, 120, 120, 120, 120, 220],
  review: [150, 150, 150, 150, 150, 280],
};

const PETS = {
  bixia: {
    name: "陛下",
    atlas: "pets/bixia/spritesheet.webp",
    profile: [
      "只知道吃，看见零食就会盯住",
      "不喜欢梳毛，但可以揉捏",
      "喜欢粉色和毛绒绒的东西",
      "经常搞破坏，脸还很无辜",
    ],
    baseX: 92,
    baseY: 384,
    speech: {
      feed: "先给我吃这个。",
      brush: "梳毛？朕不想配合。",
      hug: "抱一下可以，太久不行。",
      door: "门？先看有没有吃的。",
      hide: "这个纸箱我先拆了。",
      computer: "我对键盘没兴趣，我对你有。",
      fight: "别拦我，我闻到好吃的了。",
      rest: "好吧，那先眯一会儿。",
    },
  },
  tiger: {
    name: "Tiger",
    atlas: "pets/tiger/spritesheet.webp",
    profile: [
      "短尾巴，兴奋时会摇",
      "特别黏人，爱趴你身上",
      "会开门，还会跑去洗手间",
      "喜欢像人一样坐着，心思很多",
    ],
    baseX: 784,
    baseY: 396,
    speech: {
      feed: "我不抢，我只是陪你看。",
      brush: "我可以配合，但你得轻点。",
      hug: "我可以趴你肚子上。",
      door: "门开一下，我自己会去。",
      hide: "来玩捉迷藏，我知道你在哪。",
      computer: "电脑前这个位置，我先占了。",
      fight: "陛下先别闹，我来看看。",
      rest: "那我先坐着等你。",
    },
  },
};

const stateDurations = {
  idle: 240,
  moving: 120,
  dragging: 80,
  action: 100,
};

class PetActor {
  constructor(id, cfg, root) {
    this.id = id;
    this.cfg = cfg;
    this.root = root;
    this.el = root.querySelector(`#pet-${id}`);
    this.sprite = this.el.querySelector(".pet-sprite");
    this.tail = this.el.querySelector(".pet-tail");
    this.bubble = this.el.querySelector(".pet-bubble");
    this.x = cfg.baseX;
    this.y = cfg.baseY;
    this.vx = 0;
    this.vy = 0;
    this.state = "idle";
    this.row = ROWS.idle;
    this.frame = 0;
    this.acc = 0;
    this.dragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.mood = 0;
    this.direction = id === "tiger" ? -1 : 1;
    this.atlas = new Image();
    this.atlas.src = cfg.atlas;
    this.randomTarget = null;
    this.actionLock = 0;
    this.setSpeech("");
    this.bindDrag();
    this.render();
  }

  bindDrag() {
    this.el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.dragging = true;
      this.el.setPointerCapture(event.pointerId);
      this.dragOffsetX = event.clientX - this.x;
      this.dragOffsetY = event.clientY - this.y;
      this.setState("running");
      this.setSpeech(this.id === "bixia" ? "别拽我，我还没吃够。" : "我跟着你走。");
    });
    this.el.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.x = event.clientX - this.dragOffsetX;
      this.y = event.clientY - this.dragOffsetY;
      this.clampPosition();
      this.render();
    });
    this.el.addEventListener("pointerup", () => {
      this.dragging = false;
      this.setState("idle");
      this.setSpeech("");
    });
    this.el.addEventListener("pointercancel", () => {
      this.dragging = false;
      this.setState("idle");
    });
  }

  clampPosition() {
    const stage = this.root.getBoundingClientRect();
    const maxX = stage.width - 192;
    const maxY = stage.height - 208;
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  setState(state) {
    this.state = state;
    this.row = ROWS[state] ?? ROWS.idle;
    this.frame = 0;
    this.acc = 0;
    const cssState = state.startsWith("running") || state === "moving" ? "running" : state;
    this.el.className = `pet pet--${this.id} ${cssState}`;
    if (this.id === "tiger") {
      this.tail.style.animationDuration = state.startsWith("running") || state === "moving" ? "0.5s" : "0.9s";
    }
  }

  setSpeech(text, persist = 2800) {
    if (!text) {
      this.el.classList.remove("show-bubble");
      this.bubble.textContent = "";
      return;
    }
    this.bubble.textContent = text;
    this.el.classList.add("show-bubble");
    window.clearTimeout(this._bubbleTimer);
    this._bubbleTimer = window.setTimeout(() => {
      if (!this.dragging) {
        this.el.classList.remove("show-bubble");
      }
    }, persist);
  }

  speak(key) {
    const text = this.cfg.speech[key] || "";
    if (text) this.setSpeech(text);
  }

  trigger(state, key, opts = {}) {
    this.setState(state);
    this.actionLock = opts.lockMs ?? 1800;
    if (key) this.setSpeech(this.cfg.speech[key] || key, opts.bubbleMs ?? 2200);
    if (opts.dx || opts.dy) {
      this.x += opts.dx || 0;
      this.y += opts.dy || 0;
      this.clampPosition();
    }
    this.direction = opts.direction ?? this.direction;
    this.render();
  }

  followTarget(targetX, targetY, speed = 2.2) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) return true;
    this.x += (dx / dist) * speed;
    this.y += (dy / dist) * speed;
    this.clampPosition();
    this.direction = dx < 0 ? -1 : 1;
    this.setState("running");
    this.render();
    return false;
  }

  setIdleTarget(stage) {
    const w = stage.width;
    const h = stage.height;
    const margin = 64;
    const leftLane = this.id === "bixia";
    const tx = leftLane ? Math.min(w * 0.42, w * 0.30 + Math.random() * w * 0.14) : Math.max(w * 0.55, w * 0.62 + Math.random() * w * 0.12);
    const ty = Math.min(h * 0.76, h * 0.48 + Math.random() * h * 0.22);
    this.randomTarget = {
      x: Math.max(margin, Math.min(w - margin - 192, tx)),
      y: Math.max(24, Math.min(h - 208 - 24, ty)),
    };
  }

  tick(dt, stage, other) {
    this.acc += dt;
    this.actionLock = Math.max(0, this.actionLock - dt);
    if (this.dragging) {
      this.animateFrame();
      return;
    }
    if (!this.randomTarget || Math.abs(this.randomTarget.x - this.x) < 10 && Math.abs(this.randomTarget.y - this.y) < 10) {
      if (this.acc > 4200 + Math.random() * 2600) {
        this.setIdleTarget(stage);
        this.acc = 0;
      }
    }
    if (this.randomTarget && this.actionLock === 0) {
      const reached = this.followTarget(this.randomTarget.x, this.randomTarget.y, this.id === "tiger" ? 1.9 : 2.0);
      if (reached) {
        this.setState("idle");
        this.randomTarget = null;
      }
    } else if (this.actionLock === 0) {
      if (this.state !== "idle") this.setState("idle");
    }
    if (other && this.id === "tiger" && this.state === "idle" && Math.abs(other.x - this.x) < 220 && Math.random() < 0.004) {
      this.setSpeech("我先看着陛下。", 1800);
    }
    if (this.id === "tiger") {
      const nearLaptop = this.x > stage.width * 0.56 && this.y > stage.height * 0.45;
      if (nearLaptop && this.state === "idle") {
        this.setState("review");
      }
    }
    if (this.id === "bixia") {
      const nearFood = this.x < stage.width * 0.34 && this.state === "idle" && Math.random() < 0.01;
      if (nearFood) {
        this.setState("waiting");
        this.setSpeech("闻到吃的了。", 1400);
      }
    }
    this.animateFrame();
    this.render();
  }

  animateFrame() {
    const timings = TIMINGS[this.state === "moving" ? "running" : this.state] || TIMINGS.idle;
    this.acc += 0;
    const step = timings[this.frame] ?? timings[timings.length - 1];
    if (!this._frameClock) this._frameClock = 0;
  }

  advanceFrame(dt) {
    const timings = TIMINGS[this.state === "moving" ? "running" : this.state] || TIMINGS.idle;
    this._frameClock = (this._frameClock ?? 0) + dt;
    const current = timings[this.frame] ?? timings[timings.length - 1];
    if (this._frameClock >= current) {
      this._frameClock = 0;
      this.frame = (this.frame + 1) % timings.length;
    }
  }

  render() {
    const stateName = this.state === "moving" ? "running" : this.state;
    const row = ROWS[stateName] ?? ROWS.idle;
    const bgX = -(this.frame * CELL_W);
    const bgY = -(row * CELL_H);
    this.sprite.style.backgroundImage = `url('${this.cfg.atlas}')`;
    this.sprite.style.backgroundPosition = `${bgX}px ${bgY}px`;
    this.sprite.style.backgroundSize = `${CELL_W * 8}px ${CELL_H * 9}px`;
    const facing = this.direction < 0 ? -1 : 1;
    this.el.style.setProperty("--x", `${Math.round(this.x)}px`);
    this.el.style.setProperty("--y", `${Math.round(this.y)}px`);
    if (this.id === "tiger") {
      this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0) scaleX(${facing})`;
    } else {
      this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0) scaleX(${facing})`;
    }
  }
}

const stage = document.getElementById("stage");
const logLine = document.getElementById("log-line");
const profileBixia = document.querySelector("#profile-bixia ul");
const profileTiger = document.querySelector("#profile-tiger ul");
const pets = {
  bixia: new PetActor("bixia", PETS.bixia, stage),
  tiger: new PetActor("tiger", PETS.tiger, stage),
};

for (const line of PETS.bixia.profile) {
  const li = document.createElement("li");
  li.textContent = line;
  profileBixia.appendChild(li);
}
for (const line of PETS.tiger.profile) {
  const li = document.createElement("li");
  li.textContent = line;
  profileTiger.appendChild(li);
}

function log(text) {
  logLine.textContent = text;
}

function setPetState(id, state, key, opts = {}) {
  const pet = pets[id];
  pet.trigger(state, key, opts);
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    switch (action) {
      case "feed":
        setPetState("bixia", "waiting", "feed", { lockMs: 1600, dx: -18, dy: -6 });
        setPetState("tiger", "review", "feed", { lockMs: 1200, dx: 12, dy: 2 });
        log("陛下先冲了过去，Tiger 在旁边眼巴巴看着。");
        break;
      case "brush":
        setPetState("bixia", "failed", "brush", { lockMs: 1800 });
        setPetState("tiger", "idle", "brush", { lockMs: 900 });
        log("陛下明显不太乐意，Tiger 假装没看见。");
        break;
      case "hug":
        setPetState("bixia", "idle", "hug", { lockMs: 1000 });
        setPetState("tiger", "idle", "hug", { lockMs: 1000 });
        log("两只猫都能抱，但都不想被抱太久。");
        break;
      case "door":
        setPetState("tiger", "running-right", "door", { lockMs: 1800, dx: 90, direction: -1 });
        setPetState("bixia", "waiting", "door", { lockMs: 1200, dx: -12 });
        log("Tiger 直接跑去门边，像真的会开门一样。");
        break;
      case "hide":
        setPetState("tiger", "running", "hide", { lockMs: 2000, dx: -60 });
        setPetState("bixia", "review", "hide", { lockMs: 1400 });
        log("Tiger 开始玩捉迷藏，陛下先懵一下。");
        break;
      case "computer":
        setPetState("tiger", "review", "computer", { lockMs: 2200, dx: 44, dy: -18 });
        setPetState("bixia", "idle", "computer", { lockMs: 1200, dx: 30, dy: 0 });
        log("Tiger 躺到电脑前了，陛下也想凑热闹。");
        break;
      case "fight":
        setPetState("bixia", "running", "fight", { lockMs: 1600, dx: 50 });
        setPetState("tiger", "running-left", "fight", { lockMs: 1600, dx: -50, direction: -1 });
        log("又开始打架了，不过看着更像拌嘴。");
        break;
      case "rest":
        setPetState("bixia", "idle", "rest", { lockMs: 1000 });
        setPetState("tiger", "idle", "rest", { lockMs: 1000 });
        log("都先歇一会儿，桌面终于安静点。");
        break;
    }
  });
});

const stageRect = () => stage.getBoundingClientRect();
let last = performance.now();
function loop(now) {
  const dt = Math.min(40, now - last);
  last = now;
  const rect = stageRect();
  for (const pet of Object.values(pets)) {
    pet.advanceFrame(dt);
  }
  pets.bixia.tick(dt, rect, pets.tiger);
  pets.tiger.tick(dt, rect, pets.bixia);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  const rect = stageRect();
  pets.bixia.clampPosition();
  pets.tiger.clampPosition();
  pets.bixia.render();
  pets.tiger.render();
  log(`桌面大小：${Math.round(rect.width)} × ${Math.round(rect.height)}`);
});

log("两只猫正在看着你。");
requestAnimationFrame(loop);
""",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=repo_root())
    args = parser.parse_args()

    repo = args.repo_root
    write_manifest(repo)
    for pet_id in PETS:
        build_sheet(repo, pet_id)
        build_preview(repo, pet_id)
    build_web_index(repo)


if __name__ == "__main__":
    main()
