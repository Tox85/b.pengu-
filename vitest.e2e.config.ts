import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    include: [
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
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    globals: true,
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
