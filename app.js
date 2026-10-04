const CELL_W = 192;
const CELL_H = 208;

const TIMINGS = {
  idle: [280, 110, 110, 140, 140, 320],
  walking: [160, 160, 160, 160],
  "running-right": [120, 120, 120, 120, 120, 120, 120, 220],
  "running-left": [120, 120, 120, 120, 120, 120, 120, 220],
  waving: [140, 140, 140, 280],
  jumping: [140, 140, 140, 140, 280],
  failed: [140, 140, 140, 140, 140, 140, 140, 240],
  waiting: [150, 150, 150, 150, 150, 260],
  running: [100, 100, 100, 100],
  review: [150, 150, 150, 150, 150, 280],
};

const STATE_CLASSES = [
  "idle", "walking", "running", "waving", "jumping", "failed", "waiting", "review", "expressing",
  "mood--greedy", "mood--refusing", "mood--clingy", "mood--scheming",
  "mood--door", "mood--computer", "mood--fight", "mood--resting",
];

const PETS = {
  bixia: {
    name: "陛下",
    atlas: "pets/bixia/spritesheet.webp",
    expressions: "pets/bixia/expressions.webp?v=consistent-1",
    locomotion: "pets/bixia/locomotion.webp?v=consistent-1",
    climbing: "pets/bixia/climbing.webp?v=gravity-1",
    spawn: [0.14, 0.54],
    defaultMood: "装无辜",
    expressionFrames: {
      idle: 0, food: 1, steal: 2, brushNo: 3,
      shortHug: 4, escape: 5, destroy: 6, innocent: 7,
    },
    profile: [
      "只知道吃，看见零食就会盯住",
      "不喜欢梳毛，但可以揉捏",
      "喜欢粉色和毛绒绒的东西",
      "经常搞破坏，脸还很无辜",
    ],
    speech: {
      feed: "这个先归我。", plush: "咬一下应该不会坏。", brush: "把梳子拿走。",
      hug: "一下可以，怎么还不放手？", door: "Tiger，你开门，我看着。",
      hide: "他又躲哪去了？", computer: "键盘能吃吗？", lick: "别舔了，毛都湿了。",
      lock: "Tiger！给朕把门打开！", fight: "你刚才是不是故意的？",
      rest: "朕先睡，吃的留着。",
    },
  },
  tiger: {
    name: "Tiger",
    atlas: "pets/tiger/spritesheet.webp",
    expressions: "pets/tiger/expressions.webp?v=consistent-1",
    locomotion: "pets/tiger/locomotion.webp?v=consistent-1",
    climbing: "pets/tiger/climbing.webp?v=gravity-1",
    spawn: [0.62, 0.55],
    defaultMood: "人坐姿",
    expressionFrames: {
      humanSit: 0, pitiful: 1, cuddle: 2, scheming: 3,
      openDoor: 4, hide: 5, computer: 6, lick: 7,
    },
    profile: [
      "短尾巴，兴奋时会摇",
      "特别黏人，爱趴你身上",
      "会开门，还会跑去洗手间",
      "喜欢像人一样坐着，心思很多",
    ],
    speech: {
      feed: "我不抢，我就这样看着。", plush: "我什么都没看见。",
      brush: "陛下生气了，我先坐远点。", hug: "我来了，我要趴着。",
      door: "这门很简单。", hide: "来洗手间找我呀。",
      computer: "电脑前这个位置是我的。", lick: "陛下的毛要舔整齐。",
      lock: "咔哒。好像不小心关上了。", fight: "我只是舔了一下。",
      rest: "我坐着陪你。",
    },
  },
};

class PetActor {
  constructor(id, config, root) {
    this.id = id;
    this.config = config;
    this.climbLayout = CLIMB_LAYOUT[id];
    this.root = root;
    this.el = root.querySelector(`#pet-${id}`);
    this.visual = this.el.querySelector(".pet-visual");
    this.sprite = this.el.querySelector(".pet-sprite");
    this.tail = this.el.querySelector(".pet-tail");
    this.bubble = this.el.querySelector(".pet-bubble");
    this.moodLabel = this.el.querySelector(".pet-mood");
    const stage = root.getBoundingClientRect();
    this.x = stage.width * config.spawn[0];
    this.y = stage.height * config.spawn[1];
    this.state = "idle";
    this.frame = 0;
    this.frameClock = 0;
    this.idleClock = 0;
    this.dragging = false;
    this.dragMoved = false;
    this.direction = id === "tiger" ? -1 : 1;
    this.randomTarget = null;
    this.actionLock = 0;
    this.locomotion = null;
    this.hop = 0;
    this.velocity = { x: 0, y: 0 };
    this.travelClock = 0;
    this.routeIndex = id === "tiger" ? 0 : 3;
    this.routeStep = id === "tiger" ? 1 : -1;
    this.surface = "bottom";
    this.climbMotion = null;
    this.climbFrame = null;
    this.climbCooldown = 0;
    this.swing = 0;
    this.cornerPause = 0;
    this.cursorRestUntil = 0;
    this.previousCursorActive = false;
    this.edgeCooldownUntil = 0;
    this.chasingCursor = false;
    this.expressionFrame = null;
    this.expressionMood = null;
    this.hidden = false;
    this.expressionAtlas = new Image();
    this.expressionAtlas.src = config.expressions;
    this.locomotionAtlas = new Image();
    this.locomotionAtlas.src = config.locomotion;
    this.climbAtlas = new Image();
    this.climbAtlas.src = config.climbing;
    this.setSpeech("");
    this.setMood(config.defaultMood);
    this.bindPointerEvents();
    this.clampPosition();
    this.applyStateClass();
    this.render();
  }

  bindPointerEvents() {
    this.el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.dragging = true;
      this.dragMoved = false;
      this.pointerStartX = event.clientX;
      this.pointerStartY = event.clientY;
      this.el.setPointerCapture(event.pointerId);
      this.dragOffsetX = event.clientX - this.x;
      this.dragOffsetY = event.clientY - this.y;
      this.actionLock = 0;
      this.velocity = { x: 0, y: 0 };
      this.surface = null;
      this.randomTarget = null;
      this.locomotion = null;
      this.climbMotion = null;
      this.climbFrame = null;
      this.swing = 0;
      this.hop = 0;
      this.clearExpression();
      this.setState("running");
      this.setSpeech(this.id === "bixia" ? "别拽太久。" : "我跟着你。", 1200);
    });

    this.el.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.dragMoved ||= Math.hypot(event.clientX - this.pointerStartX, event.clientY - this.pointerStartY) > 6;
      this.x = event.clientX - this.dragOffsetX;
      this.y = event.clientY - this.dragOffsetY;
      this.clampPosition();
      this.render();
    });

    const finishDrag = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.setState("idle");
      this.setSpeech("");
      if (this.dragMoved) {
        this.beginDrop();
      } else if (event.type === "pointerup" && this.tapHandler) this.tapHandler(this);
    };
    this.el.addEventListener("pointerup", finishDrag);
    this.el.addEventListener("pointercancel", finishDrag);
  }

  onTap(handler) {
    this.tapHandler = handler;
  }

  onEdge(handler) {
    this.edgeHandler = handler;
  }

  setHidden(hidden) {
    this.locomotion = null;
    this.hop = 0;
    this.climbMotion = null;
    this.climbFrame = null;
    this.swing = 0;
    this.pendingExpression = null;
    this.hidden = hidden;
    this.velocity = { x: 0, y: 0 };
    this.surface = null;
    this.el.classList.toggle("is-hidden", hidden);
    if (hidden) {
      this.actionLock = 0;
      this.randomTarget = null;
      this.clearExpression();
      this.setSpeech("");
    } else {
      this.clampPosition();
      this.setState("idle", true);
      this.render();
    }
  }

  clampPosition() {
    const stage = this.root.getBoundingClientRect();
    this.x = Math.max(0, Math.min(Math.max(0, stage.width - CELL_W), this.x));
    // A perched cat's transparent cell extends above the rail; its artwork stays visible.
    const minY = this.climbMotion ? Math.min(0, this.climbGeometry(stage).perchY) : 0;
    this.y = Math.max(minY, Math.min(Math.max(0, stage.height - CELL_H), this.y));
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.clampPosition();
    this.render();
  }

  applyStateClass() {
    this.el.classList.remove(...STATE_CLASSES);
    if (this.expressionFrame !== null) {
      this.el.classList.add("expressing", `mood--${this.expressionMood || "resting"}`);
      return;
    }
    this.el.classList.add(this.state.startsWith("running") ? "running" : this.state);
  }

  setState(state, force = false) {
    if (!force && this.state === state && this.expressionFrame === null) return;
    if (this.expressionFrame !== null) this.clearExpression(false);
    this.state = state;
    this.frame = 0;
    this.frameClock = 0;
    this.applyStateClass();
    if (this.id === "tiger") {
      this.tail.style.animationDuration = state.startsWith("running") ? "0.45s" : "0.9s";
    }
  }

  setMood(text) {
    this.moodLabel.textContent = text;
  }

  setSpeech(text, persist = 2600) {
    window.clearTimeout(this.bubbleTimer);
    if (!text) {
      this.el.classList.remove("show-bubble");
      this.bubble.textContent = "";
      return;
    }
    this.bubble.textContent = text;
    this.el.classList.add("show-bubble");
    this.bubbleTimer = window.setTimeout(() => {
      if (!this.dragging) this.el.classList.remove("show-bubble");
    }, persist);
  }

  clearExpression(refreshClass = true) {
    window.clearTimeout(this.expressionTimer);
    delete this.el.dataset.motion;
    this.expressionFrame = null;
    this.expressionMood = null;
    if (refreshClass) this.applyStateClass();
  }

  playExpression(sequence, keyOrSpeech, options = {}) {
    if (this.climbMotion) {
      this.pendingExpression = { sequence, keyOrSpeech, options };
      this.beginDrop();
      return;
    }
    const frames = sequence.map((name) => this.config.expressionFrames[name]);
    if (frames.some((frame) => frame === undefined)) {
      throw new Error(`Unknown ${this.id} expression in ${sequence.join(", ")}`);
    }
    this.clearExpression(false);
    this.locomotion = null;
    this.hop = 0;
    this.idleClock = 0;
    this.randomTarget = null;
    this.velocity = { x: 0, y: 0 };
    this.surface = null;
    this.actionLock = options.lockMs ?? 2400;
    this.direction = options.direction ?? this.direction;
    this.moveTo(this.x + (options.dx || 0), this.y + (options.dy || 0));
    this.expressionMood = options.mood || "resting";
    this.expressionFrame = frames[0];
    this.setMood(options.moodLabel || this.config.defaultMood);
    this.applyStateClass();
    if (keyOrSpeech) this.setSpeech(this.config.speech[keyOrSpeech] || keyOrSpeech, options.bubbleMs ?? 2300);

    let index = 1;
    const advance = () => {
      if (this.expressionFrame === null || this.actionLock === 0) return;
      if (behavior.paused) {
        this.expressionTimer = window.setTimeout(advance, 100);
        return;
      }
      if (index < frames.length) {
        this.expressionFrame = frames[index++];
        this.render();
        this.expressionTimer = window.setTimeout(advance, options.stepMs ?? 650);
      } else if (options.loop && frames.length > 1) {
        index = 0;
        this.expressionTimer = window.setTimeout(advance, options.stepMs ?? 650);
      }
    };
    if (frames.length > 1) this.expressionTimer = window.setTimeout(advance, options.stepMs ?? 650);
    this.render();
  }

  followTarget(targetX, targetY, speed, dt) {
    const bounds = this.root.getBoundingClientRect();
    targetX = Math.max(16, Math.min(Math.max(16, bounds.width - CELL_W - 16), targetX));
    targetY = Math.max(16, Math.min(Math.max(16, bounds.height - CELL_H - 16), targetY));
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 5) {
      this.x = targetX;
      this.y = targetY;
      this.velocity = { x: 0, y: 0 };
      return true;
    }
    const easedSpeed = Math.min(speed, Math.max(25, distance * 3));
    const blend = 1 - Math.exp(-dt / 100);
    this.velocity.x += (dx / distance * easedSpeed - this.velocity.x) * blend;
    this.velocity.y += (dy / distance * easedSpeed - this.velocity.y) * blend;
    const step = Math.min(distance, Math.hypot(this.velocity.x, this.velocity.y) * dt / 1000);
    this.x += dx / distance * step;
    this.y += dy / distance * step;
    if (Math.abs(dx) > 4) this.direction = dx < 0 ? -1 : 1;
    this.setState(speed < 160 ? "walking" : "running");
    this.travelClock += step;
    // Paw cadence follows distance traveled, preventing skating at low speeds.
    this.frame = Math.floor(this.travelClock / (speed < 160 ? 14 : 24)) % 4;
    this.clampPosition();
    this.render();
    return false;
  }

  chooseIdleTarget(stage) {
    if (this.climbMotion) return;
    const geometry = this.climbGeometry(stage);
    this.surface = "bottom";
    const side = this.direction > 0 ? "right" : "left";
    const wallX = side === "right" ? geometry.rightX : geometry.leftX;
    // Approach on the floor; stop short so the pounce has visible horizontal travel.
    const x = behavior.climb && geometry.canClimb ? wallX + (side === "right" ? -42 : 42) : wallX;
    this.randomTarget = { x, y: geometry.floorY, edge: side };
  }

  climbGeometry(stage = this.root.getBoundingClientRect()) {
    const railY = Math.min(160, Math.max(108, stage.height - 320));
    const floorY = Math.max(0, stage.height - CELL_H - 16);
    const hangY = railY - this.climbLayout[4].gripY;
    return { railY, floorY, hangY, perchY: railY - 198,
      leftX: 12, rightX: Math.max(12, stage.width - CELL_W - 12),
      canClimb: floorY - hangY > 96 && stage.width > CELL_W + 110 };
  }

  startClimb(side) {
    const g = this.climbGeometry();
    if (!g.canClimb || this.hidden || this.dragging || this.climbMotion) return;
    this.clearExpression(false);
    this.locomotion = null;
    this.actionLock = 0;
    this.randomTarget = null;
    this.velocity = { x: 0, y: 0 };
    this.hop = 0;
    this.direction = side === "right" ? 1 : -1;
    this.surface = side;
    this.climbMotion = { phase: "crouch", elapsed: 0, side, startX: this.x, startY: g.floorY, stepStartY: g.floorY - 68, step: 0 };
    this.y = g.floorY;
    this.climbFrame = 0;
    this.setMood("蹲下蓄力");
    this.setSpeech(this.id === "tiger" ? "先抓稳，再上去。" : "朕先试试这个边框。", 1800);
  }

  beginDrop() {
    const g = this.climbGeometry();
    if (this.y >= g.floorY - 1 && !this.climbMotion) {
      this.y = g.floorY;
      return;
    }
    if (this.climbMotion?.phase === "fall" || this.climbMotion?.phase === "land") return;
    this.locomotion = null;
    this.actionLock = 0;
    this.clearExpression(false);
    this.randomTarget = null;
    this.climbMotion = { phase: "fall", elapsed: 0, side: this.direction > 0 ? "right" : "left",
      fallVelocity: 0, startY: this.y };
    this.climbFrame = 1;
    this.surface = null;
    this.swing = 0;
    this.hop = 0;
    this.setMood("松爪落下");
  }

  tickClimb(dt, stage, pointer) {
    const m = this.climbMotion;
    const g = this.climbGeometry(stage);
    const wallX = m.side === "right" ? g.rightX : g.leftX;
    const gripWall = frame => {
      const pawX = this.climbLayout[frame].sideX;
      const edgeX = m.side === "right" ? stage.width - 24 : 24;
      return edgeX - (m.side === "right" ? pawX : CELL_W - pawX);
    };
    const duration = this.id === "tiger" ? 480 : 680;
    const change = phase => { m.phase = phase; m.elapsed = 0; };
    m.elapsed += dt;
    if ((!behavior.climb || !g.canClimb) && m.phase !== "fall" && m.phase !== "land") {
      this.beginDrop(); this.render(); return;
    }
    if (m.phase === "crouch") {
      this.climbFrame = 0;
      if (m.elapsed >= (this.id === "tiger" ? 350 : 550)) change("pounce");
    } else if (m.phase === "pounce") {
      this.climbFrame = 1;
      const t = Math.min(0.48, m.elapsed / 1000);
      // A ballistic leap: gravity slows the rise, then the paws catch the frame.
      this.x = m.startX + (gripWall(2) - m.startX) * t / 0.48;
      this.y = g.floorY - 405 * t + 550 * t * t;
      this.setMood("扑向边框");
      if (t === 0.48) {
        this.x = gripWall(2); this.y = g.floorY - 68;
        m.stepStartY = this.y; change("climb");
      }
    } else if (m.phase === "climb") {
      const progress = Math.min(1, m.elapsed / duration);
      // A new paw grip precedes each pull. Hind paws push in the second half.
      const pull = Math.max(0, Math.min(1, (progress - 0.3) / 0.7));
      const eased = pull * pull * (3 - 2 * pull);
      this.climbFrame = progress < 0.3 ? 2 : 3;
      this.x = gripWall(this.climbFrame);
      this.y = Math.max(g.hangY, m.stepStartY - eased * 28);
      this.setMood(progress < 0.3 ? "前爪换抓点" : "后腿蹬、前爪拉");
      if (progress === 1) {
        m.stepStartY = this.y; m.step++; m.elapsed = 0;
        if (this.y <= g.hangY + 0.1) change("hang");
      }
    } else if (m.phase === "hang") {
      this.climbFrame = 4;
      this.x = wallX; this.y = g.hangY;
      this.swing = Math.sin(m.elapsed / 260) * 3 * Math.exp(-m.elapsed / 2200);
      this.setMood("双爪抓住，身体垂下");
      if (m.elapsed >= (this.id === "tiger" ? 1500 : 2400)) {
        this.swing = 0; change("pullup");
      }
    } else if (m.phase === "pullup") {
      const p = Math.min(1, m.elapsed / (this.id === "tiger" ? 900 : 1400));
      this.climbFrame = p < 0.35 ? 4 : 5;
      // Both hand poses share the fixed rail; the torso rises around the grip.
      this.y = g.railY - this.climbLayout[this.climbFrame].gripY;
      this.setMood("前爪撑住，后腿收上来");
      if (p === 1) change("perch");
    } else if (m.phase === "perch") {
      this.climbFrame = 6;
      this.y = g.perchY;
      this.setMood(this.id === "tiger" ? "爬上窗沿，坐稳了" : "站稳，先歇一会儿");
      if (m.elapsed >= (this.id === "tiger" ? 1800 : 2800)) {
        change("release");
      }
    } else if (m.phase === "release") {
      // Lower back over the ledge with both paws still supporting the body.
      const p = Math.min(1, m.elapsed / 650);
      this.climbFrame = p < 0.65 ? 5 : 4;
      this.y = g.railY - this.climbLayout[this.climbFrame].gripY;
      this.setMood("抓着窗沿，慢慢放下身体");
      if (p === 1) this.beginDrop();
    } else if (m.phase === "fall") {
      this.climbFrame = 1;
      this.swing = 0;
      m.fallVelocity += 1100 * dt / 1000;
      this.y = Math.min(g.floorY, this.y + m.fallVelocity * dt / 1000);
      this.setMood("松爪，向下落");
      if (this.y >= g.floorY) { this.climbFrame = 7; change("land"); }
    } else if (m.phase === "land") {
      this.climbFrame = 7;
      this.y = g.floorY;
      this.setMood("四脚落地，屈腿缓冲");
      if (m.elapsed >= 380) {
        this.climbMotion = null; this.climbFrame = null; this.surface = "bottom";
        this.direction = m.side === "right" ? -1 : 1;
        this.climbCooldown = performance.now() + 12000;
        this.idleClock = 0; this.setState("idle", true);
        const queued = this.pendingExpression;
        this.pendingExpression = null;
        if (queued) this.playExpression(queued.sequence, queued.keyOrSpeech, queued.options);
        else this.chooseIdleTarget(stage);
      }
    }
    this.el.dataset.climbPhase = this.climbMotion?.phase || "ground";
    this.render();
  }

  detectEdge(stage, target) {
    const maxX = Math.max(0, stage.width - CELL_W);
    const maxY = Math.max(0, stage.height - CELL_H);
    if (this.x <= 1 && target.x < 0) return "left";
    if (this.x >= maxX - 1 && target.x > maxX) return "right";
    if (this.y <= 1 && target.y < 0) return "top";
    if (this.y >= maxY - 1 && target.y > maxY) return "bottom";
    return null;
  }

  reactAtEdge(edge, now) {
    if (now < this.edgeCooldownUntil) return false;
    this.edgeCooldownUntil = now + 5200;
    this.randomTarget = null;
    this.chasingCursor = false;
    if (this.edgeHandler) this.edgeHandler(this, edge);
    return true;
  }

  advanceFrame(dt) {
    if (this.expressionFrame !== null || this.hidden || behavior.paused || this.climbMotion) return;
    if (!this.locomotion && (this.state === "walking" || this.state === "running")) return;
    const timings = TIMINGS[this.state] || TIMINGS.idle;
    this.frameClock += dt * (this.id === "tiger" ? 1.15 : 1);
    while (this.frameClock >= timings[this.frame]) {
      this.frameClock -= timings[this.frame];
      this.frame = (this.frame + 1) % timings.length;
    }
  }

  tick(dt, stage, pointer, now) {
    if (this.hidden) return;
    if (behavior.paused) { this.render(); return; }
    if (this.dragging) { this.render(); return; }
    if (this.climbMotion) { this.tickClimb(dt, stage, pointer); return; }
    const floor = this.climbGeometry(stage).floorY;
    if (this.y < floor - 1) { this.beginDrop(); this.tickClimb(dt, stage, pointer); return; }
    if (this.locomotion && !this.dragging) {
      const motion = this.locomotion;
      motion.elapsed = Math.min(motion.duration, motion.elapsed + dt);
      const progress = motion.elapsed / motion.duration;
      if (motion.kind === "jump") {
        // Keep the feet at the same landing point; leave room above the head.
        const flight = Math.max(0, Math.min(1, (progress - 0.18) / 0.7));
        this.hop = Math.sin(Math.PI * flight) * Math.min(this.y, this.id === "tiger" ? 82 : 58);
        this.frame = Math.min(4, Math.floor(progress * 5));
      } else {
        const speed = motion.kind === "walk" ? (this.id === "tiger" ? 112 : 86) : (this.id === "tiger" ? 310 : 245);
        this.x += this.direction * speed * dt / 1000;
        const maxX = Math.max(0, stage.width - CELL_W);
        if (this.x <= 0) this.direction = 1;
        if (this.x >= maxX) this.direction = -1;
        this.clampPosition();
      }
      if (progress === 1) {
        this.locomotion = null;
        this.hop = 0;
        this.actionLock = 0;
        this.idleClock = 0;
        this.setState("idle", true);
        this.setMood(this.config.defaultMood);
      }
      this.render();
      return;
    }
    const wasLocked = this.actionLock > 0;
    this.actionLock = Math.max(0, this.actionLock - dt);
    if (wasLocked && this.actionLock === 0) {
      this.clearExpression();
      this.setMood(this.config.defaultMood);
      this.setState("idle", true);
    }
    if (this.dragging || this.actionLock > 0) {
      this.render();
      return;
    }

    const pointerIsFresh = behavior.chase && pointer.active && now - pointer.lastMove < (this.id === "tiger" ? 5000 : 2600);
    if (pointerIsFresh && !this.previousCursorActive) {
      this.cursorRestUntil = now + (this.id === "bixia" ? 450 : 0);
    }
    this.previousCursorActive = pointerIsFresh;
    this.idleClock += dt;
    if (pointerIsFresh) {
      if (now < this.cursorRestUntil) { this.render(); return; }
      this.surface = null;
      const sideOffset = this.id === "bixia" ? -52 : 52;
      const target = {
        x: pointer.x - CELL_W / 2 + sideOffset,
        y: floor,
      };
      this.randomTarget = null;
      this.chasingCursor = true;
      this.setMood(this.id === "bixia" ? "追着看看能否吃" : "黏着光标跑");
      const reached = this.followTarget(target.x, target.y, this.id === "tiger" ? 310 : 255, dt);
      if (reached) {
        this.cursorRestUntil = now + (this.id === "tiger" ? 650 : 1800);
        this.playExpression(this.id === "tiger" ? ["cuddle"] : ["food", "innocent"],
          this.id === "tiger" ? "你动到哪，我就跟到哪。" : "闻闻，这个能吃吗？",
          { mood: this.id === "tiger" ? "clingy" : "greedy", moodLabel: this.id === "tiger" ? "追到你啦" : "先观察一下", lockMs: this.id === "tiger" ? 650 : 1200 });
      }
    } else if (this.randomTarget) {
      if (this.chasingCursor) {
        this.chasingCursor = false;
        this.setMood(this.config.defaultMood);
      }
      if (now < this.cornerPause) { this.render(); return; }
      const target = this.randomTarget;
      this.surface = "bottom";
      this.setMood(this.id === "tiger" ? "去窗边探险" : "沿边找零食");
      const reached = this.followTarget(target.x, target.y, this.id === "tiger" ? 102 : 78, dt);
      if (reached) {
        this.randomTarget = null;
        this.idleClock = 0;
        if (behavior.climb && now >= this.climbCooldown && this.climbGeometry(stage).canClimb) {
          this.startClimb(target.edge);
          this.render();
          return;
        }
        this.direction *= -1;
        this.cornerPause = now + (this.id === "tiger" ? 350 : 850);
        this.setState("idle", true);
        if (target.edge && Math.random() < 0.25) {
          this.setSpeech(this.id === "tiger" ? "拐个弯，继续探险。" : "这边会有吃的吗？", 1800);
        }
        if (target.edge === "bottom" && Math.random() < 0.2) playSignature(this.id);
        this.chooseIdleTarget(stage);
      }
    } else if (this.idleClock > 1500) {
      this.chasingCursor = false;
      const choice = Math.random();
      if (choice < 0.08) {
        this.startLocomotion("jump");
      } else if (choice < 0.2) {
        playSignature(this.id);
      } else {
        this.setMood(this.config.defaultMood);
        this.chooseIdleTarget(stage);
      }
      this.idleClock = 0;
    }
    this.render();
  }

  render() {
    this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y - this.hop)}px, 0)`;
    this.visual.style.setProperty("--facing", this.expressionFrame === null ? this.direction : 1);
    this.visual.style.setProperty("--surface-angle", `${this.swing}deg`);
    if (this.climbFrame !== null) {
      this.sprite.style.backgroundImage = `url('${this.config.climbing}')`;
      this.sprite.style.backgroundPosition = `${-this.climbFrame * CELL_W}px 0px`;
      this.sprite.style.backgroundSize = `${CELL_W * 8}px ${CELL_H}px`;
      this.el.classList.add("climbing");
      return;
    }
    this.el.classList.remove("climbing");
    if (this.expressionFrame !== null) {
      this.sprite.style.backgroundImage = `url('${this.config.expressions}')`;
      this.sprite.style.backgroundPosition = `${-(this.expressionFrame * CELL_W)}px 0px`;
      this.sprite.style.backgroundSize = `${CELL_W * 8}px ${CELL_H}px`;
      return;
    }
    if (this.state === "walking" || this.state === "running" || this.state === "jumping") {
      const row = this.state === "walking" ? 0 : 1;
      const frame = this.state === "jumping" ? [0, 1, 1, 2, 3][this.frame] : this.frame;
      this.sprite.style.backgroundImage = `url('${this.config.locomotion}')`;
      this.sprite.style.backgroundPosition = `${-frame * CELL_W}px ${-row * CELL_H}px`;
      this.sprite.style.backgroundSize = `${CELL_W * 8}px ${CELL_H * 2}px`;
      return;
    }
    // Idle and actions share the same character sheet as the gait artwork.
    this.sprite.style.backgroundImage = `url('${this.config.expressions}')`;
    this.sprite.style.backgroundPosition = "0px 0px";
    this.sprite.style.backgroundSize = `${CELL_W * 8}px ${CELL_H}px`;
  }

  startLocomotion(kind) {
    if (this.hidden || this.dragging) return;
    if (this.climbMotion) { this.beginDrop(); return; }
    this.clearExpression(false);
    this.hop = 0;
    this.randomTarget = null;
    this.chasingCursor = false;
    this.surface = null;
    this.velocity = { x: 0, y: 0 };
    const duration = kind === "jump" ? (this.id === "tiger" ? 900 : 1150) : 3000;
    this.locomotion = { kind, elapsed: 0, duration };
    this.actionLock = duration;
    this.setState({ walk: "walking", run: "running", jump: "jumping" }[kind], true);
    this.setSpeech("");
    this.setMood({ walk: "散步中", run: "撒腿跑", jump: "跳起来！" }[kind]);
    this.render();
  }
}

const stage = document.getElementById("stage");
const behavior = { chase: true, climb: true, paused: false };
function syncClimbFrame() {
  const geometry = pets.tiger.climbGeometry();
  stage.style.setProperty("--rail-y", `${geometry.railY}px`);
  stage.querySelector(".climb-frame").style.display = behavior.climb ? "" : "none";
}
const logLine = document.getElementById("log-line");
const cursorBeacon = document.getElementById("cursor-beacon");
const pointer = { active: false, x: 0, y: 0, lastMove: 0 };
const pets = {
  bixia: new PetActor("bixia", PETS.bixia, stage),
  tiger: new PetActor("tiger", PETS.tiger, stage),
};

for (const petId of ["bixia", "tiger"]) {
  const list = document.querySelector(`#profile-${petId} ul`);
  for (const line of PETS[petId].profile) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
}

function log(text) {
  logLine.textContent = text;
}

// Each pet uses its own existing artwork and action rhythm.
const SIGNATURES = {
  bixia: [
    { title: "偷偷吃两口", frames: ["food", "steal", "innocent"], speech: "feed", mood: "greedy", motion: "snack" },
    { title: "扑粉色毛绒", frames: ["destroy", "innocent"], speech: "plush", mood: "greedy", motion: "pounce" },
    { title: "扭头拒绝梳毛", frames: ["brushNo", "escape"], speech: "brush", mood: "refusing", motion: "refuse" },
  ],
  tiger: [
    { title: "像人一样坐", frames: ["humanSit"], speech: "rest", mood: "resting", motion: "sit" },
    { title: "蹭蹭求抱抱", frames: ["pitiful", "cuddle"], speech: "hug", mood: "clingy", motion: "nuzzle" },
    { title: "探头研究门", frames: ["hide", "openDoor", "scheming"], speech: "door", mood: "door", motion: "peek" },
  ],
};

function playSignature(id, index) {
  const pet = pets[id];
  if (pet.hidden || pet.dragging) return;
  const actions = SIGNATURES[id];
  const next = index ?? ((pet.lastSignature ?? -1) + 1) % actions.length;
  const action = actions[next];
  pet.lastSignature = next;
  pet.playExpression(action.frames, action.speech, {
    mood: action.mood, moodLabel: action.title, lockMs: 3200, stepMs: 850,
  });
  pet.el.dataset.motion = action.motion;
  log(`${pet.config.name}：${action.title}。`);
}

for (const button of document.querySelectorAll("[data-signature]")) {
  button.addEventListener("click", () => {
    playSignature(button.dataset.pet, Number(button.dataset.signature));
  });
}

for (const button of document.querySelectorAll("[data-locomotion]")) {
  button.addEventListener("click", () => {
    pets[button.dataset.pet].startLocomotion(button.dataset.locomotion);
  });
}

stage.addEventListener("pointermove", (event) => {
  if (event.target.closest(".behavior-toolbar")) return;
  if (Object.values(pets).some((pet) => pet.dragging)) return;
  const rect = stage.getBoundingClientRect();
  pointer.active = true;
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.lastMove = performance.now();
  cursorBeacon.style.left = `${pointer.x}px`;
  cursorBeacon.style.top = `${pointer.y}px`;
  cursorBeacon.classList.add("is-active");
});

stage.addEventListener("pointerleave", () => {
  pointer.active = false;
  cursorBeacon.classList.remove("is-active");
});

for (const button of document.querySelectorAll("[data-behavior]")) {
  button.addEventListener("click", () => {
    const key = button.dataset.behavior;
    behavior[key] = !behavior[key];
    button.setAttribute("aria-pressed", String(behavior[key]));
    button.textContent = key === "paused" ? (behavior.paused ? "继续" : "暂停") : button.textContent;
    document.body.classList.toggle("is-paused", behavior.paused);
    pointer.active = false;
    cursorBeacon.classList.remove("is-active");
    if (key === "climb") {
      syncClimbFrame();
      for (const pet of Object.values(pets)) {
        pet.surface = null;
        pet.velocity = { x: 0, y: 0 };
        pet.chooseIdleTarget(stage.getBoundingClientRect());
      }
    }
  });
}

document.getElementById("companion-mode").addEventListener("click", (event) => {
  const enabled = document.body.classList.toggle("companion-mode");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "展开档案" : "窗口陪伴";
  pointer.active = false;
  requestAnimationFrame(() => {
    syncClimbFrame();
    for (const pet of Object.values(pets)) {
      pet.clampPosition();
      pet.chooseIdleTarget(stage.getBoundingClientRect());
    }
  });
});

function positionPair(mode) {
  const rect = stage.getBoundingClientRect();
  const positions = {
    close: [[0.34, 0.54], [0.47, 0.56]],
    door: [[0.57, 0.53], [0.72, 0.51]],
    computer: [[0.38, 0.54], [0.61, 0.56]],
    food: [[0.08, 0.55], [0.28, 0.57]],
  };
  const [bixia, tiger] = positions[mode];
  pets.bixia.moveTo(rect.width * bixia[0], rect.height * bixia[1]);
  pets.tiger.moveTo(rect.width * tiger[0], rect.height * tiger[1]);
}

function playSingleScene(action) {
  const visible = pets.bixia.hidden ? pets.tiger : pets.bixia;
  const scenes = visible.id === "bixia"
    ? { feed: ["food", "steal"], plush: ["destroy", "innocent"], brush: ["brushNo"], hug: ["shortHug", "escape"], rest: ["idle"] }
    : { door: ["openDoor", "scheming"], hide: ["hide", "scheming"], computer: ["computer"], hug: ["cuddle"], rest: ["humanSit"] };
  visible.playExpression(scenes[action] || (visible.id === "bixia" ? ["innocent"] : ["pitiful"]), action, {
    mood: visible.id === "bixia" ? "greedy" : "clingy",
    moodLabel: "单独营业",
  });
  log(`${visible.config.name} 正在单独营业。`);
}

function playScene(action, automatic = false) {
  if (pets.bixia.hidden || pets.tiger.hidden) {
    playSingleScene(action);
    return;
  }

  const scene = {
    feed() {
      positionPair("food");
      pets.bixia.playExpression(["food", "steal"], "feed", { mood: "greedy", moodLabel: "馋到发亮", lockMs: 2800, stepMs: 620 });
      pets.tiger.playExpression(["pitiful"], "feed", { mood: "clingy", moodLabel: "眼巴巴看", lockMs: 2800 });
      log("陛下先冲去抢吃的，Tiger 不抢，只在旁边可怜巴巴地看。");
    },
    plush() {
      positionPair("close");
      pets.bixia.playExpression(["destroy", "innocent"], "plush", { mood: "greedy", moodLabel: "拆完装傻", lockMs: 3000, stepMs: 900 });
      pets.tiger.playExpression(["scheming"], "plush", { mood: "scheming", moodLabel: "看破不说破", lockMs: 3000 });
      log("粉色毛绒刚到手就被陛下咬了，随后立刻装作不知道。");
    },
    brush() {
      pets.bixia.playExpression(["brushNo"], "brush", { mood: "refusing", moodLabel: "拒绝梳毛", lockMs: 2400 });
      pets.tiger.playExpression(["humanSit", "scheming"], "brush", { mood: "scheming", moodLabel: "坐远看戏", lockMs: 2400, stepMs: 850 });
      log("陛下耳朵一横开始挡梳子，Tiger 很聪明地坐远了。");
    },
    hug() {
      positionPair("close");
      pets.bixia.playExpression(["shortHug", "escape"], "hug", { mood: "refusing", moodLabel: "抱久就跑", lockMs: 3000, stepMs: 1000 });
      pets.tiger.playExpression(["cuddle"], "hug", { mood: "clingy", moodLabel: "主动贴贴", lockMs: 3000 });
      log("陛下短抱一下还行，再久就挣脱；Tiger 已经准备趴到你身上。");
    },
    door() {
      positionPair("door");
      pets.tiger.playExpression(["openDoor", "hide"], "door", { mood: "door", moodLabel: "熟练开门", lockMs: 3000, stepMs: 900 });
      pets.bixia.playExpression(["innocent"], "door", { mood: "resting", moodLabel: "不会开门", lockMs: 3000 });
      log("Tiger 自己按开门把手，陛下只负责站在旁边看。");
    },
    hide() {
      positionPair("door");
      pets.tiger.playExpression(["hide", "scheming"], "hide", { mood: "scheming", moodLabel: "等你来找", lockMs: 3000, stepMs: 900 });
      pets.bixia.playExpression(["innocent", "food"], "hide", { mood: "greedy", moodLabel: "完全没懂", lockMs: 3000, stepMs: 950 });
      log("Tiger 躲到门后等你捉迷藏，陛下还在研究有没有吃的。");
    },
    computer() {
      positionPair("computer");
      pets.tiger.playExpression(["computer"], "computer", { mood: "computer", moodLabel: "霸占电脑", lockMs: 3400 });
      pets.bixia.playExpression(["idle", "food"], "computer", { mood: "greedy", moodLabel: "键盘能吃吗", lockMs: 3400, stepMs: 1000 });
      log("Tiger 整只趴到电脑前，陛下只对电脑旁的零食感兴趣。");
    },
    lick() {
      positionPair("close");
      pets.tiger.playExpression(["lick", "scheming"], "lick", { mood: "clingy", moodLabel: "又来舔陛下", lockMs: 3000, stepMs: 900 });
      pets.bixia.playExpression(["brushNo", "escape"], "lick", { mood: "refusing", moodLabel: "嫌弃但没跑", lockMs: 3000, stepMs: 950 });
      log("Tiger 又凑过去舔陛下，陛下满脸嫌弃，但并没有真的走。");
    },
    lock() {
      positionPair("door");
      pets.tiger.playExpression(["openDoor", "scheming"], "lock", { mood: "scheming", moodLabel: "腹黑得逞", lockMs: 3400, stepMs: 900 });
      pets.bixia.playExpression(["escape", "brushNo"], "lock", { mood: "fight", moodLabel: "被关厕所", lockMs: 3400, stepMs: 850 });
      log("Tiger 熟练地把门一关，不会开门的陛下在洗手间里急了。");
    },
    fight() {
      positionPair("close");
      pets.bixia.playExpression(["escape", "brushNo"], "fight", { mood: "fight", moodLabel: "气呼呼反击", lockMs: 2800, stepMs: 620, loop: true });
      pets.tiger.playExpression(["lick", "scheming"], "fight", { mood: "fight", moodLabel: "边打边算计", lockMs: 2800, stepMs: 620, loop: true });
      log("两只又打起来了，陛下直来直去，Tiger 打完还一脸有计划。");
    },
    rest() {
      pets.bixia.playExpression(["idle"], "rest", { mood: "resting", moodLabel: "吃饱发呆", lockMs: 2600 });
      pets.tiger.playExpression(["humanSit"], "rest", { mood: "resting", moodLabel: "像人一样坐", lockMs: 2600 });
      log("陛下摊着发呆，Tiger 又像人一样坐好了。");
    },
  }[action];

  if (!scene) return;
  scene();
  if (automatic) log(`两只自己演起来了：${logLine.textContent}`);
}

for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => playScene(button.dataset.action));
}

for (const button of document.querySelectorAll("[data-presence]")) {
  button.addEventListener("click", () => {
    const mode = button.dataset.presence;
    pets.bixia.setHidden(mode === "tiger");
    pets.tiger.setHidden(mode === "bixia");
    for (const pet of Object.values(pets)) {
      if (!pet.hidden) pet.chooseIdleTarget(stage.getBoundingClientRect());
    }
    for (const action of document.querySelectorAll("[data-signature], [data-locomotion]")) {
      action.disabled = pets[action.dataset.pet].hidden;
    }
    for (const option of document.querySelectorAll("[data-presence]")) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    log(mode === "both" ? "陛下和 Tiger 已经一起出现。" : `${mode === "bixia" ? "陛下" : "Tiger"} 正在单独营业。`);
  });
}

pets.bixia.onTap((pet) => {
  const options = [
    [["food", "steal"], "greedy", "突然想吃", "feed"],
    [["destroy", "innocent"], "greedy", "拆完装傻", "plush"],
    [["brushNo"], "refusing", "今天不梳", "brush"],
  ];
  const [frames, mood, label, line] = options[Math.floor(Math.random() * options.length)];
  pet.playExpression(frames, line, { mood, moodLabel: label, lockMs: 2200, stepMs: 700 });
  log("你点了陛下一下，她立刻露出了自己的小心思。");
});

pets.tiger.onTap((pet) => {
  const options = [
    [["humanSit"], "resting", "人坐姿", "我就这样坐。"],
    [["pitiful"], "clingy", "玻璃心脸", "你是不是不理我了？"],
    [["cuddle", "scheming"], "scheming", "黏人有计划", "我可以趴你肚子上吗？"],
  ];
  const [frames, mood, label, line] = options[Math.floor(Math.random() * options.length)];
  pet.playExpression(frames, line, { mood, moodLabel: label, lockMs: 2200, stepMs: 780 });
  log("你点了 Tiger 一下，他先装可怜，再观察你有没有上当。");
});

pets.bixia.onEdge((pet, edge) => {
  const scene = {
    left: { frames: ["innocent"], mood: "resting", label: "撞到边装没事", text: "陛下撞到左边了，马上装作什么都没发生。" },
    right: { frames: ["brushNo"], mood: "refusing", label: "嫌弃这个边框", text: "陛下撞到右边框，觉得是边框挡了她的路。" },
    top: { frames: ["escape"], mood: "fight", label: "顶边生气", text: "陛下撞到上边，气呼呼地往回挪。" },
    bottom: { frames: ["food"], mood: "greedy", label: "边缘发现吃的", text: "陛下撞到下边，低头看看有没有掉出来的零食。" },
  }[edge];
  pet.playExpression(scene.frames, edge === "bottom" ? "有吃的吗？" : "这边怎么过不去？", { mood: scene.mood, moodLabel: scene.label, lockMs: 1900 });
  log(scene.text);
});

pets.tiger.onEdge((pet, edge) => {
  const scene = {
    left: { frames: ["hide"], mood: "scheming", label: "把边框当门后", text: "Tiger 到左边框后探头，准备把这里当成新的躲藏点。" },
    right: { frames: ["openDoor", "scheming"], mood: "door", label: "研究边框门", text: "Tiger 研究右边框，仿佛下一秒就要把它打开。" },
    top: { frames: ["humanSit"], mood: "resting", label: "坐稳再看", text: "Tiger 碰到上边，先像人一样坐稳，再继续观察你。" },
    bottom: { frames: ["cuddle"], mood: "clingy", label: "贴着边等你", text: "Tiger 在下边框旁贴着不走，等你把光标带回来。" },
  }[edge];
  pet.playExpression(scene.frames, edge === "right" ? "这条边也许能打开。" : "我在这里等你。", { mood: scene.mood, moodLabel: scene.label, lockMs: 2100, stepMs: 650 });
  log(scene.text);
});

let nextEncounterAt = 0;
function handleEncounter(now) {
  if (behavior.paused || pointer.active) return;
  if (Object.values(pets).some((pet) => pet.surface && pet.surface !== "bottom")) return;
  if (Object.values(pets).some((pet) => pet.climbMotion)) return;
  if (now < nextEncounterAt) return;
  if (pets.bixia.hidden || pets.tiger.hidden || pets.bixia.dragging || pets.tiger.dragging) return;
  if (pets.bixia.actionLock > 0 || pets.tiger.actionLock > 0) return;
  const bixiaCenter = [pets.bixia.x + CELL_W / 2, pets.bixia.y + CELL_H / 2];
  const tigerCenter = [pets.tiger.x + CELL_W / 2, pets.tiger.y + CELL_H / 2];
  if (Math.hypot(bixiaCenter[0] - tigerCenter[0], bixiaCenter[1] - tigerCenter[1]) > 148) return;
  nextEncounterAt = now + 20000;
  pets.tiger.playExpression(["lick", "scheming"], "lick", { mood: "clingy", moodLabel: "贴过来舔", lockMs: 2300, stepMs: 750 });
  pets.bixia.playExpression(["brushNo", "escape"], "lick", { mood: "refusing", moodLabel: "嫌弃但没走", lockMs: 2300, stepMs: 850 });
  log("两只走到一起了：Tiger 贴过去舔，陛下嫌弃地躲了一下。");
}

let last = performance.now();
let nextAutoScene = last + 30000;
const autoScenes = ["feed", "plush", "hide", "computer", "lick"];

function loop(now) {
  const dt = Math.min(40, now - last);
  last = now;
  const rect = stage.getBoundingClientRect();
  for (const pet of Object.values(pets)) {
    pet.advanceFrame(dt);
    pet.tick(dt, rect, pointer, now);
  }
  handleEncounter(now);
  if (!behavior.paused && now >= nextAutoScene && !pointer.active && Object.values(pets).every((pet) => !pet.hidden && !pet.dragging && !pet.randomTarget && pet.actionLock === 0)) {
    playScene(autoScenes[Math.floor(Math.random() * autoScenes.length)], true);
    nextAutoScene = now + 14000 + Math.random() * 8000;
  }
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  syncClimbFrame();
  for (const pet of Object.values(pets)) {
    pet.clampPosition();
    if (pet.randomTarget) pet.chooseIdleTarget(stage.getBoundingClientRect());
    pet.render();
  }
});

for (const pet of Object.values(pets)) {
  pet.moveTo(pet.x, Math.max(16, stage.getBoundingClientRect().height - CELL_H - 16));
  pet.chooseIdleTarget(stage.getBoundingClientRect());
}
syncClimbFrame();
log("两只先在底部散步，走到窗边会蓄力扑上去；松爪后会落回地面。");
requestAnimationFrame(loop);
