(() => {
  "use strict";

  const SUPABASE_URL = "https://vwulrywvwjevwtgizpnp.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Fy43I5bt16aGjlCL-JRvXA_Jp6u_9rz";
  const TABLE = "arcade_scores";

  const apiHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };

  const formatScore = (value) => String(Math.max(0, Math.floor(value || 0))).padStart(6, "0");

  async function getLeaderboard(game) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=initials,score,created_at&game=eq.${encodeURIComponent(game)}&order=score.desc,created_at.asc&limit=3`;
    const response = await fetch(url, { headers: apiHeaders });
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
    return response.json();
  }

  async function submitScore(game, initials, score) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: { ...apiHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ game, initials, score: Math.floor(score) })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Score submission failed (${response.status})`);
    }
  }

  const GAME_PREFIX = {
    "brick-breaker": "brick",
    pong: "pong",
    snake: "snake",
    "space-invaders": "invaders"
  };

  function renderLeaderboard(game, rows) {
    const prefix = GAME_PREFIX[game];
    const list = document.getElementById(`${prefix}-leaderboard`);
    if (!list) return;
    const safe = Array.isArray(rows) ? rows.slice(0, 3) : [];
    list.innerHTML = "";
    for (let i = 0; i < 3; i += 1) {
      const row = safe[i];
      const li = document.createElement("li");
      const rank = document.createElement("span");
      const initials = document.createElement("b");
      const score = document.createElement("strong");
      rank.textContent = String(i + 1).padStart(2, "0");
      initials.textContent = row?.initials || "---";
      score.textContent = row ? formatScore(row.score) : "------";
      li.append(rank, initials, score);
      list.appendChild(li);
    }
  }

  const leaderboardCache = {
    "brick-breaker": [],
    pong: [],
    snake: [],
    "space-invaders": []
  };

  async function refreshLeaderboard(game) {
    const prefix = GAME_PREFIX[game];
    const status = document.getElementById(`${prefix}-status`);
    try {
      const rows = await getLeaderboard(game);
      leaderboardCache[game] = rows;
      renderLeaderboard(game, rows);
      status.textContent = rows.length ? "Global scores online." : "No scores yet. The throne is vacant.";
      return rows;
    } catch (error) {
      console.error(error);
      status.textContent = "Leaderboard offline. The game still works.";
      return leaderboardCache[game];
    }
  }

  const highScoreEntry = document.getElementById("high-score-entry");
  const highScoreValue = document.getElementById("high-score-value");
  const initialsForm = document.getElementById("initials-form");
  const initialsInput = document.getElementById("initials-input");
  const submitStatus = document.getElementById("submit-status");
  let pendingHighScore = null;

  async function handleGameOver(game, score) {
    if (score <= 0) return;
    const rows = await refreshLeaderboard(game);
    const qualifies = rows.length < 3 || score > Number(rows[2]?.score || -1);
    if (!qualifies) return;
    pendingHighScore = { game, score: Math.floor(score) };
    highScoreValue.textContent = formatScore(score);
    submitStatus.textContent = "";
    initialsInput.value = "";
    highScoreEntry.hidden = false;
    requestAnimationFrame(() => {
      highScoreEntry.scrollIntoView({ behavior: "smooth", block: "nearest" });
      initialsInput.focus({ preventScroll: true });
    });
  }

  initialsInput.addEventListener("input", () => {
    initialsInput.value = initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  });

  initialsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingHighScore) return;
    const initials = initialsInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(initials)) {
      submitStatus.textContent = "Please enter exactly 3 letters or numbers.";
      initialsInput.focus();
      return;
    }
    const button = initialsForm.querySelector('button[type="submit"]');
    button.disabled = true;
    submitStatus.textContent = "Saving score…";
    try {
      await submitScore(pendingHighScore.game, initials, pendingHighScore.score);
      await refreshLeaderboard(pendingHighScore.game);
      submitStatus.textContent = "Score saved. You are now extremely important.";
      pendingHighScore = null;
      setTimeout(() => { highScoreEntry.hidden = true; }, 1700);
    } catch (error) {
      console.error(error);
      submitStatus.textContent = "Could not save the score. Try again.";
    } finally {
      button.disabled = false;
    }
  });

  // Simple retro audio generated locally with Web Audio.
  let audioContext = null;
  function beep(frequency = 440, duration = 0.04, volume = 0.035, type = "square", muted = false) {
    if (muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* sound is optional */ }
  }

  class BrickBreaker {
    constructor() {
      this.canvas = document.getElementById("brick-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.overlay = document.getElementById("brick-overlay");
      this.startButton = document.getElementById("brick-start");
      this.pauseButton = document.getElementById("brick-pause");
      this.muteButton = document.getElementById("brick-mute");
      this.scoreEl = document.getElementById("brick-score");
      this.levelEl = document.getElementById("brick-level");
      this.livesEl = document.getElementById("brick-lives");
      this.keys = new Set();
      this.muted = false;
      this.state = "idle";
      this.lastTime = 0;
      this.raf = 0;
      this.paddle = { x: 310, y: 478, w: 140, h: 14, speed: 560 };
      this.ball = { x: 380, y: 450, r: 8, vx: 215, vy: -260 };
      this.bricks = [];
      this.score = 0;
      this.level = 1;
      this.lives = 3;
      this.pointerX = null;
      this.bind();
      this.resetBricks();
      this.draw();
    }

    bind() {
      this.startButton.addEventListener("click", () => {
        if (this.state === "paused") this.togglePause();
        else this.start();
      });
      this.pauseButton.addEventListener("click", () => this.togglePause());
      this.muteButton.addEventListener("click", () => {
        this.muted = !this.muted;
        this.muteButton.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
        this.muteButton.setAttribute("aria-pressed", String(this.muted));
      });
      this.canvas.addEventListener("keydown", (e) => {
        if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D", " "].includes(e.key)) e.preventDefault();
        this.keys.add(e.key.toLowerCase());
        if (e.key === " " && this.state === "idle") this.start();
      });
      this.canvas.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
      this.canvas.addEventListener("pointermove", (e) => this.setPointer(e));
      this.canvas.addEventListener("pointerdown", (e) => { this.canvas.focus(); this.setPointer(e); });
      window.addEventListener("blur", () => { if (this.state === "running") this.pause(); });
    }

    setPointer(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    }

    resetBricks() {
      this.bricks = [];
      const cols = 10, rows = 6, gap = 7, marginX = 38, top = 72;
      const w = (this.canvas.width - marginX * 2 - gap * (cols - 1)) / cols;
      const h = 24;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          this.bricks.push({ x: marginX + c * (w + gap), y: top + r * (h + gap), w, h, alive: true, row: r });
        }
      }
    }

    resetBall(direction = -1) {
      const speed = 310 + (this.level - 1) * 26;
      const angle = (Math.random() * 0.72 + 0.42) * (Math.random() < .5 ? -1 : 1);
      this.ball.x = this.paddle.x + this.paddle.w / 2;
      this.ball.y = this.paddle.y - 18;
      this.ball.vx = Math.sin(angle) * speed;
      this.ball.vy = Math.cos(angle) * speed * direction;
    }

    start() {
      cancelAnimationFrame(this.raf);
      this.score = 0; this.level = 1; this.lives = 3;
      this.paddle.x = 310;
      this.resetBricks();
      this.resetBall(-1);
      this.updateHud();
      this.overlay.hidden = true;
      highScoreEntry.hidden = true;
      pendingHighScore = null;
      this.state = "running";
      this.pauseButton.textContent = "PAUSE";
      this.lastTime = performance.now();
      this.canvas.focus();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseButton.textContent = "RESUME";
      this.showOverlay("PAUSED", "Your reflexes have been temporarily unionized.", "RESUME");
    }

    togglePause() {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") {
        this.overlay.hidden = true;
        this.state = "running";
        this.pauseButton.textContent = "PAUSE";
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    }

    showOverlay(title, message, buttonText) {
      this.overlay.hidden = false;
      this.overlay.querySelector("strong").textContent = title;
      this.overlay.querySelector("span").textContent = message;
      this.startButton.textContent = buttonText;
    }

    updateHud() {
      this.scoreEl.textContent = formatScore(this.score);
      this.levelEl.textContent = String(this.level);
      this.livesEl.textContent = String(this.lives);
    }

    loop(time) {
      if (this.state !== "running") return;
      const dt = Math.min((time - this.lastTime) / 1000, 0.025);
      this.lastTime = time;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const left = this.keys.has("arrowleft") || this.keys.has("a");
      const right = this.keys.has("arrowright") || this.keys.has("d");
      if (left) this.paddle.x -= this.paddle.speed * dt;
      if (right) this.paddle.x += this.paddle.speed * dt;
      if (this.pointerX !== null) {
        const target = this.pointerX - this.paddle.w / 2;
        this.paddle.x += (target - this.paddle.x) * Math.min(1, dt * 14);
      }
      this.paddle.x = Math.max(12, Math.min(this.canvas.width - this.paddle.w - 12, this.paddle.x));

      const b = this.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x - b.r <= 0 && b.vx < 0) { b.x = b.r; b.vx *= -1; beep(250, .025, .02, "square", this.muted); }
      if (b.x + b.r >= this.canvas.width && b.vx > 0) { b.x = this.canvas.width - b.r; b.vx *= -1; beep(250, .025, .02, "square", this.muted); }
      if (b.y - b.r <= 0 && b.vy < 0) { b.y = b.r; b.vy *= -1; beep(310, .025, .02, "square", this.muted); }

      if (b.vy > 0 && b.y + b.r >= this.paddle.y && b.y - b.r <= this.paddle.y + this.paddle.h && b.x >= this.paddle.x && b.x <= this.paddle.x + this.paddle.w) {
        const offset = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
        const speed = Math.min(620, Math.hypot(b.vx, b.vy) * 1.015);
        const angle = offset * 1.05;
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.abs(Math.cos(angle) * speed);
        b.y = this.paddle.y - b.r - 1;
        beep(520, .035, .035, "square", this.muted);
      }

      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        if (b.x + b.r > brick.x && b.x - b.r < brick.x + brick.w && b.y + b.r > brick.y && b.y - b.r < brick.y + brick.h) {
          brick.alive = false;
          this.score += (6 - brick.row) * 10 + this.level * 5;
          const overlapLeft = (b.x + b.r) - brick.x;
          const overlapRight = (brick.x + brick.w) - (b.x - b.r);
          const overlapTop = (b.y + b.r) - brick.y;
          const overlapBottom = (brick.y + brick.h) - (b.y - b.r);
          const minX = Math.min(overlapLeft, overlapRight), minY = Math.min(overlapTop, overlapBottom);
          if (minX < minY) b.vx *= -1; else b.vy *= -1;
          beep(680 + brick.row * 45, .03, .025, "square", this.muted);
          this.updateHud();
          break;
        }
      }

      if (this.bricks.every((brick) => !brick.alive)) {
        this.level += 1;
        this.score += 1000 * this.level;
        this.resetBricks();
        this.resetBall(-1);
        this.updateHud();
        beep(880, .12, .04, "triangle", this.muted);
      }

      if (b.y - b.r > this.canvas.height) {
        this.lives -= 1;
        this.updateHud();
        beep(120, .22, .055, "sawtooth", this.muted);
        if (this.lives <= 0) this.gameOver();
        else this.resetBall(-1);
      }
    }

    async gameOver() {
      cancelAnimationFrame(this.raf);
      this.state = "over";
      this.draw();
      this.showOverlay("GAME OVER", `Final score: ${formatScore(this.score)}. The bricks remain smug.`, "PLAY AGAIN");
      await handleGameOver("brick-breaker", this.score);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#05090d"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.strokeStyle = "rgba(242,213,77,.06)"; ctx.lineWidth = 1;
      for (let x = 0; x < this.canvas.width; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke(); }
      for (let y = 0; y < this.canvas.height; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke(); }
      const colors = ["#f2d54d", "#f5e58c", "#d8e7f7", "#7da0cb", "#3c6fae", "#244f88"];
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = colors[brick.row % colors.length];
        ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(brick.x + 2, brick.y + 2, brick.w - 4, 3);
      }
      ctx.fillStyle = "#f2d54d";
      ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  class PongSurvival {
    constructor() {
      this.canvas = document.getElementById("pong-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.overlay = document.getElementById("pong-overlay");
      this.startButton = document.getElementById("pong-start");
      this.pauseButton = document.getElementById("pong-pause");
      this.muteButton = document.getElementById("pong-mute");
      this.scoreEl = document.getElementById("pong-score");
      this.streakEl = document.getElementById("pong-streak");
      this.livesEl = document.getElementById("pong-lives");
      this.keys = new Set();
      this.muted = false;
      this.state = "idle";
      this.score = 0; this.streak = 0; this.lives = 3;
      this.player = { x: 28, y: 205, w: 14, h: 110, speed: 520 };
      this.cpu = { x: 718, y: 205, w: 14, h: 110 };
      this.ball = { x: 380, y: 260, r: 8, vx: 340, vy: 170 };
      this.pointerY = null;
      this.lastTime = 0; this.raf = 0;
      this.bind();
      this.draw();
    }

    bind() {
      this.startButton.addEventListener("click", () => {
        if (this.state === "paused") this.togglePause();
        else this.start();
      });
      this.pauseButton.addEventListener("click", () => this.togglePause());
      this.muteButton.addEventListener("click", () => {
        this.muted = !this.muted;
        this.muteButton.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
        this.muteButton.setAttribute("aria-pressed", String(this.muted));
      });
      this.canvas.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "w", "W", "s", "S", " "].includes(e.key)) e.preventDefault();
        this.keys.add(e.key.toLowerCase());
        if (e.key === " " && this.state === "idle") this.start();
      });
      this.canvas.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
      this.canvas.addEventListener("pointermove", (e) => this.setPointer(e));
      this.canvas.addEventListener("pointerdown", (e) => { this.canvas.focus(); this.setPointer(e); });
      window.addEventListener("blur", () => { if (this.state === "running") this.pause(); });
    }

    setPointer(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    }

    resetBall(direction = 1) {
      const speed = 350 + Math.min(180, this.score / 55);
      const vy = (Math.random() * 280 - 140) || 90;
      this.ball.x = this.canvas.width / 2;
      this.ball.y = this.canvas.height / 2;
      this.ball.vx = Math.abs(speed) * direction;
      this.ball.vy = vy;
    }

    start() {
      cancelAnimationFrame(this.raf);
      this.score = 0; this.streak = 0; this.lives = 3;
      this.player.y = 205; this.cpu.y = 205;
      this.resetBall(-1);
      this.updateHud();
      this.overlay.hidden = true;
      highScoreEntry.hidden = true;
      pendingHighScore = null;
      this.state = "running";
      this.pauseButton.textContent = "PAUSE";
      this.lastTime = performance.now();
      this.canvas.focus();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseButton.textContent = "RESUME";
      this.showOverlay("PAUSED", "The computer is pretending not to practice.", "RESUME");
    }

    togglePause() {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") {
        this.overlay.hidden = true;
        this.state = "running";
        this.pauseButton.textContent = "PAUSE";
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    }

    showOverlay(title, message, buttonText) {
      this.overlay.hidden = false;
      this.overlay.querySelector("strong").textContent = title;
      this.overlay.querySelector("span").textContent = message;
      this.startButton.textContent = buttonText;
    }

    updateHud() {
      this.scoreEl.textContent = formatScore(this.score);
      this.streakEl.textContent = String(this.streak);
      this.livesEl.textContent = String(this.lives);
    }

    loop(time) {
      if (this.state !== "running") return;
      const dt = Math.min((time - this.lastTime) / 1000, .025);
      this.lastTime = time;
      this.update(dt); this.draw();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const up = this.keys.has("arrowup") || this.keys.has("w");
      const down = this.keys.has("arrowdown") || this.keys.has("s");
      if (up) this.player.y -= this.player.speed * dt;
      if (down) this.player.y += this.player.speed * dt;
      if (this.pointerY !== null) {
        const target = this.pointerY - this.player.h / 2;
        this.player.y += (target - this.player.y) * Math.min(1, dt * 14);
      }
      this.player.y = Math.max(12, Math.min(this.canvas.height - this.player.h - 12, this.player.y));

      const difficulty = Math.min(.92, .52 + this.score / 18000);
      const cpuTarget = this.ball.y - this.cpu.h / 2 + Math.sin(performance.now() / 380) * (38 * (1 - difficulty));
      const cpuSpeed = 260 + difficulty * 245;
      const delta = cpuTarget - this.cpu.y;
      this.cpu.y += Math.sign(delta) * Math.min(Math.abs(delta), cpuSpeed * dt);
      this.cpu.y = Math.max(12, Math.min(this.canvas.height - this.cpu.h - 12, this.cpu.y));

      const b = this.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y - b.r <= 0 && b.vy < 0) { b.y = b.r; b.vy *= -1; beep(260, .025, .02, "square", this.muted); }
      if (b.y + b.r >= this.canvas.height && b.vy > 0) { b.y = this.canvas.height - b.r; b.vy *= -1; beep(260, .025, .02, "square", this.muted); }

      if (b.vx < 0 && b.x - b.r <= this.player.x + this.player.w && b.x + b.r >= this.player.x && b.y >= this.player.y - b.r && b.y <= this.player.y + this.player.h + b.r) {
        const offset = (b.y - (this.player.y + this.player.h / 2)) / (this.player.h / 2);
        const speed = Math.min(690, Math.hypot(b.vx, b.vy) * 1.035);
        b.vx = Math.abs(Math.cos(offset * .82) * speed);
        b.vy = Math.sin(offset * .98) * speed;
        b.x = this.player.x + this.player.w + b.r + 1;
        this.streak += 1;
        this.score += 100 + Math.min(25, this.streak) * 12;
        this.updateHud();
        beep(540 + Math.min(220, this.streak * 8), .035, .035, "square", this.muted);
      }

      if (b.vx > 0 && b.x + b.r >= this.cpu.x && b.x - b.r <= this.cpu.x + this.cpu.w && b.y >= this.cpu.y - b.r && b.y <= this.cpu.y + this.cpu.h + b.r) {
        const offset = (b.y - (this.cpu.y + this.cpu.h / 2)) / (this.cpu.h / 2);
        const speed = Math.min(690, Math.hypot(b.vx, b.vy) * 1.018);
        b.vx = -Math.abs(Math.cos(offset * .82) * speed);
        b.vy = Math.sin(offset * .98) * speed;
        b.x = this.cpu.x - b.r - 1;
        beep(430, .03, .025, "square", this.muted);
      }

      if (b.x - b.r > this.canvas.width) {
        this.score += 500 + this.streak * 15;
        this.updateHud();
        beep(900, .09, .04, "triangle", this.muted);
        this.resetBall(-1);
      }

      if (b.x + b.r < 0) {
        this.lives -= 1;
        this.streak = 0;
        this.updateHud();
        beep(110, .22, .055, "sawtooth", this.muted);
        if (this.lives <= 0) this.gameOver();
        else this.resetBall(1);
      }
    }

    async gameOver() {
      cancelAnimationFrame(this.raf);
      this.state = "over";
      this.draw();
      this.showOverlay("GAME OVER", `Final score: ${formatScore(this.score)}. The machine feels nothing.`, "PLAY AGAIN");
      await handleGameOver("pong", this.score);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#05090d"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "rgba(242,213,77,.24)";
      for (let y = 18; y < this.canvas.height; y += 34) ctx.fillRect(this.canvas.width / 2 - 2, y, 4, 18);
      ctx.fillStyle = "rgba(216,231,247,.12)";
      ctx.font = '500 78px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("H", 290, 110); ctx.fillText("F", 470, 110);
      ctx.fillStyle = "#f2d54d"; ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
      ctx.fillStyle = "#d8e7f7"; ctx.fillRect(this.cpu.x, this.cpu.y, this.cpu.w, this.cpu.h);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.fill();
    }
  }


  class SnakeGame {
    constructor() {
      this.canvas = document.getElementById("snake-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.overlay = document.getElementById("snake-overlay");
      this.startButton = document.getElementById("snake-start");
      this.pauseButton = document.getElementById("snake-pause");
      this.muteButton = document.getElementById("snake-mute");
      this.scoreEl = document.getElementById("snake-score");
      this.lengthEl = document.getElementById("snake-length");
      this.speedEl = document.getElementById("snake-speed");
      this.cell = 20;
      this.cols = this.canvas.width / this.cell;
      this.rows = this.canvas.height / this.cell;
      this.state = "idle";
      this.score = 0;
      this.muted = false;
      this.snake = [];
      this.food = { x: 26, y: 13 };
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.lastTime = 0;
      this.accumulator = 0;
      this.raf = 0;
      this.swipeStart = null;
      this.bind();
      this.resetSnake();
      this.draw();
    }

    bind() {
      this.startButton.addEventListener("click", () => {
        if (this.state === "paused") this.togglePause();
        else this.start();
      });
      this.pauseButton.addEventListener("click", () => this.togglePause());
      this.muteButton.addEventListener("click", () => {
        this.muted = !this.muted;
        this.muteButton.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
        this.muteButton.setAttribute("aria-pressed", String(this.muted));
      });
      this.canvas.addEventListener("keydown", (e) => {
        const key = e.key.toLowerCase();
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(key)) e.preventDefault();
        if (key === " " && this.state === "idle") this.start();
        if (key === "arrowup" || key === "w") this.setDirection(0, -1);
        if (key === "arrowdown" || key === "s") this.setDirection(0, 1);
        if (key === "arrowleft" || key === "a") this.setDirection(-1, 0);
        if (key === "arrowright" || key === "d") this.setDirection(1, 0);
      });
      this.canvas.addEventListener("pointerdown", (e) => {
        this.canvas.focus();
        this.swipeStart = { x: e.clientX, y: e.clientY };
      });
      this.canvas.addEventListener("pointerup", (e) => {
        if (!this.swipeStart) return;
        const dx = e.clientX - this.swipeStart.x;
        const dy = e.clientY - this.swipeStart.y;
        this.swipeStart = null;
        if (Math.hypot(dx, dy) < 16) return;
        if (Math.abs(dx) > Math.abs(dy)) this.setDirection(dx > 0 ? 1 : -1, 0);
        else this.setDirection(0, dy > 0 ? 1 : -1);
      });
      window.addEventListener("blur", () => { if (this.state === "running") this.pause(); });
    }

    resetSnake() {
      this.snake = [
        { x: 12, y: 13 },
        { x: 11, y: 13 },
        { x: 10, y: 13 },
        { x: 9, y: 13 },
        { x: 8, y: 13 }
      ];
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.spawnFood();
    }

    setDirection(x, y) {
      if (this.state !== "running") return;
      if (x === -this.dir.x && y === -this.dir.y) return;
      this.nextDir = { x, y };
    }

    spawnFood() {
      const occupied = new Set(this.snake.map((s) => `${s.x},${s.y}`));
      const open = [];
      for (let y = 1; y < this.rows - 1; y += 1) {
        for (let x = 1; x < this.cols - 1; x += 1) {
          if (!occupied.has(`${x},${y}`)) open.push({ x, y });
        }
      }
      this.food = open[Math.floor(Math.random() * open.length)] || { x: 26, y: 13 };
    }

    speedLevel() {
      return 1 + Math.floor(Math.max(0, this.snake.length - 5) / 4);
    }

    stepMs() {
      return Math.max(52, 135 - (this.speedLevel() - 1) * 9);
    }

    start() {
      cancelAnimationFrame(this.raf);
      this.score = 0;
      this.resetSnake();
      this.updateHud();
      this.overlay.hidden = true;
      highScoreEntry.hidden = true;
      pendingHighScore = null;
      this.state = "running";
      this.pauseButton.textContent = "PAUSE";
      this.accumulator = 0;
      this.lastTime = performance.now();
      this.canvas.focus();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseButton.textContent = "RESUME";
      this.showOverlay("PAUSED", "The snake is considering its options.", "RESUME");
    }

    togglePause() {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") {
        this.overlay.hidden = true;
        this.state = "running";
        this.pauseButton.textContent = "PAUSE";
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    }

    showOverlay(title, message, buttonText) {
      this.overlay.hidden = false;
      this.overlay.querySelector("strong").textContent = title;
      this.overlay.querySelector("span").textContent = message;
      this.startButton.textContent = buttonText;
    }

    updateHud() {
      this.scoreEl.textContent = formatScore(this.score);
      this.lengthEl.textContent = String(this.snake.length);
      this.speedEl.textContent = String(this.speedLevel());
    }

    loop(time) {
      if (this.state !== "running") return;
      const elapsed = Math.min(time - this.lastTime, 80);
      this.lastTime = time;
      this.accumulator += elapsed;
      while (this.accumulator >= this.stepMs() && this.state === "running") {
        this.accumulator -= this.stepMs();
        this.step();
      }
      this.draw();
      if (this.state === "running") this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    step() {
      this.dir = this.nextDir;
      const head = {
        x: this.snake[0].x + this.dir.x,
        y: this.snake[0].y + this.dir.y
      };

      const hitWall = head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows;
      const hitSelf = this.snake.some((segment) => segment.x === head.x && segment.y === head.y);
      if (hitWall || hitSelf) {
        beep(105, .24, .055, "sawtooth", this.muted);
        this.gameOver();
        return;
      }

      this.snake.unshift(head);
      if (head.x === this.food.x && head.y === this.food.y) {
        this.score += 100 + Math.min(900, (this.snake.length - 5) * 15);
        this.spawnFood();
        this.updateHud();
        beep(700 + Math.min(240, this.speedLevel() * 18), .045, .035, "square", this.muted);
      } else {
        this.snake.pop();
      }
    }

    async gameOver() {
      cancelAnimationFrame(this.raf);
      this.state = "over";
      this.draw();
      this.showOverlay("GAME OVER", `Final score: ${formatScore(this.score)}. Your Nokia would be proud.`, "PLAY AGAIN");
      await handleGameOver("snake", this.score);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#05090d";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.strokeStyle = "rgba(216,231,247,.045)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.canvas.width; x += this.cell) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= this.canvas.height; y += this.cell) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
      }

      ctx.fillStyle = "#f2d54d";
      ctx.fillRect(this.food.x * this.cell + 3, this.food.y * this.cell + 3, this.cell - 6, this.cell - 6);
      ctx.fillStyle = "#7da0cb";
      ctx.fillRect(this.food.x * this.cell + 8, this.food.y * this.cell - 1, 4, 6);

      this.snake.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? "#f2d54d" : (index % 2 ? "#d8e7f7" : "#7da0cb");
        ctx.fillRect(segment.x * this.cell + 2, segment.y * this.cell + 2, this.cell - 4, this.cell - 4);
      });

      const head = this.snake[0];
      if (head) {
        ctx.fillStyle = "#05090d";
        const eyeY = head.y * this.cell + 6;
        if (this.dir.x !== 0) {
          const eyeX = head.x * this.cell + (this.dir.x > 0 ? 14 : 4);
          ctx.fillRect(eyeX, eyeY, 3, 3);
          ctx.fillRect(eyeX, eyeY + 7, 3, 3);
        } else {
          const y = head.y * this.cell + (this.dir.y > 0 ? 14 : 4);
          ctx.fillRect(head.x * this.cell + 5, y, 3, 3);
          ctx.fillRect(head.x * this.cell + 12, y, 3, 3);
        }
      }
    }
  }

  class SpaceInvadersGame {
    constructor() {
      this.canvas = document.getElementById("invaders-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.overlay = document.getElementById("invaders-overlay");
      this.startButton = document.getElementById("invaders-start");
      this.pauseButton = document.getElementById("invaders-pause");
      this.muteButton = document.getElementById("invaders-mute");
      this.scoreEl = document.getElementById("invaders-score");
      this.waveEl = document.getElementById("invaders-wave");
      this.livesEl = document.getElementById("invaders-lives");
      this.keys = new Set();
      this.muted = false;
      this.state = "idle";
      this.score = 0;
      this.wave = 1;
      this.lives = 3;
      this.player = { x: 355, y: 474, w: 50, h: 18, speed: 430 };
      this.aliens = [];
      this.playerBullets = [];
      this.enemyBullets = [];
      this.alienDirection = 1;
      this.alienSpeed = 42;
      this.fireCooldown = 0;
      this.enemyFireTimer = .7;
      this.pointerX = null;
      this.lastTime = 0;
      this.raf = 0;
      this.bind();
      this.resetWave();
      this.draw();
    }

    bind() {
      this.startButton.addEventListener("click", () => {
        if (this.state === "paused") this.togglePause();
        else this.start();
      });
      this.pauseButton.addEventListener("click", () => this.togglePause());
      this.muteButton.addEventListener("click", () => {
        this.muted = !this.muted;
        this.muteButton.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
        this.muteButton.setAttribute("aria-pressed", String(this.muted));
      });
      this.canvas.addEventListener("keydown", (e) => {
        const key = e.key.toLowerCase();
        if (["arrowleft", "arrowright", "a", "d", " "].includes(key)) e.preventDefault();
        this.keys.add(key);
        if (key === " " && this.state === "idle") this.start();
        else if (key === " " && this.state === "running") this.fire();
      });
      this.canvas.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
      this.canvas.addEventListener("pointermove", (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointerX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      });
      this.canvas.addEventListener("pointerdown", (e) => {
        this.canvas.focus();
        const rect = this.canvas.getBoundingClientRect();
        this.pointerX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        if (this.state === "running") this.fire();
      });
      window.addEventListener("blur", () => { if (this.state === "running") this.pause(); });
    }

    resetWave() {
      this.aliens = [];
      const rows = 5, cols = 9;
      const startX = 112, startY = 76, gapX = 58, gapY = 46;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          this.aliens.push({
            x: startX + c * gapX,
            y: startY + r * gapY,
            w: 34,
            h: 24,
            row: r,
            col: c,
            alive: true
          });
        }
      }
      this.alienDirection = 1;
      this.alienSpeed = 38 + (this.wave - 1) * 8;
      this.playerBullets = [];
      this.enemyBullets = [];
      this.enemyFireTimer = .8;
    }

    start() {
      cancelAnimationFrame(this.raf);
      this.score = 0;
      this.wave = 1;
      this.lives = 3;
      this.player.x = 355;
      this.fireCooldown = 0;
      this.resetWave();
      this.updateHud();
      this.overlay.hidden = true;
      highScoreEntry.hidden = true;
      pendingHighScore = null;
      this.state = "running";
      this.pauseButton.textContent = "PAUSE";
      this.lastTime = performance.now();
      this.canvas.focus();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseButton.textContent = "RESUME";
      this.showOverlay("PAUSED", "The invasion has agreed to a brief ceasefire.", "RESUME");
    }

    togglePause() {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") {
        this.overlay.hidden = true;
        this.state = "running";
        this.pauseButton.textContent = "PAUSE";
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    }

    showOverlay(title, message, buttonText) {
      this.overlay.hidden = false;
      this.overlay.querySelector("strong").textContent = title;
      this.overlay.querySelector("span").textContent = message;
      this.startButton.textContent = buttonText;
    }

    updateHud() {
      this.scoreEl.textContent = formatScore(this.score);
      this.waveEl.textContent = String(this.wave);
      this.livesEl.textContent = String(this.lives);
    }

    fire() {
      if (this.state !== "running" || this.fireCooldown > 0 || this.playerBullets.length >= 3) return;
      this.playerBullets.push({
        x: this.player.x + this.player.w / 2 - 2,
        y: this.player.y - 8,
        w: 4,
        h: 12,
        vy: -520
      });
      this.fireCooldown = .22;
      beep(760, .035, .025, "square", this.muted);
    }

    loop(time) {
      if (this.state !== "running") return;
      const dt = Math.min((time - this.lastTime) / 1000, .03);
      this.lastTime = time;
      this.update(dt);
      this.draw();
      if (this.state === "running") this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const left = this.keys.has("arrowleft") || this.keys.has("a");
      const right = this.keys.has("arrowright") || this.keys.has("d");
      if (left) this.player.x -= this.player.speed * dt;
      if (right) this.player.x += this.player.speed * dt;
      if (this.pointerX !== null) {
        const target = this.pointerX - this.player.w / 2;
        this.player.x += (target - this.player.x) * Math.min(1, dt * 12);
      }
      this.player.x = Math.max(12, Math.min(this.canvas.width - this.player.w - 12, this.player.x));

      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (this.keys.has(" ")) this.fire();

      let hitEdge = false;
      const living = this.aliens.filter((a) => a.alive);
      const movement = this.alienDirection * this.alienSpeed * dt * (1 + (45 - living.length) / 70);
      for (const alien of living) {
        alien.x += movement;
        if (alien.x < 20 || alien.x + alien.w > this.canvas.width - 20) hitEdge = true;
      }
      if (hitEdge) {
        this.alienDirection *= -1;
        for (const alien of living) {
          alien.x += this.alienDirection * 5;
          alien.y += 18;
        }
        beep(150, .025, .02, "square", this.muted);
      }

      if (living.some((alien) => alien.y + alien.h >= this.player.y - 8)) {
        this.loseLife(true);
        return;
      }

      this.enemyFireTimer -= dt;
      if (this.enemyFireTimer <= 0 && living.length) {
        const bottomByColumn = new Map();
        for (const alien of living) {
          const current = bottomByColumn.get(alien.col);
          if (!current || alien.y > current.y) bottomByColumn.set(alien.col, alien);
        }
        const shooters = [...bottomByColumn.values()];
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        if (shooter) {
          this.enemyBullets.push({
            x: shooter.x + shooter.w / 2 - 2,
            y: shooter.y + shooter.h + 3,
            w: 4,
            h: 12,
            vy: 205 + this.wave * 18
          });
        }
        this.enemyFireTimer = Math.max(.28, .86 - this.wave * .055) + Math.random() * .28;
      }

      for (const bullet of this.playerBullets) bullet.y += bullet.vy * dt;
      for (const bullet of this.enemyBullets) bullet.y += bullet.vy * dt;

      for (const bullet of this.playerBullets) {
        if (bullet.dead) continue;
        for (const alien of this.aliens) {
          if (!alien.alive) continue;
          if (this.overlap(bullet, alien)) {
            bullet.dead = true;
            alien.alive = false;
            this.score += (5 - alien.row) * 60 + this.wave * 15;
            this.updateHud();
            beep(520 + alien.row * 55, .045, .03, "square", this.muted);
            break;
          }
        }
      }

      for (const bullet of this.enemyBullets) {
        if (!bullet.dead && this.overlap(bullet, this.player)) {
          bullet.dead = true;
          this.loseLife(false);
          return;
        }
      }

      this.playerBullets = this.playerBullets.filter((b) => !b.dead && b.y + b.h > 0);
      this.enemyBullets = this.enemyBullets.filter((b) => !b.dead && b.y < this.canvas.height + 20);

      if (this.aliens.every((alien) => !alien.alive)) {
        this.wave += 1;
        this.score += 1000 * this.wave;
        this.updateHud();
        beep(920, .14, .04, "triangle", this.muted);
        this.resetWave();
      }
    }

    overlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    loseLife(fromInvasion) {
      this.lives -= 1;
      this.updateHud();
      beep(95, .25, .06, "sawtooth", this.muted);
      if (this.lives <= 0) {
        this.gameOver();
        return;
      }
      this.player.x = 355;
      this.playerBullets = [];
      this.enemyBullets = [];
      if (fromInvasion) this.resetWave();
    }

    async gameOver() {
      cancelAnimationFrame(this.raf);
      this.state = "over";
      this.draw();
      this.showOverlay("GAME OVER", `Final score: ${formatScore(this.score)}. Earth has filed an appeal.`, "PLAY AGAIN");
      await handleGameOver("space-invaders", this.score);
    }

    drawAlien(ctx, alien) {
      const x = Math.round(alien.x), y = Math.round(alien.y);
      const color = alien.row < 2 ? "#f2d54d" : (alien.row < 4 ? "#d8e7f7" : "#7da0cb");
      ctx.fillStyle = color;
      ctx.fillRect(x + 7, y, 20, 4);
      ctx.fillRect(x + 3, y + 4, 28, 4);
      ctx.fillRect(x, y + 8, 34, 8);
      ctx.fillRect(x + 4, y + 16, 7, 4);
      ctx.fillRect(x + 23, y + 16, 7, 4);
      ctx.fillRect(x + 8, y + 20, 5, 4);
      ctx.fillRect(x + 21, y + 20, 5, 4);
      ctx.fillStyle = "#05090d";
      ctx.fillRect(x + 8, y + 9, 4, 4);
      ctx.fillRect(x + 22, y + 9, 4, 4);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#05090d";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "rgba(216,231,247,.16)";
      for (let i = 0; i < 52; i += 1) {
        const x = (i * 149) % this.canvas.width;
        const y = (i * 83) % 360;
        ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
      }

      for (const alien of this.aliens) {
        if (alien.alive) this.drawAlien(ctx, alien);
      }

      ctx.fillStyle = "#f2d54d";
      ctx.fillRect(this.player.x, this.player.y + 7, this.player.w, 11);
      ctx.fillRect(this.player.x + 9, this.player.y + 3, this.player.w - 18, 8);
      ctx.fillRect(this.player.x + this.player.w / 2 - 4, this.player.y - 2, 8, 8);

      ctx.fillStyle = "#fff";
      for (const bullet of this.playerBullets) ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
      ctx.fillStyle = "#7da0cb";
      for (const bullet of this.enemyBullets) ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);

      ctx.fillStyle = "rgba(242,213,77,.24)";
      ctx.fillRect(18, this.canvas.height - 22, this.canvas.width - 36, 2);
    }
  }

  // Tabs. Pause whichever game is being hidden so nothing runs offscreen.
  const tabs = [...document.querySelectorAll("[data-game-tab]")];
  const panels = [...document.querySelectorAll("[data-game-panel]")];
  const games = {};

  if (document.getElementById("brick-canvas")) games.brick = new BrickBreaker();
  if (document.getElementById("pong-canvas")) games.pong = new PongSurvival();
  if (document.getElementById("snake-canvas")) games.snake = new SnakeGame();
  if (document.getElementById("invaders-canvas")) games.invaders = new SpaceInvadersGame();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.gameTab;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      panels.forEach((panel) => {
        const active = panel.dataset.gamePanel === target;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      });
      Object.entries(games).forEach(([key, game]) => {
        if (key !== target && game.state === "running") game.pause();
      });
      highScoreEntry.hidden = true;
      pendingHighScore = null;
    });
  });

  if (document.getElementById("brick-leaderboard")) refreshLeaderboard("brick-breaker");
  if (document.getElementById("pong-leaderboard")) refreshLeaderboard("pong");
  if (document.getElementById("snake-leaderboard")) refreshLeaderboard("snake");
  if (document.getElementById("invaders-leaderboard")) refreshLeaderboard("space-invaders");
})();
