// ─────────────────────────────────────────────────────────────────────────────
// WebGL 2 instanced renderer for the word-wave particle system.
//
// Replaces thousands of individual Canvas 2D `drawImage()` calls with a single
// `drawArraysInstanced()` call. Each particle is a textured quad whose sprite
// is looked up from the glyph atlas texture via per-instance UV attributes.
//
// Buffer layout:
//   • Quad geometry (6 vertices, shared)  — STATIC
//   • Per-instance static data            — STATIC  (size, center, UV rect, opacity)
//   • Per-instance position               — DYNAMIC (renderX, renderY — updated each frame)
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;

in vec2 a_position;

in vec2 a_offset;
in vec2 a_size;
in vec2 a_center;
in vec4 a_uv;
in float a_opacity;

uniform mat4 u_projection;

out vec2 v_uv;
out float v_opacity;

void main() {
  vec2 world = a_offset - a_center + a_position * a_size;
  gl_Position = u_projection * vec4(world, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_position);
  v_opacity = a_opacity;
}
`;

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

/** Minimal particle shape required by the renderer. */
interface RenderableParticle {
  glyph: { sx: number; sw: number; cssW: number; cssHalfW: number };
  opacity: number;
  renderX: number;
  renderY: number;
}

// Static stride: size(2) + center(2) + uv(4) + opacity(1) = 9 floats
const STATIC_FLOATS = 9;
const STATIC_STRIDE = STATIC_FLOATS * 4;

/** Throws with a descriptive message if a WebGL resource is null. */
function glAssert<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`WebGL: failed to create ${name}`);
  return value;
}

export class WebGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture | null = null;
  private quadBuf: WebGLBuffer;
  private staticBuf: WebGLBuffer;
  private dynamicBuf: WebGLBuffer;
  private projectionLoc: WebGLUniformLocation;
  private positionData: Float32Array = new Float32Array(0);
  private instanceCount = 0;
  private destroyed = false;

  /** Throws if WebGL 2 is unavailable. Caller should catch and fall back. */
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // ── Shaders ───────────────────────────────────────────────────────────
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);

    const program = glAssert(gl.createProgram(), 'program');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader link failed: ${info}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(program);
    this.program = program;

    this.projectionLoc = glAssert(
      gl.getUniformLocation(program, 'u_projection'),
      'u_projection uniform',
    );

    // ── Blend (premultiplied alpha) ───────────────────────────────────────
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // ── VAO + buffers ─────────────────────────────────────────────────────
    this.vao = glAssert(gl.createVertexArray(), 'VAO');
    gl.bindVertexArray(this.vao);

    // Unit-quad geometry (2 triangles, 6 vertices)
    // prettier-ignore
    const quad = new Float32Array([
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
    ]);
    this.quadBuf = glAssert(gl.createBuffer(), 'quad buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    attr(gl, program, 'a_position', 2, 0, 0, 0); // per vertex

    // Static per-instance buffer
    this.staticBuf = glAssert(gl.createBuffer(), 'static buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
    attr(gl, program, 'a_size', 2, STATIC_STRIDE, 0, 1);
    attr(gl, program, 'a_center', 2, STATIC_STRIDE, 8, 1);
    attr(gl, program, 'a_uv', 4, STATIC_STRIDE, 16, 1);
    attr(gl, program, 'a_opacity', 1, STATIC_STRIDE, 32, 1);

    // Dynamic per-instance buffer (positions)
    this.dynamicBuf = glAssert(gl.createBuffer(), 'dynamic buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
    attr(gl, program, 'a_offset', 2, 0, 0, 1);

    gl.bindVertexArray(null);
  }

  // ── Atlas texture ─────────────────────────────────────────────────────────

  uploadAtlas(atlasCanvas: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = glAssert(gl.createTexture(), 'texture');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlasCanvas,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_atlas'), 0);
  }

  // ── Per-instance data ─────────────────────────────────────────────────────

  uploadStaticData(
    particles: RenderableParticle[],
    atlasWidth: number,
    cellHeight: number,
    halfHeight: number,
  ): void {
    const gl = this.gl;
    this.instanceCount = particles.length;

    const data = new Float32Array(particles.length * STATIC_FLOATS);
    const invW = 1 / atlasWidth;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const g = p.glyph;
      const off = i * STATIC_FLOATS;

      data[off] = g.cssW; // size.x
      data[off + 1] = cellHeight; // size.y
      data[off + 2] = g.cssHalfW; // center.x
      data[off + 3] = halfHeight; // center.y
      data[off + 4] = g.sx * invW; // u0
      data[off + 5] = 0; // v0
      data[off + 6] = (g.sx + g.sw) * invW; // u1
      data[off + 7] = 1; // v1
      data[off + 8] = p.opacity; // opacity
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    // Pre-allocate dynamic buffer & reusable typed array
    this.positionData = new Float32Array(particles.length * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.positionData.byteLength,
      gl.DYNAMIC_DRAW,
    );
  }

  updatePositions(particles: RenderableParticle[]): void {
    const buf = this.positionData;
    for (let i = 0; i < particles.length; i++) {
      buf[i * 2] = particles[i].renderX;
      buf[i * 2 + 1] = particles[i].renderY;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw(): void {
    if (this.destroyed || this.instanceCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
  }

  // ── Projection ────────────────────────────────────────────────────────────

  private readonly projectionMatrix = new Float32Array(16);

  resize(cssW: number, cssH: number, dpr: number): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, cssW * dpr, cssH * dpr);
    // Orthographic: CSS pixels → clip space (y flipped for canvas convention)
    const m = this.projectionMatrix;
    // prettier-ignore
    m[0] = 2 / cssW;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    // prettier-ignore
    m[4] = 0;
    m[5] = -2 / cssH;
    m[6] = 0;
    m[7] = 0;
    // prettier-ignore
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = 0;
    // prettier-ignore
    m[12] = -1;
    m[13] = 1;
    m[14] = 0;
    m[15] = 1;
    gl.uniformMatrix4fv(this.projectionLoc, false, m);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.staticBuf);
    gl.deleteBuffer(this.dynamicBuf);
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = glAssert(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function attr(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  size: number,
  stride: number,
  offset: number,
  divisor: number,
): void {
  const loc = gl.getAttribLocation(program, name);
  if (loc === -1) return;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  if (divisor) gl.vertexAttribDivisor(loc, divisor);
}
