// ─────────────────────────────────────────────────────────────────────────────
// GPU displacement effect definitions.
//
// Effects compose additively: each contributes a vec2 displacement that is
// summed in the vertex shader. Built-in types cover common patterns; the
// `glsl` escape hatch allows arbitrary GLSL for advanced use cases.
// ─────────────────────────────────────────────────────────────────────────────

/** 3D simplex noise displacement. */
export interface NoiseEffect {
  type: 'noise';
  /** Spatial frequency — lower values produce larger-scale noise. @default 0.008 */
  frequency?: number;
  /** Maximum displacement in CSS pixels. @default 10 */
  amplitude?: number;
  /** Time evolution rate. @default 0.01 */
  speed?: number;
  /** Y-axis amplitude multiplier (relative to X). @default 0.6 */
  yScale?: number;
}

/** Directional propagating wave. */
export interface WaveEffect {
  type: 'wave';
  /** Wave direction in degrees (0 = right, 90 = down). @default 225 */
  direction?: number;
  /** Wave density — higher values produce more crests. @default 0.03 */
  propagation?: number;
  /** Push distance in CSS pixels. @default 15 */
  amplitude?: number;
  /** Time multiplier for wave propagation speed. @default 2.0 */
  speed?: number;
}

/** Radial ripple expanding from a point. */
export interface PulseEffect {
  type: 'pulse';
  /** Horizontal center (0–1 normalized to viewport). @default 0.5 */
  centerX?: number;
  /** Vertical center (0–1 normalized to viewport). @default 0.5 */
  centerY?: number;
  /** Ring spacing. @default 0.05 */
  frequency?: number;
  /** Maximum displacement in CSS pixels. @default 10 */
  amplitude?: number;
  /** Time multiplier. @default 1.0 */
  speed?: number;
}

/**
 * Custom GLSL displacement snippet.
 *
 * The code receives `pos` (vec2, particle base position in CSS px),
 * `time` (float), and any declared params as float uniforms.
 * It must assign to `d` (vec2) — the displacement contribution.
 *
 * @example
 * ```typescript
 * {
 *   type: 'glsl',
 *   params: { u_freq: 0.05, u_amp: 12.0 },
 *   code: 'd = vec2(sin(pos.x * u_freq + time) * u_amp, 0.0);',
 * }
 * ```
 */
export interface GlslEffect {
  type: 'glsl';
  /** Named float uniforms available in the GLSL code. */
  params?: Record<string, number>;
  /** GLSL snippet that assigns to `d` (vec2). */
  code: string;
}

/** A displacement effect applied in the vertex shader. */
export type Effect = NoiseEffect | WaveEffect | PulseEffect | GlslEffect;

// ── Defaults ─────────────────────────────────────────────────────────────────

export const NOISE_DEFAULTS = {
  frequency: 0.008,
  amplitude: 10,
  speed: 0.01,
  yScale: 0.6,
} as const;

export const WAVE_DEFAULTS = {
  direction: 225,
  propagation: 0.03,
  amplitude: 15,
  speed: 2.0,
} as const;

export const PULSE_DEFAULTS = {
  centerX: 0.5,
  centerY: 0.5,
  frequency: 0.05,
  amplitude: 10,
  speed: 1.0,
} as const;

/** Default effects matching the legacy CPU displacement behavior. */
export const DEFAULT_EFFECTS: Effect[] = [{ type: 'noise' }, { type: 'wave' }];
