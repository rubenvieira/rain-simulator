/**
 * Realistic Rain Renderer
 * 
 * Renders water droplets on glass with:
 * - True lens-like refraction (inverted/magnified background)
 * - Specular highlights following droplet curvature
 * - Caustic effects at droplet edges
 * - Trail bead rendering
 */

import { Droplet, TrailBead } from '../simulation/RainSimulation';

export interface LightSource {
    x: number;  // 0-1, position across screen
    y: number;  // 0-1, position down screen
    intensity: number; // 0-1
}

export class RainRenderer {
    private ctx: CanvasRenderingContext2D;
    private bgCanvas: HTMLCanvasElement;
    private bgCtx: CanvasRenderingContext2D;
    private width: number = 0;
    private height: number = 0;

    // Cached for performance
    private offscreenCanvas: HTMLCanvasElement;
    private offscreenCtx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement, bgCanvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d')!;
        this.bgCanvas = bgCanvas;
        this.bgCtx = bgCanvas.getContext('2d')!;

        // Offscreen canvas for compositing
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
    }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;
    }

    clear(): void {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    // Draw a single realistic droplet
    private renderDroplet(droplet: Droplet, light: LightSource): void {
        const { x, y, baseRadius, stretchX, stretchY, opacity } = droplet;
        const rx = baseRadius * stretchX;
        const ry = baseRadius * stretchY;

        if (opacity <= 0 || rx < 1 || ry < 1) return;

        this.ctx.save();
        this.ctx.globalAlpha = opacity;

        // Create droplet path (ellipse)
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

        // 1. REFRACTION EFFECT - Show magnified/inverted background through droplet
        this.ctx.save();
        this.ctx.clip();

        if (this.bgCanvas.width > 0 && this.bgCanvas.height > 0) {
            // Calculate refraction parameters
            const refractScale = 1.15 + (baseRadius / 50) * 0.3; // Larger drops = more magnification
            const sampleW = rx * 2 * refractScale;
            const sampleH = ry * 2 * refractScale;
            const sampleX = x - sampleW / 2;
            const sampleY = y - sampleH / 2;

            try {
                // Draw refracted (slightly magnified) background
                this.ctx.drawImage(
                    this.bgCanvas,
                    Math.max(0, sampleX), Math.max(0, sampleY),
                    Math.min(sampleW, this.bgCanvas.width - sampleX),
                    Math.min(sampleH, this.bgCanvas.height - sampleY),
                    x - rx, y - ry,
                    rx * 2, ry * 2
                );
            } catch {
                // Fallback: simple fill
                this.ctx.fillStyle = 'rgba(100, 150, 200, 0.1)';
                this.ctx.fill();
            }
        }
        this.ctx.restore();

        // 2. INNER SHADOW - Creates depth/volume
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

        const shadowGradient = this.ctx.createRadialGradient(
            x, y + ry * 0.4, 0,
            x, y, Math.max(rx, ry)
        );
        shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.15)');
        shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = shadowGradient;
        this.ctx.fill();

        // 3. CAUSTIC EDGE EFFECT - Light concentration at edges
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

        const causticGradient = this.ctx.createRadialGradient(
            x, y, Math.max(rx, ry) * 0.6,
            x, y, Math.max(rx, ry)
        );
        causticGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        causticGradient.addColorStop(0.7, 'rgba(200, 220, 255, 0.05)');
        causticGradient.addColorStop(0.9, 'rgba(180, 200, 255, 0.15)');
        causticGradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
        this.ctx.fillStyle = causticGradient;
        this.ctx.fill();

        // 4. MAIN SPECULAR HIGHLIGHT - Sharp bright spot
        const lightDirX = light.x - 0.5;
        const lightDirY = light.y - 0.5;
        const highlightX = x - rx * 0.35 - lightDirX * rx * 0.5;
        const highlightY = y - ry * 0.4 - lightDirY * ry * 0.5;
        const highlightSize = Math.min(rx, ry) * (0.25 + light.intensity * 0.15);

        const highlightGradient = this.ctx.createRadialGradient(
            highlightX, highlightY, 0,
            highlightX, highlightY, highlightSize
        );
        highlightGradient.addColorStop(0, `rgba(255, 255, 255, ${0.85 * light.intensity})`);
        highlightGradient.addColorStop(0.3, `rgba(255, 255, 255, ${0.5 * light.intensity})`);
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = highlightGradient;
        this.ctx.fill();

        // 5. SECONDARY HIGHLIGHT - Softer, opposite side
        const secondaryX = x + rx * 0.2 + lightDirX * rx * 0.3;
        const secondaryY = y + ry * 0.15 + lightDirY * ry * 0.3;
        const secondarySize = Math.min(rx, ry) * 0.4;

        const secondaryGradient = this.ctx.createRadialGradient(
            secondaryX, secondaryY, 0,
            secondaryX, secondaryY, secondarySize
        );
        secondaryGradient.addColorStop(0, `rgba(255, 255, 255, ${0.2 * light.intensity})`);
        secondaryGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = secondaryGradient;
        this.ctx.fill();

        // 6. RIM LIGHT - Subtle edge highlight
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 * light.intensity})`;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // 7. DROP SHADOW - Very subtle, offset down
        this.ctx.beginPath();
        this.ctx.ellipse(x + 1, y + 2, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        this.ctx.globalCompositeOperation = 'destination-over';
        this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-over';

        this.ctx.restore();
    }

    // Render a trail bead (smaller, simpler droplets)
    private renderTrailBead(bead: TrailBead, light: LightSource): void {
        const { x, y, radius, opacity } = bead;

        if (opacity <= 0 || radius < 0.5) return;

        this.ctx.save();
        this.ctx.globalAlpha = opacity * 0.8;

        // Simple refraction
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (this.bgCanvas.width > 0 && this.bgCanvas.height > 0) {
            this.ctx.save();
            this.ctx.clip();
            const scale = 1.1;
            const sampleSize = radius * 2 * scale;
            try {
                this.ctx.drawImage(
                    this.bgCanvas,
                    x - sampleSize / 2, y - sampleSize / 2,
                    sampleSize, sampleSize,
                    x - radius, y - radius,
                    radius * 2, radius * 2
                );
            } catch {
                this.ctx.fillStyle = 'rgba(150, 180, 220, 0.2)';
                this.ctx.fill();
            }
            this.ctx.restore();
        }

        // Simple highlight
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);

        const gradient = this.ctx.createRadialGradient(
            x - radius * 0.3, y - radius * 0.3, 0,
            x, y, radius
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${0.5 * light.intensity})`);
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');

        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Edge
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();

        this.ctx.restore();
    }

    // Main render function
    render(
        droplets: Droplet[],
        trailBeads: TrailBead[],
        light: LightSource = { x: 0.3, y: 0.2, intensity: 0.9 }
    ): void {
        this.clear();

        // Render trail beads first (behind droplets)
        for (const bead of trailBeads) {
            this.renderTrailBead(bead, light);
        }

        // Render droplets
        for (const droplet of droplets) {
            this.renderDroplet(droplet, light);
        }
    }

    // Draw background with procedural rain scene
    drawBackground(
        type: 'city' | 'highway' | 'nature' | 'custom',
        customImage?: HTMLImageElement | null,
        blur: number = 8
    ): void {
        if (this.bgCanvas.width === 0 || this.bgCanvas.height === 0) return;

        if (type === 'custom' && customImage && customImage.complete) {
            this.drawCoverImage(customImage, blur);
            return;
        }

        // Generate procedural backgrounds
        switch (type) {
            case 'city':
                this.drawCityNight();
                break;
            case 'highway':
                this.drawHighway();
                break;
            case 'nature':
                this.drawNature();
                break;
            default:
                this.drawCityNight();
        }
    }

    private drawCoverImage(img: HTMLImageElement, blur: number): void {
        const canvasAspect = this.bgCanvas.width / this.bgCanvas.height;
        const imgAspect = img.naturalWidth / img.naturalHeight;

        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

        if (imgAspect > canvasAspect) {
            sw = sh * canvasAspect;
            sx = (img.naturalWidth - sw) / 2;
        } else {
            sh = sw / canvasAspect;
            sy = (img.naturalHeight - sh) / 2;
        }

        this.bgCtx.filter = `blur(${blur}px)`;
        this.bgCtx.drawImage(img, sx, sy, sw, sh, 0, 0, this.bgCanvas.width, this.bgCanvas.height);
        this.bgCtx.filter = 'none';
    }

    private drawCityNight(): void {
        const { width, height } = this.bgCanvas;
        const ctx = this.bgCtx;

        // Create on temp canvas, then blur onto main
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d')!;

        // Sky gradient
        const skyGradient = tCtx.createLinearGradient(0, 0, 0, height);
        skyGradient.addColorStop(0, '#0a0a15');
        skyGradient.addColorStop(0.5, '#1a1a2e');
        skyGradient.addColorStop(1, '#16213e');
        tCtx.fillStyle = skyGradient;
        tCtx.fillRect(0, 0, width, height);

        const horizon = height * 0.55;

        // Buildings silhouettes
        tCtx.fillStyle = '#0d0d12';
        for (let i = 0; i < 25; i++) {
            const bx = Math.random() * width;
            const bw = 30 + Math.random() * 120;
            const bh = (0.2 + Math.random() * 0.5) * (height - horizon);
            tCtx.fillRect(bx, horizon - bh, bw, bh + horizon);
        }

        // Street/ground
        const groundGradient = tCtx.createLinearGradient(0, horizon, 0, height);
        groundGradient.addColorStop(0, '#151520');
        groundGradient.addColorStop(1, '#0a0a0f');
        tCtx.fillStyle = groundGradient;
        tCtx.fillRect(0, horizon, width, height - horizon);

        // City lights (bokeh effect)
        const colors = ['#ffdd44', '#ff8811', '#ff4444', '#44aaff', '#ffffff', '#ff66aa'];
        for (let i = 0; i < 300; i++) {
            const ly = horizon * 0.4 + Math.random() * (height - horizon * 0.4);
            const perspective = (ly - horizon * 0.3) / (height - horizon * 0.3);
            const lx = Math.random() * width;
            const lr = 2 + perspective * perspective * 20 + Math.random() * 10;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const alpha = 0.3 + perspective * 0.5;

            const lightGradient = tCtx.createRadialGradient(lx, ly, 0, lx, ly, lr);
            lightGradient.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', 'rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i, (_, r, g, b) =>
                `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`));
            lightGradient.addColorStop(0.5, `rgba(${this.hexToRgb(color)}, ${alpha * 0.4})`);
            lightGradient.addColorStop(1, 'rgba(0,0,0,0)');

            tCtx.fillStyle = lightGradient;
            tCtx.beginPath();
            tCtx.arc(lx, ly, lr, 0, Math.PI * 2);
            tCtx.fill();
        }

        // Apply blur
        ctx.filter = 'blur(6px)';
        ctx.drawImage(temp, 0, 0);
        ctx.filter = 'none';
    }

    private drawHighway(): void {
        const { width, height } = this.bgCanvas;
        const ctx = this.bgCtx;

        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d')!;

        // Dark sky
        tCtx.fillStyle = '#0f0f18';
        tCtx.fillRect(0, 0, width, height);

        const horizon = height * 0.45;
        const vanishX = width * 0.5;

        // Road
        tCtx.fillStyle = '#1a1a1a';
        tCtx.beginPath();
        tCtx.moveTo(0, height);
        tCtx.lineTo(vanishX - 20, horizon);
        tCtx.lineTo(vanishX + 20, horizon);
        tCtx.lineTo(width, height);
        tCtx.closePath();
        tCtx.fill();

        // Road lights (red tail lights, white headlights)
        const tailLightColors = ['#ff3333', '#ff5555', '#ff2222'];
        const headlightColors = ['#ffffff', '#ffffee', '#ffeecc'];

        for (let i = 0; i < 80; i++) {
            const t = Math.random();
            const ly = horizon + t * (height - horizon);
            const spread = (ly - horizon) / (height - horizon);
            const lx = vanishX + (Math.random() - 0.5) * spread * width * 0.8;
            const lr = 2 + spread * 15;

            const isHeadlight = Math.random() > 0.6;
            const colors = isHeadlight ? headlightColors : tailLightColors;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const alpha = 0.5 + spread * 0.4;

            const gradient = tCtx.createRadialGradient(lx, ly, 0, lx, ly, lr);
            gradient.addColorStop(0, `rgba(${this.hexToRgb(color)}, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(${this.hexToRgb(color)}, ${alpha * 0.3})`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            tCtx.fillStyle = gradient;
            tCtx.beginPath();
            tCtx.arc(lx, ly, lr, 0, Math.PI * 2);
            tCtx.fill();
        }

        // Street lamps
        for (let i = 0; i < 15; i++) {
            const t = i / 15;
            const ly = horizon + t * (height - horizon) * 0.8;
            const spread = (ly - horizon) / (height - horizon);
            const lx = vanishX + (i % 2 === 0 ? -1 : 1) * spread * width * 0.35;
            const lr = 5 + spread * 25;

            const gradient = tCtx.createRadialGradient(lx, ly, 0, lx, ly, lr);
            gradient.addColorStop(0, 'rgba(255, 200, 100, 0.6)');
            gradient.addColorStop(0.4, 'rgba(255, 180, 80, 0.2)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            tCtx.fillStyle = gradient;
            tCtx.beginPath();
            tCtx.arc(lx, ly, lr, 0, Math.PI * 2);
            tCtx.fill();
        }

        ctx.filter = 'blur(5px)';
        ctx.drawImage(temp, 0, 0);
        ctx.filter = 'none';
    }

    private drawNature(): void {
        const { width, height } = this.bgCanvas;
        const ctx = this.bgCtx;

        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d')!;

        // Stormy sky
        const skyGradient = tCtx.createLinearGradient(0, 0, 0, height * 0.6);
        skyGradient.addColorStop(0, '#2d3436');
        skyGradient.addColorStop(0.5, '#4a5568');
        skyGradient.addColorStop(1, '#636e72');
        tCtx.fillStyle = skyGradient;
        tCtx.fillRect(0, 0, width, height);

        const horizon = height * 0.6;

        // Hills/trees silhouette
        tCtx.fillStyle = '#1a1a1a';
        tCtx.beginPath();
        tCtx.moveTo(0, horizon);
        for (let x = 0; x <= width; x += 20) {
            const h = Math.sin(x * 0.01) * 30 + Math.sin(x * 0.03) * 20 + Math.random() * 15;
            tCtx.lineTo(x, horizon - h);
        }
        tCtx.lineTo(width, height);
        tCtx.lineTo(0, height);
        tCtx.closePath();
        tCtx.fill();

        // Ground
        tCtx.fillStyle = '#0f0f0f';
        tCtx.fillRect(0, horizon, width, height - horizon);

        // Distant lights (houses, etc)
        for (let i = 0; i < 20; i++) {
            const lx = Math.random() * width;
            const ly = horizon - 10 - Math.random() * 50;
            const lr = 2 + Math.random() * 4;

            const gradient = tCtx.createRadialGradient(lx, ly, 0, lx, ly, lr);
            gradient.addColorStop(0, 'rgba(255, 220, 150, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.3)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            tCtx.fillStyle = gradient;
            tCtx.beginPath();
            tCtx.arc(lx, ly, lr, 0, Math.PI * 2);
            tCtx.fill();
        }

        ctx.filter = 'blur(4px)';
        ctx.drawImage(temp, 0, 0);
        ctx.filter = 'none';
    }

    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        return '255, 255, 255';
    }

    // Apply lightning flash
    flash(intensity: number): void {
        this.ctx.save();
        this.ctx.globalAlpha = intensity;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }
}

export default RainRenderer;
