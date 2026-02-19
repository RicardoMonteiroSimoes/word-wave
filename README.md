# word-wave

A high-performance canvas animation engine that renders floating text particles in a simplex-noise-driven wave pattern.

## Features

- Per-character rendering with a pre-built glyph atlas (`drawImage`, not `fillText`)
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

## License

MIT