module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'modules/**/*.ts',
    'src/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
  },
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/e2e/**/*.test.ts', '!<rootDir>/tests/**/*.integration.test.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.integration.test.ts'],
      testTimeout: 60000,
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testTimeout: 30000,
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
  ],
};