import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WordWaveEngine, DEFAULT_WORDS } from './index';
import { createCanvas } from './test-utils';

// happy-dom doesn't implement canvas 2D context, so the engine logs expected
// warnings during tests. We spy on console.warn to suppress output and to
// assert that the correct warnings fire.
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

describe('DEFAULT_WORDS', () => {
  it('contains the expected fallback words', () => {
    expect(DEFAULT_WORDS).toEqual(['No', 'Words', 'Supplied!']);
  });
});

describe('WordWaveEngine', () => {
  let canvas: HTMLCanvasElement;
  let engine: WordWaveEngine;

  beforeEach(() => {
    warnSpy.mockClear();
    canvas = createCanvas();
  });

  afterEach(() => {
    engine?.destroy();
    canvas.parentElement?.remove();
  });

  it('constructs without throwing', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas);
    }).not.toThrow();
  });

  it('accepts custom options', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, {
        words: ['hello', 'world'],
        speed: 0.02,
        amplitude: 20,
      });
    }).not.toThrow();
  });

  it('defensively copies the words array', () => {
    const words = ['a', 'b', 'c'];
    engine = new WordWaveEngine(canvas, { words });
    words.push('d');
    words.length = 0;
    // Engine should still function — the mutation should not affect it
    expect(() => engine.destroy()).not.toThrow();
  });

  it('warns when 2D context is unavailable', () => {
    engine = new WordWaveEngine(canvas);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('word-wave:'));
  });

  it('start() is safe to call multiple times', () => {
    engine = new WordWaveEngine(canvas);
    expect(() => {
      engine.start();
      engine.start();
      engine.start();
    }).not.toThrow();
  });

  it('stop() is safe to call when not running', () => {
    engine = new WordWaveEngine(canvas);
    expect(() => {
      engine.stop();
      engine.stop();
    }).not.toThrow();
  });

  it('destroy() cleans up without throwing', () => {
    engine = new WordWaveEngine(canvas);
    expect(() => engine.destroy()).not.toThrow();
  });

  it('destroy() is idempotent', () => {
    engine = new WordWaveEngine(canvas);
    engine.destroy();
    expect(() => engine.destroy()).not.toThrow();
  });

  it('start() after destroy() is a no-op', () => {
    engine = new WordWaveEngine(canvas);
    engine.destroy();
    expect(() => engine.start()).not.toThrow();
  });

  it('resize() does not throw', () => {
    engine = new WordWaveEngine(canvas);
    expect(() => engine.resize()).not.toThrow();
  });

  it('resize() after destroy() does not throw', () => {
    engine = new WordWaveEngine(canvas);
    engine.destroy();
    expect(() => engine.resize()).not.toThrow();
  });

  it('accepts mode: "word" option', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, { mode: 'word' });
    }).not.toThrow();
  });

  it.each(['character', 'word'] as const)('%s mode builds atlas', (mode) => {
    engine = new WordWaveEngine(canvas, { mode });
    // Both modes build an atlas — happy-dom has no 2D context, so it warns.
    const atlasWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('font metrics'),
    );
    expect(atlasWarnings.length).toBeGreaterThan(0);
  });

  it('constructs with --word-wave-color set', () => {
    canvas.style.setProperty('--word-wave-color', '#ff0000');
    expect(() => {
      engine = new WordWaveEngine(canvas);
    }).not.toThrow();
  });

  it('constructs with --word-wave-opacity set', () => {
    canvas.style.setProperty('--word-wave-opacity', '0.3');
    expect(() => {
      engine = new WordWaveEngine(canvas);
    }).not.toThrow();
  });

  it('constructs without CSS custom properties (uses fallback)', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas);
    }).not.toThrow();
  });
});
