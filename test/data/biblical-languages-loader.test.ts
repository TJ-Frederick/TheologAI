/**
 * Tests for Biblical Languages Database Loader (TDD)
 *
 * Tests the download and initialization logic for the Strong's database.
 */

import { BiblicalLanguagesLoader } from '../../src/data/biblical-languages-loader.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('BiblicalLanguagesLoader', () => {
  const testDataPath = join(__dirname, '../../data');
  const testDbPath = join(testDataPath, 'strongs.db');
  let loader: BiblicalLanguagesLoader;

  beforeEach(() => {
    loader = new BiblicalLanguagesLoader(testDataPath);
  });

  afterEach(() => {
    // Clean up test database if created
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe('ensureDatabase', () => {
    it('should return path to existing database if present', async () => {
      // This test assumes the database has been built
      const dbPath = await loader.ensureDatabase();

      expect(dbPath).toBe(testDbPath);
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should download database if not present', async () => {
      // Remove database if exists
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }

      const dbPath = await loader.ensureDatabase();

      expect(dbPath).toBe(testDbPath);
      expect(existsSync(dbPath)).toBe(true);
    }, 60000); // 60 second timeout for download

    it('should not re-download if database exists', async () => {
      // First call - may download
      await loader.ensureDatabase();

      const downloadSpy = jest.spyOn(loader as any, 'downloadDatabase');

      // Second call - should not download
      await loader.ensureDatabase();

      expect(downloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('downloadDatabase', () => {
    it('should handle download failures gracefully', async () => {
      // Force invalid URL to test error handling
      const loaderWithBadUrl = new BiblicalLanguagesLoader(testDataPath, {
        downloadUrl: 'https://invalid-url-that-does-not-exist.com/strongs.db.gz'
      });

      await expect(loaderWithBadUrl.ensureDatabase()).rejects.toThrow();
    }, 30000);
  });

  describe('Database validation', () => {
    it('should validate database has required tables', async () => {
      await loader.ensureDatabase();

      const isValid = await loader.validateDatabase();

      expect(isValid).toBe(true);
    });

    it('should validate database has data', async () => {
      await loader.ensureDatabase();

      const hasData = await loader.checkDatabaseHasData();

      expect(hasData).toBe(true);
    });

    it('should return metadata from database', async () => {
      await loader.ensureDatabase();

      const metadata = await loader.getMetadata();

      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('source');
      expect(metadata).toHaveProperty('license');
      expect(metadata.license).toBe('Public Domain');
    });
  });
});
