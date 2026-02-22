// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-empty-function */

import { bench, describe, vi } from 'vitest';
import { WordWaveEngine } from './index';
import { createCanvas } from './test-utils';

// Suppress engine warnings
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

// ── Mock canvas rendering surface ───────────────────────────────────────────
// happy-dom has no canvas 2D context, so the engine would bail immediately.
// We mock only the rendering calls (drawImage, fillText = no-ops) while all
// real computation — noise grid, interpolation, wave displacement — runs
// against the actual library code.

function createMockContext(): CanvasRenderingContext2D {
  return {
    scale: () => {},
    clearRect: () => {},
    drawImage: () => {},
    fillText: () => {},
    measureText: (text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
    }),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

// All canvas elements return the mock context
HTMLCanvasElement.prototype.getContext = function () {
  return createMockContext();
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Capture the animation frame callback so we can drive frames manually.
//
// WARNING: this relies on an implementation detail of WordWaveEngine.
// The engine's startAnimationLoop() calls requestAnimationFrame(animate),
// which our mock intercepts to capture the internal `animate` closure.
// Calling frameCallback() then runs a full frame (noise grid + particle
// displacement). If the engine stops using requestAnimationFrame or
// changes how it schedules frames, this benchmark will silently measure
// nothing — update it accordingly.
let frameCallback: FrameRequestCallback | null = null;
globalThis.requestAnimationFrame = (cb) => {
  frameCallback = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

// ── Constants ───────────────────────────────────────────────────────────────

const WORDS = [
  'dark_mode',
  'feature_flag',
  'rollout',
  'beta_test',
  'analytics',
];

// ── Setup: long-lived engines for frame benchmarks ──────────────────────────
// Each engine construction overwrites frameCallback via the rAF mock,
// so we save each callback right after construction.

const charCanvas = createCanvas();
const charEngine = new WordWaveEngine(charCanvas, {
  words: WORDS,
  mode: 'character',
  pauseOffScreen: false,
});
// TypeScript can't see that the constructor mutates frameCallback via the
// rAF mock, so it narrows to null. We read through a helper to prevent this.
const capture = () => frameCallback;

const charFrameCallback = capture();

const wordCanvas = createCanvas();
new WordWaveEngine(wordCanvas, {
  words: WORDS,
  mode: 'word',
  pauseOffScreen: false,
});
const wordFrameCallback = capture();

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe('WordWaveEngine', () => {
  bench('single frame (character mode)', () => {
    if (charFrameCallback) charFrameCallback(performance.now());
  });

  bench('single frame (word mode)', () => {
    if (wordFrameCallback) wordFrameCallback(performance.now());
  });

  bench('construction (character mode)', () => {
    const canvas = createCanvas();
    const engine = new WordWaveEngine(canvas, {
      words: WORDS,
      mode: 'character',
      pauseOffScreen: false,
    });
    engine.destroy();
    canvas.parentElement?.remove();
  });

  bench('construction (word mode)', () => {
    const canvas = createCanvas();
    const engine = new WordWaveEngine(canvas, {
      words: WORDS,
      mode: 'word',
      pauseOffScreen: false,
    });
    engine.destroy();
    canvas.parentElement?.remove();
  });

  bench('resize (rebuild particles)', () => {
    charEngine.resize();
  });
});
