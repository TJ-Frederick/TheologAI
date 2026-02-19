import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      lines: 80,
      functions: 75,
      branches: 70,
      statements: 80
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
