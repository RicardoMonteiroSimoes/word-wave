import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    benchmark: {
      include: ['src/index.bench.ts'],
    },
  },
});
