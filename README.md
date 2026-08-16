# Pets

Codex custom pet assets and a tiny local desk-pet demo.

## Installed Pets

- `pets/xiuxiu` — original Xiuxiu example from the upstream repo
- `pets/bixia` — 陛下，银渐层馋猫，爱吃、爱闹、爱粉色毛绒，已做成 Q 版透明卡通桌宠
- `pets/tiger` — Tiger，狸花麒麟猫，短尾、黏人、会开门，已做成 Q 版透明卡通桌宠

## Local Demo

Open `index.html` in a browser for a draggable two-cat desk-pet scene.

## Regenerate

From the repo root:

```powershell
python scripts/build_pet_assets.py
```

That script reads the final cartoon cutouts under `artwork/cartoon/` and rebuilds:

- `pets/bixia/pet.json`
- `pets/bixia/spritesheet.webp`
- `pets/tiger/pet.json`
- `pets/tiger/spritesheet.webp`
- `previews/bixia-contact-sheet.png`
- `previews/tiger-contact-sheet.png`

The cartoon cutouts were generated from the original cat photos with local `tuzi-image`.

## Original Xiuxiu

`pets/xiuxiu` contains the upstream installable pet package:

- `pet.json`
- `spritesheet.webp`

Preview contact sheet:

- `previews/xiuxiu-contact-sheet.png`
