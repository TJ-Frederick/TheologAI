import { afterEach, describe, expect, it, vi } from 'vitest';

const databaseMock = vi.hoisted(() => ({
  close: vi.fn(),
  pragma: vi.fn(),
}));
const databaseConstructor = vi.hoisted(() => vi.fn(function () {
  return databaseMock;
}));

vi.mock('better-sqlite3', () => ({ default: databaseConstructor }));
vi.mock('fs', async importOriginal => {
  const original = await importOriginal<typeof import('fs')>();
  return { ...original, existsSync: vi.fn(() => true) };
});

import {
  closeDatabase,
  getDatabase,
  resolveDatabasePath,
} from '../../../../src/adapters/shared/Database.js';

afterEach(() => {
  closeDatabase();
  vi.clearAllMocks();
});

describe('resolveDatabasePath', () => {
  it('prefers an explicit argument over the environment', () => {
    expect(resolveDatabasePath('/explicit/theologai.db', {
      THEOLOGAI_DATABASE_PATH: '/environment/theologai.db',
    })).toBe('/explicit/theologai.db');
  });

  it('uses THEOLOGAI_DATABASE_PATH when no argument is provided', () => {
    expect(resolveDatabasePath(undefined, {
      THEOLOGAI_DATABASE_PATH: '/environment/theologai.db',
    })).toBe('/environment/theologai.db');
  });

  it('falls back to the repository data path', () => {
    expect(resolveDatabasePath(undefined, {})).toMatch(/data\/theologai\.db$/);
  });

  it('opens a fresh database read-only without trying to change its journal mode', () => {
    getDatabase('/fresh/theologai.db');

    expect(databaseConstructor).toHaveBeenCalledWith('/fresh/theologai.db', { readonly: true });
    expect(databaseMock.pragma).toHaveBeenCalledWith('cache_size = -64000');
    expect(databaseMock.pragma).toHaveBeenCalledWith('mmap_size = 268435456');
    expect(databaseMock.pragma).not.toHaveBeenCalledWith(expect.stringMatching(/^journal_mode/i));
  });
});
