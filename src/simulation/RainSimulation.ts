/**
 * Realistic Rain Simulation Physics Engine
 *
 * Simulates water droplets on a glass surface with:
 * - Surface tension and contact angle physics
 * - Energy-based surface tension (not binary stuck/unstick)
 * - Mass-based deformation with damped oscillation on merge
 * - Wind simulation with gusts and intensity variation
 * - Trail system with gravity-affected "pearling" effect
 * - Rivulet channel system (drops carve paths, future drops follow)
 * - Realistic merging behavior with directional splash
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
    gustiness: number;        // 0-100: rain intensity variation
    condensation: number;     // 0-100: micro-drop density
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

// Rivulet channel map — tracks where drops have traveled on the glass
export class RivuletMap {
    private data: Float32Array;      // wetness strength
    private dirX: Float32Array;      // average flow direction X
    private dirY: Float32Array;      // average flow direction Y
    cols: number;
    rows: number;
    cellSize: number;

    constructor(width: number, height: number, cellSize: number = 8) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        const len = this.cols * this.rows;
        this.data = new Float32Array(len);
        this.dirX = new Float32Array(len);
        this.dirY = new Float32Array(len);
    }

    resize(width: number, height: number) {
        const newCols = Math.ceil(width / this.cellSize);
        const newRows = Math.ceil(height / this.cellSize);
        if (newCols !== this.cols || newRows !== this.rows) {
            this.cols = newCols;
            this.rows = newRows;
            const len = newCols * newRows;
            this.data = new Float32Array(len);
            this.dirX = new Float32Array(len);
            this.dirY = new Float32Array(len);
        }
    }

    deposit(x: number, y: number, strength: number, flowDirX: number, flowDirY: number) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        const idx = row * this.cols + col;
        this.data[idx] = Math.min(1, this.data[idx] + strength);
        // Blend flow direction
        this.dirX[idx] = this.dirX[idx] * 0.8 + flowDirX * 0.2;
        this.dirY[idx] = this.dirY[idx] * 0.8 + flowDirY * 0.2;
    }

    query(x: number, y: number, radius: number): { forceX: number; forceY: number; strength: number } {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        const r = Math.ceil(radius / this.cellSize);
        let totalForceX = 0;
        let totalForceY = 0;
        let totalStrength = 0;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const c = col + dx;
                const rr = row + dy;
                if (c < 0 || c >= this.cols || rr < 0 || rr >= this.rows) continue;
                const idx = rr * this.cols + c;
                const s = this.data[idx];
                if (s < 0.01) continue;
                // Distance-weighted attraction toward the channel
                const wx = (c * this.cellSize + this.cellSize / 2) - x;
                const wy = (rr * this.cellSize + this.cellSize / 2) - y;
                const dist = Math.sqrt(wx * wx + wy * wy) + 0.1;
                const weight = s / dist;
                totalForceX += (wx / dist) * weight;
                totalForceY += (wy / dist) * weight;
                totalStrength += s;
            }
        }

        return { forceX: totalForceX, forceY: totalForceY, strength: totalStrength };
    }

    // Get raw data for rendering
    getData(): Float32Array {
        return this.data;
    }

    decay(deltaTime: number) {
        const factor = 1 - 0.0003 * deltaTime; // Slow evaporation
        for (let i = 0; i < this.data.length; i++) {
            this.data[i] *= factor;
            if (this.data[i] < 0.005) this.data[i] = 0;
        }
    }

    clear() {
        this.data.fill(0);
        this.dirX.fill(0);
        this.dirY.fill(0);
    }
}

// Trail bead left behind by moving droplets
export class TrailBead {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    opacity: number;
    age: number;
    maxAge: number;

    constructor(x: number, y: number, radius: number, persistence: number) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
        this.opacity = 0.6;
        this.age = 0;
        this.maxAge = 500 + persistence * 50; // 500ms to 5500ms
    }

    update(deltaTime: number, rivuletMap?: RivuletMap, enableAttraction?: boolean): boolean {
        this.age += deltaTime;
        this.opacity = Math.max(0, 0.6 * (1 - this.age / this.maxAge));
        const dt = deltaTime / 16.67;

        // Micro-gravity: trail beads slowly slide down
        this.vy += 0.002 * dt;

        // Rivulet attraction (desktop only)
        if (enableAttraction && rivuletMap) {
            const q = rivuletMap.query(this.x, this.y, 16);
            if (q.strength > 0.1) {
                this.vx += q.forceX * 0.0005 * dt;
                this.vy += q.forceY * 0.0003 * dt;
            }
        }

        // Apply velocity with damping
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.98;
        this.vy *= 0.98;

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

    // Damped oscillation from merges
    oscillationAmplitude: number = 0;
    oscillationPhase: number = 0;

    // Energy-based surface tension
    isStuck: boolean;
    stickForce: number;
    stickEnergy: number = 0;
    stickThreshold: number;
    contactAngle: number;

    // Visual properties
    opacity: number = 0;

    // Trail generation
    lastTrailX: number;
    lastTrailY: number;
    distanceSinceTrail: number = 0;

    // Merge tracking for directional splash
    lastMergeAngle: number = 0;
    lastMergeEnergy: number = 0;

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
        this.stickThreshold = this.stickForce * (1 + 1 / (mass * 0.2 + 1));
        this.contactAngle = 40 + Math.random() * 30;

        // Small droplets stick more easily
        this.isStuck = mass < 15 || Math.random() < this.stickForce * 0.5;

        this.lastTrailX = x;
        this.lastTrailY = y;
    }

    private calculateRadius(mass: number): number {
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
        createTrailBead: (x: number, y: number, radius: number) => void,
        rivuletMap?: RivuletMap,
        enableRivuletAttraction?: boolean
    ): boolean {
        const dt = deltaTime / 16.67;

        // Fade in
        if (this.opacity < 1) {
            this.opacity = Math.min(1, this.opacity + 0.1 * dt);
        }

        // Update oscillation from merges
        if (this.oscillationAmplitude > 0.001) {
            this.oscillationPhase += dt * 0.5;
            this.oscillationAmplitude *= Math.pow(0.92, dt);
            const osc = Math.sin(this.oscillationPhase * 8) * this.oscillationAmplitude;
            this.stretchX = 1 + osc;
            this.stretchY = 1 - osc;
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
            // Energy-based surface tension: accumulate force energy
            const appliedForce = gravity + Math.abs(windForceY) + Math.abs(windForceX);
            this.stickEnergy += appliedForce * dt;
            // Drain energy slowly (surface tension fighting back)
            this.stickEnergy -= this.stickThreshold * 0.02 * dt;
            this.stickEnergy = Math.max(0, this.stickEnergy);

            if (this.stickEnergy > this.stickThreshold) {
                this.isStuck = false;
                this.stickEnergy = 0;
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

        // Rivulet channel attraction
        if (enableRivuletAttraction && rivuletMap) {
            const q = rivuletMap.query(this.x, this.y, this.baseRadius * 2);
            if (q.strength > 0.1) {
                this.vx += q.forceX * 0.001 * dt;
                this.vy += q.forceY * 0.0005 * dt;
            }
        }

        // Random micro-movements for realism
        this.vx += (Math.random() - 0.5) * 0.02 * dt;

        // Re-stick if moving slowly (energy-based: lower threshold on worn channels)
        if (totalVelocity < 0.3 && Math.random() < 0.01 * this.stickForce) {
            this.isStuck = true;
            // Worn channel: easier to release next time
            this.stickThreshold *= 0.7;
            this.stickThreshold = Math.max(0.05, this.stickThreshold);
        }

        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Deposit onto rivulet map
        if (rivuletMap && totalVelocity > 0.2) {
            const norm = totalVelocity + 0.01;
            rivuletMap.deposit(
                this.x, this.y,
                Math.min(0.15, totalVelocity * 0.03),
                this.vx / norm,
                this.vy / norm
            );
        }

        // Calculate shape deformation based on velocity (only if not oscillating)
        if (this.oscillationAmplitude <= 0.001) {
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const targetStretchY = 1 + Math.min(speed * 0.3, 0.5);
            const targetStretchX = 1 / Math.sqrt(targetStretchY);
            this.stretchY += (targetStretchY - this.stretchY) * 0.1 * dt;
            this.stretchX += (targetStretchX - this.stretchX) * 0.1 * dt;
        }

        // Trail generation
        const distMoved = Math.sqrt(
            Math.pow(this.x - this.lastTrailX, 2) +
            Math.pow(this.y - this.lastTrailY, 2)
        );
        this.distanceSinceTrail += distMoved;
        this.lastTrailX = this.x;
        this.lastTrailY = this.y;

        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const trailInterval = Math.max(5, 20 - speed * 5);
        if (this.distanceSinceTrail > trailInterval && speed > 0.5 && this.mass > 8) {
            const trailRadius = this.baseRadius * (0.15 + Math.random() * 0.2);
            const trailX = this.x + (Math.random() - 0.5) * this.baseRadius * 0.3;
            const trailY = this.y - this.baseRadius * this.stretchY * 0.5;
            createTrailBead(trailX, trailY, trailRadius);

            this.mass = Math.max(5, this.mass - trailRadius * 0.5);
            this.baseRadius = this.calculateRadius(this.mass);
            this.distanceSinceTrail = 0;
        }

        return this.y < canvasHeight + this.radius * 2;
    }

    collidesWith(other: Droplet): boolean {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (this.radius + other.radius) * 0.7;
        return dist < minDist;
    }

    merge(other: Droplet): void {
        const totalMass = this.mass + other.mass;

        // Calculate merge energy and angle for directional splash
        const relVx = this.vx - other.vx;
        const relVy = this.vy - other.vy;
        const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
        const massRatio = Math.min(this.mass, other.mass) / Math.max(this.mass, other.mass);
        this.lastMergeEnergy = relSpeed * massRatio + (totalMass / 50);
        this.lastMergeAngle = Math.atan2(other.y - this.y, other.x - this.x);

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

        // Damped oscillation from merge impact
        this.oscillationAmplitude = Math.min(0.3, this.lastMergeEnergy * 0.08);
        this.oscillationPhase = 0;
    }

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
    private gustNoise: SimplexNoise;
    private time: number = 0;
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;
    maxDroplets: number = 500;
    rivuletMap: RivuletMap;
    enableRivuletAttraction: boolean;
    rivuletCellSize: number;

    // Gust intensity modulation
    intensityMod: number = 1;

    constructor(maxDroplets: number = 500, rivuletCellSize: number = 8, enableRivuletAttraction: boolean = true) {
        this.noise = new SimplexNoise();
        this.gustNoise = new SimplexNoise(Math.random());
        this.maxDroplets = maxDroplets;
        this.rivuletCellSize = rivuletCellSize;
        this.enableRivuletAttraction = enableRivuletAttraction;
        this.rivuletMap = new RivuletMap(1, 1, rivuletCellSize);
    }

    resize(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.rivuletMap.resize(width, height);
    }

    getDroplets(): Droplet[] {
        return this.droplets;
    }

    getTrailBeads(): TrailBead[] {
        return this.trailBeads;
    }

    private spawnDroplet(settings: RainSettings): void {
        const windRad = (settings.windAngle * Math.PI) / 180;
        const windOffset = Math.sin(windRad) * (settings.windSpeed / 100) * 100;

        const x = Math.random() * this.canvasWidth - windOffset;
        const y = -10 - Math.random() * 50;

        const massBase = 5 + settings.dropletSize * 2;
        const mass = massBase + Math.pow(Math.random(), 3) * massBase * 4;

        this.droplets.push(new Droplet(x, y, mass, settings));
    }

    private createTrailBead = (x: number, y: number, radius: number) => {
        this.trailBeads.push(new TrailBead(x, y, radius, 50));
    };

    update(deltaTime: number, settings: RainSettings): void {
        this.time += deltaTime * 0.001;

        // Rain intensity gusts — natural ebb-and-flow
        const gustiness = (settings.gustiness ?? 50) / 100;
        if (gustiness > 0) {
            const n1 = this.gustNoise.noise2D(this.time * 0.03, 0);
            const n2 = this.gustNoise.noise2D(this.time * 0.2, 5);
            this.intensityMod = 0.3 + 0.7 * ((n1 * 0.7 + n2 * 0.3) * gustiness * 0.5 + 0.5);
        } else {
            this.intensityMod = 1;
        }

        // Spawn new droplets with gust modulation
        const spawnRate = (settings.intensity / 100) * 0.3 * this.intensityMod;
        const spawnCount = Math.floor(spawnRate * (deltaTime / 16.67));
        for (let i = 0; i < spawnCount + (Math.random() < spawnRate ? 1 : 0); i++) {
            if (this.droplets.length < this.maxDroplets) {
                this.spawnDroplet(settings);
            }
        }

        // Get wind noise for this frame
        const windNoise = this.noise.noise2D(this.time * 0.5, 0);

        // Decay rivulet channels
        this.rivuletMap.decay(deltaTime);

        // Update trail beads with gravity and rivulet attraction
        for (let i = this.trailBeads.length - 1; i >= 0; i--) {
            if (!this.trailBeads[i].update(deltaTime, this.rivuletMap, this.enableRivuletAttraction)) {
                this.trailBeads.splice(i, 1);
            }
        }

        // Merge nearby trail beads
        for (let i = this.trailBeads.length - 1; i >= 0; i--) {
            const a = this.trailBeads[i];
            for (let j = i - 1; j >= 0; j--) {
                const b = this.trailBeads[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < a.radius + b.radius) {
                    // Merge into larger bead
                    const totalArea = a.radius * a.radius + b.radius * b.radius;
                    a.radius = Math.sqrt(totalArea);
                    a.x = (a.x + b.x) / 2;
                    a.y = (a.y + b.y) / 2;
                    a.vx = (a.vx + b.vx) / 2;
                    a.vy = (a.vy + b.vy) / 2;
                    this.trailBeads.splice(j, 1);
                    i--;
                    break;
                }
            }
        }

        // Update droplets
        for (let i = this.droplets.length - 1; i >= 0; i--) {
            const droplet = this.droplets[i];

            if (!droplet.update(deltaTime, settings, windNoise, this.canvasHeight, this.createTrailBead, this.rivuletMap, this.enableRivuletAttraction)) {
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
                    if (droplet.mass > other.mass) {
                        droplet.merge(other);
                        this.droplets.splice(j, 1);
                        i--;
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
        this.rivuletMap.clear();
    }

    populate(settings: RainSettings): void {
        const count = Math.floor((settings.intensity / 100) * 50);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * this.canvasWidth;
            const y = Math.random() * this.canvasHeight;
            const massBase = 5 + settings.dropletSize * 2;
            const mass = massBase + Math.pow(Math.random(), 2) * massBase * 2;

            const droplet = new Droplet(x, y, mass, settings);
            droplet.opacity = 1;
            droplet.isStuck = Math.random() < 0.7;
            this.droplets.push(droplet);
        }
    }
}

export default RainSimulation;
