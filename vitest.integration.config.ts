import { defineConfig } from 'vitest/config';

/**
 * Current-architecture integration tests only.
 *
 * The older files directly under test/integration predate the v2 composition
 * roots and import modules that no longer exist. Keep this include narrow so
 * adding a new contract suite cannot accidentally reactivate those files.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/current/**/*.test.ts'],
    exclude: ['test/integration/*.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
