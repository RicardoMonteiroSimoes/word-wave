import { bench, describe } from 'vitest';
import { createNoise3D } from 'simplex-noise';

// ── Viewport & grid parameters (800 × 600 CSS px, default config) ──────────

const NOISE_GRID_CELL = 50;
const FREQUENCY = 0.008;
const AMPLITUDE = 10;
const PROPAGATION = 0.03;
const WAVE_AMPLITUDE = 15;
const DIRECTION_DEG = 225;
const SPACING_X = 90;
const SPACING_Y = 20;
const VIEWPORT_W = 800;
const VIEWPORT_H = 600;

const MARGIN = Math.max(SPACING_X, SPACING_Y);
const GRID_ORIGIN_X = -MARGIN;
const GRID_ORIGIN_Y = -MARGIN;
const GRID_COLS = Math.ceil((VIEWPORT_W + 2 * MARGIN) / NOISE_GRID_CELL) + 1;
const GRID_ROWS = Math.ceil((VIEWPORT_H + 2 * MARGIN) / NOISE_GRID_CELL) + 1;
const GRID_SIZE = GRID_COLS * GRID_ROWS;

const DIR_RAD = (DIRECTION_DEG * Math.PI) / 180;
const DIR_COS = Math.cos(DIR_RAD);
const DIR_SIN = Math.sin(DIR_RAD);

// ── Generate realistic particle positions ───────────────────────────────────

interface BenchParticle {
  baseX: number;
  baseY: number;
}

function createParticles(): BenchParticle[] {
  const result: BenchParticle[] = [];
  const cols = Math.ceil(VIEWPORT_W / SPACING_X) + 2;
  const rows = Math.ceil(VIEWPORT_H / SPACING_Y) + 2;

  // Simulate character mode: ~6 characters per word position
  const charsPerWord = 6;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offsetX = row % 2 === 0 ? 0 : SPACING_X / 2;
      const wordStartX = col * SPACING_X + offsetX - SPACING_X;
      const y = row * SPACING_Y - SPACING_Y;

      for (let c = 0; c < charsPerWord; c++) {
        result.push({
          baseX: wordStartX + c * 8, // ~8px per char
          baseY: y,
        });
      }
    }
  }
  return result;
}

const particles = createParticles();

// ── Algorithm replicas (match src/index.ts hot path exactly) ────────────────

function fillNoiseGrid(
  grid: Float32Array,
  noise3D: ReturnType<typeof createNoise3D>,
  time: number,
): void {
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      grid[gy * GRID_COLS + gx] = noise3D(
        (GRID_ORIGIN_X + gx * NOISE_GRID_CELL) * FREQUENCY,
        (GRID_ORIGIN_Y + gy * NOISE_GRID_CELL) * FREQUENCY,
        time,
      );
    }
  }
}

function sampleNoiseGrid(grid: Float32Array, x: number, y: number): number {
  const gx = (x - GRID_ORIGIN_X) / NOISE_GRID_CELL;
  const gy = (y - GRID_ORIGIN_Y) / NOISE_GRID_CELL;

  const gx0 = Math.max(0, Math.min(Math.floor(gx), GRID_COLS - 2));
  const gy0 = Math.max(0, Math.min(Math.floor(gy), GRID_ROWS - 2));

  const fx = gx - gx0;
  const fy = gy - gy0;

  const i = gy0 * GRID_COLS + gx0;
  const top = grid[i] + (grid[i + 1] - grid[i]) * fx;
  const bottom =
    grid[i + GRID_COLS] + (grid[i + GRID_COLS + 1] - grid[i + GRID_COLS]) * fx;
  return top + (bottom - top) * fy;
}

function displaceParticles(
  grid: Float32Array,
  data: BenchParticle[],
  time: number,
): void {
  for (const p of data) {
    const noise = sampleNoiseGrid(grid, p.baseX, p.baseY);

    const dist = p.baseX * DIR_COS + p.baseY * DIR_SIN;
    const phase = dist * PROPAGATION - time * 2;
    const wave = Math.max(0, Math.sin(phase));
    const push = wave * wave * WAVE_AMPLITUDE;

    // Write to locals to prevent dead-code elimination
    const _rx = p.baseX + noise * AMPLITUDE + push * DIR_COS;
    const _ry = p.baseY + noise * 0.6 * AMPLITUDE + push * DIR_SIN;
    void _rx;
    void _ry;
  }
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe(`word-wave frame computation (${particles.length} particles, ${GRID_SIZE} grid cells)`, () => {
  const noise3D = createNoise3D();
  const noiseGrid = new Float32Array(GRID_SIZE);
  let time = 0;

  bench('noise grid fill', () => {
    fillNoiseGrid(noiseGrid, noise3D, time);
    time += 0.01;
  });

  bench('particle displacement (noise interpolation + wave)', () => {
    fillNoiseGrid(noiseGrid, noise3D, time);
    displaceParticles(noiseGrid, particles, time);
    time += 0.01;
  });

  bench('full frame (grid fill + all particle displacement)', () => {
    fillNoiseGrid(noiseGrid, noise3D, time);
    displaceParticles(noiseGrid, particles, time);
    time += 0.01;
  });
});
