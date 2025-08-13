"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';

export interface RainSettings {
  amount: number;
  size: number;
  speed: number;
  stickiness: number;
  sound: number;
  backgroundUrl: string | null;
}

interface DropletPoint { x: number; y: number; }

class Droplet {
  x: number; y: number; mass: number; radius: number; vy: number; vx: number;
  opacity: number; stiction: number; isStuck: boolean; points: DropletPoint[];
  targetVx: number; vxChangeCountdown: number; gravity: number; stictionFactor: number;

  constructor(x: number, y: number, mass: number, radius: number, settings: RainSettings) {
    this.x = x; this.y = y; this.mass = mass; this.radius = radius;
    this.vy = 0; this.vx = (Math.random() - 0.5) * 0.1; this.opacity = 0;
    this.gravity = 0.001 * settings.speed;
    this.stictionFactor = 0.1 * settings.stickiness;
    this.stiction = 0.4 + Math.random() * this.stictionFactor * 2.5 + (1 / (this.radius + 1));
    this.isStuck = true; this.points = this._createBlobShapePoints(radius);
    this.targetVx = this.vx; this.vxChangeCountdown = 30 + Math.random() * 60;
  }

  _createBlobShapePoints(radius: number): DropletPoint[] {
    const points: DropletPoint[] = [];
    const pointCount = 12 + Math.floor(Math.random() * 6);
    const angleStep = (Math.PI * 2) / pointCount;
    const rx = radius * (0.7 + Math.random() * 0.6);
    const ry = radius * (0.7 + Math.random() * 0.9);
    for (let i = 0; i < pointCount; i++) {
      const angle = i * angleStep;
      const r = 1 + (Math.random() - 0.5) * 0.4;
      let x = Math.cos(angle) * rx * r;
      let y = Math.sin(angle) * ry * r;
      if (Math.sin(angle) > 0) y += Math.sin(angle) * (radius * 0.3);
      points.push({ x, y });
    }
    return points;
  }

  update(dynamicSwayIntensity: number, droplets: Droplet[], createDropletCallback: (x: number, y: number, mass: number, radius: number) => void) {
    if (this.opacity < 1) this.opacity += 0.05;
    this.points.forEach(p => { p.x += (Math.random() - 0.5) * 0.2; p.y += (Math.random() - 0.5) * 0.2; });
    const gravityForce = this.mass * this.gravity;
    if (this.isStuck && gravityForce > this.stiction) this.isStuck = false;
    if (this.isStuck) { this.y += gravityForce * (Math.random() * 0.35); }
    else {
      this.vy += gravityForce; this.y += this.vy;
      this.vxChangeCountdown--;
      if (this.vxChangeCountdown <= 0) {
        this.targetVx = (Math.random() - 0.5) * (0.4 * dynamicSwayIntensity);
        this.vxChangeCountdown = 60 + Math.random() * 120;
      }
      this.vx += (this.targetVx - this.vx) * 0.05; this.x += this.vx;
      if (this.vy > 0.5 && this.mass > 10) {
        const massToLose = this.vy * 0.02;
        const massLost = Math.min(this.mass - 1, massToLose);
        const trailRadius = Math.cbrt(massLost) * 3.5;
        if (trailRadius > 3) {
          this.mass -= massLost; this.radius = Math.cbrt(this.mass) * 3.5;
          createDropletCallback(this.x + (Math.random() - 0.5) * this.radius * 0.3, this.y - this.radius, massLost, trailRadius);
        }
      }
    }
    for (let j = droplets.length - 1; j >= 0; j--) {
      const other = droplets[j];
      if (!other || other === this) continue;
      if (this.isCollidingWith(other)) { this.mergeWith(other); droplets.splice(j, 1); break; }
    }
  }

  draw(rainCtx: CanvasRenderingContext2D, bgCanvas: HTMLCanvasElement, aberrationColorGrid: any[], aberrationGridSize: number) {
    const _drawBlobShape = (points: DropletPoint[], x: number, y: number) => {
      if (points.length < 2) return new Path2D();
      const path = new Path2D(); path.moveTo(x + points[0].x, y + points[0].y);
      for (let i = 1; i <= points.length; i++) {
        const p1 = points[i - 1]; const p2 = points[i % points.length];
        const xc = (p1.x + p2.x) / 2 + x; const yc = (p1.y + p2.y) / 2 + y;
        path.quadraticCurveTo(x + p1.x, y + p1.y, xc, yc);
      }
      return path;
    };
    const path = _drawBlobShape(this.points, this.x, this.y);
    rainCtx.save(); rainCtx.globalAlpha = 0.85; rainCtx.clip(path);
    const distortion = this.radius * 0.45;
    if (bgCanvas.width > 0 && bgCanvas.height > 0) {
      try { rainCtx.drawImage(bgCanvas, this.x - this.radius - distortion, this.y - this.radius - distortion, (this.radius + distortion) * 2, (this.radius + distortion) * 2, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); } catch (e) { /* ignore */ }
      const gridX = Math.min(aberrationGridSize - 1, Math.floor((this.x / rainCtx.canvas.width) * aberrationGridSize));
      const gridY = Math.min(aberrationGridSize - 1, Math.floor((this.y / rainCtx.canvas.height) * aberrationGridSize));
      const colors = aberrationColorGrid[gridY * aberrationGridSize + gridX];
      if (colors) {
        rainCtx.globalCompositeOperation = 'lighter';
        const fringeGradient = rainCtx.createRadialGradient(this.x, this.y, this.radius * 0.6, this.x, this.y, this.radius);
        fringeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        fringeGradient.addColorStop(0.85, `rgba(${colors.fringe1[0]}, ${colors.fringe1[1]}, ${colors.fringe1[2]}, 0.25)`);
        fringeGradient.addColorStop(0.95, `rgba(${colors.fringe2[0]}, ${colors.fringe2[1]}, ${colors.fringe2[2]}, 0.25)`);
        rainCtx.fillStyle = fringeGradient; rainCtx.fill(path);
      }
    }
    rainCtx.restore(); rainCtx.save();
    const grad1 = rainCtx.createRadialGradient(this.x - this.radius * 0.4, this.y - this.radius * 0.5, 0, this.x - this.radius * 0.4, this.y - this.radius * 0.5, this.radius * 0.5);
    grad1.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); grad1.addColorStop(1, 'rgba(255, 255, 255, 0)');
    rainCtx.fillStyle = grad1; rainCtx.fill(path);
    const grad2 = rainCtx.createRadialGradient(this.x + this.radius * 0.4, this.y + this.radius * 0.4, this.radius * 0.5, this.x + this.radius * 0.4, this.y + this.radius * 0.4, this.radius);
    grad2.addColorStop(0, 'rgba(0, 0, 0, 0)'); grad2.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    rainCtx.fillStyle = grad2; rainCtx.fill(path); rainCtx.restore();
  }

  isCollidingWith(other: Droplet): boolean { const dx = this.x - other.x; const dy = this.y - other.y; return Math.sqrt(dx * dx + dy * dy) < (this.radius + other.radius) * 0.75; }
  mergeWith(other: Droplet) {
    const totalMass = this.mass + other.mass;
    this.x = (this.x * this.mass + other.x * other.mass) / totalMass;
    this.y = (this.y * this.mass + other.y * other.mass) / totalMass;
    this.mass = totalMass; this.radius = Math.cbrt(this.mass) * 3.5;
    if (!other.isStuck) this.isStuck = false;
    this.points = this._createBlobShapePoints(this.radius);
  }
}

const RainSimulatorPage = () => {
  const [settings, setSettings] = useState<RainSettings>({ amount: 700, size: 4, speed: 5, stickiness: 4, sound: 0, backgroundUrl: null });
  const [isStarted, setIsStarted] = useState(false);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const rainCanvasRef = useRef<HTMLCanvasElement>(null);
  const dropletsRef = useRef<Droplet[]>([]);
  const userImageRef = useRef<HTMLImageElement | null>(null);
  const audioNodesRef = useRef<any>({});
  const animationFrameIdRef = useRef<number>();

  const createDroplet = useCallback((x?: number, y?: number, mass?: number, radius?: number) => {
    const rainCanvas = rainCanvasRef.current; if (!rainCanvas) return;
    const finalX = x ?? Math.random() * rainCanvas.width;
    const finalY = y ?? Math.random() * rainCanvas.height;
    const baseMass = 10 + Math.pow(settings.size, 3.2);
    const finalMass = mass ?? Math.pow(Math.random(), 2) * baseMass + 10;
    const finalRadius = radius ?? Math.cbrt(finalMass) * 3.5;
    const newDroplet = new Droplet(finalX, finalY, finalMass, finalRadius, settings);
    if (y !== undefined) { newDroplet.isStuck = true; newDroplet.vy = 0; }
    dropletsRef.current.push(newDroplet);
  }, [settings]);

  const handleRefresh = useCallback(() => {
    dropletsRef.current = [];
    for (let i = 0; i < settings.amount / 4; i++) createDroplet();
  }, [settings.amount, createDroplet]);

  const startSimulation = async () => {
    await Tone.start();
    setIsStarted(true);
  };

  useEffect(() => {
    if (!isStarted) return;
    const bgCanvas = bgCanvasRef.current!; const rainCanvas = rainCanvasRef.current!;
    const bgCtx = bgCanvas.getContext('2d')!; const rainCtx = rainCanvas.getContext('2d')!;
    let isAudioSetup = false; let lavaLampAnimationId: number; let lastLavaTime = 0;
    const lavaBlobs: any[] = []; const aberrationColorGrid: any[] = []; const aberrationGridSize = 5;
    let frameCount = 0; let lastSoundTime = 0; const minSoundInterval = 50;
    let currentSoundProbability = 0.2;

    const setupAudio = () => {
      Tone.Destination.volume.value = -Infinity;
      const limiter = new Tone.Limiter(-6).toDestination();
      const lowpass = new Tone.Filter(3500, "lowpass").connect(limiter);
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.4 }).connect(lowpass);
      const patSynth = new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.005, decay: 0.25, sustain: 0.01, release: 0.1 } }).connect(reverb);
      patSynth.set({ "maxPolyphony": 8 });
      audioNodesRef.current = { patSynth }; isAudioSetup = true;
    };

    const playPatSound = (droplet: Droplet) => {
      if (!isAudioSetup || !droplet) return;
      const { patSynth } = audioNodesRef.current;
      const baseMass = 10 + Math.pow(settings.size, 3.2);
      const maxMass = baseMass + 10;
      const massRatio = Math.pow(Math.max(0, droplet.mass - 10) / (maxMass - 10), 0.5);
      const notes = ['C2', 'D2', 'E2', 'F2', 'G2'];
      const note = notes[Math.floor(massRatio * (notes.length - 1))];
      patSynth.triggerAttackRelease(note, "8n", undefined, 0.1 + (massRatio * 0.4));
    };

    const rgbToHsl = (r:number, g:number, b:number) => { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h=0, s, l = (max + min) / 2; if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return [h, s, l]; };
    const hslToRgb = (h:number, s:number, l:number) => { let r, g, b; if (s === 0) { r = g = b = l; } else { const hue2rgb = (p:number, q:number, t:number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3); } return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]; };
    const drawCoverImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => { const cA = ctx.canvas.width / ctx.canvas.height; const iA = img.naturalWidth / img.naturalHeight; let sx, sy, sW, sH; if (iA > cA) { sH = img.naturalHeight; sW = sH * cA; sx = (img.naturalWidth - sW) / 2; sy = 0; } else { sW = img.naturalWidth; sH = sW / cA; sx = 0; sy = (img.naturalHeight - sH) / 2; } ctx.drawImage(img, sx, sy, sW, sH, 0, 0, ctx.canvas.width, ctx.canvas.height); };
    
    const updateAberrationGrid = () => { if (bgCanvas.width === 0) return; aberrationColorGrid.length = 0; for (let y = 0; y < aberrationGridSize; y++) for (let x = 0; x < aberrationGridSize; x++) { const sX = Math.floor((x / (aberrationGridSize - 1)) * (bgCanvas.width - 1)); const sY = Math.floor((y / (aberrationGridSize - 1)) * (bgCanvas.height - 1)); try { const p = bgCtx.getImageData(sX, sY, 1, 1).data; const [h, s, l] = rgbToHsl(p[0], p[1], p[2]); aberrationColorGrid.push({ fringe1: hslToRgb((h + 0.1) % 1, s, l), fringe2: hslToRgb((h - 0.1 + 1) % 1, s, l) }); } catch (e) { aberrationColorGrid.push(null); } } };
    const setupLavaLamp = () => { lavaBlobs.length = 0; if (bgCanvas.width === 0) return; let baseHue = Math.random() * 360; let useSameColor = Math.random() < 0.1; for (let i = 0; i < 5; i++) { const hue = useSameColor ? baseHue : Math.random() * 360; lavaBlobs.push({ x: Math.random() * bgCanvas.width, y: Math.random() * bgCanvas.height, r: 150 + Math.random() * 100, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, color: `hsl(${hue}, ${80 + Math.random() * 20}%, ${50 + Math.random() * 20}%)` }); } };
    const drawLavaBlobs = () => { bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height); bgCtx.filter = 'blur(50px)'; lavaBlobs.forEach(b => { bgCtx.beginPath(); bgCtx.fillStyle = b.color; bgCtx.arc(b.x, b.y, b.r, 0, 2 * Math.PI); bgCtx.fill(); }); bgCtx.filter = 'none'; };
    const animateLavaLamp = (timestamp: number) => { if (!userImageRef.current) { lavaLampAnimationId = requestAnimationFrame(animateLavaLamp); if (timestamp - lastLavaTime > 1000 / 2) { lastLavaTime = timestamp; lavaBlobs.forEach(b => { b.x += b.vx; b.y += b.vy; if (b.x > bgCanvas.width + b.r) b.x = -b.r; if (b.x < -b.r) b.x = bgCanvas.width + b.r; if (b.y > bgCanvas.height + b.r) b.y = -b.r; if (b.y < -b.r) b.y = bgCanvas.height + b.r; }); drawLavaBlobs(); } } };

    const animate = () => {
      rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      frameCount++; if (frameCount % 5 === 0) updateAberrationGrid();
      const normDrops = Math.max(0, Math.min(1, (settings.amount - 100) / (2500 - 100)));
      const dynamicSwayIntensity = 2.5 - (normDrops * (2.5 - 1));
      currentSoundProbability += ((0.1 + (normDrops * (0.4 - 0.1))) - currentSoundProbability) * 0.02;
      for (let i = 0; i < 5; i++) if (Math.random() < settings.amount / 1500) createDroplet();
      const now = performance.now();
      if (isAudioSetup && Tone.Destination.volume.value > -Infinity && now - lastSoundTime > minSoundInterval && Math.random() < currentSoundProbability && dropletsRef.current.length > 0) { playPatSound(dropletsRef.current[Math.floor(Math.random() * dropletsRef.current.length)]); lastSoundTime = now; }
      for (let i = dropletsRef.current.length - 1; i >= 0; i--) { const d = dropletsRef.current[i]; d.update(dynamicSwayIntensity, dropletsRef.current, createDroplet); if (d.y - d.radius > rainCanvas.height) dropletsRef.current.splice(i, 1); else d.draw(rainCtx, bgCanvas, aberrationColorGrid, aberrationGridSize); }
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    const resizeAll = () => {
      rainCanvas.width = bgCanvas.width = window.innerWidth;
      rainCanvas.height = bgCanvas.height = window.innerHeight;
      if (userImageRef.current && userImageRef.current.complete) { bgCtx.filter = 'blur(3px)'; drawCoverImage(bgCtx, userImageRef.current); bgCtx.filter = 'none'; updateAberrationGrid(); }
      else { setupLavaLamp(); drawLavaBlobs(); }
    };

    if (settings.backgroundUrl) { const img = new Image(); img.crossOrigin = "anonymous"; img.src = settings.backgroundUrl; img.onload = () => { userImageRef.current = img; resizeAll(); }; }
    else { userImageRef.current = null; }

    resizeAll();
    handleRefresh();
    if (!userImageRef.current) animateLavaLamp(0);
    animate();
    window.addEventListener('resize', resizeAll);

    return () => {
      window.removeEventListener('resize', resizeAll);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (lavaLampAnimationId) cancelAnimationFrame(lavaLampAnimationId);
      dropletsRef.current = [];
    };
  }, [isStarted, createDroplet, handleRefresh, settings.backgroundUrl]);

  useEffect(() => {
    if (!isAudioSetup) { if (settings.sound > 0) setupAudio(); }
    else { const targetVolume = settings.sound === 0 ? -Infinity : (settings.sound / 100) * 40 - 45; Tone.Destination.volume.rampTo(targetVolume, 0.5); }
  }, [settings.sound]);

  if (!isStarted) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black text-white p-4">
        <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">Rain Simulator</h1>
            <p className="text-lg md:text-xl text-gray-300 mb-8">A calming, interactive water droplet experience.</p>
            <Button onClick={startSimulation} size="lg" className="bg-blue-500 hover:bg-blue-600 text-white">
                Start the Rain
            </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden cursor-default">
      <canvas ref={bgCanvasRef} className="absolute top-0 left-0 w-full h-full z-10" />
      <canvas ref={rainCanvasRef} className="absolute top-0 left-0 w-full h-full z-20" />
      <SettingsPanel settings={settings} onSettingsChange={setSettings} onRefresh={handleRefresh} />
    </div>
  );
};

export default RainSimulatorPage;