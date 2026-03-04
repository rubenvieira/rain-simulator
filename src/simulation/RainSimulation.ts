/**
 * Realistic Rain Simulation Physics Engine
 * 
 * Simulates water droplets on a glass surface with:
 * - Surface tension and contact angle physics
 * - Mass-based deformation
 * - Wind simulation with gusts
 * - Trail system with "pearling" effect
 * - Realistic merging behavior
 */

export interface RainSettings {
    intensity: number;        // 0-100: controls spawn rate
    dropletSize: number;      // 1-10: base size multiplier
    windSpeed: number;        // 0-100: wind force
    windAngle: number;        // -45 to 45: wind direction in degrees
    trailPersistence: number; // 0-100: how long trails last
    glassWetness: number;     // 0-100: existing wetness on glass
    gravity: number;          // 1-10: gravity multiplier
    surfaceTension: number;   // 1-10: how much droplets stick
    thunder: boolean;
    thunderFrequency: number;
    bokehIntensity: number;   // 0-100: bokeh light density/brightness
    fogDensity: number;       // 0-100: condensation fog amount
    glassBlur: number;        // 0-100: background blur amount
}

export interface Vec2 {
    x: number;
    y: number;
}

// Perlin noise for realistic wind gusts
export class SimplexNoise {
    private grad3 = [
        [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
        [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    private p: number[] = [];
    private perm: number[] = [];

    constructor(seed = Math.random()) {
        for (let i = 0; i < 256; i++) {
            this.p[i] = Math.floor(seed * 256);
            seed = (seed * 16807) % 2147483647;
            seed = seed < 0 ? seed + 2147483647 : seed;
            seed = (seed - 1) / 2147483646;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
        }
    }

    noise2D(x: number, y: number): number {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;

        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);

        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;

        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        const ii = i & 255;
        const jj = j & 255;

        const dot = (g: number[], x: number, y: number) => g[0] * x + g[1] * y;

        let n0 = 0, n1 = 0, n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * dot(this.grad3[this.perm[ii + this.perm[jj]] % 12], x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * dot(this.grad3[this.perm[ii + i1 + this.perm[jj + j1]] % 12], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * dot(this.grad3[this.perm[ii + 1 + this.perm[jj + 1]] % 12], x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    }
}

// Trail bead left behind by moving droplets
export class TrailBead {
    x: number;
    y: number;
    radius: number;
    opacity: number;
    age: number;
    maxAge: number;

    constructor(x: number, y: number, radius: number, persistence: number) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.opacity = 0.6;
        this.age = 0;
        this.maxAge = 500 + persistence * 50; // 500ms to 5500ms
    }

    update(deltaTime: number): boolean {
        this.age += deltaTime;
        this.opacity = Math.max(0, 0.6 * (1 - this.age / this.maxAge));
        this.radius *= 0.9995; // Very slow shrinking
        return this.age < this.maxAge && this.radius > 0.5;
    }
}

// Main droplet class with realistic physics
export class Droplet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    mass: number;
    baseRadius: number;

    // Shape deformation
    stretchX: number = 1;
    stretchY: number = 1;

    // Surface interaction
    isStuck: boolean;
    stickForce: number;
    contactAngle: number; // Affects how droplet spreads on surface

    // Visual properties
    opacity: number = 0;

    // Trail generation
    lastTrailX: number;
    lastTrailY: number;
    distanceSinceTrail: number = 0;

    constructor(x: number, y: number, mass: number, settings: RainSettings) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.baseRadius = this.calculateRadius(mass);

        // Initial velocity with wind influence
        const windRad = (settings.windAngle * Math.PI) / 180;
        const windInfluence = settings.windSpeed / 100;
        this.vx = Math.sin(windRad) * windInfluence * 0.5;
        this.vy = 0.1;

        // Surface tension determines how sticky droplet is
        this.stickForce = 0.3 + (settings.surfaceTension / 10) * 0.7;
        this.contactAngle = 40 + Math.random() * 30; // Degrees, affects spread

        // Small droplets stick more easily
        this.isStuck = mass < 15 || Math.random() < this.stickForce * 0.5;

        this.lastTrailX = x;
        this.lastTrailY = y;
    }

    private calculateRadius(mass: number): number {
        // Radius proportional to cube root of mass (volume)
        return Math.pow(mass, 0.4) * 2.5;
    }

    get radius(): number {
        return this.baseRadius * Math.max(this.stretchX, this.stretchY);
    }

    update(
        deltaTime: number,
        settings: RainSettings,
        windNoise: number,
        canvasHeight: number,
        createTrailBead: (x: number, y: number, radius: number) => void
    ): boolean {
        const dt = deltaTime / 16.67; // Normalize to ~60fps

        // Fade in
        if (this.opacity < 1) {
            this.opacity = Math.min(1, this.opacity + 0.1 * dt);
        }

        // Calculate forces
        const gravity = 0.015 * (settings.gravity / 5) * this.mass * 0.1;

        // Wind force with noise for gusts
        const windRad = (settings.windAngle * Math.PI) / 180;
        const windStrength = (settings.windSpeed / 100) * (0.7 + windNoise * 0.6);
        const windForceX = Math.sin(windRad) * windStrength * 0.02;
        const windForceY = Math.cos(windRad) * windStrength * 0.005;

        // Surface tension resistance
        const totalVelocity = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const resistanceForce = this.stickForce * 0.1 / (this.mass * 0.1 + 1);

        if (this.isStuck) {
            // Droplet is stuck - only moves if force exceeds threshold
            const totalForce = gravity + Math.abs(windForceY);
            const threshold = this.stickForce * (1 + 1 / (this.mass * 0.2 + 1));

            if (totalForce > threshold) {
                this.isStuck = false;
            } else {
                // Small jitter while stuck
                this.x += (Math.random() - 0.5) * 0.1 * dt;
                this.y += gravity * 0.1 * dt;
                return this.y < canvasHeight + this.radius;
            }
        }

        // Apply forces
        this.vy += (gravity - resistanceForce * this.vy) * dt;
        this.vx += (windForceX - resistanceForce * this.vx) * dt;

        // Random micro-movements for realism
        this.vx += (Math.random() - 0.5) * 0.02 * dt;

        // Occasionally stick again if moving slowly
        if (totalVelocity < 0.3 && Math.random() < 0.01 * this.stickForce) {
            this.isStuck = true;
        }

        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Calculate shape deformation based on velocity
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const targetStretchY = 1 + Math.min(speed * 0.3, 0.5);
        const targetStretchX = 1 / Math.sqrt(targetStretchY); // Preserve volume

        this.stretchY += (targetStretchY - this.stretchY) * 0.1 * dt;
        this.stretchX += (targetStretchX - this.stretchX) * 0.1 * dt;

        // Trail generation
        const distMoved = Math.sqrt(
            Math.pow(this.x - this.lastTrailX, 2) +
            Math.pow(this.y - this.lastTrailY, 2)
        );
        this.distanceSinceTrail += distMoved;
        this.lastTrailX = this.x;
        this.lastTrailY = this.y;

        // Create trail beads based on speed and mass
        const trailInterval = Math.max(5, 20 - speed * 5);
        if (this.distanceSinceTrail > trailInterval && speed > 0.5 && this.mass > 8) {
            const trailRadius = this.baseRadius * (0.15 + Math.random() * 0.2);
            const trailX = this.x + (Math.random() - 0.5) * this.baseRadius * 0.3;
            const trailY = this.y - this.baseRadius * this.stretchY * 0.5;
            createTrailBead(trailX, trailY, trailRadius);

            // Lose a bit of mass when leaving trail
            this.mass = Math.max(5, this.mass - trailRadius * 0.5);
            this.baseRadius = this.calculateRadius(this.mass);
            this.distanceSinceTrail = 0;
        }

        return this.y < canvasHeight + this.radius * 2;
    }

    // Check collision with another droplet
    collidesWith(other: Droplet): boolean {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (this.radius + other.radius) * 0.7;
        return dist < minDist;
    }

    // Merge with another droplet
    merge(other: Droplet): void {
        const totalMass = this.mass + other.mass;

        // Weighted average position
        this.x = (this.x * this.mass + other.x * other.mass) / totalMass;
        this.y = (this.y * this.mass + other.y * other.mass) / totalMass;

        // Combine velocities (momentum conservation)
        this.vx = (this.vx * this.mass + other.vx * other.mass) / totalMass;
        this.vy = (this.vy * this.mass + other.vy * other.mass) / totalMass;

        // Increase mass
        this.mass = totalMass;
        this.baseRadius = this.calculateRadius(this.mass);

        // Merged droplet usually starts moving
        if (other.vy > 0.2 || this.mass > 20) {
            this.isStuck = false;
        }

        // Brief stretch effect from merge
        this.stretchY = 1.3;
        this.stretchX = 0.85;
    }

    // Absorb a trail bead
    absorbBead(bead: TrailBead): void {
        const beadMass = bead.radius * 0.5;
        this.mass += beadMass;
        this.baseRadius = this.calculateRadius(this.mass);
    }
}

// Main simulation manager
export class RainSimulation {
    private droplets: Droplet[] = [];
    private trailBeads: TrailBead[] = [];
    private noise: SimplexNoise;
    private time: number = 0;
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    constructor() {
        this.noise = new SimplexNoise();
    }

    resize(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;
    }

    getDroplets(): Droplet[] {
        return this.droplets;
    }

    getTrailBeads(): TrailBead[] {
        return this.trailBeads;
    }

    private spawnDroplet(settings: RainSettings): void {
        // Spawn from top or slightly from sides based on wind
        const windRad = (settings.windAngle * Math.PI) / 180;
        const windOffset = Math.sin(windRad) * (settings.windSpeed / 100) * 100;

        const x = Math.random() * this.canvasWidth - windOffset;
        const y = -10 - Math.random() * 50;

        // Mass distribution - mostly small drops, occasional large ones
        const massBase = 5 + settings.dropletSize * 2;
        const mass = massBase + Math.pow(Math.random(), 3) * massBase * 4;

        this.droplets.push(new Droplet(x, y, mass, settings));
    }

    private createTrailBead = (x: number, y: number, radius: number) => {
        // Callback for droplets to create trail beads
        this.trailBeads.push(new TrailBead(x, y, radius, 50));
    };

    update(deltaTime: number, settings: RainSettings): void {
        this.time += deltaTime * 0.001;

        // Spawn new droplets based on intensity
        const spawnRate = (settings.intensity / 100) * 0.3;
        const spawnCount = Math.floor(spawnRate * (deltaTime / 16.67));
        for (let i = 0; i < spawnCount + (Math.random() < spawnRate ? 1 : 0); i++) {
            if (this.droplets.length < 500) {
                this.spawnDroplet(settings);
            }
        }

        // Get wind noise for this frame
        const windNoise = this.noise.noise2D(this.time * 0.5, 0);

        // Update trail beads
        for (let i = this.trailBeads.length - 1; i >= 0; i--) {
            if (!this.trailBeads[i].update(deltaTime)) {
                this.trailBeads.splice(i, 1);
            }
        }

        // Update droplets
        for (let i = this.droplets.length - 1; i >= 0; i--) {
            const droplet = this.droplets[i];

            if (!droplet.update(deltaTime, settings, windNoise, this.canvasHeight, this.createTrailBead)) {
                this.droplets.splice(i, 1);
                continue;
            }

            // Check for bead absorption
            for (let j = this.trailBeads.length - 1; j >= 0; j--) {
                const bead = this.trailBeads[j];
                const dx = droplet.x - bead.x;
                const dy = droplet.y - bead.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < droplet.radius + bead.radius) {
                    droplet.absorbBead(bead);
                    this.trailBeads.splice(j, 1);
                }
            }

            // Check for droplet collisions/merging
            for (let j = i - 1; j >= 0; j--) {
                const other = this.droplets[j];
                if (droplet.collidesWith(other)) {
                    // Merge into the larger droplet
                    if (droplet.mass > other.mass) {
                        droplet.merge(other);
                        this.droplets.splice(j, 1);
                        i--; // Adjust index since we removed one
                    } else {
                        other.merge(droplet);
                        this.droplets.splice(i, 1);
                    }
                    break;
                }
            }
        }
    }

    reset(): void {
        this.droplets = [];
        this.trailBeads = [];
        this.time = 0;
    }

    // Pre-populate with some drops
    populate(settings: RainSettings): void {
        const count = Math.floor((settings.intensity / 100) * 50);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * this.canvasWidth;
            const y = Math.random() * this.canvasHeight;
            const massBase = 5 + settings.dropletSize * 2;
            const mass = massBase + Math.pow(Math.random(), 2) * massBase * 2;

            const droplet = new Droplet(x, y, mass, settings);
            droplet.opacity = 1;
            droplet.isStuck = Math.random() < 0.7; // Most are stuck initially
            this.droplets.push(droplet);
        }
    }
}

export default RainSimulation;
