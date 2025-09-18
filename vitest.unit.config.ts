import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/**/*.integration.test.ts',
      'tests/**/*.e2e.test.ts',
      'tests/e2e/**/*.test.ts',
      'tests/**/flow*.test.ts',
      'tests/**/liquidity.pengu.test.ts',
      'tests/**/trading.pengu.test.ts',
      'tests/**/monitoring.e2e.test.ts',
      'tests/**/smoke.test.ts',
      'tests/**/simulation.signonly.test.ts',
    ],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    globals: true,
    setupFiles: ['tests/setup.ts'],
  },
});
