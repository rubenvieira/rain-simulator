// The view through the window: a wet city street at night, drawn sharp.
// Lights are small bright cores; the defocus pass turns them into bokeh discs.
// World units are metres: ground at y = 0, the camera 1.6 m up, looking down +z.
export const streetShader = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uFlash;

#define F 1.25
#define CAM 1.6
#define HOR -0.05
#define HALF 7.0

float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }

vec2 project(vec3 w) { return vec2(w.x / w.z, (w.y - CAM) / w.z) * F + vec2(0.0, HOR); }

// A light as seen in focus: a bright core and a faint halo from the wet air.
vec3 lamp(vec2 p, vec3 world, float size, vec3 color) {
  if (world.z < 0.5) return vec3(0.0);
  vec2 c = project(world);
  float r = size * F / world.z;
  float d = length(p - c);
  if (d > r * 10.0) return vec3(0.0);
  return color * (smoothstep(r, r * 0.25, d) * 1.6 + 0.06 * exp(-d / (r * 2.0)));
}

// Its reflection on the wet road: mirrored under the ground and drawn out into a long streak.
vec3 reflection(vec2 p, vec3 world, float size, vec3 color, float wet) {
  if (world.z < 0.5 || p.y > HOR) return vec3(0.0);
  vec2 c = project(vec3(world.x, -world.y, world.z));
  float r = size * F / world.z;
  vec2 q = (p - c) / vec2(r * 1.4, r * 7.0 + 0.008);
  float d = length(q);
  return color * wet * 0.7 * exp(-d * d * 1.6);
}

float buildingHeight(float seg, float side) { return 9.0 + 34.0 * h11(seg * 3.1 + side * 17.0); }
bool crossStreet(float seg, float side) { return h11(seg * 7.7 + side * 3.0) < 0.13; }

vec3 neonHue(float n) {
  float k = floor(n * 6.0);
  if (k < 1.0) return vec3(1.0, 0.15, 0.45);
  if (k < 2.0) return vec3(0.15, 0.75, 1.0);
  if (k < 3.0) return vec3(1.0, 0.25, 0.1);
  if (k < 4.0) return vec3(0.6, 0.3, 1.0);
  if (k < 5.0) return vec3(1.0, 0.75, 0.25);
  return vec3(0.2, 1.0, 0.55);
}

vec3 facade(float z, float y, float side, float seg) {
  vec3 col = vec3(0.004, 0.004, 0.006);
  // Shops at street level: lit windows and a neon sign above each.
  if (y < 3.4) {
    float bay = floor(z / 4.5);
    float lit = step(0.35, h21(vec2(bay, side * 9.0)));
    vec3 warm = mix(vec3(1.0, 0.72, 0.45), vec3(0.75, 0.85, 1.0), h11(bay + side * 5.0));
    float glass = step(0.4, y) * step(y, 2.6) * step(0.12, fract(z / 4.5)) * step(fract(z / 4.5), 0.88);
    // Close by, a shop window is a dim interior, not a bright panel.
    col += glass * lit * warm * 0.05 * smoothstep(4.0, 14.0, z) * (0.4 + 0.6 * h11(bay * 1.7 + side));
    float signOn = step(0.3, h11(bay * 2.3 + side));
    float sign = smoothstep(2.55, 2.65, y) * smoothstep(3.35, 3.25, y) * step(0.15, fract(z / 4.5)) * step(fract(z / 4.5), 0.8);
    float flicker = 0.85 + 0.15 * step(0.3, sin(uTime * 23.0 + bay * 7.0));
    col += sign * signOn * neonHue(h11(bay * 4.1 + side * 2.0)) * 2.6 * flicker;
    return col;
  }
  // Offices and flats above: a grid of windows, some lit.
  vec2 cell = vec2(z / 1.7, (y - 3.4) / 3.1);
  vec2 id = floor(cell), f = fract(cell);
  float on = step(0.62, h21(id + vec2(side * 13.0, seg)));
  float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.82);
  vec3 tint = mix(vec3(1.0, 0.68, 0.38), vec3(0.65, 0.8, 1.0), step(0.7, h21(id * 1.3)));
  float tv = 1.0 + 0.25 * step(0.92, h21(id + 3.0)) * sin(uTime * 9.0 + id.x);
  // Far away the windows blend into a soft glow instead of shimmering.
  float fade = smoothstep(70.0, 25.0, z);
  col += mix(vec3(0.012, 0.009, 0.007), win * on * tint * 0.18 * tv, fade);
  return col;
}

vec3 sky(vec2 p) {
  float t = clamp((p.y - HOR) * 2.2, 0.0, 1.0);
  vec3 col = mix(vec3(0.20, 0.11, 0.09), vec3(0.035, 0.04, 0.075), sqrt(t));
  col += vec3(0.30, 0.13, 0.05) * exp(-(p.y - HOR) * 9.0);
  float cloud = fbm(vec2(p.x * 1.6 + uTime * 0.01, p.y * 3.5));
  col *= 0.7 + 0.6 * cloud;
  col += uFlash * vec3(0.55, 0.6, 0.85) * (0.4 + cloud) * (0.4 + t);
  return col;
}

// The skyline where the street ends.
vec3 distance_(vec2 p, inout bool hit) {
  float block = floor(p.x * 22.0);
  float top = HOR + 0.012 + 0.11 * pow(h11(block + 40.0), 2.0);
  if (p.y > top) return vec3(0.0);
  hit = true;
  vec2 w = vec2(p.x * 260.0, (p.y - HOR) * 260.0);
  float on = step(0.7, h21(floor(w))) * step(0.3, fract(w.x)) * step(0.3, fract(w.y));
  return vec3(0.006, 0.006, 0.01) + on * vec3(1.0, 0.75, 0.5) * 0.25;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  vec3 col = vec3(0.0);
  float depth = 200.0;
  float wet = 0.0;
  bool done = false;

  // Facades on either side of the street.
  float side = p.x < 0.0 ? -1.0 : 1.0;
  float zf = abs(p.x) > 1e-4 ? HALF * F / abs(p.x) : 1e9;
  float yf = (p.y - HOR) * zf / F + CAM;
  // The ground.
  float zg = p.y < HOR ? CAM * F / (HOR - p.y) : 1e9;

  if (zf < zg && zf > 1.2 && zf < 140.0) {
    float seg = floor(zf / 11.0);
    if (!crossStreet(seg, side) && yf > 0.0 && yf < buildingHeight(seg, side)) {
      col = facade(zf, yf, side, seg);
      depth = zf;
      done = true;
    }
  }
  if (!done && p.y < HOR) {
    float x = p.x * zg / F;
    depth = zg;
    // Asphalt, kerbs and pavements, all wet; puddles reflect more.
    float puddle = smoothstep(0.45, 0.7, fbm(vec2(x * 0.35, zg * 0.12)));
    bool road = abs(x) < HALF - 2.4;
    col = road ? vec3(0.004, 0.0045, 0.006) : vec3(0.009, 0.009, 0.011);
    float stripe = road ? step(abs(x), 0.08) * step(0.5, fract(zg * 0.18)) : 0.0;
    col += stripe * vec3(0.18, 0.16, 0.1) * smoothstep(60.0, 10.0, zg);
    wet = road ? 0.55 + 0.45 * puddle : 0.35 + 0.3 * puddle;
    // The sky's orange glow on the wet surface.
    col += vec3(0.16, 0.08, 0.05) * wet * smoothstep(0.0, 0.3, (HOR - p.y)) * 0.35;
    done = true;
  }
  if (!done) {
    bool hit = false;
    vec3 far = distance_(p, hit);
    col = hit ? far : sky(p);
  }

  // Street lamps down both sides.
  vec3 lights = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float z = 5.0 + float(i) * 7.0;
    for (int s = -1; s <= 1; s += 2) {
      vec3 w = vec3(float(s) * (HALF - 0.8), 5.6, z);
      vec3 c = mod(float(i), 2.0) < 1.0 ? vec3(1.0, 0.62, 0.28) : vec3(1.0, 0.82, 0.6);
      lights += lamp(p, w, 0.32, c) * 1.3;
      lights += reflection(p, w, 0.32, c, wet);
    }
  }
  // Oncoming headlights on the left, tail lights pulling away on the right.
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    // Cars stay at least six metres away; a closer one would fill the frame with glare.
    float zIn = mod(fi * 13.0 + 7.0 * h11(fi) - uTime * (7.0 + 3.0 * h11(fi + 2.0)), 80.0) + 6.0;
    float zOut = mod(fi * 14.0 + 9.0 * h11(fi + 5.0) + uTime * (6.0 + 3.0 * h11(fi + 9.0)), 80.0) + 6.0;
    for (int s = -1; s <= 1; s += 2) {
      vec3 head = vec3(-2.1 + float(s) * 0.72, 0.68, zIn);
      lights += lamp(p, head, 0.2, vec3(1.0, 0.93, 0.8)) * 1.8;
      lights += reflection(p, head, 0.2, vec3(1.0, 0.9, 0.75), wet) * 1.4;
      vec3 tail = vec3(2.1 + float(s) * 0.7, 0.85, zOut);
      float brake = 1.0 + 0.8 * step(0.8, h11(floor(uTime * 0.25) + fi));
      lights += lamp(p, tail, 0.15, vec3(1.0, 0.07, 0.03)) * 1.5 * brake;
      lights += reflection(p, tail, 0.15, vec3(1.0, 0.06, 0.02), wet) * brake;
    }
  }
  // Traffic lights at the crossing.
  float phase = mod(uTime, 22.0);
  vec3 signal = phase < 10.0 ? vec3(0.2, 1.0, 0.5) : phase < 12.5 ? vec3(1.0, 0.6, 0.05) : vec3(1.0, 0.08, 0.05);
  for (int s = -1; s <= 1; s += 2) {
    vec3 w = vec3(float(s) * (HALF - 1.4), 4.3, 26.0);
    lights += lamp(p, w, 0.24, signal) * 1.6;
    lights += reflection(p, w, 0.24, signal, wet);
  }
  col += lights;

  // Wet air between here and there.
  float haze = 1.0 - exp(-depth * 0.012);
  col = mix(col, vec3(0.03, 0.022, 0.03) + uFlash * vec3(0.12, 0.13, 0.17), haze * 0.45);

  // Filmic curve, then display gamma.
  col = 1.0 - exp(-col * 1.7);
  outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;
