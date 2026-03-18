import {
  WordWaveEngine,
  WordWaveOptions,
  Effect,
  NoiseEffect,
  WaveEffect,
  PulseEffect,
  GlslEffect,
  DEFAULT_EFFECTS,
} from 'word-wave';

const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const modeSelect = document.getElementById('opt-mode') as HTMLSelectElement;

// ── Effect slider specs ─────────────────────────────────────────────────────

interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const EFFECT_SLIDERS: Record<string, SliderSpec[]> = {
  noise: [
    {
      key: 'frequency',
      label: 'frequency',
      min: 0.001,
      max: 0.05,
      step: 0.001,
      default: 0.008,
    },
    {
      key: 'amplitude',
      label: 'amplitude',
      min: 0,
      max: 50,
      step: 1,
      default: 10,
    },
    {
      key: 'speed',
      label: 'speed',
      min: 0.001,
      max: 0.1,
      step: 0.001,
      default: 0.01,
    },
    { key: 'yScale', label: 'yScale', min: 0, max: 2, step: 0.1, default: 0.6 },
  ],
  wave: [
    {
      key: 'direction',
      label: 'direction',
      min: 0,
      max: 360,
      step: 1,
      default: 225,
    },
    {
      key: 'propagation',
      label: 'propagation',
      min: 0.001,
      max: 0.2,
      step: 0.001,
      default: 0.03,
    },
    {
      key: 'amplitude',
      label: 'amplitude',
      min: 0,
      max: 50,
      step: 1,
      default: 15,
    },
    {
      key: 'speed',
      label: 'speed',
      min: 0.1,
      max: 10,
      step: 0.1,
      default: 2.0,
    },
  ],
  pulse: [
    {
      key: 'centerX',
      label: 'centerX',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.5,
    },
    {
      key: 'centerY',
      label: 'centerY',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.5,
    },
    {
      key: 'frequency',
      label: 'frequency',
      min: 0.001,
      max: 0.2,
      step: 0.001,
      default: 0.05,
    },
    {
      key: 'amplitude',
      label: 'amplitude',
      min: 0,
      max: 50,
      step: 1,
      default: 10,
    },
    {
      key: 'speed',
      label: 'speed',
      min: 0.1,
      max: 10,
      step: 0.1,
      default: 1.0,
    },
  ],
};

const GLSL_DEFAULT_CODE = 'd = vec2(sin(pos.x * 0.05 + time) * 8.0, 0.0);';

// ── State ───────────────────────────────────────────────────────────────────

interface EffectEntry {
  type: 'noise' | 'wave' | 'pulse' | 'glsl';
  params: Record<string, number>;
  code?: string;
  card: HTMLElement;
}

const effectEntries: EffectEntry[] = [];

// ── Theme management ────────────────────────────────────────────────────────

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

document.body.dataset.theme = getSystemTheme();

function applyColorScheme(): void {
  const isDark = document.body.dataset.theme === 'dark';
  const color = isDark
    ? (document.getElementById('opt-color-dark') as HTMLInputElement).value
    : (document.getElementById('opt-color-light') as HTMLInputElement).value;
  const opacity = isDark
    ? (document.getElementById('opt-opacity-dark') as HTMLInputElement).value
    : (document.getElementById('opt-opacity-light') as HTMLInputElement).value;
  const bg = isDark
    ? (document.getElementById('opt-bg-dark') as HTMLInputElement).value
    : (document.getElementById('opt-bg-light') as HTMLInputElement).value;
  canvas.style.setProperty('--word-wave-color', color);
  canvas.style.setProperty('--word-wave-opacity', opacity);
  document.body.style.backgroundColor = bg;
}

// ── Options ─────────────────────────────────────────────────────────────────

const layoutSliders: Record<string, keyof WordWaveOptions> = {
  spacingX: 'spacingX',
  spacingY: 'spacingY',
};

function getOptions(): Partial<WordWaveOptions> {
  const wordsInput = document.getElementById('opt-words') as HTMLInputElement;
  const fontInput = document.getElementById('opt-font') as HTMLInputElement;

  const opts: Partial<WordWaveOptions> = {
    words: wordsInput.value
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean),
    font: fontInput.value,
    mode: modeSelect.value as 'character' | 'word',
    respectReducedMotion: true,
    pauseOffScreen: true,
  };

  for (const [id, key] of Object.entries(layoutSliders)) {
    const el = document.getElementById(`opt-${id}`) as HTMLInputElement;
    (opts as Record<string, number>)[key] = parseFloat(el.value);
  }

  if (effectEntries.length > 0) {
    opts.effects = buildEffectsArray();
  } else {
    for (const id of [
      'speed',
      'frequency',
      'amplitude',
      'waveAmplitude',
      'direction',
      'propagation',
    ]) {
      const el = document.getElementById(`opt-${id}`) as HTMLInputElement;
      (opts as Record<string, number>)[id] = parseFloat(el.value);
    }
  }

  return opts;
}

// ── Effects builder ─────────────────────────────────────────────────────────

function buildEffectsArray(): Effect[] {
  return effectEntries.map((entry): Effect => {
    switch (entry.type) {
      case 'noise':
        return { type: 'noise', ...entry.params } as NoiseEffect;
      case 'wave':
        return { type: 'wave', ...entry.params } as WaveEffect;
      case 'pulse':
        return { type: 'pulse', ...entry.params } as PulseEffect;
      case 'glsl':
        return {
          type: 'glsl',
          code: entry.code ?? GLSL_DEFAULT_CODE,
          params: { ...entry.params },
        } as GlslEffect;
    }
  });
}

function renumberEffectCards(): void {
  effectEntries.forEach((entry, i) => {
    const title = entry.card.querySelector('.effect-card-title');
    if (title) title.textContent = `#${i + 1} ${entry.type}`;
  });
}

function addGlslParamRow(
  container: HTMLElement,
  entry: EffectEntry,
  name = 'u_param',
  value = 0,
): void {
  let currentName = name;
  entry.params[currentName] = value;

  const row = document.createElement('div');
  row.className = 'glsl-param-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = currentName;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '-100';
  slider.max = '100';
  slider.step = '0.1';
  slider.value = String(value);

  const display = document.createElement('span');
  display.textContent = String(value);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'effect-remove-btn';
  removeBtn.textContent = '\u00d7';

  nameInput.addEventListener('blur', () => {
    const newName = nameInput.value.trim() || currentName;
    if (newName !== currentName) {
      const val = entry.params[currentName];
      entry.params = Object.fromEntries(
        Object.entries(entry.params).filter(([k]) => k !== currentName),
      );
      entry.params[newName] = val;
      currentName = newName;
      debouncedRecreate();
    }
  });

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    entry.params[currentName] = v;
    display.textContent = String(v);
    debouncedRecreate();
  });

  removeBtn.addEventListener('click', () => {
    entry.params = Object.fromEntries(
      Object.entries(entry.params).filter(([k]) => k !== currentName),
    );
    row.remove();
    debouncedRecreate();
  });

  row.append(nameInput, slider, display, removeBtn);
  container.appendChild(row);
}

function createEffectCard(
  type: EffectEntry['type'],
  initialParams?: Record<string, number>,
  initialCode?: string,
): EffectEntry {
  const card = document.createElement('div');
  card.className = 'effect-card';

  const entry: EffectEntry = {
    type,
    params: initialParams ? { ...initialParams } : {},
    code: type === 'glsl' ? (initialCode ?? GLSL_DEFAULT_CODE) : undefined,
    card,
  };

  // Header
  const header = document.createElement('div');
  header.className = 'effect-card-header';

  const title = document.createElement('span');
  title.className = 'effect-card-title';
  title.textContent = `#${effectEntries.length + 1} ${type}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'effect-remove-btn';
  removeBtn.textContent = '\u00d7';
  removeBtn.addEventListener('click', () => {
    const idx = effectEntries.indexOf(entry);
    if (idx >= 0) effectEntries.splice(idx, 1);
    card.remove();
    renumberEffectCards();
    debouncedRecreate();
  });

  header.append(title, removeBtn);
  card.appendChild(header);

  // Body
  if (type === 'glsl') {
    const textarea = document.createElement('textarea');
    textarea.className = 'glsl-textarea';
    textarea.value = entry.code ?? GLSL_DEFAULT_CODE;
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      entry.code = textarea.value;
      debouncedRecreate();
    });
    card.appendChild(textarea);

    const paramsHeader = document.createElement('div');
    paramsHeader.className = 'glsl-params-header';

    const paramsLabel = document.createElement('span');
    paramsLabel.textContent = 'Uniforms';

    const addParamBtn = document.createElement('button');
    addParamBtn.className = 'effect-remove-btn';
    addParamBtn.textContent = '+';
    addParamBtn.style.fontSize = '14px';

    paramsHeader.append(paramsLabel, addParamBtn);
    card.appendChild(paramsHeader);

    const paramsContainer = document.createElement('div');
    card.appendChild(paramsContainer);

    addParamBtn.addEventListener('click', () => {
      const n = `u_p${Object.keys(entry.params).length}`;
      addGlslParamRow(paramsContainer, entry, n, 0);
      debouncedRecreate();
    });

    if (initialParams) {
      for (const [k, v] of Object.entries(initialParams)) {
        addGlslParamRow(paramsContainer, entry, k, v);
      }
    }
  } else {
    const specs = EFFECT_SLIDERS[type];
    if (specs) {
      for (const spec of specs) {
        const val = entry.params[spec.key] ?? spec.default;
        entry.params[spec.key] = val;

        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        const nameText = document.createTextNode(`${spec.label} `);
        const valueSpan = document.createElement('span');
        valueSpan.textContent = String(val);
        label.append(nameText, valueSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(spec.min);
        slider.max = String(spec.max);
        slider.step = String(spec.step);
        slider.value = String(val);

        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          entry.params[spec.key] = v;
          valueSpan.textContent = String(v);
          debouncedRecreate();
        });

        group.append(label, slider);
        card.appendChild(group);
      }
    }
  }

  return entry;
}

function initDefaultEffects(): void {
  const list = document.getElementById('effects-list');
  if (!list) return;
  for (const effect of DEFAULT_EFFECTS) {
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(effect)) {
      if (k !== 'type' && typeof v === 'number') params[k] = v;
    }
    const entry = createEffectCard(
      effect.type,
      Object.keys(params).length > 0 ? params : undefined,
      (effect as GlslEffect).code,
    );
    effectEntries.push(entry);
    list.appendChild(entry.card);
  }
}

// ── Engine ───────────────────────────────────────────────────────────────────

applyColorScheme();
initDefaultEffects();
let engine = new WordWaveEngine(canvas, getOptions());

function recreate(): void {
  applyColorScheme();
  engine.destroy();
  engine = new WordWaveEngine(canvas, getOptions());
}

let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedRecreate(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(recreate, 150);
}

// ── Wiring: layout sliders ──────────────────────────────────────────────────

for (const id of Object.keys(layoutSliders)) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  const display = document.getElementById(`val-${id}`) as HTMLSpanElement;
  input.addEventListener('input', () => {
    display.textContent = input.value;
    debouncedRecreate();
  });
}

// ── Wiring: legacy sliders ──────────────────────────────────────────────────

for (const id of [
  'speed',
  'frequency',
  'amplitude',
  'waveAmplitude',
  'direction',
  'propagation',
]) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  const display = document.getElementById(`val-${id}`) as HTMLSpanElement;
  input.addEventListener('input', () => {
    display.textContent = input.value;
    debouncedRecreate();
  });
}

// ── Wiring: color/opacity/text/mode ─────────────────────────────────────────

for (const id of ['color-light', 'color-dark']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  input.addEventListener('input', () => debouncedRecreate());
}

for (const id of ['bg-light', 'bg-dark']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  input.addEventListener('input', () => applyColorScheme());
}

for (const id of ['opacity-light', 'opacity-dark']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  const display = document.getElementById(`val-${id}`) as HTMLSpanElement;
  input.addEventListener('input', () => {
    display.textContent = input.value;
    debouncedRecreate();
  });
}

for (const id of ['words', 'font']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') recreate();
  });
  input.addEventListener('blur', () => recreate());
}

modeSelect.addEventListener('change', recreate);

// ── Wiring: add effect button ───────────────────────────────────────────────

const addEffectBtn = document.getElementById(
  'add-effect-btn',
) as HTMLButtonElement;
const addEffectType = document.getElementById(
  'add-effect-type',
) as HTMLSelectElement;
const effectsList = document.getElementById('effects-list') as HTMLElement;

addEffectBtn.addEventListener('click', () => {
  const type = addEffectType.value as EffectEntry['type'];
  const entry = createEffectCard(type);
  effectEntries.push(entry);
  effectsList.appendChild(entry.card);
  debouncedRecreate();
});

// ── OS color scheme listener ────────────────────────────────────────────────

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    document.body.dataset.theme = getSystemTheme();
    updateThemeIcon();
    recreate();
  });

// ── Theme toggle ────────────────────────────────────────────────────────────

const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement;
const sunSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const moonSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function updateThemeIcon(): void {
  const isDark = document.body.dataset.theme === 'dark';
  themeBtn.innerHTML = isDark ? moonSvg : sunSvg;
  themeBtn.ariaLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}
updateThemeIcon();

themeBtn.addEventListener('click', () => {
  document.body.dataset.theme =
    document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  updateThemeIcon();
  recreate();
});

// ── FPS counter ─────────────────────────────────────────────────────────────

const fpsDisplay = document.getElementById('fps') as HTMLSpanElement;
const fpsChart = document.getElementById('fps-chart') as HTMLCanvasElement;
const fpsCtx = fpsChart.getContext('2d');

const frameTimes: number[] = [];
const SAMPLE_COUNT = 30;
const MAX_DELTA_MS = 100;
const DISPLAY_INTERVAL = 10;
const CHART_HISTORY = 100;

const fpsHistory: number[] = [];
let lastFrameTime = performance.now();
let frameCount = 0;
let detectedRefreshRate = 60;

function sizeChart(): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = fpsChart.getBoundingClientRect();
  fpsChart.width = rect.width * dpr;
  fpsChart.height = rect.height * dpr;
  fpsCtx?.scale(dpr, dpr);
}
sizeChart();
new ResizeObserver(sizeChart).observe(fpsChart);

function drawChart(cssW: number, cssH: number): void {
  if (!fpsCtx || fpsHistory.length === 0) return;

  fpsCtx.clearRect(0, 0, cssW, cssH);

  const chartMax = detectedRefreshRate * 1.2;
  const greenThreshold = detectedRefreshRate * 0.8;
  const yellowThreshold = detectedRefreshRate * 0.5;
  const barW = cssW / CHART_HISTORY;
  const len = fpsHistory.length;

  for (let i = 0; i < len; i++) {
    const fps = fpsHistory[i];
    const ratio = Math.min(fps / chartMax, 1);
    const barH = ratio * cssH;

    if (fps >= greenThreshold) fpsCtx.fillStyle = 'rgba(34, 197, 94, 0.7)';
    else if (fps >= yellowThreshold)
      fpsCtx.fillStyle = 'rgba(234, 179, 8, 0.7)';
    else fpsCtx.fillStyle = 'rgba(239, 68, 68, 0.7)';

    fpsCtx.fillRect(i * barW, cssH - barH, barW - 0.5, barH);
  }
}

function measureFps(): void {
  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;

  if (delta < MAX_DELTA_MS) {
    frameTimes.push(delta);
    if (frameTimes.length > SAMPLE_COUNT) frameTimes.shift();
  }

  if (++frameCount % DISPLAY_INTERVAL === 0 && frameTimes.length > 0) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = Math.round(1000 / avg);
    fpsDisplay.textContent = `${fps} fps`;

    if (fps > detectedRefreshRate) detectedRefreshRate = fps;

    fpsHistory.push(fps);
    if (fpsHistory.length > CHART_HISTORY) fpsHistory.shift();

    const rect = fpsChart.getBoundingClientRect();
    drawChart(rect.width, rect.height);
  }

  requestAnimationFrame(measureFps);
}
requestAnimationFrame(measureFps);

// ── Copy config ─────────────────────────────────────────────────────────────

const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const copyIconSvg = copyBtn.innerHTML;
const checkSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

copyBtn.addEventListener('click', () => {
  const colorLight = (
    document.getElementById('opt-color-light') as HTMLInputElement
  ).value;
  const opacityLight = (
    document.getElementById('opt-opacity-light') as HTMLInputElement
  ).value;
  const colorDark = (
    document.getElementById('opt-color-dark') as HTMLInputElement
  ).value;
  const opacityDark = (
    document.getElementById('opt-opacity-dark') as HTMLInputElement
  ).value;
  const bgLight = (document.getElementById('opt-bg-light') as HTMLInputElement)
    .value;
  const bgDark = (document.getElementById('opt-bg-dark') as HTMLInputElement)
    .value;

  const output = {
    options: getOptions(),
    css: {
      light: {
        background: bgLight,
        '--word-wave-color': colorLight,
        '--word-wave-opacity': opacityLight,
      },
      dark: {
        background: bgDark,
        '--word-wave-color': colorDark,
        '--word-wave-opacity': opacityDark,
      },
    },
  };

  const json = JSON.stringify(output, null, 2);
  navigator.clipboard.writeText(json).then(
    () => {
      copyBtn.innerHTML = checkSvg;
      setTimeout(() => {
        copyBtn.innerHTML = copyIconSvg;
      }, 1500);
    },
    () => {
      copyBtn.title = 'failed!';
      setTimeout(() => {
        copyBtn.title = '';
      }, 1500);
    },
  );
});

// ── Collapse/expand all ─────────────────────────────────────────────────────

const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const sections =
  document.querySelectorAll<HTMLDetailsElement>('.control-section');
const chevronUp = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;
const chevronDown = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

toggleBtn.addEventListener('click', () => {
  const allOpen = [...sections].every((s) => s.open);
  sections.forEach((s) => (s.open = !allOpen));
  toggleBtn.innerHTML = allOpen ? chevronDown : chevronUp;
  toggleBtn.ariaLabel = allOpen
    ? 'Expand all sections'
    : 'Collapse all sections';
});
