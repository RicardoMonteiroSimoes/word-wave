import { createNoise3D } from 'simplex-noise';
import { WebGLRenderer } from './webgl-renderer';

// ─────────────────────────────────────────────────────────────────────────────
// WordWaveEngine — A high-performance canvas animation that renders floating
// text particles (e.g. feature-flag names) in a simplex-noise-driven wave.
//
// Features:
//   • WebGL 2 instanced rendering — all particles drawn in a single draw call
//   • Pre-built glyph atlas for both characters and whole words
//   • Automatic Canvas 2D fallback when WebGL is unavailable
//   • Simplex noise sampled on a coarse grid and bilinearly interpolated per particle
//   • Directional "beach wave" effect layered on top of the noise field
//   • Automatic IntersectionObserver pause when off-screen
//   • ResizeObserver for responsive canvas sizing
//   • prefers-reduced-motion support (renders a static pattern)
//   • CSS custom property color/opacity support
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

  /** CSS font shorthand string. */
  font: string;

  /** When true, renders a static pattern if `prefers-reduced-motion: reduce` is active. */
  respectReducedMotion: boolean;

  /** Pause the animation loop when the canvas scrolls out of view. */
  pauseOffScreen: boolean;

  /** Whether displacement is applied per character or per word. */
  mode: 'character' | 'word';
}

/** Fallback words shown when no words are supplied. */
export const DEFAULT_WORDS: readonly string[] = ['No', 'Words', 'Supplied!'];

// ── Internal types ───────────────────────────────────────────────────────────

/** A pre-rendered sprite in the atlas (used for both characters and whole words). */
interface AtlasGlyph {
  /** Source x offset in the atlas (physical pixels). */
  sx: number;
  /** Source width in the atlas (physical pixels). */
  sw: number;
  /** Sprite width (CSS pixels). */
  cssW: number;
  /** Half of cssW, cached for centering math. */
  cssHalfW: number;
}

interface BaseParticle {
  baseX: number;
  baseY: number;
  renderX: number;
  renderY: number;
  opacity: number;
}

interface CharParticle extends BaseParticle {
  kind: 'char';
  glyph: AtlasGlyph;
}

interface WordParticle extends BaseParticle {
  kind: 'word';
  glyph: AtlasGlyph;
}

type Particle = CharParticle | WordParticle;

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
  font: '14px system-ui, -apple-system, sans-serif',
  respectReducedMotion: true,
  pauseOffScreen: true,
  mode: 'character',
};

type GridIterator = (
  ctx: CanvasRenderingContext2D,
  rect: DOMRect,
  onItem: (
    text: string,
    centerX: number,
    y: number,
    row: number,
    col: number,
  ) => void,
) => void;

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
 * 1. **WebGL 2 instanced rendering** — All particles are drawn in a single
 *    `drawArraysInstanced()` call. Each particle is a textured quad whose
 *    sprite is looked up from the glyph atlas via per-instance UV attributes.
 *    Falls back to Canvas 2D `drawImage()` when WebGL 2 is unavailable.
 *
 * 2. **Glyph atlas** — Every unique glyph (character or word) is pre-rendered
 *    once onto an offscreen canvas. The animation loop never calls `fillText()`.
 *
 * 3. **Noise grid interpolation** — Instead of calling `noise3D()` for each
 *    of the ~12,000 particles, noise is sampled on a coarse spatial grid
 *    (~700 points) and bilinearly interpolated per particle.
 *
 * 4. **Off-screen pause** — An `IntersectionObserver` automatically stops the
 *    `requestAnimationFrame` loop when the canvas is not visible.
 */
export class WordWaveEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: WordWaveOptions;
  private readonly noise3D = createNoise3D();

  // Resolved color and opacity from CSS custom properties
  private resolvedColor = '#1e1e1e';
  private resolvedOpacity = 0.15;

  // Particle system
  private particles: Particle[] = [];
  private animationFrameId: number | null = null;
  private time = 0;
  private isVisible = false;
  private destroyed = false;
  private dpr = 1;

  // Noise grid (filled each frame)
  private noiseGrid = new Float32Array(0);
  private gridCols = 0;
  private gridRows = 0;
  private gridOriginX = 0;
  private gridOriginY = 0;

  // Atlas (pre-rendered sprites for characters or whole words)
  private atlas: HTMLCanvasElement | null = null;
  private glyphs = new Map<string, AtlasGlyph>();
  private atlasCellHeight = 0;
  private atlasHalfHeight = 0;
  private atlasPhysHeight = 0;

  // WebGL instanced renderer (null = Canvas 2D fallback)
  private renderer: WebGLRenderer | null = null;
  // Offscreen context for text measurement (avoids touching the main canvas context)
  private measureCtx: CanvasRenderingContext2D | null = null;

  // Observers
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  /**
   * Create a new WordWave engine attached to the given canvas.
   *
   * The canvas must be inside a positioned parent element — the engine sizes
   * itself to fill `canvas.parentElement`.
   *
   * Options are read once at construction. To update options on a live
   * engine, call {@link destroy} and create a new instance.
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
    this.renderer?.destroy();
    this.renderer = null;
    this.atlas = null;
    this.particles = [];
  }

  // ── Initialization ───────────────────────────────────────────────────────

  private init(): void {
    if (typeof window === 'undefined') return;

    this.resolvedColor = this.resolveColorFromCSS();
    this.resolvedOpacity = this.resolveOpacityFromCSS();

    // Offscreen context for text measurement (never touches the main canvas)
    const measureCanvas = document.createElement('canvas');
    this.measureCtx = measureCanvas.getContext('2d');
    if (this.measureCtx) this.measureCtx.font = this.config.font;

    // Reduced motion: render once with 2D context, no animation
    if (this.config.respectReducedMotion && this.prefersReducedMotion()) {
      this.setupCanvas();
      this.renderStaticPattern();
      return;
    }

    // DPR is needed by buildAtlas before setupCanvas sets it
    this.dpr = window.devicePixelRatio || 1;

    this.buildAtlas();

    // Attempt WebGL instanced rendering; fall back to Canvas 2D
    try {
      this.renderer = new WebGLRenderer(this.canvas);
      if (this.atlas) this.renderer.uploadAtlas(this.atlas);
    } catch {
      this.renderer = null;
    }

    this.setupCanvas();
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
            } else if (
              wasVisible &&
              !entry.isIntersecting &&
              this.animationFrameId !== null
            ) {
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
    this.dpr = dpr;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    if (this.renderer) {
      this.renderer.resize(rect.width, rect.height, dpr);
    } else {
      const ctx = this.canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }
  }

  // ── Atlas ────────────────────────────────────────────────────────────────

  /**
   * Pre-render sprites onto an offscreen canvas (the "atlas").
   * In character mode, each unique character gets its own sprite.
   * In word mode, each unique word gets its own sprite.
   * During animation, `drawImage()` blits from this atlas instead of calling
   * `fillText()` — skipping font shaping and rasterization entirely.
   */
  private buildAtlas(): void {
    const dpr = this.dpr;
    const isWordMode = this.config.mode === 'word';

    // Collect unique strings to render
    const uniqueStrings = new Set<string>();
    for (const word of this.config.words) {
      if (isWordMode) {
        uniqueStrings.add(word);
      } else {
        for (const char of word) uniqueStrings.add(char);
      }
    }

    // Measure font metrics
    const tmp = document.createElement('canvas');
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) {
      console.warn('word-wave: failed to acquire 2D context for font metrics');
      return;
    }
    tmpCtx.font = this.config.font;

    const ref = tmpCtx.measureText('Mg');
    const ascent = Math.ceil(ref.actualBoundingBoxAscent);
    const descent = Math.ceil(ref.actualBoundingBoxDescent);
    const padding = 2;
    const cellHeight = ascent + descent + padding * 2;
    const baseline = ascent + padding;

    // Layout sprites horizontally
    const entries: { text: string; cellW: number; x: number }[] = [];
    let totalWidth = 0;
    for (const text of uniqueStrings) {
      const cellW = Math.ceil(tmpCtx.measureText(text).width) + padding * 2;
      entries.push({ text, cellW, x: totalWidth });
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
    if (!ctx) {
      console.warn('word-wave: failed to acquire 2D context for atlas');
      return;
    }
    ctx.scale(dpr, dpr);
    ctx.font = this.config.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = this.resolvedColor;

    this.glyphs.clear();
    for (const { text, cellW, x } of entries) {
      ctx.fillText(text, x + cellW / 2, baseline);
      this.glyphs.set(text, {
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
    const ctx = this.measureCtx;
    if (!ctx) {
      console.warn(
        'word-wave: failed to acquire measurement context for particle creation',
      );
      return;
    }

    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();

    const { spacingX, spacingY } = this.config;

    // Noise grid dimensions
    const margin = Math.max(spacingX, spacingY);
    this.gridOriginX = -margin;
    this.gridOriginY = -margin;
    this.gridCols = Math.ceil((rect.width + 2 * margin) / NOISE_GRID_CELL) + 1;
    this.gridRows = Math.ceil((rect.height + 2 * margin) / NOISE_GRID_CELL) + 1;
    this.noiseGrid = new Float32Array(this.gridCols * this.gridRows);

    const isWordMode = this.config.mode === 'word';
    const iterate = isWordMode ? this.iterateWordGrid : this.iterateCharGrid;
    iterate(ctx, rect, (text, centerX, y, row, col) => {
      const depthNoise = this.noise3D(col * 0.1, row * 0.1, 0);
      const baseOpacity = Math.min(
        1,
        this.resolvedOpacity + (depthNoise + 1) * (this.resolvedOpacity * 0.4),
      );

      const base: BaseParticle = {
        baseX: centerX,
        baseY: y,
        renderX: 0,
        renderY: 0,
        opacity: baseOpacity,
      };

      const glyph = this.glyphs.get(text);
      if (!glyph) return;
      if (isWordMode) {
        this.particles.push({ ...base, kind: 'word', glyph });
      } else {
        this.particles.push({ ...base, kind: 'char', glyph });
      }
    });

    if (this.particles.length === 0 && this.glyphs.size === 0) {
      console.warn(
        'word-wave: atlas build failed — no particles created. Check that 2D canvas context is available.',
      );
    }

    // Sort by opacity to minimize globalAlpha state changes in the 2D render path
    this.particles.sort((a, b) => a.opacity - b.opacity);

    // Upload static per-instance data to WebGL renderer
    if (this.renderer && this.atlas) {
      this.renderer.uploadStaticData(
        this.particles,
        this.atlas.width,
        this.atlasCellHeight,
        this.atlasHalfHeight,
      );
    }
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
    const top =
      this.noiseGrid[i] + (this.noiseGrid[i + 1] - this.noiseGrid[i]) * fx;
    const bottom =
      this.noiseGrid[i + this.gridCols] +
      (this.noiseGrid[i + this.gridCols + 1] -
        this.noiseGrid[i + this.gridCols]) *
        fx;
    return top + (bottom - top) * fy;
  }

  // ── Animation loop ───────────────────────────────────────────────────────

  private startAnimationLoop(): void {
    const renderer = this.renderer;
    const ctx = renderer ? null : this.canvas.getContext('2d');

    if (!renderer && !ctx) {
      console.warn('word-wave: no rendering context available');
      return;
    }
    if (!renderer && !this.atlas) {
      console.warn('word-wave: atlas not available for 2D fallback');
      return;
    }
    if (this.animationFrameId !== null) return;

    // Capture config + references as locals for the hot path.
    // This is why options are immutable after construction — these closures
    // read the values set at init time and never re-check this.config.
    const canvas = this.canvas;
    const atlas = this.atlas;
    const atlasPhysH = this.atlasPhysHeight;
    const cellH = this.atlasCellHeight;
    const halfH = this.atlasHalfHeight;
    const { frequency, amplitude, speed, propagation, waveAmplitude } =
      this.config;

    const dirRad = (this.config.direction * Math.PI) / 180;
    const dirCos = Math.cos(dirRad);
    const dirSin = Math.sin(dirRad);

    const animate = () => {
      if (!this.isVisible || this.destroyed) {
        this.animationFrameId = null;
        return;
      }

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

      // Compute particle positions
      const particles = this.particles;
      for (const p of particles) {
        const noise = this.sampleNoiseGrid(p.baseX, p.baseY);
        const dist = p.baseX * dirCos + p.baseY * dirSin;
        const phase = dist * propagation - this.time * 2;
        const wave = Math.max(0, Math.sin(phase));
        const push = wave * wave * waveAmplitude;
        p.renderX = p.baseX + noise * amplitude + push * dirCos;
        p.renderY = p.baseY + noise * 0.6 * amplitude + push * dirSin;
      }

      // Render
      if (renderer) {
        renderer.updatePositions(particles);
        renderer.draw();
      } else if (ctx && atlas) {
        const dpr = this.dpr;
        const cssW = canvas.width / dpr;
        const cssH = canvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        let currentAlpha = -1;
        for (const p of particles) {
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
        }
        ctx.globalAlpha = 1;
      }

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

    ctx.font = this.config.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.resolvedColor;
    ctx.globalAlpha = this.resolvedOpacity;

    const iterate =
      this.config.mode === 'word' ? this.iterateWordGrid : this.iterateCharGrid;
    iterate(ctx, rect, (text, centerX, y) => {
      ctx.fillText(text, centerX, y);
    });

    ctx.globalAlpha = 1;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Iterate over every grid cell, calling `onCell` with the word, its
   * start-x position, width, y position, and grid coordinates.
   */
  private forEachGridCell(
    ctx: CanvasRenderingContext2D,
    rect: DOMRect,
    onCell: (
      word: string,
      wordStartX: number,
      wordWidth: number,
      y: number,
      row: number,
      col: number,
    ) => void,
  ): void {
    const { spacingX, spacingY, words } = this.config;
    const cols = Math.ceil(rect.width / spacingX) + 2;
    const rows = Math.ceil(rect.height / spacingY) + 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : spacingX / 2;
        const wordIndex = (row * cols + col) % words.length;
        const word = words[wordIndex];
        const wordWidth = ctx.measureText(word).width;
        const wordStartX = col * spacingX + offsetX - spacingX - wordWidth / 2;
        const wordY = row * spacingY - spacingY;

        onCell(word, wordStartX, wordWidth, wordY, row, col);
      }
    }
  }

  /** Iterate per-character, emitting each character with its center-x. */
  private iterateCharGrid: GridIterator = (ctx, rect, onItem) => {
    this.forEachGridCell(
      ctx,
      rect,
      (word, wordStartX, _wordWidth, y, row, col) => {
        let charX = wordStartX;
        for (const char of word) {
          const charWidth = ctx.measureText(char).width;
          onItem(char, charX + charWidth / 2, y, row, col);
          charX += charWidth;
        }
      },
    );
  };

  /** Iterate per-word, emitting each word with its center-x. */
  private iterateWordGrid: GridIterator = (ctx, rect, onItem) => {
    this.forEachGridCell(
      ctx,
      rect,
      (word, wordStartX, wordWidth, y, row, col) => {
        onItem(word, wordStartX + wordWidth / 2, y, row, col);
      },
    );
  };

  /** Resolve text color from CSS. Fallback: --word-wave-color -> inherited color -> #1e1e1e */
  private resolveColorFromCSS(): string {
    const style = getComputedStyle(this.canvas);
    const custom = style.getPropertyValue('--word-wave-color').trim();
    if (custom) return custom;
    const inherited = style.color;
    if (inherited) return inherited;
    return '#1e1e1e';
  }

  /** Resolve base opacity from CSS. Fallback: --word-wave-opacity -> 0.15 */
  private resolveOpacityFromCSS(): number {
    const style = getComputedStyle(this.canvas);
    const raw = style.getPropertyValue('--word-wave-opacity').trim();
    if (raw) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
    return 0.15;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
