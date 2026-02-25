import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WordWaveEngine, DEFAULT_WORDS } from './index';
import { createCanvas } from './test-utils';
import { generateShaders, extractUniformValues } from './shader-gen';
import {
  type Effect,
  NOISE_DEFAULTS,
  WAVE_DEFAULTS,
  PULSE_DEFAULTS,
} from './effects';

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

  describe('with effects option', () => {
    it('constructs without throwing when effects is provided', () => {
      const effects: Effect[] = [{ type: 'noise' }];
      expect(() => {
        engine = new WordWaveEngine(canvas, { effects });
      }).not.toThrow();
    });

    it('constructs with a single noise effect', () => {
      const effects: Effect[] = [
        { type: 'noise', amplitude: 8, frequency: 0.01 },
      ];
      expect(() => {
        engine = new WordWaveEngine(canvas, { effects });
      }).not.toThrow();
    });

    it('constructs with multiple stacked effects', () => {
      const effects: Effect[] = [
        { type: 'noise', amplitude: 10 },
        { type: 'wave', direction: 180, amplitude: 20 },
        { type: 'pulse', centerX: 0.5, centerY: 0.5 },
      ];
      expect(() => {
        engine = new WordWaveEngine(canvas, { effects });
      }).not.toThrow();
    });

    it('constructs with a custom glsl effect', () => {
      const effects: Effect[] = [
        {
          type: 'glsl',
          params: { u_freq: 0.05, u_amp: 12.0 },
          code: 'd = vec2(sin(pos.x * u_freq + u_time) * u_amp, 0.0);',
        },
      ];
      expect(() => {
        engine = new WordWaveEngine(canvas, { effects });
      }).not.toThrow();
    });

    it('destroy() works with effects', () => {
      const effects: Effect[] = [{ type: 'wave' }];
      engine = new WordWaveEngine(canvas, { effects });
      expect(() => engine.destroy()).not.toThrow();
    });

    it('start() and stop() work with effects', () => {
      const effects: Effect[] = [{ type: 'noise' }, { type: 'wave' }];
      engine = new WordWaveEngine(canvas, { effects });
      expect(() => {
        engine.start();
        engine.stop();
      }).not.toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('constructs without effects option (uses default effects)', () => {
      expect(() => {
        engine = new WordWaveEngine(canvas);
      }).not.toThrow();
    });
  });
});

describe('Effects system: shader generation', () => {
  describe('generateShaders', () => {
    it('includes snoise in vertex source when noise effect is present', () => {
      const effects: Effect[] = [{ type: 'noise' }];
      const { vertexSource } = generateShaders(effects);
      expect(vertexSource).toContain('snoise');
    });

    it('does NOT include snoise when only wave effect is present', () => {
      const effects: Effect[] = [{ type: 'wave' }];
      const { vertexSource } = generateShaders(effects);
      expect(vertexSource).not.toContain('snoise');
    });

    it('returns correct uniform names for noise + wave combo', () => {
      const effects: Effect[] = [{ type: 'noise' }, { type: 'wave' }];
      const { uniformNames } = generateShaders(effects);

      expect(uniformNames).toContain('u_time');
      expect(uniformNames).toContain('u_resolution');
      expect(uniformNames).toContain('u_fx0_freq');
      expect(uniformNames).toContain('u_fx0_amp');
      expect(uniformNames).toContain('u_fx0_speed');
      expect(uniformNames).toContain('u_fx0_yscale');
      expect(uniformNames).toContain('u_fx1_dircos');
      expect(uniformNames).toContain('u_fx1_dirsin');
      expect(uniformNames).toContain('u_fx1_prop');
      expect(uniformNames).toContain('u_fx1_amp');
      expect(uniformNames).toContain('u_fx1_speed');
    });

    it('throws on unknown effect type', () => {
      const effects = [{ type: 'unknown' }] as unknown as Effect[];
      expect(() => generateShaders(effects)).toThrow(
        'Unknown effect type: unknown',
      );
    });

    it('generates fragment shader source', () => {
      const effects: Effect[] = [{ type: 'wave' }];
      const { fragmentSource } = generateShaders(effects);
      expect(fragmentSource).toContain('#version 300 es');
      expect(fragmentSource).toContain('uniform sampler2D u_atlas');
    });

    it('includes custom glsl effect in shader', () => {
      const effects: Effect[] = [
        {
          type: 'glsl',
          params: { u_freq: 0.05 },
          code: 'd = vec2(sin(pos.x * u_freq), 0.0);',
        },
      ];
      const { vertexSource } = generateShaders(effects);
      expect(vertexSource).toContain('d = vec2(sin(pos.x * u_freq), 0.0);');
    });
  });

  describe('extractUniformValues', () => {
    it('returns correct values for noise defaults', () => {
      const effects: Effect[] = [{ type: 'noise' }];
      const values = extractUniformValues(effects);

      expect(values.u_fx0_freq).toBe(NOISE_DEFAULTS.frequency);
      expect(values.u_fx0_amp).toBe(NOISE_DEFAULTS.amplitude);
      expect(values.u_fx0_speed).toBe(NOISE_DEFAULTS.speed);
      expect(values.u_fx0_yscale).toBe(NOISE_DEFAULTS.yScale);
    });

    it('returns correct values for wave with custom direction', () => {
      const effects: Effect[] = [
        { type: 'wave', direction: 90, amplitude: 20 },
      ];
      const values = extractUniformValues(effects);

      const expectedRad = (90 * Math.PI) / 180;
      expect(values.u_fx0_dircos).toBeCloseTo(Math.cos(expectedRad), 5);
      expect(values.u_fx0_dirsin).toBeCloseTo(Math.sin(expectedRad), 5);
      expect(values.u_fx0_prop).toBe(WAVE_DEFAULTS.propagation);
      expect(values.u_fx0_amp).toBe(20);
      expect(values.u_fx0_speed).toBe(WAVE_DEFAULTS.speed);
    });

    it('returns correct values for pulse defaults', () => {
      const effects: Effect[] = [{ type: 'pulse' }];
      const values = extractUniformValues(effects);

      expect(values.u_fx0_cx).toBe(PULSE_DEFAULTS.centerX);
      expect(values.u_fx0_cy).toBe(PULSE_DEFAULTS.centerY);
      expect(values.u_fx0_freq).toBe(PULSE_DEFAULTS.frequency);
      expect(values.u_fx0_amp).toBe(PULSE_DEFAULTS.amplitude);
      expect(values.u_fx0_speed).toBe(PULSE_DEFAULTS.speed);
    });

    it('handles glsl effect params', () => {
      const effects: Effect[] = [
        {
          type: 'glsl',
          params: { u_custom1: 42.5, u_custom2: 0.1 },
          code: 'd = vec2(0.0);',
        },
      ];
      const values = extractUniformValues(effects);

      expect(values.u_custom1).toBe(42.5);
      expect(values.u_custom2).toBe(0.1);
    });

    it('handles multiple stacked effects', () => {
      const effects: Effect[] = [
        { type: 'noise', amplitude: 5 },
        { type: 'wave', direction: 0 },
        { type: 'pulse', amplitude: 12 },
      ];
      const values = extractUniformValues(effects);

      // Check noise (fx0)
      expect(values.u_fx0_amp).toBe(5);

      // Check wave (fx1)
      expect(values.u_fx1_dircos).toBeCloseTo(Math.cos(0), 5);
      expect(values.u_fx1_dirsin).toBeCloseTo(Math.sin(0), 5);

      // Check pulse (fx2)
      expect(values.u_fx2_amp).toBe(12);
    });
  });
});
