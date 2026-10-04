(() => {
  "use strict";

  class HFTankDuel {
    constructor(options = {}) {
      this.onGameOver = typeof options.onGameOver === "function" ? options.onGameOver : async () => {};
      this.beep = typeof options.beep === "function" ? options.beep : () => {};

      this.canvas = document.getElementById("tank-canvas");
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext("2d");
      this.overlay = document.getElementById("tank-overlay");
      this.startButton = document.getElementById("tank-start");
      this.pauseButton = document.getElementById("tank-pause");
      this.muteButton = document.getElementById("tank-mute");
      this.fireButton = document.getElementById("tank-fire");
      this.difficulty = document.getElementById("tank-difficulty");

      this.angleInput = document.getElementById("tank-angle");
      this.powerInput = document.getElementById("tank-power");
      this.angleValue = document.getElementById("tank-angle-value");
      this.powerValue = document.getElementById("tank-power-value");
      this.angleDown = document.getElementById("tank-angle-down");
      this.angleUp = document.getElementById("tank-angle-up");
      this.powerDown = document.getElementById("tank-power-down");
      this.powerUp = document.getElementById("tank-power-up");

      this.streakEl = document.getElementById("tank-streak");
      this.playerHpEl = document.getElementById("tank-player-hp");
      this.cpuHpEl = document.getElementById("tank-cpu-hp");
      this.turnLabel = document.getElementById("tank-turn-label");

      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.gravity = 210;
      this.powerScale = 5.15;
      this.windScale = 2.25;

      this.state = "idle";
      this.resumeState = null;
      this.muted = false;
      this.raf = 0;
      this.cpuTimer = 0;
      this.lastTime = 0;
      this.projectile = null;
      this.explosion = null;
      this.trail = [];

      this.streak = 0;
      this.round = 1;
      this.playerHp = 100;
      this.cpuHp = 100;
      this.wind = 0;
      this.cpuAim = { angle: 45, power: 68 };

      this.player = { x: 84, y: 350, w: 32, h: 14, facing: 1 };
      this.cpu = { x: 676, y: 350, w: 32, h: 14, facing: -1 };
      this.terrain = [];

      this.bind();
      this.generateRound();
      this.updateControlReadout();
      this.updateHud();
      this.draw();
    }

    bind() {
      this.startButton.addEventListener("click", () => {
        if (this.state === "paused") {
          this.resume();
        } else if (this.state === "roundwon") {
          this.startNextRound();
        } else {
          this.startRun();
        }
      });

      this.fireButton.addEventListener("click", () => this.playerFire());
      this.pauseButton.addEventListener("click", () => {
        if (this.state === "paused") this.resume();
        else this.pause();
      });

      this.muteButton.addEventListener("click", () => {
        this.muted = !this.muted;
        this.muteButton.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
        this.muteButton.setAttribute("aria-pressed", String(this.muted));
      });

      const sync = () => {
        this.updateControlReadout();
        this.draw();
      };
      this.angleInput.addEventListener("input", sync);
      this.powerInput.addEventListener("input", sync);
      this.difficulty.addEventListener("change", () => this.draw());

      this.angleDown.addEventListener("click", () => this.adjustAngle(-1));
      this.angleUp.addEventListener("click", () => this.adjustAngle(1));
      this.powerDown.addEventListener("click", () => this.adjustPower(-2));
      this.powerUp.addEventListener("click", () => this.adjustPower(2));

      this.canvas.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
          event.preventDefault();
        }
        if (event.key === "ArrowLeft") this.adjustAngle(-1);
        if (event.key === "ArrowRight") this.adjustAngle(1);
        if (event.key === "ArrowDown") this.adjustPower(-2);
        if (event.key === "ArrowUp") this.adjustPower(2);
        if (event.key === " ") this.playerFire();
      });

      this.canvas.addEventListener("pointerdown", () => this.canvas.focus());

      window.addEventListener("blur", () => {
        if (["player-turn", "projectile", "cpu-thinking"].includes(this.state)) this.pause();
      });
    }

    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    updateControlReadout() {
      this.angleValue.textContent = this.angleInput.value;
      this.powerValue.textContent = this.powerInput.value;
    }

    adjustAngle(amount) {
      if (this.state !== "player-turn" && this.state !== "idle" && this.state !== "over" && this.state !== "roundwon") return;
      this.angleInput.value = String(this.clamp(Number(this.angleInput.value) + amount, 10, 85));
      this.updateControlReadout();
      this.draw();
    }

    adjustPower(amount) {
      if (this.state !== "player-turn" && this.state !== "idle" && this.state !== "over" && this.state !== "roundwon") return;
      this.powerInput.value = String(this.clamp(Number(this.powerInput.value) + amount, 20, 100));
      this.updateControlReadout();
      this.draw();
    }

    startRun() {
      this.streak = 0;
      this.round = 1;
      this.playerHp = 100;
      this.cpuHp = 100;
      this.generateRound();
      this.updateHud();
      this.overlay.hidden = true;
      this.state = "player-turn";
      this.turnLabel.textContent = "YOUR TURN";
      this.pauseButton.textContent = "PAUSE";
      this.fireButton.disabled = false;
      this.canvas.focus();
      this.draw();
      this.beep(440, .05, .025, "square", this.muted);
    }

    startNextRound() {
      this.playerHp = 100;
      this.cpuHp = 100;
      this.generateRound();
      this.updateHud();
      this.overlay.hidden = true;
      this.state = "player-turn";
      this.turnLabel.textContent = "YOUR TURN";
      this.fireButton.disabled = false;
      this.canvas.focus();
      this.draw();
    }

    generateRound() {
      this.wind = Math.round(this.randomBetween(-18, 18));
      this.terrain = new Array(this.width);

      const phase1 = Math.random() * Math.PI * 2;
      const phase2 = Math.random() * Math.PI * 2;
      const phase3 = Math.random() * Math.PI * 2;

      for (let x = 0; x < this.width; x += 1) {
        const y =
          344 +
          Math.sin(x / 88 + phase1) * 54 +
          Math.sin(x / 37 + phase2) * 24 +
          Math.sin(x / 19 + phase3) * 8;
        this.terrain[x] = this.clamp(y, 238, 420);
      }

      for (let pass = 0; pass < 3; pass += 1) {
        const next = this.terrain.slice();
        for (let x = 2; x < this.width - 2; x += 1) {
          next[x] = (
            this.terrain[x - 2] +
            this.terrain[x - 1] +
            this.terrain[x] * 2 +
            this.terrain[x + 1] +
            this.terrain[x + 2]
          ) / 6;
        }
        this.terrain = next;
      }

      this.flattenTerrain(this.player.x, 42);
      this.flattenTerrain(this.cpu.x, 42);
      this.settleTanks();
      this.projectile = null;
      this.explosion = null;
      this.trail = [];
      this.cpuAim = { angle: 45, power: 68 };
    }

    flattenTerrain(center, radius) {
      const left = Math.max(0, Math.floor(center - radius));
      const right = Math.min(this.width - 1, Math.ceil(center + radius));
      let total = 0;
      for (let x = left; x <= right; x += 1) total += this.terrain[x];
      const average = total / (right - left + 1);
      for (let x = left; x <= right; x += 1) {
        const edge = Math.abs(x - center) / radius;
        const blend = this.clamp(1 - edge, 0, 1);
        this.terrain[x] = this.terrain[x] * (1 - blend) + average * blend;
      }
    }

    terrainY(x) {
      const ix = this.clamp(Math.round(x), 0, this.width - 1);
      return this.terrain[ix] ?? this.height;
    }

    settleTanks() {
      this.player.y = this.terrainY(this.player.x) - this.player.h;
      this.cpu.y = this.terrainY(this.cpu.x) - this.cpu.h;
    }

    updateHud() {
      this.streakEl.textContent = String(this.streak);
      this.playerHpEl.textContent = String(Math.max(0, Math.round(this.playerHp)));
      this.cpuHpEl.textContent = String(Math.max(0, Math.round(this.cpuHp)));
    }

    showOverlay(title, message, buttonText) {
      this.overlay.hidden = false;
      this.overlay.querySelector("strong").textContent = title;
      this.overlay.querySelector("span").textContent = message;
      this.startButton.textContent = buttonText;
    }

    pause() {
      if (!["player-turn", "projectile", "cpu-thinking"].includes(this.state)) return;
      cancelAnimationFrame(this.raf);
      clearTimeout(this.cpuTimer);
      this.resumeState = this.state;
      this.state = "paused";
      this.fireButton.disabled = true;
      this.pauseButton.textContent = "RESUME";
      this.showOverlay("PAUSED", "The tanks have agreed to a temporary ceasefire.", "RESUME");
    }

    resume() {
      if (this.state !== "paused") return;
      this.overlay.hidden = true;
      this.state = this.resumeState || "player-turn";
      this.pauseButton.textContent = "PAUSE";
      this.fireButton.disabled = this.state !== "player-turn";
      this.lastTime = performance.now();

      if (this.state === "projectile") {
        this.raf = requestAnimationFrame((t) => this.loop(t));
      } else if (this.state === "cpu-thinking") {
        this.scheduleCpuShot();
      }
    }

    playerFire() {
      if (this.state !== "player-turn") return;
      const angle = Number(this.angleInput.value);
      const power = Number(this.powerInput.value);
      this.launch("player", angle, power);
    }

    scheduleCpuShot() {
      clearTimeout(this.cpuTimer);
      this.cpuTimer = window.setTimeout(() => {
        if (this.state !== "cpu-thinking") return;
        const aim = this.chooseCpuAim();
        this.cpuAim = aim;
        this.launch("cpu", aim.angle, aim.power);
      }, 700);
    }

    chooseCpuAim() {
      let best = { angle: 45, power: 65, error: Infinity };

      for (let angle = 18; angle <= 78; angle += 3) {
        for (let power = 32; power <= 100; power += 3) {
          const impact = this.simulateImpact("cpu", angle, power);
          if (!impact) continue;
          const error = Math.abs(impact.x - this.player.x);
          if (error < best.error) best = { angle, power, error };
        }
      }

      const difficulty = this.difficulty.value;
      let angleError = 0;
      let powerError = 0;

      if (difficulty === "easy") {
        angleError = this.randomBetween(-11, 11);
        powerError = this.randomBetween(-17, 17);
      } else if (difficulty === "medium") {
        angleError = this.randomBetween(-5.5, 5.5);
        powerError = this.randomBetween(-8.5, 8.5);
      } else {
        angleError = this.randomBetween(-2.2, 2.2);
        powerError = this.randomBetween(-3.8, 3.8);
      }

      return {
        angle: this.clamp(best.angle + angleError, 10, 85),
        power: this.clamp(best.power + powerError, 20, 100)
      };
    }

    simulateImpact(owner, angle, power) {
      const tank = owner === "player" ? this.player : this.cpu;
      const facing = owner === "player" ? 1 : -1;
      const origin = this.barrelTip(tank, angle, facing);
      const radians = angle * Math.PI / 180;
      let x = origin.x;
      let y = origin.y;
      let vx = Math.cos(radians) * power * this.powerScale * facing;
      let vy = -Math.sin(radians) * power * this.powerScale;

      for (let step = 0; step < 220; step += 1) {
        const dt = .035;
        vx += this.wind * this.windScale * dt;
        vy += this.gravity * dt;
        x += vx * dt;
        y += vy * dt;

        if (x < 0 || x >= this.width || y > this.height + 20) {
          return { x: this.clamp(x, 0, this.width), y: this.height };
        }

        if (y >= this.terrainY(x)) {
          return { x, y: this.terrainY(x) };
        }
      }
      return null;
    }

    barrelTip(tank, angle, facing) {
      const radians = angle * Math.PI / 180;
      const cx = tank.x;
      const cy = tank.y - 2;
      const length = 25;
      return {
        x: cx + Math.cos(radians) * length * facing,
        y: cy - Math.sin(radians) * length
      };
    }

    launch(owner, angle, power) {
      cancelAnimationFrame(this.raf);
      clearTimeout(this.cpuTimer);

      const tank = owner === "player" ? this.player : this.cpu;
      const facing = owner === "player" ? 1 : -1;
      const origin = this.barrelTip(tank, angle, facing);
      const radians = angle * Math.PI / 180;

      this.projectile = {
        owner,
        x: origin.x,
        y: origin.y,
        vx: Math.cos(radians) * power * this.powerScale * facing,
        vy: -Math.sin(radians) * power * this.powerScale,
        age: 0
      };

      this.trail = [];
      this.explosion = null;
      this.state = "projectile";
      this.fireButton.disabled = true;
      this.turnLabel.textContent = owner === "player" ? "SHOT AWAY" : "CPU FIRING";
      this.lastTime = performance.now();
      this.beep(owner === "player" ? 640 : 420, .06, .03, "square", this.muted);
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    loop(time) {
      if (this.state !== "projectile") return;
      const dt = Math.min((time - this.lastTime) / 1000, .028);
      this.lastTime = time;

      const p = this.projectile;
      if (!p) return;

      p.age += dt;
      p.vx += this.wind * this.windScale * dt;
      p.vy += this.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      this.trail.push({ x: p.x, y: p.y });
      if (this.trail.length > 72) this.trail.shift();

      const hitTank = this.detectTankHit(p);
      if (hitTank) {
        this.explode(p.x, p.y, p.owner, hitTank);
        return;
      }

      if (p.x < -8 || p.x > this.width + 8 || p.y > this.height + 20) {
        this.finishMiss(p.owner);
        return;
      }

      if (p.x >= 0 && p.x < this.width && p.y >= this.terrainY(p.x)) {
        this.explode(p.x, this.terrainY(p.x), p.owner, null);
        return;
      }

      this.draw();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    detectTankHit(projectile) {
      const candidates = [
        { name: "player", tank: this.player },
        { name: "cpu", tank: this.cpu }
      ];

      for (const candidate of candidates) {
        if (candidate.name === projectile.owner && projectile.age < .18) continue;
        const cx = candidate.tank.x;
        const cy = candidate.tank.y + candidate.tank.h * .3;
        if (Math.hypot(projectile.x - cx, projectile.y - cy) <= 16) return candidate.name;
      }
      return null;
    }

    explode(x, y, owner, directHit) {
      cancelAnimationFrame(this.raf);
      const radius = directHit ? 36 : 30;
      this.explosion = { x, y, radius, started: performance.now() };
      this.projectile = null;
      this.state = "resolving";

      this.createCrater(x, y, radius);
      this.applyDamage(x, y, directHit);
      this.settleTanks();
      this.updateHud();
      this.draw();
      this.beep(95, .22, .06, "sawtooth", this.muted);

      window.setTimeout(() => {
        if (this.state === "paused") return;
        this.explosion = null;
        this.resolveTurn(owner);
      }, 520);
    }

    createCrater(x, y, radius) {
      const left = Math.max(0, Math.floor(x - radius));
      const right = Math.min(this.width - 1, Math.ceil(x + radius));

      for (let ix = left; ix <= right; ix += 1) {
        const dx = ix - x;
        const inside = radius * radius - dx * dx;
        if (inside <= 0) continue;
        const depth = Math.sqrt(inside) * .78;
        this.terrain[ix] = this.clamp(Math.max(this.terrain[ix], y + depth), 0, this.height - 14);
      }
    }

    applyDamage(x, y, directHit) {
      const targets = [
        { name: "player", tank: this.player },
        { name: "cpu", tank: this.cpu }
      ];

      for (const target of targets) {
        const tx = target.tank.x;
        const ty = target.tank.y + target.tank.h * .25;
        const distance = Math.hypot(x - tx, y - ty);
        const blastRadius = 74;
        if (distance > blastRadius) continue;

        let damage = Math.round((1 - distance / blastRadius) * 82) + 14;
        if (directHit === target.name) damage = 100;
        damage = this.clamp(damage, 8, 100);

        if (target.name === "player") this.playerHp -= damage;
        else this.cpuHp -= damage;
      }

      this.playerHp = Math.max(0, this.playerHp);
      this.cpuHp = Math.max(0, this.cpuHp);
    }

    finishMiss(owner) {
      cancelAnimationFrame(this.raf);
      this.projectile = null;
      this.trail = [];
      this.beep(160, .05, .02, "square", this.muted);
      this.resolveTurn(owner);
    }

    resolveTurn(owner) {
      this.updateHud();
      this.draw();

      if (this.cpuHp <= 0 && this.playerHp <= 0) {
        this.state = "roundwon";
        this.showOverlay("MUTUAL DESTRUCTION", "Technically nobody learned anything. Same streak. New battlefield.", "NEXT ROUND");
        this.turnLabel.textContent = "DRAW";
        return;
      }

      if (this.cpuHp <= 0) {
        this.streak += 1;
        this.round += 1;
        this.updateHud();
        this.state = "roundwon";
        this.turnLabel.textContent = "ROUND WON";
        this.fireButton.disabled = true;
        this.showOverlay(
          "DIRECTIVE COMPLETE",
          `Win streak: ${this.streak}. The computer would like a rematch.`,
          "NEXT ROUND"
        );
        this.beep(920, .13, .035, "triangle", this.muted);
        return;
      }

      if (this.playerHp <= 0) {
        this.gameOver();
        return;
      }

      if (owner === "player") {
        this.state = "cpu-thinking";
        this.turnLabel.textContent = `${this.difficulty.value.toUpperCase()} CPU THINKING`;
        this.scheduleCpuShot();
      } else {
        this.state = "player-turn";
        this.turnLabel.textContent = "YOUR TURN";
        this.fireButton.disabled = false;
        this.canvas.focus();
      }
    }

    async gameOver() {
      cancelAnimationFrame(this.raf);
      clearTimeout(this.cpuTimer);
      this.state = "over";
      this.fireButton.disabled = true;
      this.turnLabel.textContent = "RUN OVER";
      this.showOverlay(
        "YOU HAVE BEEN HUMBLED",
        `Final win streak: ${this.streak}. History will be unkind but accurate.`,
        "PLAY AGAIN"
      );
      this.draw();
      if (this.streak > 0) await this.onGameOver(this.streak);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // DOS-ish sky.
      ctx.fillStyle = "#2a111d";
      ctx.fillRect(0, 0, this.width, this.height);

      // Header strips.
      ctx.fillStyle = "#7b1f63";
      ctx.fillRect(0, 0, this.width, 26);
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 26, this.width, 28);

      ctx.font = '12px "DM Mono", monospace';
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f2d54d";
      ctx.fillText(`ROUND ${this.round}`, 14, 14);
      ctx.fillStyle = "#f0d8ec";
      ctx.fillText(`ANGLE ${this.angleInput.value}°`, 112, 14);
      ctx.fillText(`POWER ${this.powerInput.value}`, 222, 14);
      ctx.fillText(`WIND ${this.wind >= 0 ? "→" : "←"} ${Math.abs(this.wind)}`, 334, 14);
      ctx.fillText(`CPU ${this.difficulty.value.toUpperCase()}`, 486, 14);
      ctx.fillText(`STREAK ${this.streak}`, 650, 14);

      ctx.fillStyle = "#d763b8";
      ctx.fillText("YOU", 14, 40);
      ctx.fillStyle = "#f7f0dc";
      ctx.fillText(`${Math.max(0, Math.round(this.playerHp))} HP`, 50, 40);
      ctx.fillStyle = "#d763b8";
      ctx.fillText("CPU", 620, 40);
      ctx.fillStyle = "#f7f0dc";
      ctx.fillText(`${Math.max(0, Math.round(this.cpuHp))} HP`, 658, 40);

      // Terrain.
      ctx.beginPath();
      ctx.moveTo(0, this.height);
      ctx.lineTo(0, this.terrain[0]);
      for (let x = 1; x < this.width; x += 1) ctx.lineTo(x, this.terrain[x]);
      ctx.lineTo(this.width, this.height);
      ctx.closePath();
      ctx.fillStyle = "#19b318";
      ctx.fill();

      ctx.strokeStyle = "#5cff57";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.terrain[0]);
      for (let x = 1; x < this.width; x += 1) ctx.lineTo(x, this.terrain[x]);
      ctx.stroke();

      this.drawTank(this.player, Number(this.angleInput.value), "#f2d54d", "#fff2a8");
      this.drawTank(this.cpu, this.cpuAim.angle, "#d763b8", "#f4a6dc");

      // Trail and projectile.
      if (this.trail.length) {
        ctx.fillStyle = "rgba(255,255,255,.32)";
        for (let i = 0; i < this.trail.length; i += 3) {
          const point = this.trail[i];
          ctx.fillRect(Math.round(point.x), Math.round(point.y), 2, 2);
        }
      }

      if (this.projectile) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(this.projectile.x, this.projectile.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.explosion) {
        ctx.fillStyle = "#f2d54d";
        ctx.beginPath();
        ctx.arc(this.explosion.x, this.explosion.y, this.explosion.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff7a1a";
        ctx.beginPath();
        ctx.arc(this.explosion.x, this.explosion.y, this.explosion.radius * .58, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(this.explosion.x, this.explosion.y, this.explosion.radius * .2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Border and baseline.
      ctx.strokeStyle = "#d763b8";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 55, this.width - 2, this.height - 56);
    }

    drawTank(tank, angle, bodyColor, accentColor) {
      const ctx = this.ctx;
      const x = Math.round(tank.x);
      const y = Math.round(tank.y);
      const facing = tank.facing;
      const radians = angle * Math.PI / 180;

      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - 16, y + 5, 32, 9);
      ctx.fillRect(x - 11, y, 22, 8);

      ctx.fillStyle = accentColor;
      ctx.fillRect(x - 13, y + 14, 7, 3);
      ctx.fillRect(x - 2, y + 14, 7, 3);
      ctx.fillRect(x + 8, y + 14, 7, 3);

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(
        x + Math.cos(radians) * 25 * facing,
        y + 1 - Math.sin(radians) * 25
      );
      ctx.stroke();
      ctx.lineCap = "butt";
    }

  }

  window.HFTankDuel = HFTankDuel;
})();