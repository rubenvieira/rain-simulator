# Rain Simulator

Rain running down a window over a city street at night, in WebGL 2.

Live at [play.rubenv.net/rain-simulator](https://play.rubenv.net/rain-simulator/).

Drag across the glass to wipe away the condensation. The dock sets rain, wind
and fog, and turns lightning and sound on or off. Keys: `Space` pauses, `H`
hides the interface, `S` toggles sound, `L` toggles lightning, `R` fogs the
glass again.

## How it works

- **The street** (`src/shaders/street.ts`) is drawn procedurally and in focus:
  facades with lit windows and shopfronts under neon signs, street lamps
  receding in perspective, oncoming headlights and departing tail lights,
  traffic lights at a crossing, a skyline glow and long reflections on the wet
  road. Every light is a small bright core.
- **Defocus** (`defocusShader` in `src/shaders/glass.ts`): the camera is focused
  on the glass, so the street is seen as bokeh. A 64-sample golden-angle disc
  blur weights bright pixels more, so each light opens into a disc instead of
  fading into a smudge. Two wider passes make the light scattered by
  condensation.
- **Water** (`src/water.ts`) is simulated on the CPU and painted into a water
  map whose colour encodes each drop's surface normal (red, green), thickness
  (blue) and coverage (alpha). Raindrops land, grow and merge; heavy ones break
  loose and slide in stop-start jerks, leave a line of droplets behind, and
  wipe a clear path through the fog, which creeps back. Fine mist settles until
  something wipes it.
- **The glass** (`glassShader`): fogged areas show the street lifted and spread;
  cleared areas show the bokeh directly; each drop is a lens that shows a small,
  sharp, upside-down view of the street, dark at its rim, with a highlight.
- **Sound** (`src/audio.ts`): rain, ticks of drops on the pane and thunder,
  synthesized with the Web Audio API. Off until turned on.

Lightning is off when the system asks for reduced motion. `?view=street` and
`?view=bokeh` show the scene behind the glass, for tuning.

## Run

```sh
npm ci
npm run dev
npm run build -- --base=/rain-simulator/
```

No runtime dependencies; TypeScript and Vite only.

## License

MIT
