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
  thunder: boolean;
  thunderFrequency: number;
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
      const gridX = Math.max(0, Math.min(aberrationGridSize - 1, Math.floor((this.x / rainCtx.canvas.width) * aberrationGridSize)));
      const gridY = Math.max(0, Math.min(aberrationGridSize - 1, Math.floor((this.y / rainCtx.canvas.height) * aberrationGridSize)));
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
  const [settings, setSettings] = useState<RainSettings>({ amount: 700, size: 4, speed: 5, stickiness: 4, sound: 0, backgroundUrl: null, thunder: false, thunderFrequency: 5 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isAudioContextStarted, setIsAudioContextStarted] = useState(false);
  const [lightningOpacity, setLightningOpacity] = useState(0);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const rainCanvasRef = useRef<HTMLCanvasElement>(null);
  const dropletsRef = useRef<Droplet[]>([]);
  const userImageRef = useRef<HTMLImageElement | null>(null);
  const audioNodesRef = useRef<any>({});
  const animationFrameIdRef = useRef<number>();
  const isAudioSetup = useRef(false);

  const handleInteraction = async () => {
    if (!isAudioContextStarted) {
      await Tone.start();
      setIsAudioContextStarted(true);
    }
  };

  const handleSettingsChange = (newSettings: Partial<RainSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

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

  const populateDroplets = useCallback(() => {
    for (let i = 0; i < settings.amount / 4; i++) createDroplet();
  }, [settings.amount, createDroplet]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const setupAudio = useCallback(() => {
    const limiter = new Tone.Limiter(-6).toDestination();
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.5, preDelay: 0.1 }).connect(limiter);

    const rainNoise = new Tone.Noise("brown").start();
    const rainFilter = new Tone.AutoFilter({ frequency: '8n', baseFrequency: 600, octaves: 4, depth: 0.8 }).connect(reverb);
    const rainEQ = new Tone.EQ3({ low: -5, mid: -15, high: -25 }).connect(rainFilter);
    rainNoise.connect(rainEQ);

    const sizzleNoise = new Tone.Noise("white").start();
    const sizzleFilter = new Tone.Filter(7000, "highpass").connect(reverb);
    sizzleNoise.connect(sizzleFilter);
    
    const patSynth = new Tone.PolySynth(Tone.Synth).connect(reverb);
    patSynth.set({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.1 },
    });
    patSynth.volume.value = -12;

    const thunderSynth = new Tone.NoiseSynth({
        noise: { type: 'brown' },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 1.5 }
    }).connect(reverb);
    thunderSynth.volume.value = -5;

    audioNodesRef.current = { rainNoise, sizzleNoise, patSynth, thunderSynth };
    isAudioSetup.current = true;
  }, []);

  const triggerLightning = useCallback(() => {
    setLightningOpacity(0.8);
    setTimeout(() => setLightningOpacity(0), 50);
    setTimeout(() => setLightningOpacity(0.5), 150);
    setTimeout(() => setLightningOpacity(0), 200);

    const delay = 500 + Math.random() * 1500;
    setTimeout(() => {
        if (isAudioSetup.current && audioNodesRef.current.thunderSynth) {
            audioNodesRef.current.thunderSynth.triggerAttackRelease("2n");
        }
    }, delay);
  }, []);

  useEffect(() => {
    if (!settings.thunder || !isAudioContextStarted) return;
    let timeoutId: number;
    const scheduleThunder = () => {
        const frequencyFactor = 11 - settings.thunderFrequency; // maps 1-10 to 10-1
        const baseDelay = 4000 * frequencyFactor; // 40s for freq 1, 4s for freq 10
        const randomDelay = baseDelay * Math.random();
        const totalDelay = baseDelay + randomDelay;

        timeoutId = window.setTimeout(() => {
            triggerLightning();
            scheduleThunder();
        }, totalDelay);
    };
    scheduleThunder();
    return () => clearTimeout(timeoutId);
  }, [settings.thunder, settings.thunderFrequency, isAudioContextStarted, triggerLightning]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current!; const rainCanvas = rainCanvasRef.current!;
    const bgCtx = bgCanvas.getContext('2d')!; const rainCtx = rainCanvas.getContext('2d')!;
    const aberrationColorGrid: any[] = []; const aberrationGridSize = 5;
    let frameCount = 0; let lastSoundTime = 0; const minSoundInterval = 50;
    let currentSoundProbability = 0.2;

    const playPatSound = (droplet: Droplet) => {
      if (!isAudioSetup.current || !droplet || !audioNodesRef.current.patSynth) return;
      const { patSynth } = audioNodesRef.current;
      const velocity = Math.min(1, 0.2 + (droplet.mass / 100));
      const notes = ['C6', 'E6', 'G6', 'A6', 'C7'];
      const note = notes[Math.floor(Math.random() * notes.length)];
      const duration = ['32n', '64n'][Math.floor(Math.random() * 2)];
      patSynth.triggerAttackRelease(note, duration, Tone.now(), velocity);
    };

    const rgbToHsl = (r:number, g:number, b:number) => { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0, l = (max + min) / 2; if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return [h, s, l]; };
    const hslToRgb = (h:number, s:number, l:number) => { let r, g, b; if (s === 0) { r = g = b = l; } else { const hue2rgb = (p:number, q:number, t:number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3); } return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]; };
    const drawCoverImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => { const cA = ctx.canvas.width / ctx.canvas.height; const iA = img.naturalWidth / img.naturalHeight; let sx, sy, sW, sH; if (iA > cA) { sH = img.naturalHeight; sW = sH * cA; sx = (img.naturalWidth - sW) / 2; sy = 0; } else { sW = img.naturalWidth; sH = sW / cA; sx = 0; sy = (img.naturalHeight - sH) / 2; } ctx.drawImage(img, sx, sy, sW, sH, 0, 0, ctx.canvas.width, ctx.canvas.height); };
    
    const updateAberrationGrid = () => { if (bgCanvas.width === 0) return; aberrationColorGrid.length = 0; for (let y = 0; y < aberrationGridSize; y++) for (let x = 0; x < aberrationGridSize; x++) { const sX = Math.floor((x / (aberrationGridSize - 1)) * (bgCanvas.width - 1)); const sY = Math.floor((y / (aberrationGridSize - 1)) * (bgCanvas.height - 1)); try { const p = bgCtx.getImageData(sX, sY, 1, 1).data; const [h, s, l] = rgbToHsl(p[0], p[1], p[2]); aberrationColorGrid.push({ fringe1: hslToRgb((h + 0.1) % 1, s, l), fringe2: hslToRgb((h - 0.1 + 1) % 1, s, l) }); } catch (e) { aberrationColorGrid.push(null); } } };
    
    const drawBokehCityBackground = () => {
        if (bgCanvas.width === 0 || bgCanvas.height === 0) return;
        
        const palettes = [
            { sky: '#2c3e50', road: '#222225', building: '#1a1a1d', lights: ['#ffdd44', '#ffbb33', '#ff8811', '#ff5500', '#ff2200', '#ffffff'] },
            { sky: '#1c2541', road: '#0b132b', building: '#000000', lights: ['#aaddff', '#88ccff', '#66bbff', '#ffffff', '#ffdd44'] },
            { sky: '#4b2c30', road: '#3d2225', building: '#301a1d', lights: ['#ff8c69', '#ff6347', '#ff4500', '#ffffff'] },
            { sky: '#000000', road: '#111111', building: '#080808', lights: ['#ff00ff', '#00ffff', '#ffff00', '#ffffff'] }
        ];
        const { sky: skyColor, road: roadColor, building: buildingColor, lights: lightColors } = palettes[Math.floor(Math.random() * palettes.length)];

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bgCanvas.width;
        tempCanvas.height = bgCanvas.height;
        const tempCtx = tempCanvas.getContext('2d')!;

        tempCtx.fillStyle = skyColor;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        const horizonY = tempCanvas.height * (0.5 + Math.random() * 0.2);
        const roadCenterX = tempCanvas.width * (0.4 + Math.random() * 0.2);
        const roadVanishingWidth = tempCanvas.width * (0.02 + Math.random() * 0.08);
        const roadBottomWidth = tempCanvas.width * (0.6 + Math.random() * 0.4);

        tempCtx.fillStyle = roadColor;
        tempCtx.beginPath();
        tempCtx.moveTo(roadCenterX - roadBottomWidth / 2, tempCanvas.height);
        tempCtx.lineTo(roadCenterX - roadVanishingWidth / 2, horizonY);
        tempCtx.lineTo(roadCenterX + roadVanishingWidth / 2, horizonY);
        tempCtx.lineTo(roadCenterX + roadBottomWidth / 2, tempCanvas.height);
        tempCtx.closePath();
        tempCtx.fill();

        tempCtx.fillStyle = buildingColor;
        const buildingPasses = 3;
        for (let p = 0; p < buildingPasses; p++) {
            const buildingCount = 5 + Math.floor(Math.random() * 10);
            const maxBuildingHeight = (tempCanvas.height - horizonY) * (1 - p * 0.2);
            for (let i = 0; i < buildingCount; i++) {
                const x = Math.random() * tempCanvas.width;
                const width = 50 + Math.random() * 150;
                const height = (0.2 + Math.random() * 0.8) * maxBuildingHeight;
                const y = horizonY - height * (0.1 + Math.random() * 0.2);
                tempCtx.globalAlpha = 0.6 + Math.random() * 0.4;
                tempCtx.fillRect(x, y, width, tempCanvas.height - y);
            }
        }
        tempCtx.globalAlpha = 1.0;

        bgCtx.save();
        bgCtx.filter = 'blur(8px)';
        bgCtx.drawImage(tempCanvas, 0, 0);
        bgCtx.restore();

        const numLights = 200 + Math.floor(Math.random() * 150);
        for (let i = 0; i < numLights; i++) {
            const y = horizonY * 0.9 + Math.random() * (bgCanvas.height - horizonY * 0.9);
            const perspective = (y - horizonY) / (bgCanvas.height - horizonY);
            const x = Math.random() * bgCanvas.width;
            const radius = (perspective * perspective * 25) + 2;
            const color = lightColors[Math.floor(Math.random() * lightColors.length)];
            const opacity = 0.2 + perspective * 0.6 + Math.random() * 0.2;

            bgCtx.beginPath();
            const gradient = bgCtx.createRadialGradient(x, y, 0, x, y, radius);
            const rgbColor = color.replace('#', '');
            const r = parseInt(rgbColor.substring(0, 2), 16);
            const g = parseInt(rgbColor.substring(2, 4), 16);
            const b = parseInt(rgbColor.substring(4, 6), 16);

            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
            gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${opacity * 0.5})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            
            bgCtx.fillStyle = gradient;
            bgCtx.arc(x, y, radius, 0, Math.PI * 2);
            bgCtx.fill();
        }
    };

    const animate = () => {
      rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      frameCount++; if (frameCount % 5 === 0) updateAberrationGrid();
      const normDrops = Math.max(0, Math.min(1, (settings.amount - 100) / (2500 - 100)));
      const dynamicSwayIntensity = 2.5 - (normDrops * (2.5 - 1));
      currentSoundProbability += ((0.1 + (normDrops * (0.4 - 0.1))) - currentSoundProbability) * 0.02;
      for (let i = 0; i < 5; i++) if (Math.random() < settings.amount / 1500) createDroplet();
      const now = performance.now();
      if (isAudioSetup.current && now - lastSoundTime > minSoundInterval && Math.random() < currentSoundProbability && dropletsRef.current.length > 0) { playPatSound(dropletsRef.current[Math.floor(Math.random() * dropletsRef.current.length)]); lastSoundTime = now; }
      for (let i = dropletsRef.current.length - 1; i >= 0; i--) { const d = dropletsRef.current[i]; d.update(dynamicSwayIntensity, dropletsRef.current, createDroplet); if (d.y - d.radius > rainCanvas.height) dropletsRef.current.splice(i, 1); else d.draw(rainCtx, bgCanvas, aberrationColorGrid, aberrationGridSize); }
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    const resizeAll = () => {
      rainCanvas.width = bgCanvas.width = window.innerWidth;
      rainCanvas.height = bgCanvas.height = window.innerHeight;
      if (userImageRef.current && userImageRef.current.complete) {
        bgCtx.filter = 'blur(3px)';
        drawCoverImage(bgCtx, userImageRef.current);
        bgCtx.filter = 'none';
      } else {
        drawBokehCityBackground();
      }
      updateAberrationGrid();
    };

    if (settings.backgroundUrl) { const img = new Image(); img.crossOrigin = "anonymous"; img.src = settings.backgroundUrl; img.onload = () => { userImageRef.current = img; resizeAll(); }; }
    else { userImageRef.current = null; }

    resizeAll();
    populateDroplets();
    animate();
    window.addEventListener('resize', resizeAll);

    return () => {
      window.removeEventListener('resize', resizeAll);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      dropletsRef.current = [];
    };
  }, [createDroplet, populateDroplets, settings.backgroundUrl, settings.amount, settings.size, refreshKey]);

  useEffect(() => {
    if (isAudioContextStarted && settings.sound > 0 && !isAudioSetup.current) {
      setupAudio();
    }
    if (isAudioSetup.current) {
      const { rainNoise, sizzleNoise, patSynth, thunderSynth } = audioNodesRef.current;
      if (rainNoise && sizzleNoise && patSynth && thunderSynth) {
        const masterVolume = settings.sound / 100;
        const targetRainVolume = settings.sound === 0 ? -Infinity : (masterVolume * 25) - 30;
        rainNoise.volume.rampTo(targetRainVolume, 0.5);
        
        const targetSizzleVolume = settings.sound === 0 ? -Infinity : (masterVolume * 30) - 45;
        sizzleNoise.volume.rampTo(targetSizzleVolume, 0.5);

        const targetPatVolume = settings.sound === 0 ? -Infinity : (masterVolume * 15) - 20;
        patSynth.volume.rampTo(targetPatVolume, 0.5);

        const targetThunderVolume = settings.sound === 0 ? -Infinity : -5;
        thunderSynth.volume.rampTo(targetThunderVolume, 0.5);
      }
    }
  }, [settings.sound, setupAudio, isAudioContextStarted]);

  return (
    <div onClick={handleInteraction} className="w-screen h-screen bg-black overflow-hidden cursor-default">
      <canvas ref={bgCanvasRef} className="absolute top-0 left-0 w-full h-full z-10" />
      <canvas ref={rainCanvasRef} className="absolute top-0 left-0 w-full h-full z-20" />
      <div 
        className="absolute top-0 left-0 w-full h-full bg-white z-30 pointer-events-none"
        style={{ opacity: lightningOpacity, transition: 'opacity 50ms ease-in-out' }}
      />
      <SettingsPanel settings={settings} onSettingsChange={handleSettingsChange} onRefresh={handleRefresh} />
    </div>
  );
};

export default RainSimulatorPage;