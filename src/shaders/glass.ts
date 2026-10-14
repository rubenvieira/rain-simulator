export const fullscreenVertex = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Defocus: the camera is focused on the glass, so the street becomes bokeh.
// Samples a disc on a golden-angle spiral; bright pixels weigh more, the way a
// light's energy spreads into a bright disc instead of dimming into a smudge.
export const defocusShader = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uRadius;
uniform float uAspect;
uniform float uBoost;
void main() {
  const int N = 64;
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N));
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r * uRadius * vec2(1.0 / uAspect, 1.0);
    vec3 c = texture(uTex, vUv + off).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float w = 1.0 + uBoost * l * l * l * l;
    sum += c * w;
    weight += w;
  }
  outColor = vec4(sum / weight, 1.0);
}
`;

// The window: fogged glass, cleared trails, and drops that act as tiny lenses.
// The water map stores each drop's surface normal (rg), thickness (b) and coverage (a).
export const glassShader = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSharp;
uniform sampler2D uBokeh;
uniform sampler2D uFog;
uniform sampler2D uWater;
uniform sampler2D uClear;
uniform float uAspect;
uniform float uFogAmount;
uniform float uFlash;
uniform float uTime;
uniform vec2 uTexel;
uniform int uDebug;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  // Debug views: 1 = the street in focus, 2 = the street defocused.
  if (uDebug == 1) { outColor = texture(uSharp, vUv); return; }
  if (uDebug == 2) { outColor = texture(uBokeh, vUv); return; }
  vec4 water = texture(uWater, vUv);
  // Canvas y runs down; flip the normal's y for GL.
  vec2 n = vec2(water.r * 2.0 - 1.0, -(water.g * 2.0 - 1.0));
  float thick = water.b;
  float cover = smoothstep(0.2, 0.55, water.a);

  // Condensation: where the glass is fogged the street is lifted, flattened and spread further.
  float clear = texture(uClear, vUv).r;
  float fog = uFogAmount * (1.0 - clear);
  vec3 bokeh = texture(uBokeh, vUv).rgb;
  vec3 diffuse = texture(uFog, vUv).rgb;
  float grain = h21(floor(vUv / uTexel * 0.5)) - 0.5;
  vec3 veil = vec3(0.016, 0.018, 0.022) + diffuse * 0.78 + grain * 0.008;
  vec3 glass = mix(bokeh, veil, fog);

  // A drop is a lens: it shows a small, sharp, upside-down view of the street.
  // Thickness scales with drop size, so fine mist barely bends the view and big drops invert it.
  vec2 lens = n * vec2(1.0 / uAspect, 1.0) * (0.006 + 0.12 * thick);
  vec2 ruv = vUv - lens;
  vec3 inside = texture(uSharp, ruv).rgb * 0.82 + texture(uBokeh, ruv).rgb * 0.22;
  // Light bends away near the rim, so the edge of a drop goes dark.
  float body = 1.0 - smoothstep(0.55, 0.98, length(n));
  inside *= mix(0.2, 1.06, body);
  // Highlights: a sharp one from the street lights above, a soft sheen across the top.
  vec3 N = normalize(vec3(n * 1.6, 0.35));
  vec3 L = normalize(vec3(-0.3, 0.6, 0.75));
  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 90.0) * 0.85;
  float sheen = pow(max(dot(N, normalize(vec3(0.0, 0.85, 0.5))), 0.0), 10.0) * 0.07;
  inside += (spec + sheen) * vec3(1.0, 0.94, 0.86) * (0.7 + uFlash * 1.5);

  vec3 col = mix(glass, inside, cover);
  // A thin dark line where the water meets the glass.
  float rim = cover * smoothstep(0.85, 1.0, length(n));
  col *= 1.0 - 0.3 * rim;

  col += uFlash * vec3(0.05, 0.055, 0.07) * (0.4 + fog);
  // A little lens falloff toward the corners.
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.32 * dot(v, v) * 2.0;
  outColor = vec4(col, 1.0);
}
`;
