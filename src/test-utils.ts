/**
 * Create a canvas element inside a sized container for testing.
 * happy-dom doesn't implement getBoundingClientRect on plain divs,
 * so we stub it to simulate an 800 × 600 viewport.
 */
export function createCanvas(width = 800, height = 600): HTMLCanvasElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
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
