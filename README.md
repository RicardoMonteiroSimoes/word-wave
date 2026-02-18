# word-wave

A high-performance canvas animation engine that renders floating text particles in a simplex-noise-driven wave pattern.

## Features

- Per-character rendering with a pre-built glyph atlas (`drawImage`, not `fillText`)
- Simplex noise sampled on a coarse grid and bilinearly interpolated per particle
- Directional "beach wave" effect layered on top of the noise field
- Automatic `IntersectionObserver` pause when off-screen
- `ResizeObserver` for responsive canvas sizing
- `prefers-reduced-motion` support (renders a static pattern)
- `prefers-color-scheme` support (auto light/dark text color)
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
| `color` | `string` | `'auto'` | Text color as CSS `r, g, b` triplet or `'auto'` |
| `font` | `string` | `'14px system-ui, ...'` | CSS font shorthand |
| `respectReducedMotion` | `boolean` | `true` | Static pattern if `prefers-reduced-motion: reduce` |
| `autoDetectColorScheme` | `boolean` | `true` | Auto light/dark color from `prefers-color-scheme` |
| `pauseOffScreen` | `boolean` | `true` | Pause animation when canvas is not visible |

## License

MIT