// Water on the glass, simulated on the CPU and painted into a "water map":
// each drop is stamped from a sprite whose colour encodes its surface normal
// (red, green), thickness (blue) and coverage (alpha). A second map records
// where moving water and fingers have wiped the condensation away.

interface Drop {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  moving: boolean;
  /** Distance slid since the last droplet was left behind. */
  trail: number;
  /** A small per-drop phase, so sliding drops wander differently. */
  seed: number;
}

export interface WaterSettings {
  /** 0..1: how hard it is raining. */
  rain: number;
  /** -1..1: wind pushing sliding drops sideways. */
  wind: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeDropSprite(size: number, thickness: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      const d = Math.hypot(u, v);
      const k = (j * size + i) * 4;
      if (d >= 1) { img.data[k + 3] = 0; continue; }
      // A drop is flatter than a sphere: its sides tilt more than its top.
      const height = Math.pow(1 - d * d, 0.6);
      img.data[k] = Math.round((u * 0.5 + 0.5) * 255);
      img.data[k + 1] = Math.round((v * 0.5 + 0.5) * 255);
      img.data[k + 2] = Math.round(height * thickness * 255);
      img.data[k + 3] = Math.round(Math.min(1, (1 - d) * 9) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeSoftDisc(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.65, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export class Water {
  readonly map: HTMLCanvasElement;
  readonly clear: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly clearCtx: CanvasRenderingContext2D;
  /** Fine droplets that settle on the glass and stay until something wipes them. */
  private readonly mist: HTMLCanvasElement;
  private readonly mistCtx: CanvasRenderingContext2D;
  // Three thicknesses: the lens strength in the shader follows a drop's size.
  private readonly sprites = [makeDropSprite(64, 0.12), makeDropSprite(64, 0.5), makeDropSprite(64, 1)];
  private readonly soft = makeSoftDisc(64);
  private drops: Drop[] = [];
  private spawnDebt = 0;
  private mistDebt = 0;
  width = 1;
  height = 1;
  /** Pixels of the water map per CSS pixel. */
  scale = 1;
  maxDrops = 320;

  constructor() {
    this.map = document.createElement("canvas");
    this.clear = document.createElement("canvas");
    this.mist = document.createElement("canvas");
    this.mapCtx = this.map.getContext("2d")!;
    this.clearCtx = this.clear.getContext("2d")!;
    this.mistCtx = this.mist.getContext("2d")!;
  }

  resize(cssWidth: number, cssHeight: number, scale: number) {
    this.scale = scale;
    this.width = Math.max(1, Math.round(cssWidth * scale));
    this.height = Math.max(1, Math.round(cssHeight * scale));
    for (const c of [this.map, this.clear, this.mist]) { c.width = this.width; c.height = this.height; }
    this.reset();
  }

  /** Fog the whole window again and wipe all water. */
  reset() {
    this.drops = [];
    this.mistCtx.clearRect(0, 0, this.width, this.height);
    this.clearCtx.fillStyle = "#000";
    this.clearCtx.fillRect(0, 0, this.width, this.height);
  }

  private stamp(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
    const size = rx / this.scale;
    const sprite = this.sprites[size < 2.6 ? 0 : size < 6 ? 1 : 2];
    ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
  }

  /** Clear the fog (and any settled mist) under a circle of glass. */
  private wipe(x: number, y: number, r: number) {
    this.clearCtx.drawImage(this.soft, x - r, y - r, r * 2, r * 2);
    this.mistCtx.globalCompositeOperation = "destination-out";
    this.mistCtx.drawImage(this.soft, x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    this.mistCtx.globalCompositeOperation = "source-over";
  }

  /** A finger dragged across the glass: clears a band and pushes water aside. */
  touch(x0: number, y0: number, x1: number, y1: number) {
    const s = this.scale;
    const r = 26 * s;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * s / (r * 0.3)));
    for (let i = 0; i <= steps; i++) {
      const x = (x0 + (x1 - x0) * (i / steps)) * s;
      const y = (y0 + (y1 - y0) * (i / steps)) * s;
      this.clearCtx.drawImage(this.soft, x - r, y - r, r * 2, r * 2);
      this.mistCtx.globalCompositeOperation = "destination-out";
      this.mistCtx.drawImage(this.soft, x - r, y - r, r * 2, r * 2);
      this.mistCtx.globalCompositeOperation = "source-over";
      this.drops = this.drops.filter((d) => Math.hypot(d.x - x, d.y - y) > r * 0.9);
      // The finger leaves water along the edges of the wipe.
      if (Math.random() < 0.18) {
        const a = Math.random() * Math.PI * 2;
        this.addDrop(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(3, 7) * s);
      }
    }
  }

  private addDrop(x: number, y: number, r: number) {
    if (this.drops.length >= this.maxDrops) return;
    this.drops.push({ x, y, r, vx: 0, vy: 0, moving: false, trail: 0, seed: Math.random() * 100 });
  }

  update(dt: number, settings: WaterSettings) {
    const s = this.scale;
    const area = (this.width * this.height) / (s * s) / 1e6;
    const slideRadius = 8.5 * s;

    // New raindrops land anywhere on the glass; most are small.
    this.spawnDebt += dt * area * (8 + 170 * settings.rain * settings.rain);
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      const r = (2.4 + 13 * Math.pow(Math.random(), 2.2)) * s * (0.75 + 0.5 * settings.rain);
      this.addDrop(Math.random() * this.width, Math.random() * this.height, r);
    }
    // Fine mist settles continuously and only leaves when wiped.
    this.mistDebt += dt * area * (350 + 1100 * settings.rain);
    while (this.mistDebt >= 1) {
      this.mistDebt -= 1;
      const r = rand(0.5, 1.9) * s;
      this.stamp(this.mistCtx, Math.random() * this.width, Math.random() * this.height, r, r);
    }
    // Condensation creeps back over cleared glass.
    this.clearCtx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.035)})`;
    this.clearCtx.fillRect(0, 0, this.width, this.height);

    const g = 520 * s;
    for (const d of this.drops) {
      if (!d.moving) {
        // Heavy drops break loose; the heavier, the sooner.
        if (d.r > slideRadius && Math.random() < dt * 2.2 * (d.r / slideRadius - 0.9)) { d.moving = true; d.vy = 20 * s; }
      } else {
        // Sliding is stop-start: the glass catches a drop, then gravity wins again.
        d.vy += g * dt * Math.min(2.2, d.r / slideRadius);
        if (Math.random() < dt * 3.5) d.vy *= 0.25;
        d.vy = Math.min(d.vy, 380 * s);
        d.vx = settings.wind * d.vy * 0.35 + Math.sin(d.seed + d.y * 0.045 / s) * 14 * s;
        const dy = d.vy * dt;
        d.x += d.vx * dt;
        d.y += dy;
        d.trail += dy;
        // A sliding drop leaves a line of droplets behind and gets a little smaller.
        if (d.trail > d.r * rand(0.6, 1.4)) {
          d.trail = 0;
          const t = d.r * rand(0.18, 0.34);
          this.stamp(this.mistCtx, d.x + rand(-1, 1) * d.r * 0.2, d.y - d.r * 1.2, t, t * 1.15);
          d.r *= 0.982;
          if (d.r < slideRadius * 0.55) d.moving = false;
        }
      }
      this.wipe(d.x, d.y, d.r * (d.moving ? 1.25 : 1.05));
    }

    // Drops that touch merge into one; the combined drop keeps the larger one's motion.
    this.drops.sort((a, b) => a.x - b.x);
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      if (a.r <= 0) continue;
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        if (b.x - a.x > a.r + 20 * s) break;
        if (b.r <= 0) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.72) {
          const [big, small] = a.r >= b.r ? [a, b] : [b, a];
          big.r = Math.sqrt(big.r * big.r + small.r * small.r * 0.9);
          big.moving = big.moving || small.moving;
          big.vy = Math.max(big.vy, small.vy);
          small.r = 0;
        }
      }
    }
    this.drops = this.drops.filter((d) => d.r > 0.8 * s && d.y - d.r < this.height + 4 && d.x > -d.r && d.x < this.width + d.r);
  }

  /** Paint the water map: settled mist first, then every drop. */
  draw() {
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.mist, 0, 0);
    for (const d of this.drops) {
      if (d.moving) {
        // A sliding drop is a teardrop: a rounder head below, a narrower tail above.
        const stretch = Math.min(0.55, d.vy / (900 * this.scale));
        // The tail overlaps the head, so the two read as one teardrop rather than a bead on a stalk.
        this.stamp(ctx, d.x, d.y - d.r * 0.55, d.r * 0.55, d.r * (1.05 + stretch));
        this.stamp(ctx, d.x, d.y - d.r * 0.2, d.r * 0.78, d.r * (0.95 + stretch * 0.5));
        this.stamp(ctx, d.x, d.y, d.r * (1 - stretch * 0.2), d.r * (1 + stretch * 0.4));
      } else {
        this.stamp(ctx, d.x, d.y, d.r, d.r * 1.04);
      }
    }
  }

  /** Run the simulation for a while, so the window opens already wet. */
  warmUp(seconds: number, settings: WaterSettings) {
    for (let t = 0; t < seconds; t += 1 / 30) this.update(1 / 30, settings);
  }
}
