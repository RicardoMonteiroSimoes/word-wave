import { WordWaveEngine, WordWaveOptions } from 'word-wave';

const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const modeSelect = document.getElementById('opt-mode') as HTMLSelectElement;

// Apply current color scheme's CSS custom properties to the canvas
function applyColorScheme(): void {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const color = isDark
    ? (document.getElementById('opt-color-dark') as HTMLInputElement).value
    : (document.getElementById('opt-color-light') as HTMLInputElement).value;
  const opacity = isDark
    ? (document.getElementById('opt-opacity-dark') as HTMLInputElement).value
    : (document.getElementById('opt-opacity-light') as HTMLInputElement).value;
  canvas.style.setProperty('--word-wave-color', color);
  canvas.style.setProperty('--word-wave-opacity', opacity);
}

// Slider options: id suffix → config key + parser
const sliders: Record<string, keyof WordWaveOptions> = {
  speed: 'speed',
  frequency: 'frequency',
  amplitude: 'amplitude',
  waveAmplitude: 'waveAmplitude',
  direction: 'direction',
  propagation: 'propagation',
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

  for (const [id, key] of Object.entries(sliders)) {
    const el = document.getElementById(`opt-${id}`) as HTMLInputElement;
    (opts as Record<string, number>)[key] = parseFloat(el.value);
  }

  return opts;
}

applyColorScheme();
let engine = new WordWaveEngine(canvas, getOptions());

function recreate(): void {
  applyColorScheme();
  engine.destroy();
  engine = new WordWaveEngine(canvas, getOptions());
}

// Wire up sliders — update display value and debounce engine recreation
let debounceTimer: ReturnType<typeof setTimeout>;
for (const id of Object.keys(sliders)) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  const display = document.getElementById(`val-${id}`) as HTMLSpanElement;

  input.addEventListener('input', () => {
    display.textContent = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recreate, 150);
  });
}

// Wire up color inputs (no display span — hex visible in swatch)
for (const id of ['color-light', 'color-dark']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recreate, 150);
  });
}

// Wire up opacity sliders with display span
for (const id of ['opacity-light', 'opacity-dark']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  const display = document.getElementById(`val-${id}`) as HTMLSpanElement;
  input.addEventListener('input', () => {
    display.textContent = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recreate, 150);
  });
}

// Wire up text inputs — recreate on Enter or blur
for (const id of ['words', 'font']) {
  const input = document.getElementById(`opt-${id}`) as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') recreate();
  });
  input.addEventListener('blur', () => recreate());
}

// Wire up mode select — recreate immediately on change
modeSelect.addEventListener('change', recreate);

// Listen for OS color scheme changes and recreate engine with new colors
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', recreate);

// FPS counter — separate rAF loop measuring frame-to-frame delivery rate
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

  // Scale chart to 1.2x detected refresh rate so dips are visible
  const chartMax = detectedRefreshRate * 1.2;
  // Color thresholds: green above 80% of refresh rate, yellow 50-80%, red below 50%
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

  // Discard outliers from tab switches / background throttling
  if (delta < MAX_DELTA_MS) {
    frameTimes.push(delta);
    if (frameTimes.length > SAMPLE_COUNT) frameTimes.shift();
  }

  // Throttle display + chart updates (~6Hz)
  if (++frameCount % DISPLAY_INTERVAL === 0 && frameTimes.length > 0) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = Math.round(1000 / avg);
    fpsDisplay.textContent = `${fps} fps`;

    // Track the display's refresh rate from peak observed FPS
    if (fps > detectedRefreshRate) detectedRefreshRate = fps;

    fpsHistory.push(fps);
    if (fpsHistory.length > CHART_HISTORY) fpsHistory.shift();

    const rect = fpsChart.getBoundingClientRect();
    drawChart(rect.width, rect.height);
  }

  requestAnimationFrame(measureFps);
}
requestAnimationFrame(measureFps);

// Copy config to clipboard
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

  const output = {
    options: getOptions(),
    css: {
      light: {
        '--word-wave-color': colorLight,
        '--word-wave-opacity': opacityLight,
      },
      dark: {
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

// Collapse/expand all sections
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
