import { defineConfig } from 'vitest/config';

// Tests e2e: levantan la app completa (API + front-end estático) con supertest
// contra un directorio dist temporal, sin depender del build de apps/web.
export default defineConfig({
  test: {
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
  },
});
