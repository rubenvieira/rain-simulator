# 🌧️ Rain Simulator

A hyper-realistic rain and weather simulator built for the browser. Immerse yourself in a dynamic, highly customizable stormy environment featuring organic droplets, realistic window condensation, depth-of-field bokeh, and procedural thunder/rain audio synthesis. 

## ✨ Features

- **Hyper-Realistic Visuals**: Simulates organic, wobbling raindrops, wet streaks, and rivulets using complex canvas manipulations and noise algorithms (Simplex Noise).
- **Deep Immersion**: Dynamic background layers with depth-of-field city lights (Bokeh), condensation fog that responds to "breathing", and film grain textures.
- **Procedural Audio**: Real-time synthesized rain and thunder audio using Tone.js, synced with visual lightning flashes.
- **Highly Customizable**: Total control over the simulation:
  - Rain Intensity & Droplet Size
  - Wind Speed & Angle
  - Fog Density & Glass Blur
  - Bokeh Intensity
  - Audio/Thunder Settings
- **Performance Optimized**: Automatically scales down rendering complexity (e.g., dropping max droplets, disabling bloom/fresnel effects) on mobile or low-performance devices to maintain smooth framerates.

## 🛠️ Technology Stack

- **Framework**: React 18, Vite
- **Language**: TypeScript
- **Audio**: Tone.js
- **Graphics / Rendering**: HTML5 Canvas API (custom robust simulation engine)
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI)
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

Ensure you have Node.js and a package manager like `npm`, `yarn`, or `pnpm` installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rubenvieira/rain-simulator.git
   cd rain-simulator
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

4. Open your browser at the local URL printed by Vite (usually `http://localhost:8080/`).

### Publishing on Play

Pushing this repository does not publish the experience. Build it for its
public path with `npm ci && npm run build -- --base=/rain-simulator/`, then
release a reviewed commit from the Rain Simulator entry in
`rubenv.net/admin/studio/experiments`. That release serves the experience at
`https://play.rubenv.net/rain-simulator/`; the admin's release switch also
controls when it is visible.

## 🎮 How to Use

- Use the settings panel on the right (gear icon) to adjust visual and audio parameters.
- Click anywhere on the glass to trigger custom drop splashes.
- Enable/disable audio or thunder with the click of a button.
- Hit the "Reset" button to return to the original default cozy atmosphere.

## 📜 License

This project is open-sourced and available under your standard licensing choice. Feel free to modify and adapt the simulation for your own ambient projects!
