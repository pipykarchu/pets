const CELL_W = 192;
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
