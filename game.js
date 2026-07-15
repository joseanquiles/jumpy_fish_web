(() => {
  "use strict";

  // ----- Logical resolution (portrait phone canvas) -----
  const LW = 540;
  const LH = 960;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const FONT_FAMILY = '"FlappyBird", sans-serif';
  function gameFont(px) {
    return `${px}px ${FONT_FAMILY}`;
  }

  // ----- Assets -----
  const IMG_DIR = "images/";
  const FISH_FRAMES = [
    "Fish_001.png", "Fish_002.png", "Fish_003.png", "Fish_004.png",
    "Fish_005.png", "Fish_006.png", "Fish_007.png", "Fish_008.png", "Fish_009.png"
  ];
  const BG_NAMES = [
    "game_background_1.png", "game_background_1_night.png",
    "game_background_2.png", "game_background_2_night.png",
    "game_background_3_night.png",
    "game_background_4.png", "game_background_4_night.png"
  ];
  const STONE_BOTTOM = "Stone_1.png"; // rock resting on the sea floor
  const STONE_TOP = "Stone_2.png";    // rock hanging from the surface
  const BUBBLE_NAME = "burbuja.png";
  const SPLASH_NAME = "splash.png";
  const GAMEOVER_NAME = "gameover.png";
  const RANK_ICONS = ["gold.png", "silver.png", "bronce.png", "diploma_4.png", "diploma_5.png"];
  function mermaidFrameList(variant, start, count) {
    const frames = [];
    for (let i = 0; i < count; i++) {
      const n = String(start + i).padStart(3, "0");
      frames.push(`enemies/mermaid_${variant}_Move_${n}.png`);
    }
    return frames;
  }
  const MERMAID_VARIANTS = [
    mermaidFrameList(1, 1, 9),
    mermaidFrameList(2, 1, 9),
    mermaidFrameList(3, 0, 9)
  ];

  const HIGH_SCORES_KEY = "jumpyFishTopScores";
  const HIGH_SCORES_MAX = 5;
  const NAME_MAX_LEN = 12;

  function promptPlayerName() {
    let input = null;
    try {
      input = window.prompt("New record! Enter your name:", "");
    } catch (err) {
      input = null;
    }
    const trimmed = (input || "").trim().slice(0, NAME_MAX_LEN);
    return trimmed || "Player";
  }

  function loadTopScores() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HIGH_SCORES_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function wouldMakeTopScores(score) {
    const list = loadTopScores();
    if (list.length < HIGH_SCORES_MAX) return true;
    const lowest = list.reduce((min, e) => Math.min(min, e.score), Infinity);
    return score > lowest;
  }

  function recordScore(score, name) {
    const list = loadTopScores();
    const entry = { score, name: name || "", date: Date.now() };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, HIGH_SCORES_MAX);
    try {
      localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(top));
    } catch (err) {
      // storage unavailable (e.g. private browsing) - keep playing without it
    }
    const rankIndex = top.indexOf(entry);
    return { top, rank: rankIndex === -1 ? null : rankIndex + 1 };
  }

  function formatDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  const SOUND_DIR = "sounds/";
  const HIT_SOUND = "hit.wav";
  const POINT_SOUND = "point.wav";
  const JUMP_SOUND = "swoosh.wav";
  const BG_SOUND = "underwater.wav";
  const MERMAID_SOUND = "mermaid.wav";
  const BUBBLE_POP_SOUND = "bubble-pop.wav";
  const hitSound = new Audio(SOUND_DIR + HIT_SOUND);
  const pointSound = new Audio(SOUND_DIR + POINT_SOUND);
  const jumpSound = new Audio(SOUND_DIR + JUMP_SOUND);
  const bgSound = new Audio(SOUND_DIR + BG_SOUND);
  const mermaidSound = new Audio(SOUND_DIR + MERMAID_SOUND);
  const bubblePopSound = new Audio(SOUND_DIR + BUBBLE_POP_SOUND);
  bgSound.loop = true;
  mermaidSound.loop = true;
  let audioUnlocked = false;

  function playHitSound() {
    hitSound.currentTime = 0;
    hitSound.play().catch(() => {});
  }

  function playPointSound() {
    pointSound.currentTime = 0;
    pointSound.play().catch(() => {});
  }

  function playJumpSound() {
    jumpSound.currentTime = 0;
    jumpSound.play().catch(() => {});
  }

  function playMermaidSound() {
    mermaidSound.currentTime = 0;
    mermaidSound.play().catch(() => {});
  }

  function stopMermaidSound() {
    mermaidSound.pause();
    mermaidSound.currentTime = 0;
  }

  function playBubblePopSound() {
    bubblePopSound.currentTime = 0;
    bubblePopSound.play().catch(() => {});
  }

  // Safari only allows playback of a media element once it has been
  // played inside a real user-gesture handler; sounds triggered later
  // from the rAF loop (e.g. hitSound on collision, pointSound on score)
  // need this one-time unlock or they silently fail to play.
  function unlockSound(audio) {
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    }
  }

  function startAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    unlockSound(hitSound);
    unlockSound(pointSound);
    unlockSound(jumpSound);
    unlockSound(mermaidSound);
    unlockSound(bubblePopSound);
    bgSound.play().catch(() => {});
  }

  const images = {};
  function loadImage(name) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = IMG_DIR + name;
      images[name] = img;
    });
  }

  const allNames = [
    ...FISH_FRAMES, ...BG_NAMES, STONE_BOTTOM, STONE_TOP, BUBBLE_NAME, SPLASH_NAME, GAMEOVER_NAME, ...RANK_ICONS,
    ...MERMAID_VARIANTS.flat()
  ];

  // ----- Physics / gameplay constants -----
  const GRAVITY = 1500;          // px/s^2
  const JUMP_VELOCITY = -480;    // px/s
  const MAX_FALL_SPEED = 720;    // px/s
  const DEAD_TAP_DELAY_MS = 4000; // taps are ignored for this long after dying
  const FISH_X = 100;
  const FISH_W = 84;
  const FISH_H = FISH_W * (135 / 231);
  const HITBOX_INSET = 17;
  const FISH_START_Y = 80; // near the top, so the player has room to react before any rock or the floor

  const ROCK_W = 100;
  const ROCK_SPEED = 210;        // px/s
  const ROCK_SPAWN_MIN = 1.3;    // seconds
  const ROCK_SPAWN_MAX = 2.1;    // seconds
  const GAP_MIN = 210;
  const GAP_MAX = 270;
  const GAP_MARGIN = 90;         // min distance from top/bottom edges
  const GAP_MAX_SHIFT = 260;     // max vertical move of the gap between consecutive rocks, so it's always reachable in time even at ROCK_SPAWN_MIN

  const MERMAID_W = 160;
  const MERMAID_H = MERMAID_W * (917 / 1173);
  const MERMAID_SPEED_MIN = 180;      // px/s - well above BG_SCROLL_SPEED so she never looks stuck
  const MERMAID_SPEED_MAX = 320;      // px/s
  const MERMAID_SPAWN_MIN = 10;       // seconds
  const MERMAID_SPAWN_MAX = 30;       // seconds
  const MERMAID_MARGIN = 150;         // min distance from top/bottom edges for her fixed height
  const MERMAID_CENTER_GAP = 0.2;     // fraction of screen height kept clear around the middle
  const MERMAID_FRAME_DURATION = 0.07; // seconds per animation frame
  const MERMAID_HITBOX_INSET_X = MERMAID_W * 0.18;
  const MERMAID_HITBOX_INSET_Y = MERMAID_H * 0.22;

  const BUBBLE_ASPECT = 1254 / 1280;
  const BUBBLE_W = 150;                // size while floating free, before being caught
  const BUBBLE_H = BUBBLE_W * BUBBLE_ASPECT;
  const BUBBLE_SPEED_MIN = 50;         // px/s - slow drift
  const BUBBLE_SPEED_MAX = 90;         // px/s
  const BUBBLE_SPAWN_MIN = 20;         // seconds
  const BUBBLE_SPAWN_MAX = 40;         // seconds
  const BUBBLE_Y_JITTER = 180;         // px of random offset around vertical center
  const BUBBLE_HITBOX_INSET_X = BUBBLE_W * 0.12;
  const BUBBLE_HITBOX_INSET_Y = BUBBLE_H * 0.12;
  const SHIELD_DURATION_MIN = 10;      // seconds the fish rides the bubble, immune
  const SHIELD_DURATION_MAX = 20;      // seconds
  const SHIELD_BUBBLE_SCALE = 2.2;     // bubble size around the fish while riding, relative to FISH_W

  const BG_SCROLL_SPEED = 45;    // px/s
  const BG_CHANGE_MIN_MS = 90000;  // 2min - 30s
  const BG_CHANGE_MAX_MS = 150000; // 2min + 30s
  const BG_FADE_DURATION = 1.2;  // seconds

  // ----- Game state -----
  const state = {
    mode: "loading", // loading | splash | playing | dead
    fish: { y: FISH_START_Y, vy: 0, angle: 0, frame: 0, frameTimer: 0 },
    rocks: [],
    spawnTimer: 0,
    score: 0,
    playTime: 0,
    topScores: [],
    lastScoreRank: null,
    deadAt: 0,
    mermaid: { active: false, x: 0, y: 0, speed: 0, variant: 0, frame: 0, frameTimer: 0 },
    mermaidSpawnTimer: 0,
    bubble: { active: false, x: 0, y: 0, speed: 0 },
    bubbleSpawnTimer: 0,
    shield: { active: false, timer: 0 },
    bg: {
      order: [],
      currentIdx: 0,
      nextIdx: -1,
      fade: 0,
      scrollX: 0,
      changeAt: 0
    }
  };

  function randomSpawnInterval() {
    return ROCK_SPAWN_MIN + Math.random() * (ROCK_SPAWN_MAX - ROCK_SPAWN_MIN);
  }

  function randomMermaidInterval() {
    return MERMAID_SPAWN_MIN + Math.random() * (MERMAID_SPAWN_MAX - MERMAID_SPAWN_MIN);
  }

  // Picks a height in the top band or the bottom band, never near the middle.
  function randomMermaidY() {
    const topMin = MERMAID_MARGIN;
    const topMax = LH * (0.5 - MERMAID_CENTER_GAP / 2) - MERMAID_H;
    const bottomMin = LH * (0.5 + MERMAID_CENTER_GAP / 2);
    const bottomMax = LH - MERMAID_MARGIN - MERMAID_H;
    return Math.random() < 0.5
      ? topMin + Math.random() * (topMax - topMin)
      : bottomMin + Math.random() * (bottomMax - bottomMin);
  }

  function randomBubbleInterval() {
    return BUBBLE_SPAWN_MIN + Math.random() * (BUBBLE_SPAWN_MAX - BUBBLE_SPAWN_MIN);
  }

  // Roughly centered vertically, with some random jitter.
  function randomBubbleY() {
    const centerY = LH / 2 - BUBBLE_H / 2;
    return centerY + (Math.random() * 2 - 1) * BUBBLE_Y_JITTER;
  }

  function randomShieldDuration() {
    return SHIELD_DURATION_MIN + Math.random() * (SHIELD_DURATION_MAX - SHIELD_DURATION_MIN);
  }

  function resetGame() {
    state.fish.y = FISH_START_Y;
    state.fish.vy = 0;
    state.fish.angle = 0;
    state.fish.frame = 0;
    state.fish.frameTimer = 0;
    state.rocks = [];
    state.spawnTimer = randomSpawnInterval();
    state.score = 0;
    state.playTime = 0;
    state.lastScoreRank = null;
    state.mermaid.active = false;
    state.mermaid.frame = 0;
    state.mermaid.frameTimer = 0;
    state.mermaidSpawnTimer = randomMermaidInterval();
    stopMermaidSound();
    state.bubble.active = false;
    state.bubbleSpawnTimer = randomBubbleInterval();
    state.shield.active = false;
    state.shield.timer = 0;
  }

  function pickNextBgIndex(excludeIdx) {
    if (BG_NAMES.length <= 1) return 0;
    let idx;
    do {
      idx = Math.floor(Math.random() * BG_NAMES.length);
    } while (idx === excludeIdx);
    return idx;
  }

  function scheduleBgChange(now) {
    const span = BG_CHANGE_MAX_MS - BG_CHANGE_MIN_MS;
    state.bg.changeAt = now + BG_CHANGE_MIN_MS + Math.random() * span;
  }

  function initBg(now) {
    state.bg.currentIdx = Math.floor(Math.random() * BG_NAMES.length);
    state.bg.nextIdx = -1;
    state.bg.fade = 0;
    state.bg.scrollX = 0;
    scheduleBgChange(now);
  }

  // ----- Rocks -----
  function spawnRockPair() {
    const gapSize = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    const minTop = GAP_MARGIN;
    const maxTop = LH - GAP_MARGIN - gapSize;

    const prevRock = state.rocks[state.rocks.length - 1];
    let gapTop;
    if (prevRock) {
      // Keep the gap within reach of the previous one, so two rocks never
      // demand a vertical jump the fish physically can't make in time.
      const lo = Math.max(minTop, prevRock.gapTop - GAP_MAX_SHIFT);
      const hi = Math.max(lo, Math.min(maxTop, prevRock.gapTop + GAP_MAX_SHIFT));
      gapTop = lo + Math.random() * (hi - lo);
    } else {
      gapTop = minTop + Math.random() * (maxTop - minTop);
    }

    const gapBottom = gapTop + gapSize;
    state.rocks.push({
      x: LW + ROCK_W,
      gapTop,
      gapBottom,
      scored: false
    });
  }

  function updateRocks(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnRockPair();
      state.spawnTimer = randomSpawnInterval();
    }
    for (const rock of state.rocks) {
      rock.x -= ROCK_SPEED * dt;
      if (!rock.scored && rock.x + ROCK_W < FISH_X) {
        rock.scored = true;
        state.score += 1;
        playPointSound();
      }
    }
    state.rocks = state.rocks.filter((r) => r.x + ROCK_W > -10);
  }

  // ----- Mermaid (enemy) -----
  function updateMermaid(dt) {
    const mermaid = state.mermaid;
    if (!mermaid.active) {
      state.mermaidSpawnTimer -= dt;
      if (state.mermaidSpawnTimer <= 0) {
        mermaid.active = true;
        mermaid.x = LW;
        mermaid.y = randomMermaidY();
        mermaid.speed = MERMAID_SPEED_MIN + Math.random() * (MERMAID_SPEED_MAX - MERMAID_SPEED_MIN);
        mermaid.variant = Math.floor(Math.random() * MERMAID_VARIANTS.length);
        mermaid.frame = 0;
        mermaid.frameTimer = 0;
        playMermaidSound();
      }
      return;
    }

    mermaid.x -= mermaid.speed * dt;
    mermaid.frameTimer += dt;
    const frames = MERMAID_VARIANTS[mermaid.variant];
    if (mermaid.frameTimer >= MERMAID_FRAME_DURATION) {
      mermaid.frameTimer -= MERMAID_FRAME_DURATION;
      mermaid.frame = (mermaid.frame + 1) % frames.length;
    }

    if (mermaid.x + MERMAID_W < 0) {
      mermaid.active = false;
      state.mermaidSpawnTimer = randomMermaidInterval();
      stopMermaidSound();
    }
  }

  function rectsOverlap(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
    return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
  }

  // ----- Bubble (power-up) -----
  function checkBubbleCatch() {
    const bubble = state.bubble;
    const fx0 = FISH_X + HITBOX_INSET;
    const fy0 = state.fish.y + HITBOX_INSET;
    const fx1 = FISH_X + FISH_W - HITBOX_INSET;
    const fy1 = state.fish.y + FISH_H - HITBOX_INSET;
    const bx0 = bubble.x + BUBBLE_HITBOX_INSET_X;
    const by0 = bubble.y + BUBBLE_HITBOX_INSET_Y;
    const bx1 = bubble.x + BUBBLE_W - BUBBLE_HITBOX_INSET_X;
    const by1 = bubble.y + BUBBLE_H - BUBBLE_HITBOX_INSET_Y;
    return rectsOverlap(fx0, fy0, fx1, fy1, bx0, by0, bx1, by1);
  }

  function updateBubble(dt) {
    const bubble = state.bubble;
    if (!bubble.active) {
      if (!state.shield.active) {
        state.bubbleSpawnTimer -= dt;
        if (state.bubbleSpawnTimer <= 0) {
          bubble.active = true;
          bubble.x = LW;
          bubble.y = randomBubbleY();
          bubble.speed = BUBBLE_SPEED_MIN + Math.random() * (BUBBLE_SPEED_MAX - BUBBLE_SPEED_MIN);
        }
      }
      return;
    }

    bubble.x -= bubble.speed * dt;

    if (checkBubbleCatch()) {
      bubble.active = false;
      state.bubbleSpawnTimer = randomBubbleInterval();
      state.shield.active = true;
      state.shield.timer = randomShieldDuration();
      playBubblePopSound();
      return;
    }

    if (bubble.x + BUBBLE_W < 0) {
      bubble.active = false;
      state.bubbleSpawnTimer = randomBubbleInterval();
    }
  }

  function updateShield(dt) {
    if (!state.shield.active) return;
    state.shield.timer -= dt;
    if (state.shield.timer <= 0) {
      state.shield.active = false;
      state.shield.timer = 0;
    }
  }

  function checkCollisions() {
    const fx0 = FISH_X + HITBOX_INSET;
    const fy0 = state.fish.y + HITBOX_INSET;
    const fx1 = FISH_X + FISH_W - HITBOX_INSET;
    const fy1 = state.fish.y + FISH_H - HITBOX_INSET;

    if (fy1 >= LH) {
      return "floor";
    }
    if (fy0 <= 0) {
      return "ceiling";
    }

    for (const rock of state.rocks) {
      if (rectsOverlap(fx0, fy0, fx1, fy1, rock.x, 0, rock.x + ROCK_W, rock.gapTop)) {
        return "rock";
      }
      if (rectsOverlap(fx0, fy0, fx1, fy1, rock.x, rock.gapBottom, rock.x + ROCK_W, LH)) {
        return "rock";
      }
    }

    if (state.mermaid.active) {
      const mx0 = state.mermaid.x + MERMAID_HITBOX_INSET_X;
      const my0 = state.mermaid.y + MERMAID_HITBOX_INSET_Y;
      const mx1 = state.mermaid.x + MERMAID_W - MERMAID_HITBOX_INSET_X;
      const my1 = state.mermaid.y + MERMAID_H - MERMAID_HITBOX_INSET_Y;
      if (rectsOverlap(fx0, fy0, fx1, fy1, mx0, my0, mx1, my1)) {
        return "mermaid";
      }
    }
    return null;
  }

  // ----- Update -----
  function updateFish(dt) {
    state.fish.vy += GRAVITY * dt;
    if (state.fish.vy > MAX_FALL_SPEED) state.fish.vy = MAX_FALL_SPEED;
    state.fish.y += state.fish.vy * dt;

    const targetAngle = Math.max(-0.5, Math.min(1.1, state.fish.vy / 500));
    state.fish.angle += (targetAngle - state.fish.angle) * Math.min(1, dt * 10);

    state.fish.frameTimer += dt;
    const frameDuration = 0.09;
    if (state.fish.frameTimer >= frameDuration) {
      state.fish.frameTimer -= frameDuration;
      state.fish.frame = (state.fish.frame + 1) % FISH_FRAMES.length;
    }
  }

  function updateBg(dt, now) {
    state.bg.scrollX -= BG_SCROLL_SPEED * dt;

    if (state.bg.nextIdx === -1 && now >= state.bg.changeAt) {
      state.bg.nextIdx = pickNextBgIndex(state.bg.currentIdx);
      state.bg.fade = 0;
    }
    if (state.bg.nextIdx !== -1) {
      state.bg.fade += dt / BG_FADE_DURATION;
      if (state.bg.fade >= 1) {
        state.bg.currentIdx = state.bg.nextIdx;
        state.bg.nextIdx = -1;
        state.bg.fade = 0;
        scheduleBgChange(now);
      }
    }
  }

  function update(dt, now) {
    updateBg(dt, now);

    if (state.mode === "playing") {
      updateFish(dt);
      updateRocks(dt);
      updateMermaid(dt);
      updateBubble(dt);
      updateShield(dt);
      state.playTime += dt;
      const collision = checkCollisions();
      if (collision && (collision === "floor" || !state.shield.active)) {
        if (collision === "rock" || collision === "mermaid") playHitSound();
        if (state.mermaid.active) stopMermaidSound();
        state.mode = "dead";
        state.deadAt = now;
        const name = wouldMakeTopScores(state.score) ? promptPlayerName() : "";
        const result = recordScore(state.score, name);
        state.topScores = result.top;
        state.lastScoreRank = result.rank;
      }
    } else if (state.mode === "dead") {
      state.fish.vy += GRAVITY * dt;
      if (state.fish.vy > MAX_FALL_SPEED) state.fish.vy = MAX_FALL_SPEED;
      state.fish.y += state.fish.vy * dt;
      if (state.fish.y + FISH_H > LH) {
        state.fish.y = LH - FISH_H;
        state.fish.vy = 0;
      }
    }
  }

  // ----- Drawing -----
  function drawBgLayer(name, alpha) {
    const img = images[name];
    if (!img || !img.complete) return;
    const scale = LH / img.height;
    const w = img.width * scale;
    const h = LH;
    let x = state.bg.scrollX % w;
    if (x > 0) x -= w;
    ctx.globalAlpha = alpha;
    for (let dx = x; dx < LW; dx += w) {
      ctx.drawImage(img, dx, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    drawBgLayer(BG_NAMES[state.bg.currentIdx], 1);
    if (state.bg.nextIdx !== -1) {
      drawBgLayer(BG_NAMES[state.bg.nextIdx], Math.min(1, state.bg.fade));
    }
  }

  function drawRocks() {
    const bottomImg = images[STONE_BOTTOM];
    const topImg = images[STONE_TOP];
    for (const rock of state.rocks) {
      if (topImg && topImg.complete && rock.gapTop > 0) {
        ctx.drawImage(topImg, rock.x, 0, ROCK_W, rock.gapTop);
      }
      if (bottomImg && bottomImg.complete && rock.gapBottom < LH) {
        ctx.drawImage(bottomImg, rock.x, rock.gapBottom, ROCK_W, LH - rock.gapBottom);
      }
    }
  }

  function drawMermaid() {
    if (!state.mermaid.active) return;
    const frames = MERMAID_VARIANTS[state.mermaid.variant];
    const img = images[frames[state.mermaid.frame]];
    if (!img || !img.complete) return;
    ctx.drawImage(img, state.mermaid.x, state.mermaid.y, MERMAID_W, MERMAID_H);
  }

  function drawBubble() {
    if (!state.bubble.active) return;
    const img = images[BUBBLE_NAME];
    if (!img || !img.complete) return;
    ctx.drawImage(img, state.bubble.x, state.bubble.y, BUBBLE_W, BUBBLE_H);
  }

  // Bubble riding along with the fish while the shield is active - drawn
  // behind the fish so the fish reads as sitting inside it.
  function drawShieldBubble() {
    if (!state.shield.active) return;
    const img = images[BUBBLE_NAME];
    if (!img || !img.complete) return;
    const w = FISH_W * SHIELD_BUBBLE_SCALE;
    const h = w * BUBBLE_ASPECT;
    const cx = FISH_X + FISH_W / 2;
    const cy = state.fish.y + FISH_H / 2;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  function drawFish() {
    const img = images[FISH_FRAMES[state.fish.frame]];
    if (!img || !img.complete) return;
    ctx.save();
    ctx.translate(FISH_X + FISH_W / 2, state.fish.y + FISH_H / 2);
    ctx.rotate(state.fish.angle);
    ctx.drawImage(img, -FISH_W / 2, -FISH_H / 2, FISH_W, FISH_H);
    ctx.restore();
  }

  function drawHud() {
    ctx.textBaseline = "top";
    ctx.font = gameFont(44);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.fillStyle = "#ffffff";

    const scoreText = String(state.score);
    ctx.textAlign = "right";
    ctx.strokeText(scoreText, LW - 20, 20);
    ctx.fillText(scoreText, LW - 20, 20);

    const totalSec = Math.floor(state.playTime);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    const timeText = `${mm}:${ss}`;
    ctx.font = gameFont(36);
    ctx.textAlign = "left";
    ctx.strokeText(timeText, 20, 20);
    ctx.fillText(timeText, 20, 20);
  }

  function drawCover(img) {
    if (!img || !img.complete) return;
    const scale = Math.max(LW / img.width, LH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (LW - w) / 2;
    const y = (LH - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  }

  function drawSplash() {
    drawBackground();
    drawCover(images[SPLASH_NAME]);
  }

  function drawGameOver(now) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, LW, LH);
    const img = images[GAMEOVER_NAME];
    if (img && img.complete) {
      const scale = Math.min((LW * 0.8) / img.width, (LH * 0.16) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (LW - w) / 2, LH * 0.185 - h / 2, w, h);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.fillStyle = "#ffffff";

    ctx.font = gameFont(32);
    ctx.lineWidth = 4;
    const scoreMsg = `Score: ${state.score}`;
    ctx.strokeText(scoreMsg, LW / 2, LH * 0.28);
    ctx.fillText(scoreMsg, LW / 2, LH * 0.28);

    if (state.lastScoreRank) {
      ctx.font = gameFont(26);
      ctx.fillStyle = "#ffd54a";
      const badge = state.lastScoreRank === 1
        ? "New Best Score!"
        : `New Top ${HIGH_SCORES_MAX} score! (#${state.lastScoreRank})`;
      ctx.strokeText(badge, LW / 2, LH * 0.33);
      ctx.fillText(badge, LW / 2, LH * 0.33);
      ctx.fillStyle = "#ffffff";
    }

    ctx.font = gameFont(30);
    const title = "Best Scores";
    ctx.strokeText(title, LW / 2, LH * 0.375);
    ctx.fillText(title, LW / 2, LH * 0.375);

    const rowStart = LH * 0.43;
    const rowStep = 84;
    const iconSize = 70;
    const iconGap = 12;
    const scoreFont = gameFont(32);
    const nameFont = gameFont(24);
    const dateFont = gameFont(16);
    state.topScores.forEach((entry, i) => {
      const scoreText = `${entry.score}`;
      const nameText = entry.name || "";
      const dateText = formatDateTime(entry.date);

      ctx.font = scoreFont;
      const scoreWidth = ctx.measureText(scoreText).width;
      ctx.font = nameFont;
      const nameWidth = nameText ? ctx.measureText("  " + nameText).width : 0;
      ctx.font = dateFont;
      const dateWidth = ctx.measureText(dateText).width;

      const line1Width = scoreWidth + nameWidth;
      const totalWidth = iconSize + iconGap + Math.max(line1Width, dateWidth);
      const startX = LW / 2 - totalWidth / 2;
      const y = rowStart + i * rowStep;

      const icon = images[RANK_ICONS[i]];
      if (icon && icon.complete) {
        ctx.drawImage(icon, startX, y - 7, iconSize, iconSize);
      }

      const textX = startX + iconSize + iconGap;
      ctx.textAlign = "left";

      ctx.font = scoreFont;
      ctx.lineWidth = 4;
      ctx.strokeText(scoreText, textX, y);
      ctx.fillText(scoreText, textX, y);

      if (nameText) {
        ctx.font = nameFont;
        ctx.lineWidth = 3;
        const nameY = y + 4; // nudge down so it optically centers against the taller score digits
        ctx.strokeText("  " + nameText, textX + scoreWidth, nameY);
        ctx.fillText("  " + nameText, textX + scoreWidth, nameY);
      }

      ctx.font = dateFont;
      ctx.lineWidth = 2;
      const dateY = y + 38;
      ctx.strokeText(dateText, textX, dateY);
      ctx.fillText(dateText, textX, dateY);
    });
    ctx.textAlign = "center";

    const remainingMs = DEAD_TAP_DELAY_MS - (now - state.deadAt);
    ctx.font = gameFont(38);
    ctx.lineWidth = 4;
    if (remainingMs > 0) {
      ctx.fillStyle = "#aaaaaa";
      const waitMsg = `Wait ${Math.ceil(remainingMs / 1000)}...`;
      ctx.strokeText(waitMsg, LW / 2, LH * 0.88);
      ctx.fillText(waitMsg, LW / 2, LH * 0.88);
      ctx.fillStyle = "#ffffff";
    } else {
      const msg = "Tap to play again";
      ctx.strokeText(msg, LW / 2, LH * 0.88);
      ctx.fillText(msg, LW / 2, LH * 0.88);
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, LW, LH);

    if (state.mode === "loading") {
      ctx.fillStyle = "#04121c";
      ctx.fillRect(0, 0, LW, LH);
      return;
    }

    if (state.mode === "splash") {
      drawSplash();
      return;
    }

    drawBackground();
    drawRocks();
    drawMermaid();
    drawBubble();
    drawShieldBubble();
    drawFish();
    drawHud();

    if (state.mode === "dead") {
      drawGameOver(now);
    }
  }

  // ----- Input -----
  function handleTap() {
    startAudio();
    if (state.mode === "splash") {
      resetGame();
      state.mode = "playing";
    } else if (state.mode === "playing") {
      state.fish.vy = JUMP_VELOCITY;
      playJumpSound();
    } else if (state.mode === "dead") {
      if (performance.now() - state.deadAt < DEAD_TAP_DELAY_MS) return;
      resetGame();
      state.mode = "playing";
    }
  }

  function setupInput() {
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleTap();
    }, { passive: false });

    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  // ----- Canvas sizing (letterboxed, integer pixel scale for crispness) -----
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const scale = Math.min(availW / LW, availH / LH);
    const cssW = LW * scale;
    const cssH = LH * scale;

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(LW * dpr * scale);
    canvas.height = Math.round(LH * dpr * scale);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  // ----- Main loop -----
  let lastTime = null;
  function loop(now) {
    if (lastTime === null) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 1 / 20); // clamp to avoid huge steps on tab switch

    update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  // ----- Boot -----
  async function boot() {
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    setupInput();
    state.topScores = loadTopScores();

    try {
      await Promise.all(allNames.map(loadImage));
    } catch (err) {
      console.error("Error cargando imágenes:", err);
    }

    try {
      await document.fonts.load(gameFont(16));
    } catch (err) {
      console.error("Error cargando la fuente:", err);
    }

    initBg(performance.now());
    state.mode = "splash";
    requestAnimationFrame(loop);
  }

  boot();
})();
