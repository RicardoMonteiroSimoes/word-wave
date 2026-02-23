/* eslint-disable @typescript-eslint/no-empty-function */

import { bench, describe } from 'vitest';
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
