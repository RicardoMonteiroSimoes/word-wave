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

// Collapse/expand toggle
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const controlsBody = document.getElementById('controls-body') as HTMLDivElement;

toggleBtn.addEventListener('click', () => {
  controlsBody.classList.toggle('collapsed');
  toggleBtn.textContent = controlsBody.classList.contains('collapsed')
    ? 'expand'
    : 'collapse';
});
