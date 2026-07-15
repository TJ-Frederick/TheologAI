import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
// Wrangler resolves its log path while its modules load. Set a writable,
// gitignored project path before dynamically importing the pool configuration.
process.env.WRANGLER_LOG_PATH ??= path.join(projectRoot, 'test-output', 'wrangler');

const {
  cloudflareTest,
  readD1Migrations,
} = await import('@cloudflare/vitest-pool-workers');
const migrations = await readD1Migrations(path.join(projectRoot, 'migrations'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/worker.ts',
      // Keep runtime tests local and independent from production bindings or
      // developer secrets in the repository-level .dev.vars file.
      wrangler: { configPath: './test/worker-runtime/wrangler.test.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          THEOLOGAI_VERSION: '3.6.0-test',
          THEOLOGAI_REQUEST_LOGS: 'false',
          THEOLOGAI_ALLOWED_ORIGINS: 'https://allowed.example',
          THEOLOGAI_MAX_REQUEST_BYTES: '1024',
          THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false',
          THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false',
        },
        d1Databases: {
          THEOLOGAI_DB: 'theologai-worker-runtime-test',
        },
      },
    }),
  ],
  test: {
    include: ['test/worker-runtime/**/*.test.ts'],
    setupFiles: ['./test/worker-runtime/setup.ts'],
  },
});
