"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { Settings, RotateCcw, Cloud, CloudRain, CloudLightning, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// ============================================================================
// HYPER-REALISTIC RAIN SIMULATION
// A single-file implementation for maximum control and debugging
// ============================================================================

interface RainDrop {
  x: number;
  y: number;
  z: number; // depth for parallax
  length: number;
  speed: number;
  opacity: number;
  thickness: number;
}

interface WaterDrop {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  stuck: boolean;
  stuckTime: number;
  mass: number;
  wobble: number;
  wobbleSpeed: number;
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  rings: number;
}

interface Trail {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  age: number;
}

interface Settings {
  intensity: number;
  windStrength: number;
  windAngle: number;
  dropSize: number;
  thunder: boolean;
  thunderFrequency: number;
}

const DEFAULT_SETTINGS: Settings = {
  intensity: 60,
  windStrength: 15,
  windAngle: 10,
  dropSize: 5,
  thunder: true,
  thunderFrequency: 5,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lightningFlash, setLightningFlash] = useState(0);
  const [audioStarted, setAudioStarted] = useState(false);

  // Refs for animation state
  const animationRef = useRef<number>(0);
  const rainDropsRef = useRef<RainDrop[]>([]);
  const waterDropsRef = useRef<WaterDrop[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const trailsRef = useRef<Trail[]>([]);
  const timeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const audioRef = useRef<any>(null);
  const bgImageRef = useRef<HTMLCanvasElement | null>(null);
  const bgLoadedRef = useRef<HTMLImageElement | null>(null);

  // ============================================================================
  // BACKGROUND - AI-generated photorealistic rainy city
  // ============================================================================
  const loadBackground = useCallback((width: number, height: number): Promise<HTMLCanvasElement> => {
    return new Promise((resolve) => {
      // If already loaded, just scale to canvas
      if (bgLoadedRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Draw image to cover the entire canvas (cover mode)
        const img = bgLoadedRef.current;
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;

        let drawWidth, drawHeight, offsetX, offsetY;
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

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        resolve(canvas);
        return;
      }

      const img = new Image();
      img.onload = () => {
        bgLoadedRef.current = img;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Draw image to cover the entire canvas (cover mode)
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;

        let drawWidth, drawHeight, offsetX, offsetY;
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

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        resolve(canvas);
      };
      img.onerror = () => {
        // Fallback to dark gradient if image fails to load
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0a0a12');
        grad.addColorStop(0.5, '#1a1c2a');
        grad.addColorStop(1, '#252838');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        resolve(canvas);
      };
      img.src = `${import.meta.env.BASE_URL}rainy-city-bg.png`;
    });
  }, []);

  // ============================================================================
  // RAIN DROP CREATION
  // ============================================================================
  const createRainDrop = useCallback((width: number, height: number, settings: Settings): RainDrop => {
    const z = Math.random(); // 0 = far, 1 = close
    const windOffset = (settings.windStrength / 100) * width * 0.3;

    return {
      x: Math.random() * (width + windOffset) - windOffset * 0.5,
      y: -20 - Math.random() * 100,
      z,
      length: 15 + z * 25 + settings.dropSize * 3,
      speed: 12 + z * 18 + (settings.intensity / 100) * 10,
      opacity: 0.15 + z * 0.35,
      thickness: 0.5 + z * 1.5,
    };
  }, []);

  // ============================================================================
  // WATER DROP ON GLASS
  // ============================================================================
  const createWaterDrop = useCallback((x: number, y: number, settings: Settings): WaterDrop => {
    const mass = 3 + Math.random() * settings.dropSize * 2;
    return {
      x,
      y,
      radius: Math.pow(mass, 0.5) * 3,
      vx: 0,
      vy: 0,
      stuck: Math.random() > 0.3,
      stuckTime: 0,
      mass,
      wobble: 0,
      wobbleSpeed: 2 + Math.random() * 4,
    };
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

    const resize = async () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      bgImageRef.current = await loadBackground(width, height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Initialize rain drops
    const initRain = () => {
      rainDropsRef.current = [];
      for (let i = 0; i < 200; i++) {
        rainDropsRef.current.push(createRainDrop(width, height, settings));
      }
    };
    initRain();

    // Pre-populate water drops on glass
    for (let i = 0; i < 40; i++) {
      const drop = createWaterDrop(
        Math.random() * width,
        Math.random() * height,
        settings
      );
      drop.stuck = true;
      waterDropsRef.current.push(drop);
    }

    // Animation loop
    const animate = (timestamp: number) => {
      const deltaTime = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 16.67 : 1;
      lastTimeRef.current = timestamp;
      timeRef.current = timestamp;

      // Clear and draw background
      if (bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0);
      }

      // Lightning flash overlay
      if (lightningFlash > 0) {
        ctx.fillStyle = `rgba(200, 210, 255, ${lightningFlash * 0.4})`;
        ctx.fillRect(0, 0, width, height);
      }

      const windX = Math.sin(settings.windAngle * Math.PI / 180) * (settings.windStrength / 100) * 8;
      const windY = Math.cos(settings.windAngle * Math.PI / 180) * 0.5;

      // ========================================
      // FALLING RAIN DROPS
      // ========================================
      const targetRainCount = Math.floor(50 + (settings.intensity / 100) * 250);

      // Add new drops as needed
      while (rainDropsRef.current.length < targetRainCount) {
        rainDropsRef.current.push(createRainDrop(width, height, settings));
      }

      // Update and render rain
      for (let i = rainDropsRef.current.length - 1; i >= 0; i--) {
        const drop = rainDropsRef.current[i];

        // Motion with wind
        drop.x += windX * drop.z * deltaTime;
        drop.y += drop.speed * deltaTime;

        // Draw rain streak
        const endX = drop.x - windX * drop.length * 0.05;
        const endY = drop.y - drop.length;

        const gradient = ctx.createLinearGradient(endX, endY, drop.x, drop.y);
        gradient.addColorStop(0, `rgba(180, 200, 220, 0)`);
        gradient.addColorStop(0.3, `rgba(180, 200, 220, ${drop.opacity * 0.3})`);
        gradient.addColorStop(1, `rgba(220, 235, 255, ${drop.opacity})`);

        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = drop.thickness;
        ctx.lineCap = 'round';
        ctx.moveTo(endX, endY);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();

        // Reset if off screen
        if (drop.y > height + 50) {
          // Maybe create splash
          if (Math.random() < 0.15) {
            splashesRef.current.push({
              x: drop.x,
              y: height - 10 - Math.random() * 20,
              radius: 2,
              maxRadius: 8 + Math.random() * 12,
              opacity: 0.4,
              rings: 2 + Math.floor(Math.random() * 2),
            });
          }

          // Maybe create water drop on glass
          if (Math.random() < 0.1) {
            waterDropsRef.current.push(createWaterDrop(drop.x, Math.random() * height * 0.3, settings));
          }

          // Reset drop
          Object.assign(drop, createRainDrop(width, height, settings));
        }
      }

      // ========================================
      // WATER DROPS ON GLASS
      // ========================================
      for (let i = waterDropsRef.current.length - 1; i >= 0; i--) {
        const drop = waterDropsRef.current[i];

        // Wobble animation for realism
        drop.wobble += drop.wobbleSpeed * 0.01 * deltaTime;
        const wobbleX = Math.sin(drop.wobble) * drop.radius * 0.05;
        const wobbleY = Math.cos(drop.wobble * 1.3) * drop.radius * 0.03;

        if (drop.stuck) {
          drop.stuckTime += deltaTime;
          // Gravity slowly overcomes surface tension
          if (drop.stuckTime > 60 + Math.random() * 200 || drop.mass > 10) {
            drop.stuck = false;
          }
          // Small drift
          drop.y += 0.02 * deltaTime;
        } else {
          // Falling
          const gravity = 0.04 * drop.mass * deltaTime;
          drop.vy = Math.min(drop.vy + gravity, 4);
          drop.vx += windX * 0.01 * deltaTime;
          drop.vx *= 0.98; // friction

          drop.x += drop.vx * deltaTime;
          drop.y += drop.vy * deltaTime;

          // Leave trail
          if (Math.random() < 0.15 && drop.vy > 0.5) {
            trailsRef.current.push({
              x: drop.x + (Math.random() - 0.5) * drop.radius * 0.5,
              y: drop.y - drop.radius,
              radius: 1 + Math.random() * 2,
              opacity: 0.4,
              age: 0,
            });
            drop.mass *= 0.995; // lose a bit of mass
            drop.radius = Math.pow(drop.mass, 0.5) * 3;
          }
        }

        // Check for collision with other drops
        for (let j = i - 1; j >= 0; j--) {
          const other = waterDropsRef.current[j];
          const dx = drop.x - other.x;
          const dy = drop.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < (drop.radius + other.radius) * 0.8) {
            // Merge
            const totalMass = drop.mass + other.mass;
            drop.x = (drop.x * drop.mass + other.x * other.mass) / totalMass;
            drop.y = (drop.y * drop.mass + other.y * other.mass) / totalMass;
            drop.vx = (drop.vx * drop.mass + other.vx * other.mass) / totalMass;
            drop.vy = (drop.vy * drop.mass + other.vy * other.mass) / totalMass;
            drop.mass = totalMass;
            drop.radius = Math.pow(totalMass, 0.5) * 3;
            drop.stuck = false;
            waterDropsRef.current.splice(j, 1);
            i--;
            break;
          }
        }

        // Absorb trails
        for (let t = trailsRef.current.length - 1; t >= 0; t--) {
          const trail = trailsRef.current[t];
          const dx = drop.x - trail.x;
          const dy = drop.y - trail.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < drop.radius + trail.radius) {
            drop.mass += trail.radius * 0.3;
            drop.radius = Math.pow(drop.mass, 0.5) * 3;
            trailsRef.current.splice(t, 1);
          }
        }

        // Remove if off screen
        if (drop.y > height + 50) {
          waterDropsRef.current.splice(i, 1);
          continue;
        }

        // ========================================
        // RENDER WATER DROP - Glass refraction effect
        // ========================================
        const dx = drop.x + wobbleX;
        const dy = drop.y + wobbleY;
        const r = drop.radius;

        // Sample background for refraction
        if (bgImageRef.current) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(dx, dy, r * 1.1, r * 0.95, 0, 0, Math.PI * 2);
          ctx.clip();

          // Draw magnified background (lens effect)
          const scale = 1.15;
          const srcSize = r * 2 * scale;
          ctx.drawImage(
            bgImageRef.current,
            Math.max(0, dx - srcSize / 2),
            Math.max(0, dy - srcSize / 2),
            srcSize,
            srcSize,
            dx - r,
            dy - r,
            r * 2,
            r * 2
          );
          ctx.restore();
        }

        // Inner depth shadow
        const shadowGrad = ctx.createRadialGradient(dx, dy + r * 0.3, 0, dx, dy, r);
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
        shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.1)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.fillStyle = shadowGrad;
        ctx.ellipse(dx, dy, r, r * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight
        const hlX = dx - r * 0.35;
        const hlY = dy - r * 0.35;
        const hlR = r * 0.35;
        const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
        hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        hlGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.fillStyle = hlGrad;
        ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
        ctx.fill();

        // Rim light
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.ellipse(dx, dy, r, r * 0.9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ========================================
      // TRAIL BEADS
      // ========================================
      for (let i = trailsRef.current.length - 1; i >= 0; i--) {
        const trail = trailsRef.current[i];
        trail.age += deltaTime;
        trail.opacity = Math.max(0, 0.4 - trail.age * 0.003);
        trail.radius *= 0.999;

        if (trail.opacity <= 0 || trail.radius < 0.5) {
          trailsRef.current.splice(i, 1);
          continue;
        }

        // Render small bead
        const grad = ctx.createRadialGradient(trail.x, trail.y, 0, trail.x, trail.y, trail.radius);
        grad.addColorStop(0, `rgba(200, 220, 240, ${trail.opacity})`);
        grad.addColorStop(0.5, `rgba(180, 200, 220, ${trail.opacity * 0.5})`);
        grad.addColorStop(1, `rgba(150, 170, 190, 0)`);
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(trail.x, trail.y, trail.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ========================================
      // SPLASHES
      // ========================================
      for (let i = splashesRef.current.length - 1; i >= 0; i--) {
        const splash = splashesRef.current[i];
        splash.radius += 0.8 * deltaTime;
        splash.opacity -= 0.02 * deltaTime;

        if (splash.opacity <= 0 || splash.radius > splash.maxRadius) {
          splashesRef.current.splice(i, 1);
          continue;
        }

        for (let ring = 0; ring < splash.rings; ring++) {
          const ringRadius = splash.radius - ring * 3;
          if (ringRadius > 0) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(200, 220, 255, ${splash.opacity * (1 - ring * 0.3)})`;
            ctx.lineWidth = 1;
            ctx.arc(splash.x, splash.y, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // ========================================
      // GLASS OVERLAY EFFECTS
      // ========================================
      // Subtle vignette
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.3,
        width / 2, height / 2, height * 0.9
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [settings, lightningFlash, createRainDrop, createWaterDrop, loadBackground]);

  // ============================================================================
  // THUNDER & LIGHTNING
  // ============================================================================
  useEffect(() => {
    if (!settings.thunder) return;

    const triggerLightning = () => {
      // Flash sequence
      setLightningFlash(1);
      setTimeout(() => setLightningFlash(0), 80);
      setTimeout(() => setLightningFlash(0.7), 150);
      setTimeout(() => setLightningFlash(0), 220);
      setTimeout(() => setLightningFlash(0.4), 300);
      setTimeout(() => setLightningFlash(0), 380);

      // Thunder sound
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

    const reverb = new Tone.Reverb({ decay: 3, wet: 0.4 }).toDestination();

    const rainNoise = new Tone.Noise('brown').start();
    const filter = new Tone.Filter(800, 'lowpass').connect(reverb);
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
  const handleRefresh = async () => {
    rainDropsRef.current = [];
    waterDropsRef.current = [];
    splashesRef.current = [];
    trailsRef.current = [];

    // Reload background
    if (canvasRef.current) {
      bgImageRef.current = await loadBackground(
        canvasRef.current.width,
        canvasRef.current.height
      );
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
              Create your perfect storm
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-6 py-6">
            {/* Intensity */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Intensity</Label>
                <span className="text-white/50 text-sm">{settings.intensity}%</span>
              </div>
              <Slider
                min={10}
                max={100}
                value={[settings.intensity]}
                onValueChange={([v]) => setSettings(s => ({ ...s, intensity: v }))}
              />
            </div>

            {/* Wind Strength */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Wind Strength</Label>
                <span className="text-white/50 text-sm">{settings.windStrength}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                value={[settings.windStrength]}
                onValueChange={([v]) => setSettings(s => ({ ...s, windStrength: v }))}
              />
            </div>

            {/* Wind Angle */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Wind Direction</Label>
                <span className="text-white/50 text-sm">{settings.windAngle}°</span>
              </div>
              <Slider
                min={-45}
                max={45}
                value={[settings.windAngle]}
                onValueChange={([v]) => setSettings(s => ({ ...s, windAngle: v }))}
              />
            </div>

            {/* Drop Size */}
            <div className="grid gap-3">
              <div className="flex justify-between">
                <Label className="text-white/80">Drop Size</Label>
                <span className="text-white/50 text-sm">{settings.dropSize}</span>
              </div>
              <Slider
                min={1}
                max={10}
                value={[settings.dropSize]}
                onValueChange={([v]) => setSettings(s => ({ ...s, dropSize: v }))}
              />
            </div>

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
                  min={1}
                  max={10}
                  value={[settings.thunderFrequency]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, thunderFrequency: v }))}
                />
              </div>
            )}

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