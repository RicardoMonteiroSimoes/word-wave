import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    benchmark: {
      exclude: ['src/index.bench.ts'],
      options: {
        iterations: 13,
        warmupIterations: 5,
      },
    },
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: [
            '--enable-gpu',
            '--use-gl=angle',
            '--ignore-gpu-blocklist',
            '--enable-webgl',
          ],
        },
      }),
      instances: [{ browser: 'chromium', headless: true }],
    },
  },
});
