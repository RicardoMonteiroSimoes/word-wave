# word-wave

<img width="1299" height="458" alt="image" src="https://github.com/user-attachments/assets/203f8211-0606-4e45-8a3d-c0c2d92f152e" />

<hr/>

A high-performance canvas animation engine that renders floating text particles in a simplex-noise-driven wave pattern.

[Live demo](https://ricardomonteirosimoes.github.io/word-wave/) | [npm](https://www.npmjs.com/package/word-wave)

## Features

- **WebGL 2 instanced rendering** — all particles drawn in a single GPU draw call, with automatic Canvas 2D fallback
- **GPU displacement effects** — composable effects (noise, wave, pulse, custom GLSL) computed in the vertex shader
- Pre-built glyph atlas for characters and whole words (no per-frame `fillText`)
- Simplex noise sampled on a coarse grid and bilinearly interpolated per particle
- Directional "beach wave" effect layered on top of the noise field
- Automatic `IntersectionObserver` pause when off-screen
- `ResizeObserver` for responsive canvas sizing
- `prefers-reduced-motion` support (renders a static pattern)
- CSS custom property theming (`--word-wave-color`, `--word-wave-opacity`)
- Framework-agnostic — works with vanilla JS, Angular, React, Vue, etc.

## Install

```bash
npm install word-wave
```

## Usage

```ts
import { WordWaveEngine } from 'word-wave';

const canvas = document.getElementById('wave') as HTMLCanvasElement;
const engine = new WordWaveEngine(canvas, {
  words: ['dark_mode', 'feature_flag', 'rollout'],
  speed: 0.015,
});

// Later:
engine.stop();    // pause
engine.start();   // resume
engine.destroy(); // full cleanup
```

The canvas must be inside a positioned parent element — the engine sizes itself to fill `canvas.parentElement`.

## Options

All fields are optional. Unspecified fields use sensible defaults.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `words` | `string[]` | Feature-flag names | Words displayed as floating text particles |
| `frequency` | `number` | `0.008` | Noise field spatial frequency (lower = smoother) |
| `amplitude` | `number` | `10` | Maximum noise-driven displacement (CSS px) |
| `speed` | `number` | `0.01` | How fast the noise field evolves over time |
| `spacingX` | `number` | `90` | Horizontal spacing between word centers (CSS px) |
| `spacingY` | `number` | `20` | Vertical spacing between rows (CSS px) |
| `direction` | `number` | `225` | Wave propagation direction in degrees |
| `propagation` | `number` | `0.03` | Wave density (higher = more crests) |
| `waveAmplitude` | `number` | `15` | Directional wave push distance (CSS px) |
| `font` | `string` | `'14px system-ui, ...'` | CSS font shorthand |
| `respectReducedMotion` | `boolean` | `true` | Static pattern if `prefers-reduced-motion: reduce` |
| `pauseOffScreen` | `boolean` | `true` | Pause animation when canvas is not visible |
| `mode` | `'character' \| 'word'` | `'character'` | Per-character or per-word displacement |

## Effects

Effects move displacement computation to the GPU vertex shader, enabling more complex visual patterns without CPU overhead. They compose additively: each effect contributes a displacement that is summed together. When `effects` is provided, the legacy displacement parameters (`frequency`, `amplitude`, `direction`, etc.) are ignored.

### Basic usage

Omitting `effects` preserves the existing CPU-based behavior. To use GPU effects, pass an array of effect descriptors:

```ts
const engine = new WordWaveEngine(canvas, {
  words: ['hello', 'world'],
  effects: [
    { type: 'noise', frequency: 0.008, amplitude: 10 },
    { type: 'wave', direction: 225, propagation: 0.03, amplitude: 15 },
  ],
});
```

### Built-in effects

#### `noise`

3D simplex noise displacement.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `frequency` | `number` | `0.008` | Spatial frequency — lower values produce larger-scale noise |
| `amplitude` | `number` | `10` | Maximum displacement in CSS pixels |
| `speed` | `number` | `0.01` | Time evolution rate |
| `yScale` | `number` | `0.6` | Y-axis amplitude multiplier (relative to X) |

#### `wave`

Directional propagating wave.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `direction` | `number` | `225` | Wave direction in degrees (0 = right, 90 = down) |
| `propagation` | `number` | `0.03` | Wave density — higher values produce more crests |
| `amplitude` | `number` | `15` | Push distance in CSS pixels |
| `speed` | `number` | `2.0` | Time multiplier for wave propagation speed |

#### `pulse`

Radial ripple expanding from a point.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `centerX` | `number` | `0.5` | Horizontal center (0–1 normalized to viewport) |
| `centerY` | `number` | `0.5` | Vertical center (0–1 normalized to viewport) |
| `frequency` | `number` | `0.05` | Ring spacing |
| `amplitude` | `number` | `10` | Maximum displacement in CSS pixels |
| `speed` | `number` | `1.0` | Time multiplier |

### Composing effects

Effects stack additively. Order doesn't affect the visual result. Combine multiple effects for richer motion:

```ts
const engine = new WordWaveEngine(canvas, {
  words: ['composable', 'effects'],
  effects: [
    { type: 'noise', frequency: 0.005, amplitude: 8 },
    { type: 'wave', direction: 45, propagation: 0.02, amplitude: 12 },
    { type: 'wave', direction: 135, propagation: 0.025, amplitude: 10 },
  ],
});
```

### Custom GLSL

The `glsl` effect type allows arbitrary vertex shader displacement code. Your snippet receives:

- `pos` (vec2) — particle base position in CSS pixels
- `time` (float) — elapsed time
- `u_resolution` (vec2) — viewport size in CSS pixels
- `d` (vec2) — must be assigned; this is the displacement contribution from this effect
- `params` — each key becomes a float uniform accessible by name

Example: horizontal sine wave with vertical bias

```ts
const engine = new WordWaveEngine(canvas, {
  words: ['custom', 'displacement'],
  effects: [
    {
      type: 'glsl',
      params: { u_freq: 0.05, u_amp: 12.0, u_vbias: 0.003 },
      code: `
        float wave = sin(pos.x * u_freq + time) * u_amp;
        d = vec2(wave, pos.y * u_vbias);
      `,
    },
  ],
});
```

### Canvas fallback

Effects require WebGL 2. When using the Canvas 2D fallback renderer, a static grid is displayed instead of animated displacement.

### Migration

The `effects` option is fully optional. Omitting it preserves the existing CPU-based displacement behavior using the legacy parameters (`frequency`, `amplitude`, `direction`, etc.).

## Color & Opacity

Color and opacity are controlled via CSS custom properties on the canvas element, not JS options. This lets you use standard CSS for theming (media queries, class toggles, CSS variables).

| Property | Default | Description |
|----------|---------|-------------|
| `--word-wave-color` | inherited `color` | Text color (any CSS color value) |
| `--word-wave-opacity` | `0.15` | Base particle opacity (`0`–`1`) |

The engine reads these once at construction. To update, set the properties and recreate the engine.

### Example: light/dark theming

```css
canvas {
  --word-wave-color: #1e1e1e;
  --word-wave-opacity: 0.24;
}

@media (prefers-color-scheme: dark) {
  canvas {
    --word-wave-color: #a5a5a5;
    --word-wave-opacity: 0.12;
  }
}
```

```ts
// Recreate on scheme change to pick up new CSS values
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener('change', () => {
  engine.destroy();
  engine = new WordWaveEngine(canvas, opts);
});
```

If no CSS custom properties are set, the engine falls back to the canvas element's inherited CSS `color` for text color, and `0.15` for opacity.

## Built with AI

This project was vibe-engineered with [Claude](https://claude.ai) (Anthropic) under human review and direction throughout.

## License

MIT
