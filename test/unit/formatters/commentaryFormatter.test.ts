import { describe, it, expect } from 'vitest';
import { formatCommentaryResponse } from '../../../src/formatters/commentaryFormatter.js';
import type { CommentaryResult } from '../../../src/kernel/types.js';

function makeResult(overrides: Partial<CommentaryResult> = {}): CommentaryResult {
  return {
    reference: 'John 3:16',
    commentator: 'Matthew Henry',
    text: 'This is a commentary on the love of God...',
    citation: { source: 'HelloAO Commentary API' },
    ...overrides,
  };
}

describe('formatCommentaryResponse', () => {
  it('shows commentator name and reference in header', () => {
    const out = formatCommentaryResponse(makeResult());
    expect(out).toContain('**Matthew Henry Commentary on John 3:16**');
  });

  it('includes commentary text body', () => {
    const out = formatCommentaryResponse(makeResult());
    expect(out).toContain('This is a commentary on the love of God...');
  });

  it('appends citation source', () => {
    const out = formatCommentaryResponse(makeResult());
    expect(out).toContain('*Source: HelloAO Commentary API*');
  });

  it('includes copyright when present', () => {
    const out = formatCommentaryResponse(makeResult({
      citation: { source: 'HelloAO Commentary API', copyright: 'Public Domain' },
    }));
    expect(out).toContain('*Source: HelloAO Commentary API* - Public Domain');
  });

  it('omits copyright when absent', () => {
    const out = formatCommentaryResponse(makeResult());
    expect(out).not.toContain(' - ');
  });

  it('returns trimmed output', () => {
    const out = formatCommentaryResponse(makeResult());
    expect(out).toBe(out.trim());
  });
});
