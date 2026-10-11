import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    isolate: false,
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 30_000,
    clearMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/__tests__/**',
        'src/**/__test__/**',
        'src/test_cert/**',
        'vitest.config.mts',
        'vitest.setup.ts',
      ],
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      src: resolve(import.meta.dirname, 'src'),
    },
  },
});