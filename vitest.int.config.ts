import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    globals: true,
    setupFiles: ['tests/setup.ts'],
  },
});
