/**
 * Create a canvas element inside a sized container for testing.
 * happy-dom doesn't implement getBoundingClientRect on plain divs,
 * so we stub it to simulate an 800 × 600 viewport.
 */
export function createCanvas(): HTMLCanvasElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(container);
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  return canvas;
}
