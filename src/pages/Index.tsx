"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { Settings, RotateCcw, CloudRain, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  RainSimulation,
  SimplexNoise,
  Droplet,
  TrailBead,
} from '@/simulation/RainSimulation';
import type { RainSettings } from '@/simulation/RainSimulation';

// ============================================================================
// HYPER-REALISTIC RAIN SIMULATOR
// Complete rewrite with bokeh, organic drops, condensation, film grain
// ============================================================================

interface BokehOrb {
  x: number;
  y: number;
  radius: number;
  hue: number;
  sat: number;
  lightness: number;
  opacity: number;
  driftX: number;
  driftY: number;
  pulsePhase: number;
  pulseSpeed: number;
  streakFactor: number; // 1 = circle, >1 = vertical streak
}

interface BackgroundRainStreak {
  x: number;
  y: number;
  z: number;
  length: number;
  speed: number;
  opacity: number;
  thickness: number;
}

// Shape perturbations for organic drop outlines
interface DropShape {
  perturbations: number[];  // base shape
  numPoints: number;
  wobblePhase: number;      // current wobble offset for animation
  wobbleSpeed: number;      // how fast wobble oscillates
  wobbleAmp: number;        // wobble amplitude (scales with recent merge/speed)
  gravityBulge: number;     // 0-1: how pear-shaped the drop is (higher = more teardrop)
}

const DEFAULT_SETTINGS: RainSettings = {
  intensity: 60,
  dropletSize: 5,
  windSpeed: 15,
  windAngle: 10,
  trailPersistence: 50,
  glassWetness: 50,
  gravity: 5,
  surfaceTension: 5,
  thunder: true,
  thunderFrequency: 5,
  bokehIntensity: 70,
  fogDensity: 30,
  glassBlur: 60,
};

// ============================================================================
// HELPERS
// ============================================================================

function generateDropShape(complexity: number = 14): DropShape {
  const raw: number[] = [];
  for (let i = 0; i < complexity; i++) {
    raw.push(0.88 + Math.random() * 0.24);
  }
  // Double-pass smoothing for organic curves
  let smoothed = raw.map((val, i) => {
    const prev = raw[(i - 1 + complexity) % complexity];
    const next = raw[(i + 1) % complexity];
    return prev * 0.25 + val * 0.5 + next * 0.25;
  });
  smoothed = smoothed.map((val, i) => {
    const prev = smoothed[(i - 1 + complexity) % complexity];
    const next = smoothed[(i + 1) % complexity];
    return prev * 0.2 + val * 0.6 + next * 0.2;
  });
  return {
    perturbations: smoothed,
    numPoints: complexity,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 1.5 + Math.random() * 2.5,
    wobbleAmp: 0.02 + Math.random() * 0.02,
    gravityBulge: 0,
  };
}

function drawDropPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  rx: number, ry: number,
  shape: DropShape,
  time: number = 0
) {
  const { perturbations, numPoints, wobblePhase, wobbleSpeed, wobbleAmp, gravityBulge } = shape;
  const points: { x: number; y: number }[] = [];
  const wobbleT = time * 0.001 * wobbleSpeed + wobblePhase;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    let r = perturbations[i];

    // Wobble: sinusoidal deformation that oscillates over time
    // Use different frequencies per point for organic feel
    const wobble = Math.sin(wobbleT + i * 1.7) * wobbleAmp +
                   Math.sin(wobbleT * 1.3 + i * 2.3) * wobbleAmp * 0.5;
    r += wobble;

    // Gravity bulge: bottom half expands, top half contracts (pear/teardrop)
    // sin(angle) > 0 means bottom half, < 0 means top half
    const sinA = Math.sin(angle);
    const bulgeEffect = gravityBulge * 0.25;
    if (sinA > 0) {
      // Bottom: expand outward
      r += sinA * bulgeEffect;
    } else {
      // Top: contract inward, narrow to a point
      r += sinA * bulgeEffect * 0.6;
    }

    points.push({
      x: x + Math.cos(angle) * rx * r,
      y: y + Math.sin(angle) * ry * r,
    });
  }

  ctx.beginPath();
  const startX = (points[0].x + points[numPoints - 1].x) / 2;
  const startY = (points[0].y + points[numPoints - 1].y) / 2;
  ctx.moveTo(startX, startY);
  for (let i = 0; i < numPoints; i++) {
    const curr = points[i];
    const next = points[(i + 1) % numPoints];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }
  ctx.closePath();
}

function generateBokehField(
  width: number,
  height: number,
  intensity: number
): BokehOrb[] {
  const count = Math.floor(30 + (intensity / 100) * 50);
  const colors = [
    { hue: 40, sat: 90, lightness: 60 },   // warm yellow (sodium lamps)
    { hue: 25, sat: 95, lightness: 55 },   // orange
    { hue: 0, sat: 80, lightness: 50 },    // red (tail lights)
    { hue: 210, sat: 70, lightness: 60 },  // cool blue (LED)
    { hue: 0, sat: 0, lightness: 95 },     // white (headlights)
    { hue: 120, sat: 60, lightness: 45 },  // green (traffic)
    { hue: 330, sat: 70, lightness: 55 },  // pink (neon)
    { hue: 50, sat: 80, lightness: 65 },   // warm white
  ];
  const orbs: BokehOrb[] = [];
  for (let i = 0; i < count; i++) {
    const yWeight = Math.pow(Math.random(), 0.6);
    const y = height * 0.15 + yWeight * height * 0.8;
    const x = Math.random() * width;
    const depth = Math.random();
    const radius = 15 + depth * 55 + Math.random() * 25;
    const opacity = 0.03 + (1 - depth) * 0.12 + Math.random() * 0.06;
    const color = colors[Math.floor(Math.random() * colors.length)];
    orbs.push({
      x, y, radius, opacity,
      hue: color.hue,
      sat: color.sat,
      lightness: color.lightness,
      driftX: (Math.random() - 0.5) * 0.15,
      driftY: (Math.random() - 0.5) * 0.08,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.3 + Math.random() * 0.7,
      streakFactor: 1 + Math.random() * 0.6,
    });
  }
  return orbs;
}

function createBackgroundRainStreaks(
  width: number,
  height: number,
  count: number
): BackgroundRainStreak[] {
  const streaks: BackgroundRainStreak[] = [];
  for (let i = 0; i < count; i++) {
    const z = Math.random();
    streaks.push({
      x: Math.random() * width * 1.2 - width * 0.1,
      y: -20 - Math.random() * height,
      z,
      length: 20 + z * 40,
      speed: 14 + z * 22,
      opacity: 0.04 + z * 0.12,
      thickness: 0.3 + z * 1.2,
    });
  }
  return streaks;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<RainSettings>(DEFAULT_SETTINGS);
  const [lightningFlash, setLightningFlash] = useState(0);
  const [audioStarted, setAudioStarted] = useState(false);

  // Refs for animation state
  const animationRef = useRef<number>(0);
  const simulationRef = useRef<RainSimulation>(new RainSimulation());
  const noiseRef = useRef<SimplexNoise>(new SimplexNoise());
  const timeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const audioRef = useRef<any>(null);

  // Cached layers (offscreen canvases)
  const bgLayerRef = useRef<HTMLCanvasElement | null>(null);
  const bokehOrbsRef = useRef<BokehOrb[]>([]);
  const bgRainRef = useRef<BackgroundRainStreak[]>([]);
  const bgLoadedRef = useRef<HTMLImageElement | null>(null);
  const dropShapesRef = useRef<Map<Droplet, DropShape>>(new Map());

  // Grain texture (pre-generated, tiled)
  const grainCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fog canvas (updated at low frequency)
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogLastUpdateRef = useRef(0);

  // Settings ref for animation loop access
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lightningRef = useRef(lightningFlash);
  lightningRef.current = lightningFlash;

  // ============================================================================
  // GRAIN TEXTURE (generated once)
  // ============================================================================
  const initGrain = useCallback(() => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const val = Math.random() * 255;
      data[i] = data[i + 1] = data[i + 2] = val;
      data[i + 3] = 18;
    }
    ctx.putImageData(imageData, 0, 0);
    grainCanvasRef.current = c;
  }, []);

  // ============================================================================
  // BACKGROUND LAYER (blurred image + bokeh)
  // ============================================================================
  const buildBackgroundLayer = useCallback((width: number, height: number, s: RainSettings) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const blurAmount = Math.floor(4 + (s.glassBlur / 100) * 14);

    // Draw background image if loaded
    if (bgLoadedRef.current) {
      const img = bgLoadedRef.current;
      const imgRatio = img.width / img.height;
      const canvasRatio = width / height;
      let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;
      if (canvasRatio > imgRatio) {
        drawWidth = width;
        drawHeight = width / imgRatio;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      } else {
        drawHeight = height;
        drawWidth = height * imgRatio;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      }
      ctx.filter = `blur(${blurAmount}px) brightness(0.7)`;
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      ctx.filter = 'none';
    } else {
      // Fallback: procedural dark city gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#050510');
      grad.addColorStop(0.35, '#0a0a1a');
      grad.addColorStop(0.6, '#121225');
      grad.addColorStop(1, '#181830');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Darken slightly for depth
    ctx.fillStyle = 'rgba(0, 5, 15, 0.25)';
    ctx.fillRect(0, 0, width, height);

    // Render bokeh orbs with additive blending
    const orbs = generateBokehField(width, height, s.bokehIntensity);
    bokehOrbsRef.current = orbs;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const orb of orbs) {
      const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
      grad.addColorStop(0, `hsla(${orb.hue}, ${orb.sat}%, ${orb.lightness}%, ${orb.opacity})`);
      grad.addColorStop(0.5, `hsla(${orb.hue}, ${orb.sat}%, ${orb.lightness}%, ${orb.opacity * 0.45})`);
      grad.addColorStop(0.8, `hsla(${orb.hue}, ${orb.sat}%, ${orb.lightness}%, ${orb.opacity * 0.12})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      // Streaked bokeh (vertical elongation simulating glass refraction)
      ctx.save();
      ctx.translate(orb.x, orb.y);
      ctx.scale(1, orb.streakFactor);
      ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
      ctx.restore();
      ctx.fillStyle = grad;
      ctx.fill();

      // Bright rim on some orbs (real bokeh ring effect)
      if (orb.opacity > 0.08) {
        ctx.beginPath();
        ctx.save();
        ctx.translate(orb.x, orb.y);
        ctx.scale(1, orb.streakFactor);
        ctx.arc(0, 0, orb.radius * 0.88, 0, Math.PI * 2);
        ctx.restore();
        ctx.strokeStyle = `hsla(${orb.hue}, ${orb.sat}%, 85%, ${orb.opacity * 0.25})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Apply final slight blur for softness
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;
    const fCtx = finalCanvas.getContext('2d')!;
    fCtx.filter = 'blur(2px)';
    fCtx.drawImage(canvas, 0, 0);
    fCtx.filter = 'none';

    bgLayerRef.current = finalCanvas;
  }, []);

  // ============================================================================
  // FOG / CONDENSATION LAYER
  // ============================================================================
  const updateFogLayer = useCallback((width: number, height: number, time: number, density: number) => {
    if (!fogCanvasRef.current || fogCanvasRef.current.width !== Math.floor(width / 4) || fogCanvasRef.current.height !== Math.floor(height / 4)) {
      const c = document.createElement('canvas');
      c.width = Math.floor(width / 4);
      c.height = Math.floor(height / 4);
      fogCanvasRef.current = c;
    }
    const c = fogCanvasRef.current;
    const ctx = c.getContext('2d')!;
    const w = c.width;
    const h = c.height;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const noise = noiseRef.current;
    const t = time * 0.0003;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n1 = noise.noise2D(x * 0.025, y * 0.025 + t);
        const n2 = noise.noise2D(x * 0.06, y * 0.06 - t * 0.5) * 0.5;
        const n3 = noise.noise2D(x * 0.12, y * 0.09 + t * 0.3) * 0.25;
        const nv = (n1 + n2 + n3) * 0.5 + 0.5;

        // Denser at edges and bottom
        const edgeFade = Math.min(x / w, (w - x) / w, y / h, (h - y) / h) * 4;
        const edgeDensity = 1 - Math.min(1, edgeFade);
        const alpha = nv * (density / 100) * (0.3 + edgeDensity * 0.7);

        const idx = (y * w + x) * 4;
        data[idx] = 170;
        data[idx + 1] = 180;
        data[idx + 2] = 200;
        data[idx + 3] = Math.floor(alpha * 30);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  // ============================================================================
  // MAIN ANIMATION LOOP
  // ============================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false })!;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const sim = simulationRef.current;

    // Load background image
    const loadBg = () => {
      const img = new Image();
      img.onload = () => {
        bgLoadedRef.current = img;
        buildBackgroundLayer(width, height, settingsRef.current);
      };
      img.onerror = () => {
        buildBackgroundLayer(width, height, settingsRef.current);
      };
      img.src = `${import.meta.env.BASE_URL}rainy-city-bg.png`;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      sim.resize(width, height);
      buildBackgroundLayer(width, height, settingsRef.current);
      bgRainRef.current = createBackgroundRainStreaks(width, height, 180);
    };

    initGrain();
    resize();
    loadBg();
    window.addEventListener('resize', resize);

    // Initialize simulation
    sim.resize(width, height);
    sim.populate(settingsRef.current);
    bgRainRef.current = createBackgroundRainStreaks(width, height, 180);

    // Animation frame
    const animate = (timestamp: number) => {
      const deltaTime = lastTimeRef.current ? (timestamp - lastTimeRef.current) : 16.67;
      lastTimeRef.current = timestamp;
      timeRef.current = timestamp;
      const dt = deltaTime / 16.67;
      const s = settingsRef.current;

      // === LAYER 1: BLURRED BACKGROUND + BOKEH ===
      if (bgLayerRef.current) {
        ctx.drawImage(bgLayerRef.current, 0, 0);
      } else {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, width, height);
      }

      // Lightning flash brightens the background
      const flash = lightningRef.current;
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(180, 195, 230, ${flash * 0.35})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // === LAYER 2: CONDENSATION FOG ===
      if (s.fogDensity > 0) {
        if (timestamp - fogLastUpdateRef.current > 120) {
          updateFogLayer(width, height, timestamp, s.fogDensity);
          fogLastUpdateRef.current = timestamp;
        }
        if (fogCanvasRef.current) {
          ctx.drawImage(fogCanvasRef.current, 0, 0, width, height);
        }
      }

      // === LAYER 3: BACKGROUND RAIN (behind glass) ===
      const windX = Math.sin(s.windAngle * Math.PI / 180) * (s.windSpeed / 100) * 8;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const streaks = bgRainRef.current;
      for (let i = 0; i < streaks.length; i++) {
        const streak = streaks[i];
        streak.x += windX * streak.z * dt;
        streak.y += streak.speed * dt;

        if (streak.y > height + 60) {
          streak.y = -streak.length - Math.random() * 100;
          streak.x = Math.random() * width * 1.2 - width * 0.1;
        }

        const endX = streak.x - windX * streak.length * 0.04;
        const endY = streak.y - streak.length;

        const grad = ctx.createLinearGradient(endX, endY, streak.x, streak.y);
        grad.addColorStop(0, `rgba(150, 170, 200, 0)`);
        grad.addColorStop(0.3, `rgba(170, 190, 215, ${streak.opacity * 0.3})`);
        grad.addColorStop(1, `rgba(210, 225, 245, ${streak.opacity})`);

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = streak.thickness;
        ctx.lineCap = 'round';
        ctx.moveTo(endX, endY);
        ctx.lineTo(streak.x, streak.y);
        ctx.stroke();
      }
      ctx.restore();

      // === LAYER 4: SIMULATION UPDATE ===
      sim.update(deltaTime, s);
      const droplets = sim.getDroplets();
      const trails = sim.getTrailBeads();

      // === LAYER 5: TRAIL BEADS ===
      for (let i = 0; i < trails.length; i++) {
        const trail = trails[i];
        if (trail.opacity <= 0 || trail.radius < 0.5) continue;

        const tr = trail.radius;

        // Tiny refraction dot
        if (bgLayerRef.current && tr > 1) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(trail.x, trail.y, tr, 0, Math.PI * 2);
          ctx.clip();
          const scale = 1.1;
          const srcSize = tr * 2 * scale;
          ctx.drawImage(
            bgLayerRef.current,
            Math.max(0, trail.x - srcSize / 2),
            Math.max(0, trail.y - srcSize / 2),
            Math.min(srcSize, width),
            Math.min(srcSize, height),
            trail.x - tr, trail.y - tr,
            tr * 2, tr * 2
          );
          ctx.restore();
        }

        // Specular dot
        const hlGrad = ctx.createRadialGradient(
          trail.x - tr * 0.3, trail.y - tr * 0.3, 0,
          trail.x, trail.y, tr
        );
        hlGrad.addColorStop(0, `rgba(255, 255, 255, ${trail.opacity * 0.5})`);
        hlGrad.addColorStop(0.4, `rgba(255, 255, 255, ${trail.opacity * 0.15})`);
        hlGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.fillStyle = hlGrad;
        ctx.arc(trail.x, trail.y, tr, 0, Math.PI * 2);
        ctx.fill();

        // Subtle rim
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${trail.opacity * 0.12})`;
        ctx.lineWidth = 0.5;
        ctx.arc(trail.x, trail.y, tr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // === LAYER 6: WATER DROPS ON GLASS (HERO ELEMENT) ===

      // First pass: draw wet halos beneath all drops (contact shadow on glass)
      for (let i = 0; i < droplets.length; i++) {
        const drop = droplets[i];
        if (drop.opacity <= 0) continue;
        const rx = drop.baseRadius * drop.stretchX;
        const ry = drop.baseRadius * drop.stretchY;
        if (rx < 2 || ry < 2) continue;

        // Wet halo: darker ring around the drop where glass is wet
        const haloRx = rx * 1.35;
        const haloRy = ry * 1.3;
        const haloGrad = ctx.createRadialGradient(
          drop.x, drop.y, Math.max(rx, ry) * 0.7,
          drop.x, drop.y, Math.max(haloRx, haloRy)
        );
        haloGrad.addColorStop(0, `rgba(0, 0, 0, ${0.06 * drop.opacity})`);
        haloGrad.addColorStop(0.5, `rgba(0, 5, 15, ${0.04 * drop.opacity})`);
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.ellipse(drop.x, drop.y, haloRx, haloRy, 0, 0, Math.PI * 2);
        ctx.fillStyle = haloGrad;
        ctx.fill();
      }

      // Second pass: draw water film connections between moving drops and trail beads
      for (let i = 0; i < droplets.length; i++) {
        const drop = droplets[i];
        if (drop.opacity <= 0 || drop.isStuck) continue;
        const speed = Math.sqrt(drop.vx * drop.vx + drop.vy * drop.vy);
        if (speed < 0.3) continue;

        // Find trail beads that belong to this drop (nearby and above it)
        const nearTrails: TrailBead[] = [];
        for (let t = 0; t < trails.length; t++) {
          const trail = trails[t];
          const tdx = trail.x - drop.x;
          const tdy = trail.y - drop.y;
          const dist = Math.sqrt(tdx * tdx + tdy * tdy);
          // Trails should be above the drop and within reasonable distance
          if (tdy < 0 && dist < drop.baseRadius * 8 && Math.abs(tdx) < drop.baseRadius * 3) {
            nearTrails.push(trail);
          }
        }

        if (nearTrails.length > 0) {
          // Sort by y (top to bottom)
          nearTrails.sort((a, b) => a.y - b.y);

          // Draw thin water film from trail beads down to the drop
          ctx.save();
          ctx.globalAlpha = drop.opacity * 0.12;
          ctx.beginPath();
          ctx.moveTo(nearTrails[0].x, nearTrails[0].y);
          for (let t = 1; t < nearTrails.length; t++) {
            ctx.lineTo(nearTrails[t].x, nearTrails[t].y);
          }
          ctx.lineTo(drop.x, drop.y - drop.baseRadius * drop.stretchY * 0.5);
          ctx.strokeStyle = 'rgba(180, 200, 230, 0.6)';
          ctx.lineWidth = Math.max(0.5, drop.baseRadius * 0.15);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.restore();
        }
      }

      // Main pass: render each droplet with full detail
      for (let i = 0; i < droplets.length; i++) {
        const drop = droplets[i];
        if (drop.opacity <= 0) continue;

        const rx = drop.baseRadius * drop.stretchX;
        const ry = drop.baseRadius * drop.stretchY;
        if (rx < 1 || ry < 1) continue;

        const dx = drop.x;
        const dy = drop.y;

        // Get or create organic shape for this drop
        let shape = dropShapesRef.current.get(drop);
        if (!shape) {
          shape = generateDropShape(rx > 10 ? 18 : rx > 5 ? 14 : 10);
          dropShapesRef.current.set(drop, shape);
        }

        // Update gravity bulge based on velocity (moving drops become pear-shaped)
        const speed = Math.sqrt(drop.vx * drop.vx + drop.vy * drop.vy);
        const targetBulge = Math.min(1, speed * 0.6);
        shape.gravityBulge += (targetBulge - shape.gravityBulge) * 0.08;

        // Boost wobble amplitude after merges (detected by stretchY > 1.1)
        if (drop.stretchY > 1.15) {
          shape.wobbleAmp = Math.min(0.08, shape.wobbleAmp + 0.005);
        } else {
          shape.wobbleAmp *= 0.995; // Slowly decay wobble
          shape.wobbleAmp = Math.max(0.015, shape.wobbleAmp);
        }

        ctx.save();
        ctx.globalAlpha = drop.opacity;

        // 1. REFRACTION: Clip to organic shape, draw inverted magnified background
        if (bgLayerRef.current) {
          ctx.save();
          drawDropPath(ctx, dx, dy, rx * 1.05, ry, shape, timestamp);
          ctx.clip();

          const baseScale = 1.15 + (drop.baseRadius / 50) * 0.25;

          // Barrel distortion approximation: draw multiple concentric rings
          // at slightly increasing magnification. Center is more magnified.
          if (drop.baseRadius > 10) {
            // 3-ring barrel distortion for large drops
            const rings = 3;
            for (let ring = rings - 1; ring >= 0; ring--) {
              const t = ring / rings;
              const ringScale = baseScale + t * 0.12; // Center ring is most magnified
              const ringAlpha = ring === 0 ? 1 : 0.25;
              const srcW = rx * 2 * ringScale;
              const srcH = ry * 2 * ringScale;

              ctx.globalAlpha = ringAlpha;

              // Vertical flip for lens inversion
              ctx.save();
              ctx.translate(dx, dy);
              ctx.scale(1, -1);
              ctx.translate(-dx, -dy);
              ctx.drawImage(
                bgLayerRef.current!,
                Math.max(0, dx - srcW / 2),
                Math.max(0, dy - srcH / 2),
                Math.min(srcW, width),
                Math.min(srcH, height),
                dx - rx, dy - ry,
                rx * 2, ry * 2
              );
              ctx.restore();
            }
            ctx.globalAlpha = drop.opacity;
          } else if (drop.baseRadius > 5) {
            // Medium drops: simple flip + magnify
            const srcW = rx * 2 * baseScale;
            const srcH = ry * 2 * baseScale;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.scale(1, -1);
            ctx.translate(-dx, -dy);
            ctx.drawImage(
              bgLayerRef.current,
              Math.max(0, dx - srcW / 2),
              Math.max(0, dy - srcH / 2),
              Math.min(srcW, width),
              Math.min(srcH, height),
              dx - rx, dy - ry,
              rx * 2, ry * 2
            );
            ctx.restore();
          } else {
            // Small drops: simple magnify, no flip
            const srcW = rx * 2 * baseScale;
            const srcH = ry * 2 * baseScale;
            ctx.drawImage(
              bgLayerRef.current,
              Math.max(0, dx - srcW / 2),
              Math.max(0, dy - srcH / 2),
              Math.min(srcW, width),
              Math.min(srcH, height),
              dx - rx, dy - ry,
              rx * 2, ry * 2
            );
          }

          // Chromatic aberration: offset red/blue channels slightly
          if (drop.baseRadius > 7) {
            const caOffset = Math.min(2, drop.baseRadius * 0.08);
            const srcW = rx * 2 * baseScale;
            const srcH = ry * 2 * baseScale;
            ctx.globalAlpha = 0.035;
            ctx.globalCompositeOperation = 'lighter';
            // Red shift left
            ctx.drawImage(
              bgLayerRef.current,
              Math.max(0, dx - srcW / 2 - caOffset),
              Math.max(0, dy - srcH / 2),
              Math.min(srcW, width),
              Math.min(srcH, height),
              dx - rx - caOffset, dy - ry,
              rx * 2, ry * 2
            );
            // Blue shift right
            ctx.drawImage(
              bgLayerRef.current,
              Math.max(0, dx - srcW / 2 + caOffset),
              Math.max(0, dy - srcH / 2),
              Math.min(srcW, width),
              Math.min(srcH, height),
              dx - rx + caOffset, dy - ry,
              rx * 2, ry * 2
            );
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = drop.opacity;
          }

          ctx.restore();
        }

        // 2. INNER SHADOW (3D volume/depth) - asymmetric for realism
        drawDropPath(ctx, dx, dy, rx, ry, shape, timestamp);
        const shadowGrad = ctx.createRadialGradient(
          dx - rx * 0.1, dy + ry * 0.35, 0,
          dx, dy, Math.max(rx, ry)
        );
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
        shadowGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.18)');
        shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.06)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.fill();

        // 3. CAUSTIC EDGE GLOW - brighter on bottom where light concentrates
        drawDropPath(ctx, dx, dy, rx, ry, shape, timestamp);
        const maxR = Math.max(rx, ry);
        const causticGrad = ctx.createRadialGradient(
          dx, dy, maxR * 0.5,
          dx, dy, maxR * 1.08
        );
        causticGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        causticGrad.addColorStop(0.55, 'rgba(200, 220, 255, 0)');
        causticGrad.addColorStop(0.78, 'rgba(200, 220, 255, 0.1)');
        causticGrad.addColorStop(0.92, 'rgba(230, 240, 255, 0.22)');
        causticGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
        ctx.fillStyle = causticGrad;
        ctx.fill();

        // Concentrated caustic at the bottom (light focus point)
        if (drop.baseRadius > 5) {
          const focusY = dy + ry * 0.55;
          const focusR = rx * 0.4;
          const focusGrad = ctx.createRadialGradient(dx, focusY, 0, dx, focusY, focusR);
          focusGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
          focusGrad.addColorStop(0.5, 'rgba(220, 235, 255, 0.05)');
          focusGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.beginPath();
          ctx.arc(dx, focusY, focusR, 0, Math.PI * 2);
          ctx.fillStyle = focusGrad;
          ctx.fill();
        }

        // 4. INTERNAL COLOR CAUSTICS from nearby bokeh lights
        // Check if any bokeh orb is "behind" this drop and tint the drop interior
        if (drop.baseRadius > 6) {
          const orbs = bokehOrbsRef.current;
          for (let b = 0; b < orbs.length; b++) {
            const orb = orbs[b];
            const bdx = dx - orb.x;
            const bdy = dy - orb.y;
            const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
            // If drop is within the bokeh orb's influence radius
            if (bDist < orb.radius * 1.5 + drop.baseRadius) {
              const influence = Math.max(0, 1 - bDist / (orb.radius * 1.5 + drop.baseRadius));
              const colorAlpha = influence * orb.opacity * 0.35;
              if (colorAlpha > 0.005) {
                ctx.save();
                drawDropPath(ctx, dx, dy, rx * 0.85, ry * 0.85, shape, timestamp);
                ctx.clip();
                ctx.globalCompositeOperation = 'lighter';
                const tintGrad = ctx.createRadialGradient(
                  dx - bdx * 0.3, dy - bdy * 0.3, 0,
                  dx, dy, maxR * 0.9
                );
                tintGrad.addColorStop(0, `hsla(${orb.hue}, ${orb.sat}%, ${orb.lightness}%, ${colorAlpha})`);
                tintGrad.addColorStop(0.6, `hsla(${orb.hue}, ${orb.sat}%, ${orb.lightness}%, ${colorAlpha * 0.3})`);
                tintGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = tintGrad;
                ctx.fill();
                ctx.restore();
                ctx.globalAlpha = drop.opacity;
                break; // Only strongest bokeh influence
              }
            }
          }
        }

        // 5. PRIMARY SPECULAR HIGHLIGHT (top-left, sharp)
        const hlX = dx - rx * 0.3;
        const hlY = dy - ry * 0.33;
        const hlR = Math.min(rx, ry) * (drop.baseRadius > 8 ? 0.26 : 0.3);
        const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
        hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        hlGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.6)');
        hlGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
        hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
        ctx.fillStyle = hlGrad;
        ctx.fill();

        // Tiny pinpoint highlight (crisp reflection dot)
        if (drop.baseRadius > 4) {
          const pinX = hlX + hlR * 0.1;
          const pinY = hlY + hlR * 0.1;
          const pinR = Math.max(1, hlR * 0.2);
          ctx.beginPath();
          ctx.arc(pinX, pinY, pinR, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fill();
        }

        // 6. SECONDARY SPECULAR (softer, bottom-right)
        const secX = dx + rx * 0.22;
        const secY = dy + ry * 0.2;
        const secR = Math.min(rx, ry) * 0.16;
        const secGrad = ctx.createRadialGradient(secX, secY, 0, secX, secY, secR);
        secGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        secGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.06)');
        secGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(secX, secY, secR, 0, Math.PI * 2);
        ctx.fillStyle = secGrad;
        ctx.fill();

        // 7. RIM LIGHT (thin bright edge, stronger on light-facing side)
        ctx.save();
        drawDropPath(ctx, dx, dy, rx, ry, shape, timestamp);
        // Partial rim: brighter on top-left
        const rimGrad = ctx.createLinearGradient(dx - rx, dy - ry, dx + rx, dy + ry);
        rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        rimGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
        rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = drop.baseRadius > 8 ? 1.0 : 0.7;
        ctx.stroke();
        ctx.restore();

        // 8. DROP SHADOW (subtle, beneath, offset by light direction)
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        drawDropPath(ctx, dx + 1.5, dy + 2.5, rx * 0.93, ry * 0.93, shape, timestamp);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.1 * drop.opacity})`;
        ctx.fill();
        ctx.restore();

        ctx.restore();
      }

      // === LAYER 7: POST-PROCESSING ===

      // Vignette (stronger, cinematic)
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.25,
        width / 2, height / 2, Math.max(width, height) * 0.72
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.5, 'rgba(0, 0, 0, 0.06)');
      vignette.addColorStop(0.8, 'rgba(0, 0, 0, 0.22)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Film grain
      if (grainCanvasRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.globalCompositeOperation = 'overlay';
        const offsetX = Math.random() * 128;
        const offsetY = Math.random() * 128;
        const pattern = ctx.createPattern(grainCanvasRef.current, 'repeat');
        if (pattern) {
          ctx.translate(offsetX, offsetY);
          ctx.fillStyle = pattern;
          ctx.fillRect(-offsetX, -offsetY, width + 128, height + 128);
        }
        ctx.restore();
      }

      // Subtle cool-blue color grade
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(210, 220, 240, 0.06)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [buildBackgroundLayer, updateFogLayer, initGrain]);

  // Rebuild background when relevant settings change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    buildBackgroundLayer(canvas.width, canvas.height, settings);
  }, [settings.bokehIntensity, settings.glassBlur, buildBackgroundLayer]);

  // ============================================================================
  // THUNDER & LIGHTNING
  // ============================================================================
  useEffect(() => {
    if (!settings.thunder) return;

    const triggerLightning = () => {
      setLightningFlash(1);
      setTimeout(() => setLightningFlash(0.15), 80);
      setTimeout(() => setLightningFlash(0.7), 160);
      setTimeout(() => setLightningFlash(0.05), 240);
      setTimeout(() => setLightningFlash(0.4), 310);
      setTimeout(() => setLightningFlash(0), 400);

      if (audioRef.current) {
        const delay = 500 + Math.random() * 2500;
        setTimeout(() => {
          audioRef.current?.thunderSynth?.triggerAttackRelease('2n');
        }, delay);
      }
    };

    const interval = setInterval(() => {
      if (Math.random() < settings.thunderFrequency / 10) {
        triggerLightning();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [settings.thunder, settings.thunderFrequency]);

  // ============================================================================
  // AUDIO SETUP
  // ============================================================================
  const startAudio = async () => {
    if (audioStarted) return;
    await Tone.start();
    setAudioStarted(true);

    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.45 }).toDestination();

    const rainNoise = new Tone.Noise('brown').start();
    const filter = new Tone.Filter(700, 'lowpass').connect(reverb);
    rainNoise.connect(filter);
    rainNoise.volume.value = -25;

    const thunderSynth = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.05, decay: 0.8, sustain: 0.2, release: 2 }
    }).connect(reverb);
    thunderSynth.volume.value = -10;

    audioRef.current = { rainNoise, thunderSynth };
  };

  // ============================================================================
  // REFRESH
  // ============================================================================
  const handleRefresh = () => {
    simulationRef.current.reset();
    dropShapesRef.current.clear();
    simulationRef.current.populate(settings);
    const canvas = canvasRef.current;
    if (canvas) {
      bgRainRef.current = createBackgroundRainStreaks(canvas.width, canvas.height, 180);
      buildBackgroundLayer(canvas.width, canvas.height, settings);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="w-screen h-screen overflow-hidden bg-black" onClick={startAudio}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
      />

      {/* Settings Panel */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-5 left-5 z-50 rounded-full h-14 w-14 bg-black/40 backdrop-blur-xl border-white/20 hover:bg-black/60 shadow-2xl"
          >
            <Settings className="h-6 w-6 text-white" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[350px] bg-black/80 backdrop-blur-2xl border-white/10 overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <CloudRain className="h-5 w-5" />
              Rain Controls
            </SheetTitle>
            <SheetDescription className="text-white/50">
              Hyper-realistic rain simulation
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-6 py-6">
            {/* Rain Intensity */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Rain Intensity</Label>
                <span className="text-white/50 text-sm">{settings.intensity}%</span>
              </div>
              <Slider
                min={5} max={100}
                value={[settings.intensity]}
                onValueChange={([v]) => setSettings(s => ({ ...s, intensity: v }))}
              />
            </div>

            {/* Drop Size */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Drop Size</Label>
                <span className="text-white/50 text-sm">{settings.dropletSize}</span>
              </div>
              <Slider
                min={1} max={10}
                value={[settings.dropletSize]}
                onValueChange={([v]) => setSettings(s => ({ ...s, dropletSize: v }))}
              />
            </div>

            {/* Gravity */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Gravity</Label>
                <span className="text-white/50 text-sm">{settings.gravity}</span>
              </div>
              <Slider
                min={1} max={10}
                value={[settings.gravity]}
                onValueChange={([v]) => setSettings(s => ({ ...s, gravity: v }))}
              />
            </div>

            {/* Surface Tension */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Surface Tension</Label>
                <span className="text-white/50 text-sm">{settings.surfaceTension}</span>
              </div>
              <Slider
                min={1} max={10}
                value={[settings.surfaceTension]}
                onValueChange={([v]) => setSettings(s => ({ ...s, surfaceTension: v }))}
              />
            </div>

            <Separator className="bg-white/10" />

            {/* Wind */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Wind Speed</Label>
                <span className="text-white/50 text-sm">{settings.windSpeed}%</span>
              </div>
              <Slider
                min={0} max={100}
                value={[settings.windSpeed]}
                onValueChange={([v]) => setSettings(s => ({ ...s, windSpeed: v }))}
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Wind Direction</Label>
                <span className="text-white/50 text-sm">{settings.windAngle}°</span>
              </div>
              <Slider
                min={-45} max={45}
                value={[settings.windAngle]}
                onValueChange={([v]) => setSettings(s => ({ ...s, windAngle: v }))}
              />
            </div>

            <Separator className="bg-white/10" />

            {/* Visual Effects */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Bokeh Intensity</Label>
                <span className="text-white/50 text-sm">{settings.bokehIntensity}%</span>
              </div>
              <Slider
                min={0} max={100}
                value={[settings.bokehIntensity]}
                onValueChange={([v]) => setSettings(s => ({ ...s, bokehIntensity: v }))}
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Background Blur</Label>
                <span className="text-white/50 text-sm">{settings.glassBlur}%</span>
              </div>
              <Slider
                min={0} max={100}
                value={[settings.glassBlur]}
                onValueChange={([v]) => setSettings(s => ({ ...s, glassBlur: v }))}
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Fog / Condensation</Label>
                <span className="text-white/50 text-sm">{settings.fogDensity}%</span>
              </div>
              <Slider
                min={0} max={100}
                value={[settings.fogDensity]}
                onValueChange={([v]) => setSettings(s => ({ ...s, fogDensity: v }))}
              />
            </div>

            <Separator className="bg-white/10" />

            {/* Thunder */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
              <Label className="flex items-center gap-2 text-white/80">
                <Zap className="h-4 w-4" />
                Thunder & Lightning
              </Label>
              <Switch
                checked={settings.thunder}
                onCheckedChange={(v) => setSettings(s => ({ ...s, thunder: v }))}
              />
            </div>

            {settings.thunder && (
              <div className="grid gap-3 pl-4">
                <div className="flex justify-between">
                  <Label className="text-white/70">Frequency</Label>
                  <span className="text-white/50 text-sm">{settings.thunderFrequency}</span>
                </div>
                <Slider
                  min={1} max={10}
                  value={[settings.thunderFrequency]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, thunderFrequency: v }))}
                />
              </div>
            )}

            <Separator className="bg-white/10" />

            {/* Refresh */}
            <Button
              onClick={handleRefresh}
              className="w-full bg-white/10 hover:bg-white/20 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh Scene
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
