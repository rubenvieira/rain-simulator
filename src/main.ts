import "./style.css";
import { streetShader } from "./shaders/street";
import { defocusShader, fullscreenVertex, glassShader } from "./shaders/glass";
import { Water } from "./water";
import { RainSound } from "./audio";

const canvas = document.querySelector<HTMLCanvasElement>("#glass")!;
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
const status = document.querySelector<HTMLElement>(".status")!;
if (!gl) {
  status.textContent = "This window needs WebGL 2, which this browser does not offer.";
  throw new Error("WebGL 2 unavailable");
}

// ---------------------------------------------------------------- GL plumbing
function compile(type: number, source: string) {
  const shader = gl!.createShader(type)!;
  gl!.shaderSource(shader, source);
  gl!.compileShader(shader);
  if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) ?? "shader");
  return shader;
}
function program(fragment: string) {
  const p = gl!.createProgram()!;
  gl!.attachShader(p, compile(gl!.VERTEX_SHADER, fullscreenVertex));
  gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fragment));
  gl!.linkProgram(p);
  if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) throw new Error(gl!.getProgramInfoLog(p) ?? "link");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (name: string) => { if (!uniforms.has(name)) uniforms.set(name, gl!.getUniformLocation(p, name)); return uniforms.get(name)!; } };
}
function texture() {
  const t = gl!.createTexture()!;
  gl!.bindTexture(gl!.TEXTURE_2D, t);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
  return t;
}
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }
function target(w: number, h: number, old?: Target): Target {
  const tex = old?.tex ?? texture();
  gl!.bindTexture(gl!.TEXTURE_2D, tex);
  gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
  const fb = old?.fb ?? gl!.createFramebuffer()!;
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, fb);
  gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
  return { fb, tex, w, h };
}

const quad = gl.createVertexArray();
gl.bindVertexArray(quad);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const street = program(streetShader);
const defocus = program(defocusShader);
const glass = program(glassShader);
const waterTex = texture();
const clearTex = texture();

function draw(into: Target | null, prog: ReturnType<typeof program>, bind: () => void) {
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, into ? into.fb : null);
  gl!.viewport(0, 0, into ? into.w : canvas.width, into ? into.h : canvas.height);
  gl!.useProgram(prog.p);
  bind();
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
}
function use(prog: ReturnType<typeof program>, name: string, unit: number, tex: WebGLTexture) {
  gl!.activeTexture(gl!.TEXTURE0 + unit);
  gl!.bindTexture(gl!.TEXTURE_2D, tex);
  gl!.uniform1i(prog.u(name), unit);
}

// ---------------------------------------------------------------- sizes and quality
const coarse = matchMedia("(pointer: coarse)").matches;
const water = new Water();
water.maxDrops = coarse ? 160 : 320;
let sharp: Target, bokeh: Target, fogged: Target, fogTmp: Target;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  canvas.width = w; canvas.height = h;
  // The street is out of focus anyway, so it renders at a fraction of the screen.
  const sw = Math.round(Math.min(w, 1600) * (coarse ? 0.4 : 0.55)), sh = Math.round(sw * h / w);
  sharp = target(sw, sh, sharp);
  bokeh = target(Math.round(sw / 2), Math.round(sh / 2), bokeh);
  fogTmp = target(Math.round(sw / 4), Math.round(sh / 4), fogTmp);
  fogged = target(Math.round(sw / 4), Math.round(sh / 4), fogged);
  water.resize(innerWidth, innerHeight, coarse ? 0.6 : 0.85);
  water.warmUp(6, settings);
}

// ---------------------------------------------------------------- state
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = { rain: 0.55, wind: 0.0, fog: 0.6, lightning: !reduced };
let paused = false;
let time = 0;
let flash = 0;
let nextStrike = 8 + Math.random() * 14;
const strikes: { at: number; power: number }[] = [];
const sound = new RainSound();
// ?view=street or ?view=bokeh shows the scene behind the glass, for tuning.
const debugView = ({ street: 1, bokeh: 2 } as Record<string, number>)[new URLSearchParams(location.search).get("view") ?? ""] ?? 0;

function strike() {
  // A strike is a few quick pulses; nearer strikes are brighter and the thunder comes sooner.
  const distance = Math.random();
  const power = 0.85 - distance * 0.55;
  const pulses = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pulses; i++) strikes.push({ at: time + i * rand(0.06, 0.14), power: power * (i ? 0.6 : 1) });
  sound.thunder(distance);
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function frame(dt: number) {
  if (!paused) {
    time += dt;
    water.update(dt, settings);
    sound.update(dt, settings.rain);
    if (settings.lightning && time > nextStrike) { strike(); nextStrike = time + 14 + Math.random() * 26 * (1.2 - settings.rain); }
  }
  // Flash: each pulse rises instantly and decays over a fifth of a second.
  flash = 0;
  for (const s of strikes) { const age = time - s.at; if (age >= 0 && age < 0.6) flash = Math.max(flash, s.power * Math.exp(-age * 9)); }
  while (strikes.length && time - strikes[0].at > 1) strikes.shift();

  water.draw();
  gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
  gl!.bindTexture(gl!.TEXTURE_2D, waterTex);
  gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, water.map);
  gl!.bindTexture(gl!.TEXTURE_2D, clearTex);
  gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, water.clear);

  const aspect = canvas.width / canvas.height;
  draw(sharp, street, () => {
    gl!.uniform2f(street.u("uRes"), sharp.w, sharp.h);
    gl!.uniform1f(street.u("uTime"), time);
    gl!.uniform1f(street.u("uFlash"), flash);
  });
  draw(bokeh, defocus, () => {
    use(defocus, "uTex", 0, sharp.tex);
    gl!.uniform1f(defocus.u("uRadius"), 0.032);
    gl!.uniform1f(defocus.u("uAspect"), aspect);
    gl!.uniform1f(defocus.u("uBoost"), 70);
  });
  // Condensation scatters light much further: two wider, softer passes.
  draw(fogTmp, defocus, () => {
    use(defocus, "uTex", 0, bokeh.tex);
    gl!.uniform1f(defocus.u("uRadius"), 0.06);
    gl!.uniform1f(defocus.u("uBoost"), 6);
  });
  draw(fogged, defocus, () => {
    use(defocus, "uTex", 0, fogTmp.tex);
    gl!.uniform1f(defocus.u("uRadius"), 0.09);
    gl!.uniform1f(defocus.u("uBoost"), 2);
  });
  draw(null, glass, () => {
    use(glass, "uSharp", 0, sharp.tex);
    use(glass, "uBokeh", 1, bokeh.tex);
    use(glass, "uFog", 2, fogged.tex);
    use(glass, "uWater", 3, waterTex);
    use(glass, "uClear", 4, clearTex);
    gl!.uniform1f(glass.u("uAspect"), aspect);
    gl!.uniform1f(glass.u("uFogAmount"), settings.fog);
    gl!.uniform1f(glass.u("uFlash"), flash);
    gl!.uniform1f(glass.u("uTime"), time);
    gl!.uniform2f(glass.u("uTexel"), 1 / canvas.width, 1 / canvas.height);
    gl!.uniform1i(glass.u("uDebug"), debugView);
  });
}

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- interface
const ui = document.querySelector<HTMLElement>(".ui")!;
const showUi = document.querySelector<HTMLButtonElement>("#show")!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
const slider = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;

function bindSlider(id: keyof typeof settings, scale = 1) {
  const input = slider(id);
  input.value = String((settings[id] as number) * scale);
  input.addEventListener("input", () => { (settings[id] as number) = Number(input.value) / scale; });
}
bindSlider("rain", 100);
bindSlider("wind", 100);
bindSlider("fog", 100);

const setPressed = (b: HTMLButtonElement, on: boolean) => b.setAttribute("aria-pressed", String(on));
const lightningButton = button("lightning");
setPressed(lightningButton, settings.lightning);
lightningButton.addEventListener("click", () => { settings.lightning = !settings.lightning; setPressed(lightningButton, settings.lightning); });

const soundButton = button("sound");
const toggleSound = async () => setPressed(soundButton, await sound.toggle());
soundButton.addEventListener("click", toggleSound);

const pauseButton = button("pause");
const togglePause = () => { paused = !paused; setPressed(pauseButton, paused); pauseButton.querySelector("span")!.textContent = paused ? "Play" : "Pause"; };
pauseButton.addEventListener("click", togglePause);

const resetGlass = () => water.reset();
button("reset").addEventListener("click", resetGlass);

const setHidden = (hidden: boolean) => {
  ui.hidden = hidden;
  showUi.hidden = !hidden;
  (hidden ? showUi : button("hide")).focus({ preventScroll: true });
};
button("hide").addEventListener("click", () => setHidden(true));
showUi.addEventListener("click", () => setHidden(false));

addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); togglePause(); }
  else if (k === "h") setHidden(!ui.hidden);
  else if (k === "s") void toggleSound();
  else if (k === "l") lightningButton.click();
  else if (k === "r") resetGlass();
});

// Drag a finger across the glass to wipe the condensation.
let pointer: { id: number; x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => { pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); water.touch(e.clientX, e.clientY, e.clientX, e.clientY); });
canvas.addEventListener("pointermove", (e) => {
  if (!pointer || pointer.id !== e.pointerId) return;
  water.touch(pointer.x, pointer.y, e.clientX, e.clientY);
  pointer.x = e.clientX; pointer.y = e.clientY;
});
const release = () => { pointer = null; };
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => { last = performance.now(); });
resize();
document.body.classList.add("ready");
requestAnimationFrame((now) => { last = now; loop(now); });

// For recordings and tests: a deterministic hook to trigger lightning.
(window as unknown as { rain: unknown }).rain = { strike, settings, water };
