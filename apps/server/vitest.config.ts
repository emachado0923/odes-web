import { defineConfig } from 'vitest/config';

// Tests unitarios: src/**/*.spec.ts (los e2e van en vitest.config.e2e.ts).
export default defineConfig({
  test: {
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
