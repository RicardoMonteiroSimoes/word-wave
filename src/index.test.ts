import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WordWaveEngine, DEFAULT_WORDS, noise, directionalWave } from './index';
import type { EffectContext, EffectParticle } from './index';
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
        effects: [noise({ amplitude: 20 }), directionalWave()],
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

describe('effects pipeline', () => {
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

  it('constructs with empty effects array', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, { effects: [] });
    }).not.toThrow();
  });

  it('constructs with noise() only', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, { effects: [noise()] });
    }).not.toThrow();
  });

  it('constructs with directionalWave() only', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, { effects: [directionalWave()] });
    }).not.toThrow();
  });

  it('constructs with multiple directional waves', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, {
        effects: [
          noise(),
          directionalWave({ direction: 225 }),
          directionalWave({ direction: 45, amplitude: 8 }),
        ],
      });
    }).not.toThrow();
  });

  it('constructs with custom inline effect', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, {
        effects: [
          (particle, ctx) => ({
            dx: Math.sin(ctx.time) * 5,
            dy: 0,
          }),
        ],
      });
    }).not.toThrow();
  });

  it('defensively copies the effects array', () => {
    const effects = [noise(), directionalWave()];
    engine = new WordWaveEngine(canvas, { effects });
    effects.push(noise({ amplitude: 100 }));
    effects.length = 0;
    expect(() => engine.destroy()).not.toThrow();
  });

  it('noise() accepts custom options', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, {
        effects: [noise({ amplitude: 25, verticalScale: 0.8 })],
      });
    }).not.toThrow();
  });

  it('directionalWave() accepts custom options', () => {
    expect(() => {
      engine = new WordWaveEngine(canvas, {
        effects: [
          directionalWave({
            direction: 90,
            propagation: 0.05,
            amplitude: 20,
            timeScale: 3,
          }),
        ],
      });
    }).not.toThrow();
  });
});

describe('noise()', () => {
  it('returns a function', () => {
    const effect = noise();
    expect(typeof effect).toBe('function');
  });

  it('returns displacement deltas', () => {
    const effect = noise({ amplitude: 10, verticalScale: 0.5 });
    const ctx: EffectContext = {
      time: 0,
      canvasWidth: 800,
      canvasHeight: 600,
      sampleNoise: () => 0.5,
    };
    const particle: EffectParticle = { baseX: 100, baseY: 100, dx: 0, dy: 0 };
    const delta = effect(particle, ctx);
    expect(delta).toHaveProperty('dx');
    expect(delta).toHaveProperty('dy');
    expect(delta.dx).toBe(5); // 0.5 * 10
    expect(delta.dy).toBe(2.5); // 0.5 * 0.5 * 10
  });
});

describe('directionalWave()', () => {
  it('returns a function', () => {
    const effect = directionalWave();
    expect(typeof effect).toBe('function');
  });

  it('returns displacement deltas', () => {
    const effect = directionalWave({
      direction: 0,
      propagation: 0,
      amplitude: 10,
      timeScale: 0,
    });
    const ctx: EffectContext = {
      time: 0,
      canvasWidth: 800,
      canvasHeight: 600,
      sampleNoise: () => 0,
    };
    const particle: EffectParticle = { baseX: 0, baseY: 0, dx: 0, dy: 0 };
    const delta = effect(particle, ctx);
    expect(delta).toHaveProperty('dx');
    expect(delta).toHaveProperty('dy');
    // sin(0) = 0, max(0, 0) = 0, push = 0 * 0 * 10 = 0
    expect(delta.dx).toBe(0);
    expect(delta.dy).toBe(0);
  });
});
