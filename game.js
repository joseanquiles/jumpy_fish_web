(() => {
  "use strict";

  // ----- Logical resolution (portrait phone canvas) -----
  const LW = 540;
  const LH = 960;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

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
  const SPLASH_NAME = "splash.png";
  const GAMEOVER_NAME = "gameover.png";
  const RANK_ICONS = ["gold.png", "silver.png", "bronce.png", "diploma_4.png", "diploma_5.png"];

  const HIGH_SCORES_KEY = "jumpyFishTopScores";
  const HIGH_SCORES_MAX = 5;

  function loadTopScores() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HIGH_SCORES_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function recordScore(score) {
    const list = loadTopScores();
    const entry = { score, date: Date.now() };
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
  const hitSound = new Audio(SOUND_DIR + HIT_SOUND);
  const pointSound = new Audio(SOUND_DIR + POINT_SOUND);
  const jumpSound = new Audio(SOUND_DIR + JUMP_SOUND);
  const bgSound = new Audio(SOUND_DIR + BG_SOUND);
  bgSound.loop = true;
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
    ...FISH_FRAMES, ...BG_NAMES, STONE_BOTTOM, STONE_TOP, SPLASH_NAME, GAMEOVER_NAME, ...RANK_ICONS
  ];

  // ----- Physics / gameplay constants -----
  const GRAVITY = 1500;          // px/s^2
  const JUMP_VELOCITY = -480;    // px/s
  const MAX_FALL_SPEED = 720;    // px/s
  const FISH_X = 100;
  const FISH_W = 84;
  const FISH_H = FISH_W * (135 / 231);
  const HITBOX_INSET = 12;
  const FISH_START_Y = 80; // near the top, so the player has room to react before any rock or the floor

  const ROCK_W = 100;
  const ROCK_SPEED = 210;        // px/s
  const ROCK_SPAWN_MIN = 1.3;    // seconds
  const ROCK_SPAWN_MAX = 2.1;    // seconds
  const GAP_MIN = 210;
  const GAP_MAX = 270;
  const GAP_MARGIN = 90;         // min distance from top/bottom edges

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
    const gapTop = GAP_MARGIN + Math.random() * (LH - GAP_MARGIN * 2 - gapSize);
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

  // Closest-point test: clamp the ellipse center into the rect, then check
  // whether that closest point falls inside the ellipse.
  function ellipseIntersectsRect(cx, cy, rx, ry, x0, y0, x1, y1) {
    const closestX = Math.max(x0, Math.min(cx, x1));
    const closestY = Math.max(y0, Math.min(cy, y1));
    const dx = (closestX - cx) / rx;
    const dy = (closestY - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function checkCollisions() {
    const cx = FISH_X + FISH_W / 2;
    const cy = state.fish.y + FISH_H / 2;
    const rx = (FISH_W - HITBOX_INSET * 2) / 2;
    const ry = (FISH_H - HITBOX_INSET * 2) / 2;

    if (cy - ry <= 0 || cy + ry >= LH) {
      return "boundary";
    }

    for (const rock of state.rocks) {
      if (ellipseIntersectsRect(cx, cy, rx, ry, rock.x, 0, rock.x + ROCK_W, rock.gapTop)) {
        return "rock";
      }
      if (ellipseIntersectsRect(cx, cy, rx, ry, rock.x, rock.gapBottom, rock.x + ROCK_W, LH)) {
        return "rock";
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
      state.playTime += dt;
      const collision = checkCollisions();
      if (collision) {
        if (collision === "rock") playHitSound();
        state.mode = "dead";
        const result = recordScore(state.score);
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
    ctx.font = "bold 30px sans-serif";
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
    ctx.font = "bold 24px sans-serif";
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

  function drawGameOver() {
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

    ctx.font = "bold 22px sans-serif";
    ctx.lineWidth = 4;
    const scoreMsg = `Score: ${state.score}`;
    ctx.strokeText(scoreMsg, LW / 2, LH * 0.29);
    ctx.fillText(scoreMsg, LW / 2, LH * 0.29);

    if (state.lastScoreRank) {
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = "#ffd54a";
      const badge = state.lastScoreRank === 1
        ? "New Best Score!"
        : `New Top ${HIGH_SCORES_MAX} score! (#${state.lastScoreRank})`;
      ctx.strokeText(badge, LW / 2, LH * 0.335);
      ctx.fillText(badge, LW / 2, LH * 0.335);
      ctx.fillStyle = "#ffffff";
    }

    ctx.font = "bold 20px sans-serif";
    const title = "Best Scores";
    ctx.strokeText(title, LW / 2, LH * 0.375);
    ctx.fillText(title, LW / 2, LH * 0.375);

    const rowStart = LH * 0.415;
    const rowStep = 82;
    const iconSize = 76;
    const iconGap = 12;
    const scoreFont = "bold 26px sans-serif";
    const dateFont = "13px sans-serif";
    const sep = "   —   ";
    state.topScores.forEach((entry, i) => {
      const scoreText = `${entry.score}`;
      const dateText = formatDateTime(entry.date);

      ctx.font = scoreFont;
      const scoreWidth = ctx.measureText(scoreText).width;
      ctx.font = dateFont;
      const dateWidth = ctx.measureText(sep + dateText).width;

      const totalWidth = iconSize + iconGap + scoreWidth + dateWidth;
      const startX = LW / 2 - totalWidth / 2;
      const y = rowStart + i * rowStep;

      const icon = images[RANK_ICONS[i]];
      if (icon && icon.complete) {
        ctx.drawImage(icon, startX, y - (iconSize - 26) / 2, iconSize, iconSize);
      }

      let textX = startX + iconSize + iconGap;
      ctx.textAlign = "left";

      ctx.font = scoreFont;
      ctx.lineWidth = 4;
      ctx.strokeText(scoreText, textX, y);
      ctx.fillText(scoreText, textX, y);
      textX += scoreWidth;

      ctx.font = dateFont;
      ctx.lineWidth = 3;
      const dateY = y + 7; // nudge down so it optically centers against the taller score digits
      ctx.strokeText(sep + dateText, textX, dateY);
      ctx.fillText(sep + dateText, textX, dateY);
    });
    ctx.textAlign = "center";

    ctx.font = "bold 26px sans-serif";
    ctx.lineWidth = 4;
    const msg = "Tap to play again";
    ctx.strokeText(msg, LW / 2, LH * 0.87);
    ctx.fillText(msg, LW / 2, LH * 0.87);
  }

  function draw() {
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
    drawFish();
    drawHud();

    if (state.mode === "dead") {
      drawGameOver();
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
    draw();
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

    initBg(performance.now());
    state.mode = "splash";
    requestAnimationFrame(loop);
  }

  boot();
})();
