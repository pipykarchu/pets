# Pets

Codex custom pet assets and a tiny local desk-pet demo.

## Installed Pets

- `pets/xiuxiu` — original Xiuxiu example from the upstream repo
- `pets/bixia` — 陛下，银渐层馋猫，爱吃、爱闹、爱粉色毛绒，已做成 Q 版透明卡通桌宠
- `pets/tiger` — Tiger，狸花麒麟猫，短尾、黏人、会开门，已做成 Q 版透明卡通桌宠

## Local Demo

Run `python -m http.server 4173 --bind 127.0.0.1` from the repository root and open
`http://127.0.0.1:4173/`. Both cats appear together by default.

- Tiger follows the cursor eagerly; 陛下 reacts more slowly and pauses to inspect it.
- With 沿边爬 enabled, they crouch, pounce onto a side frame, climb with alternating
  grips, hang from the top rail, pull onto the ledge, then release and fall to a soft landing.
  Tiger climbs faster; 陛下 takes longer pauses. Cursor chase stays on the ground.
- Each cat has walk, run, jump and three personality buttons. You can drag them and
  switch between both cats or one cat. Pause, cursor chase and edge crawl have separate controls.
- 窗口陪伴 hides the profile panel and expands the scene within the browser window.
  This is a browser prototype; it does not create a transparent OS desktop overlay
  or follow the cursor outside the browser.

Browser poses use style-consistent movement and climbing sheets per character. The original
character references remain under `artwork/cartoon/`; 陛下 uses a slimmer natural torso
instead of an inflated round belly. The original installable Codex `spritesheet.webp`
packages are preserved separately from the demo's new motion/expressions.

Build the current browser assets with Python + Pillow + NumPy:

```powershell
python scripts/build_consistent_assets.py
python scripts/build_climb_assets.py
```

The script uses `artwork/bixia-consistent.png` and `artwork/tiger-consistent.png` to build
`pets/<id>/expressions.webp`, `pets/<id>/locomotion.webp`, contact sheets and animation previews.
The motion atlas has four walk and four run key poses; each expression strip has eight poses.
Generation prompts are in `artwork/prompts/consistent-*.txt` and were run through local `tuzi-image`.
Climbing uses eight dedicated poses in `artwork/<id>-climb.png`; `pets/climb-layout.js`
records paw contact points so hands stay on the rail and feet rest on the ledge.

For browser QA, install Playwright (`npm install --no-save playwright`), then run:

```powershell
node --check app.js
node scripts/browser_qa.cjs
```

The test uses an isolated headless browser against the running local server. Optional
`PET_DEMO_URL` and `PET_BROWSER_PATH` select the server and installed browser executable.
It checks two-pet presence, all edges, cursor chase, movement/personality controls,
pause, dragging without accidental taps, companion mode, resizing and console errors.

## Regenerate

The following older builder regenerates the original installable Codex pet packages,
not the browser's current character sheets.

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
