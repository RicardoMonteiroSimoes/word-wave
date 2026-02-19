import { WordWaveEngine, WordWaveOptions } from 'word-wave';

const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const modeSelect = document.getElementById('opt-mode') as HTMLSelectElement;

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
    color: 'auto',
    respectReducedMotion: true,
    autoDetectColorScheme: true,
    pauseOffScreen: true,
  };

  for (const [id, key] of Object.entries(sliders)) {
    const el = document.getElementById(`opt-${id}`) as HTMLInputElement;
    (opts as Record<string, number>)[key] = parseFloat(el.value);
  }

  return opts;
}

let engine = new WordWaveEngine(canvas, getOptions());

function recreate(): void {
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
copyBtn.addEventListener('click', () => {
  const json = JSON.stringify(getOptions(), null, 2);
  navigator.clipboard.writeText(json).then(
    () => {
      copyBtn.textContent = 'copied!';
      setTimeout(() => {
        copyBtn.textContent = 'copy config';
      }, 1500);
    },
    () => {
      copyBtn.textContent = 'failed!';
      setTimeout(() => {
        copyBtn.textContent = 'copy config';
      }, 1500);
    },
  );
});

// Collapse/expand toggle
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const controlsBody = document.getElementById('controls-body') as HTMLDivElement;

toggleBtn.addEventListener('click', () => {
  controlsBody.classList.toggle('collapsed');
  toggleBtn.textContent = controlsBody.classList.contains('collapsed')
    ? 'expand'
    : 'collapse';
});
