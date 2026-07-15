import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Node unit tests import the Worker entry point but never instantiate a
    // Durable Object. Workerd runtime tests use vitest.worker.config.ts and the
    // real cloudflare:workers module instead.
    alias: {
      'cloudflare:workers': new URL('./test/helpers/cloudflareWorkersShim.ts', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/unit/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        'scripts/',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/types/index.ts',
        'src/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
