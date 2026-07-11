import { describe, expect, it, vi } from 'vitest';
import type { CcelAdapter } from '../../../../src/adapters/commentary/CcelAdapter.js';
import { CcelService } from '../../../../src/services/commentary/CcelService.js';

function adapterReturning(work = 'john-bunyan/pilgrims-progress', section = 'chapter-one') {
  const getWorkSection = vi.fn().mockResolvedValue({
    work,
    section,
    content: 'Classic text content',
  });
  return {
    adapter: { getWorkSection } as unknown as CcelAdapter,
    getWorkSection,
  };
}

describe('CcelService', () => {
  it('maps adapter output to a cited response with a readable title', async () => {
    const { adapter, getWorkSection } = adapterReturning();
    const service = new CcelService(adapter);

    const result = await service.getWorkSection({
      work: 'john-bunyan/pilgrims-progress',
      section: 'chapter-one',
    });

    expect(getWorkSection).toHaveBeenCalledWith(
      'john-bunyan/pilgrims-progress',
      'chapter-one',
    );
    expect(result).toEqual({
      work: 'john-bunyan/pilgrims-progress',
      section: 'chapter-one',
      title: 'John Bunyan — Pilgrims Progress',
      content: 'Classic text content',
      source: 'CCEL (Christian Classics Ethereal Library)',
      url: 'https://ccel.org/ccel/john-bunyan/pilgrims-progress/chapter-one.html',
    });
  });

  it('derives the section from the final work path component', async () => {
    const { adapter, getWorkSection } = adapterReturning('calvin/institutes', 'institutes');
    const service = new CcelService(adapter);

    await service.getWorkSection({ work: 'calvin/institutes' });

    expect(getWorkSection).toHaveBeenCalledWith('calvin/institutes', 'institutes');
  });

  it('does not leave an incomplete author-only heading', async () => {
    const { adapter } = adapterReturning('calvin', 'calvin');
    const service = new CcelService(adapter);

    const result = await service.getWorkSection({ work: 'calvin' });

    expect(result.title).toBe('Calvin');
    expect(result.title).not.toContain('— ');
  });

  it('rejects an empty work identifier before calling the adapter', async () => {
    const { adapter, getWorkSection } = adapterReturning('', '');
    const service = new CcelService(adapter);

    await expect(service.getWorkSection({ work: '' })).rejects.toThrow('CCEL work and section identifiers');
    expect(getWorkSection).not.toHaveBeenCalled();
  });

  it('forwards identical and different-section requests to the adapter cache boundary', async () => {
    const { adapter, getWorkSection } = adapterReturning('augustine/confessions', 'book-one');
    const service = new CcelService(adapter);

    const first = await service.getWorkSection({
      work: 'augustine/confessions',
      section: 'book-one',
    });
    const cached = await service.getWorkSection({
      work: 'augustine/confessions',
      section: 'book-one',
    });
    await service.getWorkSection({
      work: 'augustine/confessions',
      section: 'book-two',
    });

    expect(cached).toEqual(first);
    expect(getWorkSection).toHaveBeenCalledTimes(3);
  });

  it('rejects unsafe path identifiers', async () => {
    const { adapter, getWorkSection } = adapterReturning();
    const service = new CcelService(adapter);
    await expect(service.getWorkSection({ work: 'calvin/../../private', section: 'chapter-one' }))
      .rejects.toThrow('CCEL work and section identifiers');
    expect(getWorkSection).not.toHaveBeenCalled();
  });
});
