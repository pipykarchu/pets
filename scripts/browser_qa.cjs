// Run against a local demo server: node scripts/browser_qa.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PET_BROWSER_PATH ? { executablePath: process.env.PET_BROWSER_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1125, height: 665 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(process.env.PET_DEMO_URL || "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await page.mouse.move(1110, 10);
    assert.equal(await page.locator(".pet:not(.is-hidden)").count(), 2, "Both pets visible by default");
    assert(await page.evaluate(() => Object.values(pets).every(p => p.expressionAtlas.complete && p.expressionAtlas.naturalWidth === 1536 && p.locomotionAtlas.naturalHeight === 416)), "Atlases loaded");
    const start = await page.evaluate(() => Object.values(pets).map(p => p.x));
    await page.waitForTimeout(1000);
    const next = await page.evaluate(() => Object.values(pets).map(p => p.x));
    assert(next.every((x, i) => Math.abs(x - start[i]) > 10), "Both roam without clicking");

    // Exercise the real route controller from each side, including corner turns.
    for (const id of ["bixia", "tiger"]) {
      const surfaces = await page.evaluate(id => {
        const p = pets[id], bounds = stage.getBoundingClientRect();
        p.actionLock = 0; p.clearExpression(); p.locomotion = null;
        p.moveTo(16, bounds.height - CELL_H - 16); p.routeIndex = p.routeStep === 1 ? 0 : 3;
        p.chooseIdleTarget(bounds); const seen = new Set();
        for (let t = 0; t < 80000; t += 20) {
          p.tick(20, bounds, { active: false }, performance.now() + t);
          if (p.surface) seen.add(p.surface);
          if (p.x < 0 || p.y < 0 || p.x > bounds.width - CELL_W + 1 || p.y > bounds.height - CELL_H + 1) throw Error('Pet escaped stage');
        }
        return [...seen];
      }, id);
      assert.equal(surfaces.length, 4, `${id} crawls all four edges`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-behavior="climb"]').click();
    await page.mouse.move(1110, 10);
    await page.evaluate(() => {
      for (const pet of Object.values(pets)) {
        pet.moveTo(pet.id === 'tiger' ? 16 : 300, 16);
        pet.randomTarget = null; pet.actionLock = 0; pet.clearExpression();
      }
    });
    const before = await page.evaluate(() => Object.values(pets).map(p => ({ x: p.x, y: p.y })));
    const bounds = await page.locator('#stage').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .72, { steps: 12 });
    await page.waitForTimeout(1000);
    const chase = await page.evaluate(() => Object.values(pets).map(p => ({ x: p.x, y: p.y, chasing: p.chasingCursor })));
    assert(chase.every((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 15), "Both respond to real cursor movement");
    assert(chase.every(p => p.chasing), "Chase state active");

    await page.locator('[data-behavior="paused"]').click();
    const paused = await page.evaluate(() => Object.values(pets).map(p => [p.x, p.y]));
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => Object.values(pets).map(p => [p.x, p.y])), paused, "Pause freezes motion");
    await page.locator('[data-behavior="paused"]').click();
    await page.locator('[data-presence="tiger"]').click();
    assert.equal(await page.locator('.pet:not(.is-hidden)').count(), 1);
    assert(await page.locator('[data-pet="bixia"][data-locomotion="walk"]').isDisabled());
    await page.locator('[data-presence="both"]').click();
    assert.equal(await page.locator('.pet:not(.is-hidden)').count(), 2);

    for (const id of ['bixia', 'tiger']) {
      for (const action of ['walk', 'run', 'jump']) {
        await page.locator(`[data-pet="${id}"][data-locomotion="${action}"]`).click();
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(id => pets[id].locomotion?.kind, id), action);
      }
      for (let i = 0; i < 3; i++) {
        await page.locator(`[data-pet="${id}"][data-signature="${i}"]`).click();
        assert.equal(await page.evaluate(id => pets[id].locomotion, id), null, "Action cancels movement");
      }
    }
    // Dragging must not also trigger a tap action.
    await page.locator('[data-behavior="paused"]').click();
    await page.evaluate(() => { pets.tiger.moveTo(240, 230); pets.tiger.actionLock = 0; pets.tiger.clearExpression(); });
    const box = await page.locator('#pet-tiger').boundingBox();
    await page.mouse.move(box.x + 80, box.y + 120);
    await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 100, { steps: 8 }); await page.mouse.up();
    assert.equal(await page.evaluate(() => pets.tiger.expressionFrame), null, "Drag did not trigger tap");
    assert.equal(await page.evaluate(() => pets.tiger.dragging), false);
    await page.locator('[data-behavior="paused"]').click();

    await page.locator('#companion-mode').click();
    assert.equal(await page.locator('.panel').isVisible(), false);
    await page.evaluate(() => {
      behavior.climb = true;
      pointer.active = false;
      const bounds = stage.getBoundingClientRect();
      for (const pet of Object.values(pets)) {
        pet.actionLock = 0; pet.clearExpression(); pet.locomotion = null;
        pet.moveTo(pet.id === 'tiger' ? 620 : 220, bounds.height - CELL_H - 16);
        pet.routeIndex = pet.id === 'tiger' ? 0 : 3;
        pet.chooseIdleTarget(bounds);
      }
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, '../previews/companions-browser.png') });
    await page.evaluate(() => {
      const bounds = stage.getBoundingClientRect();
      const pet = pets.tiger;
      pet.moveTo(bounds.width - CELL_W - 16, bounds.height / 2 - CELL_H / 2);
      pet.routeIndex = 1; pet.chooseIdleTarget(bounds); pet.tick(20, bounds, {active:false}, performance.now());
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(__dirname, '../previews/companions-edge-browser.png') });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => Object.values(pets).every(p => p.x >= 0 && p.x <= stage.clientWidth - CELL_W + 2)), "Resize clamps both pets");
    assert.deepEqual(errors, [], 'Browser console clean');
    console.log('PASS: both visible, loaded artwork, autonomous roam, four edges, cursor chase, pause, presence, six movement actions, six personality actions, drag, companion mode, resize, clean console');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
