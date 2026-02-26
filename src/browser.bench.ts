/* eslint-disable @typescript-eslint/no-empty-function */

import { bench, describe } from 'vitest';
import type { Effect } from './index';
import { WordWaveEngine } from './index';

// ── Capture animation frame callback ────────────────────────────────────────
//
// WARNING: this relies on an implementation detail of WordWaveEngine.
// The engine's startAnimationLoop() calls requestAnimationFrame(animate),
// which our mock intercepts to capture the internal `animate` closure.
// Calling frameCallback() then runs a full frame (noise grid + particle
// displacement + real canvas rendering). If the engine stops using
// requestAnimationFrame or changes how it schedules frames, this benchmark
// will silently measure nothing — update it accordingly.
let frameCallback: FrameRequestCallback | null = null;
globalThis.requestAnimationFrame = (cb) => {
  frameCallback = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

// ── Constants — match demo defaults ─────────────────────────────────────────

const WORDS = [
  'premium_tier',
  'dark_mode',
  'ai_assistant',
  'beta_analytics',
  'edge_caching',
];

// ── Canvas helper — real browser canvas at Full HD ──────────────────────────

function createBenchCanvas(): HTMLCanvasElement {
  const container = document.createElement('div');
  container.style.width = '1920px';
  container.style.height = '1080px';
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  document.body.appendChild(container);
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  return canvas;
}

// ── Setup: long-lived engines for frame benchmarks ──────────────────────────
// Each engine construction overwrites frameCallback via the rAF mock,
// so we save each callback right after construction.

const charCanvas = createBenchCanvas();
new WordWaveEngine(charCanvas, {
  words: WORDS,
  mode: 'character',
  pauseOffScreen: false,
});
// TypeScript can't see that the constructor mutates frameCallback via the
// rAF mock, so it narrows to null. We read through a helper to prevent this.
const capture = () => frameCallback;
const charFrameCallback = capture();

const wordCanvas = createBenchCanvas();
new WordWaveEngine(wordCanvas, {
  words: WORDS,
  mode: 'word',
  pauseOffScreen: false,
});
const wordFrameCallback = capture();

// ── GPU effects scaling: engines with increasing noise effect counts ───────

function generateNoiseEffects(count: number): Effect[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'noise' as const,
    frequency: 0.005 + i * 0.0003,
    amplitude: 3 + (i % 20) * 0.5,
    speed: 0.005 + i * 0.001,
    yScale: 0.2 + (i % 10) * 0.1,
  }));
}

const EFFECT_TIERS = [1, 5, 10] as const;
const effectCallbacks = new Map<number, FrameRequestCallback | null>();

for (const count of EFFECT_TIERS) {
  const canvas = createBenchCanvas();
  new WordWaveEngine(canvas, {
    words: WORDS,
    mode: 'character',
    effects: generateNoiseEffects(count),
    pauseOffScreen: false,
  });
  effectCallbacks.set(count, capture());
}

// ── Benchmarks ──────────────────────────────────────────────────────────────
// These run in a real browser via vitest browser mode. Unlike the happy-dom
// benchmarks, canvas rendering calls (drawImage, fillText) hit a real 2D
// context, so the results reflect actual per-frame rendering cost.

describe('WordWaveEngine (browser)', () => {
  bench('single frame (character mode)', () => {
    if (charFrameCallback) charFrameCallback(performance.now());
  });

  bench('single frame (word mode)', () => {
    if (wordFrameCallback) wordFrameCallback(performance.now());
  });
});

describe('GPU effects scaling', () => {
  for (const count of EFFECT_TIERS) {
    bench(`single frame — ${count} noise effects`, () => {
      const cb = effectCallbacks.get(count);
      if (cb) cb(performance.now());
    });
  }
});
