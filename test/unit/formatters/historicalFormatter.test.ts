import { describe, it, expect } from 'vitest';
import {
  formatDocumentList,
  formatDocumentSections,
  formatSearchResults,
} from '../../../src/formatters/historicalFormatter.js';
import type { DocumentInfo, DocumentSection } from '../../../src/adapters/data/HistoricalDocumentRepository.js';

// ── Fixtures ──

function makeDoc(overrides: Partial<DocumentInfo> = {}): DocumentInfo {
  return {
    id: 'nicene-creed',
    title: 'Nicene Creed',
    type: 'creed',
    date: '325 AD',
    topics: ['trinity'],
    ...overrides,
  };
}

function makeSection(overrides: Partial<DocumentSection> = {}): DocumentSection {
  return {
    id: 1,
    document_id: 'nicene-creed',
    section_number: '1',
    title: 'Article I',
    content: 'We believe in one God...',
    topics: ['god', 'monotheism'],
    ...overrides,
  };
}

// ── formatDocumentList ──

describe('formatDocumentList', () => {
  it('shows total count in header', () => {
    const out = formatDocumentList([makeDoc(), makeDoc({ id: 'westminster', title: 'Westminster Confession' })]);
    expect(out).toContain('**Available Historical Documents** (2)');
  });

  it('lists each document with title, type, and date', () => {
    const out = formatDocumentList([makeDoc()]);
    expect(out).toContain('- **Nicene Creed** (creed, 325 AD)');
  });

  it('shows document ID in backtick code format', () => {
    const out = formatDocumentList([makeDoc()]);
    expect(out).toContain('ID: `nicene-creed`');
  });

  it('shows "n.d." for null date', () => {
    const out = formatDocumentList([makeDoc({ date: null })]);
    expect(out).toContain('(creed, n.d.)');
  });

  it('returns trimmed output', () => {
    const out = formatDocumentList([makeDoc()]);
    expect(out).toBe(out.trim());
  });
});

// ── formatDocumentSections ──

describe('formatDocumentSections', () => {
  it('shows document title with type and date', () => {
    const out = formatDocumentSections(makeDoc(), [makeSection()]);
    expect(out).toContain('**Nicene Creed** (creed, 325 AD)');
  });

  it('renders section heading when title exists', () => {
    const out = formatDocumentSections(makeDoc(), [makeSection()]);
    expect(out).toContain('### Article I');
  });

  it('renders section content', () => {
    const out = formatDocumentSections(makeDoc(), [makeSection()]);
    expect(out).toContain('We believe in one God...');
  });

  it('omits heading for sections without title', () => {
    const out = formatDocumentSections(makeDoc(), [makeSection({ title: '' })]);
    expect(out).not.toContain('###');
  });

  it('shows "n.d." for null date', () => {
    const out = formatDocumentSections(makeDoc({ date: null }), [makeSection()]);
    expect(out).toContain('(creed, n.d.)');
  });

  it('returns trimmed output', () => {
    const out = formatDocumentSections(makeDoc(), [makeSection()]);
    expect(out).toBe(out.trim());
  });
});

// ── formatSearchResults ──

describe('formatSearchResults', () => {
  it('returns "No results found" message for empty array', () => {
    const out = formatSearchResults('grace', []);
    expect(out).toBe('No results found for "grace".');
  });

  it('shows query and result count in header', () => {
    const out = formatSearchResults('grace', [makeSection()]);
    expect(out).toContain('**Search Results for "grace"** (1 results)');
  });

  it('shows section titles when present', () => {
    const out = formatSearchResults('grace', [makeSection({ title: 'Of Grace' })]);
    expect(out).toContain('**Of Grace**');
  });

  it('truncates content preview at 300 chars with ellipsis', () => {
    const longContent = 'x'.repeat(350);
    const out = formatSearchResults('test', [makeSection({ content: longContent })]);
    expect(out).toContain('x'.repeat(300) + '...');
  });

  it('does not truncate content under 300 chars', () => {
    const shortContent = 'Short text about grace';
    const out = formatSearchResults('test', [makeSection({ content: shortContent })]);
    expect(out).toContain(shortContent);
    expect(out).not.toContain(shortContent + '...');
  });

  it('limits output to 10 results maximum', () => {
    const sections = Array.from({ length: 15 }, (_, i) =>
      makeSection({ id: i, title: `Section ${i}` })
    );
    const out = formatSearchResults('test', sections);
    expect(out).toContain('Section 9');
    expect(out).not.toContain('Section 10');
  });

  it('returns trimmed output', () => {
    const out = formatSearchResults('grace', [makeSection()]);
    expect(out).toBe(out.trim());
  });
});
