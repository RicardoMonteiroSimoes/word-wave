import { createNoise3D } from 'simplex-noise';

// ─────────────────────────────────────────────────────────────────────────────
// WordWaveEngine — A high-performance canvas animation that renders floating
// text particles (e.g. feature-flag names) in a simplex-noise-driven wave.
//
// Features:
//   • Per-character rendering with a pre-built glyph atlas (drawImage, not fillText)
//   • Simplex noise sampled on a coarse grid and bilinearly interpolated per particle
//   • Directional "beach wave" effect layered on top of the noise field
//   • Automatic IntersectionObserver pause when off-screen
//   • ResizeObserver for responsive canvas sizing
//   • prefers-reduced-motion support (renders a static pattern)
//   • prefers-color-scheme support (auto light/dark text color)
//
// Usage (vanilla JS / any framework):
//
//   const canvas = document.getElementById('wave') as HTMLCanvasElement;
//   const engine = new WordWaveEngine(canvas, {
//     words: ['dark_mode', 'feature_flag', 'rollout'],
//     speed: 0.015,
//   });
//
//   // Later:
//   engine.stop();    // pause
//   engine.start();   // resume
//   engine.destroy(); // full cleanup
//
// Angular wrapper example:
//
//   ngAfterViewInit() {
//     this.engine = new WordWaveEngine(this.canvasRef.nativeElement, { ... });
//   }
//   ngOnDestroy() {
//     this.engine.destroy();
//   }
//
// Dependency: simplex-noise (https://github.com/jwagner/simplex-noise.js)
// ─────────────────────────────────────────────────────────────────────────────

// ── Public types ─────────────────────────────────────────────────────────────

/** Configuration options for the WordWave engine. Every field is optional. */
export interface WordWaveOptions {
  /** Words displayed as floating text particles. */
  words: string[];

  /** Noise field spatial frequency. Lower = smoother, larger-scale movement. */
  frequency: number;

  /** Maximum noise-driven displacement in CSS pixels. */
  amplitude: number;

  /** Animation speed — how fast the noise field evolves over time. */
  speed: number;

  /** Horizontal spacing between word centers (CSS px). */
  spacingX: number;

  /** Vertical spacing between rows (CSS px). */
  spacingY: number;

  /** Wave propagation direction in degrees (0 = right, 90 = up, 225 = bottom-left). */
  direction: number;

  /** Wave density — higher values show more wave crests simultaneously. */
  propagation: number;

  /** How far the directional wave pushes particles (CSS px). */
  waveAmplitude: number;

  /**
   * Text color as a CSS `r, g, b` triplet (e.g. `'74, 74, 74'`) or `'auto'`
   * to derive from `prefers-color-scheme`.
   */
  color: string;

  /** CSS font shorthand string. */
  font: string;

  /** When true, renders a static pattern if `prefers-reduced-motion: reduce` is active. */
  respectReducedMotion: boolean;

  /** When `color` is `'auto'`, pick light/dark color from `prefers-color-scheme`. */
  autoDetectColorScheme: boolean;

  /** Pause the animation loop when the canvas scrolls out of view. */
  pauseOffScreen: boolean;
}

/** Fallback words shown when no words are supplied. */
export const DEFAULT_WORDS: readonly string[] = ['No', 'Words', 'Supplied!'];

// ── Internal types ───────────────────────────────────────────────────────────

/** A pre-rendered glyph in the character atlas. */
interface CharGlyph {
  /** Source x offset in the atlas (physical pixels). */
  sx: number;
  /** Source width in the atlas (physical pixels). */
  sw: number;
  /** Character cell width (CSS pixels). */
  cssW: number;
  /** Half of cssW, cached for centering math. */
  cssHalfW: number;
}

interface LetterParticle {
  glyph: CharGlyph;
  baseX: number;
  baseY: number;
  renderX: number;
  renderY: number;
  opacity: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Noise is pre-computed on a coarse spatial grid and bilinearly interpolated
 * per particle. This constant controls the grid cell size in CSS pixels.
 * 50px ≈ 700 noise3D calls/frame for a typical viewport, vs ~17,000 without.
 */
const NOISE_GRID_CELL = 50;

const DEFAULTS: WordWaveOptions = {
  words: [...DEFAULT_WORDS],
  frequency: 0.008,
  amplitude: 10,
  speed: 0.01,
  spacingX: 90,
  spacingY: 20,
  direction: 225,
  propagation: 0.03,
  waveAmplitude: 15,
  color: 'auto',
  font: '14px system-ui, -apple-system, sans-serif',
  respectReducedMotion: true,
  autoDetectColorScheme: true,
  pauseOffScreen: true,
};

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * A high-performance canvas animation engine that renders floating text
 * particles driven by 3D simplex noise and a directional wave field.
 *
 * The engine is **framework-agnostic** — it operates on a raw
 * `HTMLCanvasElement` and manages its own observers and animation loop.
 *
 * ### Performance techniques
 *
 * 1. **Character atlas** — Every unique glyph is pre-rendered once onto an
 *    offscreen canvas. The animation loop uses `drawImage()` blits instead of
 *    `fillText()`, eliminating per-frame font shaping and rasterization.
 *
 * 2. **Noise grid interpolation** — Instead of calling `noise3D()` for each
 *    of the ~8,500 particles, noise is sampled on a coarse spatial grid
 *    (~700 points) and bilinearly interpolated per particle.
 *
 * 3. **Opacity batching** — Particles are sorted by opacity so `globalAlpha`
 *    state changes are minimized (one change per unique opacity level instead
 *    of per particle).
 *
 * 4. **Off-screen pause** — An `IntersectionObserver` automatically stops the
 *    `requestAnimationFrame` loop when the canvas is not visible.
 */
export class WordWaveEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: WordWaveOptions;
  private readonly noise3D = createNoise3D();

  // Particle system
  private particles: LetterParticle[] = [];
  private animationFrameId: number | null = null;
  private time = 0;
  private isVisible = false;
  private destroyed = false;

  // Noise grid (filled each frame)
  private noiseGrid = new Float32Array(0);
  private gridCols = 0;
  private gridRows = 0;
  private gridOriginX = 0;
  private gridOriginY = 0;

  // Character atlas
  private atlas: HTMLCanvasElement | null = null;
  private glyphs = new Map<string, CharGlyph>();
  private atlasCellHeight = 0;
  private atlasHalfHeight = 0;
  private atlasPhysHeight = 0;

  // Observers
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  /**
   * Create a new WordWave engine attached to the given canvas.
   *
   * The canvas must be inside a positioned parent element — the engine sizes
   * itself to fill `canvas.parentElement`.
   *
   * @param canvas  The `<canvas>` element to render into.
   * @param options Partial configuration; unspecified fields use defaults.
   */
  constructor(canvas: HTMLCanvasElement, options?: Partial<WordWaveOptions>) {
    this.canvas = canvas;
    this.config = {
      ...DEFAULTS,
      ...options,
      words: [...(options?.words ?? DEFAULTS.words)],
    };
    this.init();
  }

  /**
   * Start (or resume) the animation loop.
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start(): void {
    if (this.destroyed || this.animationFrameId !== null) return;
    this.isVisible = true;
    this.startAnimationLoop();
  }

  /**
   * Pause the animation loop. The canvas retains its last rendered frame.
   * Call {@link start} to resume.
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isVisible = false;
  }

  /**
   * Recalculate canvas size and rebuild the particle grid.
   * Called automatically by the internal `ResizeObserver`, but can also be
   * triggered manually if the parent layout changes without a resize event.
   */
  resize(): void {
    if (this.destroyed) return;
    this.setupCanvas();
    this.createParticles();
  }

  /**
   * Permanently tear down the engine. Cancels the animation loop, disconnects
   * observers, and releases the atlas canvas. The engine cannot be reused
   * after calling destroy.
   */
  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.resizeObserver = null;
    this.visibilityObserver = null;
    this.atlas = null;
    this.particles = [];
  }

  // ── Initialization ───────────────────────────────────────────────────────

  private init(): void {
    if (typeof window === 'undefined') return;

    // Reduced motion: render once, no animation
    if (this.config.respectReducedMotion && this.prefersReducedMotion()) {
      this.setupCanvas();
      this.renderStaticPattern();
      return;
    }

    this.setupCanvas();
    this.buildAtlas();
    this.createParticles();

    // Responsive resize (debounced to avoid expensive rebuilds during drag)
    const parent = this.canvas.parentElement;
    if (parent) {
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      this.resizeObserver = new ResizeObserver(() => {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          this.resize();
        }, 150);
      });
      this.resizeObserver.observe(parent);
    }

    // Off-screen pause
    if (this.config.pauseOffScreen && parent) {
      this.visibilityObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const wasVisible = this.isVisible;
            this.isVisible = entry.isIntersecting;

            if (!wasVisible && entry.isIntersecting) {
              this.startAnimationLoop();
            } else if (wasVisible && !entry.isIntersecting && this.animationFrameId !== null) {
              cancelAnimationFrame(this.animationFrameId);
              this.animationFrameId = null;
            }
          });
        },
        { threshold: 0.1 },
      );

      // Defer to next microtask so the element is in the DOM
      setTimeout(() => this.visibilityObserver?.observe(parent));
    } else {
      // No off-screen detection — start immediately
      this.isVisible = true;
      this.startAnimationLoop();
    }
  }

  // ── Canvas setup ─────────────────────────────────────────────────────────

  private setupCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  // ── Character atlas ──────────────────────────────────────────────────────

  /**
   * Pre-render every unique character onto an offscreen canvas (the "atlas").
   * During animation, `drawImage()` blits from this atlas instead of calling
   * `fillText()` — skipping font shaping and rasterization entirely.
   */
  private buildAtlas(): void {
    const dpr = window.devicePixelRatio || 1;
    const color = this.resolveColor();

    // Collect unique characters
    const uniqueChars = new Set<string>();
    for (const word of this.config.words) {
      for (const char of word) uniqueChars.add(char);
    }

    // Measure font metrics
    const tmp = document.createElement('canvas');
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return;
    tmpCtx.font = this.config.font;

    const ref = tmpCtx.measureText('Mg');
    const ascent = Math.ceil(ref.actualBoundingBoxAscent);
    const descent = Math.ceil(ref.actualBoundingBoxDescent);
    const padding = 2;
    const cellHeight = ascent + descent + padding * 2;
    const baseline = ascent + padding;

    // Layout characters horizontally
    const entries: { char: string; cellW: number; x: number }[] = [];
    let totalWidth = 0;
    for (const char of uniqueChars) {
      const cellW = Math.ceil(tmpCtx.measureText(char).width) + padding * 2;
      entries.push({ char, cellW, x: totalWidth });
      totalWidth += cellW;
    }

    // Create atlas at device pixel ratio for crisp rendering
    this.atlas = document.createElement('canvas');
    this.atlas.width = totalWidth * dpr;
    this.atlas.height = cellHeight * dpr;
    this.atlasCellHeight = cellHeight;
    this.atlasHalfHeight = cellHeight / 2;
    this.atlasPhysHeight = cellHeight * dpr;

    const ctx = this.atlas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = this.config.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = `rgb(${color})`;

    this.glyphs.clear();
    for (const { char, cellW, x } of entries) {
      ctx.fillText(char, x + cellW / 2, baseline);
      this.glyphs.set(char, {
        sx: x * dpr,
        sw: cellW * dpr,
        cssW: cellW,
        cssHalfW: cellW / 2,
      });
    }
  }

  // ── Particle system ──────────────────────────────────────────────────────

  private createParticles(): void {
    this.particles = [];
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();

    const { spacingX, spacingY, words } = this.config;
    const cols = Math.ceil(rect.width / spacingX) + 2;
    const rows = Math.ceil(rect.height / spacingY) + 2;

    ctx.font = this.config.font;

    // Noise grid dimensions
    const margin = Math.max(spacingX, spacingY);
    this.gridOriginX = -margin;
    this.gridOriginY = -margin;
    this.gridCols = Math.ceil((rect.width + 2 * margin) / NOISE_GRID_CELL) + 1;
    this.gridRows = Math.ceil((rect.height + 2 * margin) / NOISE_GRID_CELL) + 1;
    this.noiseGrid = new Float32Array(this.gridCols * this.gridRows);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : spacingX / 2;
        const wordIndex = (row * cols + col) % words.length;
        const word = words[wordIndex];

        const wordWidth = ctx.measureText(word).width;
        const wordStartX = col * spacingX + offsetX - spacingX - wordWidth / 2;
        const wordY = row * spacingY - spacingY;

        const depthNoise = this.noise3D(col * 0.1, row * 0.1, 0);
        const isDark = this.config.autoDetectColorScheme && this.prefersColorSchemeDark();
        const baseOpacity = isDark
          ? 0.08 + (depthNoise + 1) * 0.04
          : 0.20 + (depthNoise + 1) * 0.08;

        let charX = wordStartX;
        for (const char of word) {
          const charWidth = ctx.measureText(char).width;
          const glyph = this.glyphs.get(char);
          if (!glyph) continue; // skip if atlas doesn't contain this character
          this.particles.push({
            glyph,
            baseX: charX + charWidth / 2,
            baseY: wordY,
            renderX: 0,
            renderY: 0,
            opacity: baseOpacity,
          });
          charX += charWidth;
        }
      }
    }

    // Sort by opacity to minimize globalAlpha state changes in the render loop
    this.particles.sort((a, b) => a.opacity - b.opacity);
  }

  // ── Noise grid ───────────────────────────────────────────────────────────

  /** Bilinearly interpolate a value from the pre-computed noise grid. */
  private sampleNoiseGrid(x: number, y: number): number {
    const gx = (x - this.gridOriginX) / NOISE_GRID_CELL;
    const gy = (y - this.gridOriginY) / NOISE_GRID_CELL;

    const gx0 = Math.max(0, Math.min(Math.floor(gx), this.gridCols - 2));
    const gy0 = Math.max(0, Math.min(Math.floor(gy), this.gridRows - 2));

    const fx = gx - gx0;
    const fy = gy - gy0;

    const i = gy0 * this.gridCols + gx0;
    const top = this.noiseGrid[i] + (this.noiseGrid[i + 1] - this.noiseGrid[i]) * fx;
    const bottom =
      this.noiseGrid[i + this.gridCols] +
      (this.noiseGrid[i + this.gridCols + 1] - this.noiseGrid[i + this.gridCols]) * fx;
    return top + (bottom - top) * fy;
  }

  // ── Animation loop ───────────────────────────────────────────────────────

  private startAnimationLoop(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.atlas) return;
    if (this.animationFrameId !== null) return;

    // Capture references as locals for the hot path
    const canvas = this.canvas;
    const atlas = this.atlas;
    const atlasPhysH = this.atlasPhysHeight;
    const cellH = this.atlasCellHeight;
    const halfH = this.atlasHalfHeight;
    const { frequency, amplitude, speed, propagation, waveAmplitude } = this.config;

    const dirRad = (this.config.direction * Math.PI) / 180;
    const dirCos = Math.cos(dirRad);
    const dirSin = Math.sin(dirRad);

    const animate = () => {
      if (!this.isVisible || this.destroyed) {
        this.animationFrameId = null;
        return;
      }

      // Read CSS dimensions from the canvas element (always in sync via setupCanvas)
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      ctx.clearRect(0, 0, cssW, cssH);

      // Fill noise grid (~700 noise3D calls instead of ~17,000)
      for (let gy = 0; gy < this.gridRows; gy++) {
        for (let gx = 0; gx < this.gridCols; gx++) {
          this.noiseGrid[gy * this.gridCols + gx] = this.noise3D(
            (this.gridOriginX + gx * NOISE_GRID_CELL) * frequency,
            (this.gridOriginY + gy * NOISE_GRID_CELL) * frequency,
            this.time,
          );
        }
      }

      // Render particles via atlas blits
      let currentAlpha = -1;

      this.particles.forEach((p) => {
        const noise = this.sampleNoiseGrid(p.baseX, p.baseY);

        const dist = p.baseX * dirCos + p.baseY * dirSin;
        const phase = dist * propagation - this.time * 2;
        const wave = Math.max(0, Math.sin(phase));
        const push = wave * wave * waveAmplitude;

        p.renderX = p.baseX + noise * amplitude + push * dirCos;
        p.renderY = p.baseY + noise * 0.6 * amplitude + push * dirSin;

        if (p.opacity !== currentAlpha) {
          ctx.globalAlpha = p.opacity;
          currentAlpha = p.opacity;
        }

        const g = p.glyph;
        ctx.drawImage(
          atlas,
          g.sx,
          0,
          g.sw,
          atlasPhysH,
          p.renderX - g.cssHalfW,
          p.renderY - halfH,
          g.cssW,
          cellH,
        );
      });

      ctx.globalAlpha = 1;
      this.time += speed;
      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  // ── Static fallback (reduced motion) ─────────────────────────────────────

  private renderStaticPattern(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();

    const color = this.resolveColor();
    const isDark = this.config.autoDetectColorScheme && this.prefersColorSchemeDark();
    const staticOpacity = isDark ? 0.08 : 0.28;
    const { spacingX, spacingY, words, font } = this.config;
    const cols = Math.ceil(rect.width / spacingX) + 2;
    const rows = Math.ceil(rect.height / spacingY) + 2;

    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : spacingX / 2;
        const wordIndex = (row * cols + col) % words.length;
        const word = words[wordIndex];

        const wordWidth = ctx.measureText(word).width;
        const wordStartX = col * spacingX + offsetX - spacingX - wordWidth / 2;
        const wordY = row * spacingY - spacingY;

        let charX = wordStartX;
        for (const char of word) {
          const charWidth = ctx.measureText(char).width;
          ctx.fillStyle = `rgba(${color}, ${staticOpacity})`;
          ctx.fillText(char, charX + charWidth / 2, wordY);
          charX += charWidth;
        }
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Resolve the text color, respecting auto-detection if configured. */
  private resolveColor(): string {
    if (this.config.color !== 'auto') return this.config.color;
    if (this.config.autoDetectColorScheme && this.prefersColorSchemeDark()) {
      return '165, 165, 165';
    }
    return '30, 30, 30';
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private prefersColorSchemeDark(): boolean {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }
}
