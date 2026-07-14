import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STEPBIBLE_SOURCE } from '../../../src/kernel/stepBibleSource.js';

interface SourceLock {
  sources: Array<{
    id: string;
    commit_sha: string;
    commit_url: string;
    license: string;
    license_url: string;
    attribution: string;
  }>;
}

describe('runtime STEPBible source metadata', () => {
  it('exactly mirrors the tracked executable source lock', () => {
    const lock = JSON.parse(readFileSync(new URL(
      '../../../data/biblical-languages/SOURCE.json',
      import.meta.url,
    ), 'utf8')) as SourceLock;
    const tracked = lock.sources.find(source => source.id === 'stepbible_data');

    expect(tracked).toBeDefined();
    expect(STEPBIBLE_SOURCE).toEqual({
      commitSha: tracked!.commit_sha,
      commitUrl: tracked!.commit_url,
      license: { label: tracked!.license, url: tracked!.license_url },
      attribution: tracked!.attribution,
    });
  });
});
