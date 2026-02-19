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
      // Legacy tests for old architecture (superseded by v2)
      'test/unit/adapters/biblicalLanguagesAdapter.test.ts',
      'test/unit/adapters/localData.test.ts',
      'test/unit/services/bibleService.test.ts',
      'test/unit/services/crossReferenceService.test.ts',
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
        // Legacy code (kept for reference, not covered)
        'src/tools/*.ts',
        'src/services/bibleService.ts',
        'src/services/crossReferenceService.ts',
        'src/services/parallelPassageService.ts',
        'src/services/commentaryService.ts',
        'src/services/ccelService.ts',
        'src/adapters/biblicalLanguagesAdapter.ts',
        'src/adapters/localData.ts',
        'src/adapters/helloaoApi.ts',
        'src/adapters/esvApi.ts',
        'src/adapters/netBibleApi.ts',
        'src/adapters/ccelApi.ts',
        'src/adapters/ccelCatalogScraper.ts',
        'src/adapters/ccelToc.ts',
        'src/adapters/publicCommentaryAdapter.ts',
        'src/adapters/helloaoBibleAdapter.ts',
        'src/utils/',
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
