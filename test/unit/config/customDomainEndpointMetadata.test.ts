import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PUBLIC_DONATION_URL } from '../../../src/kernel/publicUrls.js';

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('custom-domain phase-B endpoint metadata', () => {
  it('uses the website apex publicly while retaining every compatibility alias in client guidance', async () => {
    const readme = await readProjectFile('README.md');

    expect(PUBLIC_DONATION_URL).toBe('https://theologai.xyz/');
    for (const value of [
      'https://theologai.xyz',
      'https://mcp.theologai.xyz/mcp',
      'https://preview-mcp.theologai.xyz/mcp',
      'https://theologai.pages.dev/',
      'https://theologai.tjfrederick.workers.dev/mcp',
      'https://theologai-preview.tjfrederick.workers.dev/mcp',
    ]) {
      expect(readme).toContain(value);
    }
  });
});
