import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
process.env.WRANGLER_LOG_PATH ??= path.join(projectRoot, 'test-output', 'wrangler');

const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/ccel-coordinator-worker.ts',
      wrangler: { configPath: './test/ccel-coordinator-runtime/wrangler.test.toml' },
    }),
  ],
  test: {
    include: ['test/ccel-coordinator-runtime/**/*.test.ts'],
    setupFiles: ['./test/ccel-coordinator-runtime/setup.ts'],
  },
});
