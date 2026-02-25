// ─────────────────────────────────────────────────────────────────────────────
// GLSL shader generation from effect descriptors.
//
// Each built-in effect type has a template that emits a scoped GLSL block and
// declares its uniforms. The generator concatenates a fixed preamble, the
// effect blocks, and a fixed epilogue into a complete vertex shader source.
//
// The fragment shader is static and never changes.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Effect,
  type GlslEffect,
  NOISE_DEFAULTS,
  WAVE_DEFAULTS,
  PULSE_DEFAULTS,
} from './effects.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedShader {
  vertexSource: string;
  fragmentSource: string;
  /** All uniform names the shader expects (excluding u_projection). */
  uniformNames: string[];
}

interface EffectBlock {
  glsl: string;
  uniforms: string[];
}

// ── Simplex 3D noise (ashima/webgl-noise, MIT license) ──────────────────────

const SIMPLEX_NOISE_GLSL = `
// Simplex 3D noise — ashima/webgl-noise (MIT license)
// https://github.com/ashima/webgl-noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// ── Fragment shader (unchanged from original) ────────────────────────────────

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_atlas;

in vec2 v_uv;
in float v_opacity;

out vec4 outColor;

void main() {
  vec4 tex = texture(u_atlas, v_uv);
  outColor = tex * v_opacity;
}
`;

// ── Effect block generators ──────────────────────────────────────────────────

function noiseBlock(i: number): EffectBlock {
  const p = `u_fx${i}`;
  return {
    uniforms: [`${p}_freq`, `${p}_amp`, `${p}_speed`, `${p}_yscale`],
    glsl: `
  { // noise effect ${i}
    float n = snoise(vec3(pos * ${p}_freq, u_time * ${p}_speed));
    displacement += vec2(n * ${p}_amp, n * ${p}_yscale * ${p}_amp);
  }`,
  };
}

function waveBlock(i: number): EffectBlock {
  const p = `u_fx${i}`;
  return {
    uniforms: [
      `${p}_dircos`,
      `${p}_dirsin`,
      `${p}_prop`,
      `${p}_amp`,
      `${p}_speed`,
    ],
    glsl: `
  { // wave effect ${i}
    float dist = pos.x * ${p}_dircos + pos.y * ${p}_dirsin;
    float phase = dist * ${p}_prop - u_time * ${p}_speed;
    float w = max(0.0, sin(phase));
    float push = w * w * ${p}_amp;
    displacement += vec2(push * ${p}_dircos, push * ${p}_dirsin);
  }`,
  };
}

function pulseBlock(i: number): EffectBlock {
  const p = `u_fx${i}`;
  return {
    uniforms: [`${p}_cx`, `${p}_cy`, `${p}_freq`, `${p}_amp`, `${p}_speed`],
    glsl: `
  { // pulse effect ${i}
    vec2 center = vec2(${p}_cx * u_resolution.x, ${p}_cy * u_resolution.y);
    vec2 delta = pos - center;
    float dist = length(delta);
    float phase = dist * ${p}_freq - u_time * ${p}_speed;
    float ring = max(0.0, sin(phase));
    vec2 dir = dist > 0.0 ? delta / dist : vec2(0.0);
    displacement += dir * ring * ring * ${p}_amp;
  }`,
  };
}

function glslBlock(effect: GlslEffect, i: number): EffectBlock {
  const uniforms = Object.keys(effect.params ?? {});
  return {
    uniforms,
    glsl: `
  { // custom glsl effect ${i}
    float time = u_time;
    vec2 d = vec2(0.0);
    ${effect.code}
    displacement += d;
  }`,
  };
}

// ── Main generator ───────────────────────────────────────────────────────────

function buildBlock(effect: Effect, index: number): EffectBlock {
  switch (effect.type) {
    case 'noise':
      return noiseBlock(index);
    case 'wave':
      return waveBlock(index);
    case 'pulse':
      return pulseBlock(index);
    case 'glsl':
      return glslBlock(effect, index);
    default:
      throw new Error(
        `Unknown effect type: ${(effect as { type: string }).type}`,
      );
  }
}

export function generateShaders(effects: Effect[]): GeneratedShader {
  const needsNoise = effects.some((e) => e.type === 'noise');
  const blocks = effects.map((e, i) => buildBlock(e, i));

  const reservedUniforms = new Set([
    'u_time',
    'u_resolution',
    'u_projection',
    'u_atlas',
  ]);
  const allUniforms = ['u_time', 'u_resolution'];
  const uniformDecls: string[] = [
    'uniform float u_time;',
    'uniform vec2 u_resolution;',
  ];
  const seen = new Set(allUniforms);

  for (const block of blocks) {
    for (const name of block.uniforms) {
      if (reservedUniforms.has(name)) {
        throw new Error(
          `Effect uniform "${name}" collides with a built-in uniform. ` +
            `Reserved names: ${[...reservedUniforms].join(', ')}`,
        );
      }
      if (!seen.has(name)) {
        seen.add(name);
        allUniforms.push(name);
        uniformDecls.push(`uniform float ${name};`);
      }
    }
  }

  const vertexSource = `#version 300 es
precision highp float;

in vec2 a_position;

in vec2 a_basePosition;
in vec2 a_size;
in vec2 a_center;
in vec4 a_uv;
in float a_opacity;

uniform mat4 u_projection;
${uniformDecls.join('\n')}

${needsNoise ? SIMPLEX_NOISE_GLSL : ''}

out vec2 v_uv;
out float v_opacity;

void main() {
  vec2 pos = a_basePosition;
  vec2 displacement = vec2(0.0);
${blocks.map((b) => b.glsl).join('\n')}

  vec2 world = (pos + displacement) - a_center + a_position * a_size;
  gl_Position = u_projection * vec4(world, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_position);
  v_opacity = a_opacity;
}
`;

  return {
    vertexSource,
    fragmentSource: FRAG,
    uniformNames: allUniforms,
  };
}

// ── Uniform value extraction ─────────────────────────────────────────────────

/** Build a flat map of uniform name → value from a resolved effects array. */
export function extractUniformValues(
  effects: Effect[],
): Record<string, number> {
  const values: Record<string, number> = {};

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const p = `u_fx${i}`;

    switch (effect.type) {
      case 'noise': {
        const freq = effect.frequency ?? NOISE_DEFAULTS.frequency;
        const amp = effect.amplitude ?? NOISE_DEFAULTS.amplitude;
        const speed = effect.speed ?? NOISE_DEFAULTS.speed;
        const yScale = effect.yScale ?? NOISE_DEFAULTS.yScale;
        values[`${p}_freq`] = freq;
        values[`${p}_amp`] = amp;
        values[`${p}_speed`] = speed;
        values[`${p}_yscale`] = yScale;
        break;
      }
      case 'wave': {
        const dir = effect.direction ?? WAVE_DEFAULTS.direction;
        const rad = (dir * Math.PI) / 180;
        values[`${p}_dircos`] = Math.cos(rad);
        values[`${p}_dirsin`] = Math.sin(rad);
        values[`${p}_prop`] = effect.propagation ?? WAVE_DEFAULTS.propagation;
        values[`${p}_amp`] = effect.amplitude ?? WAVE_DEFAULTS.amplitude;
        values[`${p}_speed`] = effect.speed ?? WAVE_DEFAULTS.speed;
        break;
      }
      case 'pulse': {
        values[`${p}_cx`] = effect.centerX ?? PULSE_DEFAULTS.centerX;
        values[`${p}_cy`] = effect.centerY ?? PULSE_DEFAULTS.centerY;
        values[`${p}_freq`] = effect.frequency ?? PULSE_DEFAULTS.frequency;
        values[`${p}_amp`] = effect.amplitude ?? PULSE_DEFAULTS.amplitude;
        values[`${p}_speed`] = effect.speed ?? PULSE_DEFAULTS.speed;
        break;
      }
      case 'glsl': {
        if (effect.params) {
          for (const [name, value] of Object.entries(effect.params)) {
            values[name] = value;
          }
        }
        break;
      }
    }
  }

  return values;
}
