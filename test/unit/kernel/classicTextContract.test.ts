import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  assertClassicTextDocumentMetadata,
  assertClassicTextSectionMetadata,
  CLASSIC_TEXT_LIMITS,
} from '../../../src/kernel/classicTextContract.js';

describe('classic-text stored metadata contract', () => {
  const documentAtLimits = () => ({
    id: 'd'.repeat(CLASSIC_TEXT_LIMITS.documentIdCharacters),
    title: 'T'.repeat(CLASSIC_TEXT_LIMITS.titleCharacters),
    type: 'y'.repeat(CLASSIC_TEXT_LIMITS.typeCharacters),
    date: 'D'.repeat(CLASSIC_TEXT_LIMITS.dateCharacters),
    topics: Array.from(
      { length: CLASSIC_TEXT_LIMITS.topicCount },
      () => 'x'.repeat(CLASSIC_TEXT_LIMITS.topicCharacters),
    ),
  });
  const sectionAtLimits = () => ({
    id: Number.MAX_SAFE_INTEGER,
    documentId: 'd'.repeat(CLASSIC_TEXT_LIMITS.documentIdCharacters),
    sectionNumber: 's'.repeat(CLASSIC_TEXT_LIMITS.sectionNumberCharacters),
    title: 'T'.repeat(CLASSIC_TEXT_LIMITS.sectionTitleCharacters),
    content: '',
    topics: '["topic",""]',
  });

  it('accepts every stored document and section field at its exact maximum', () => {
    expect(() => assertClassicTextDocumentMetadata(documentAtLimits())).not.toThrow();
    expect(() => assertClassicTextSectionMetadata(sectionAtLimits())).not.toThrow();
  });

  it('accepts exactly 100 document topics and rejects 101', () => {
    expect(CLASSIC_TEXT_LIMITS.topicCount).toBe(100);
    expect(() => assertClassicTextDocumentMetadata({
      ...documentAtLimits(), topics: Array(100).fill('topic'),
    })).not.toThrow();
    expect(() => assertClassicTextDocumentMetadata({
      ...documentAtLimits(), topics: Array(101).fill('topic'),
    })).toThrow('topics must contain at most 100 strings');
  });

  it('accepts exactly 500 section-title characters and rejects 501', () => {
    expect(CLASSIC_TEXT_LIMITS.sectionTitleCharacters).toBe(500);
    expect(() => assertClassicTextSectionMetadata({
      ...sectionAtLimits(), title: 'T'.repeat(500),
    })).not.toThrow();
    expect(() => assertClassicTextSectionMetadata({
      ...sectionAtLimits(), title: 'T'.repeat(501),
    })).toThrow('title must contain 0..500 Unicode characters');
  });

  it('accepts every current deterministic historical source document', () => {
    const catalog = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8')) as {
      documents: Array<{ documentId: string; composition: { label: string } }>;
    };
    const dates = new Map(catalog.documents.map(document => [document.documentId, document.composition.label]));
    for (const file of readdirSync('data/historical-documents').filter(name => name.endsWith('.json')).sort()) {
      const id = file.slice(0, -'.json'.length);
      const source = JSON.parse(readFileSync(`data/historical-documents/${file}`, 'utf8')) as {
        title?: unknown; type?: unknown; topics?: unknown;
      };
      expect(() => assertClassicTextDocumentMetadata({
        id,
        title: source.title,
        type: source.type || 'document',
        date: dates.get(id),
        topics: source.topics || [],
      }, `Historical source ${id}`), id).not.toThrow();
      const fullSource = source as typeof source & { sections?: Array<Record<string, unknown>> };
      for (const [index, section] of (fullSource.sections || []).entries()) {
        const content = section.content || section.answer || section.a || '';
        const title = section.title || section.question || section.chapter || section.q || '';
        const sectionNumber = section.question_number || section.section_number || String(index + 1);
        expect(() => assertClassicTextSectionMetadata({
          documentId: id,
          sectionNumber,
          title,
          content,
          topics: JSON.stringify(section.topics || []),
        }, `Historical source ${id} section ${index + 1}`), `${id}:${index + 1}`).not.toThrow();
      }
    }
  });

  it.each([
    ['document id', () => ({ ...documentAtLimits(), id: `d${'x'.repeat(CLASSIC_TEXT_LIMITS.documentIdCharacters)}` })],
    ['document title', () => ({ ...documentAtLimits(), title: 'T'.repeat(CLASSIC_TEXT_LIMITS.titleCharacters + 1) })],
    ['document type', () => ({ ...documentAtLimits(), type: 'y'.repeat(CLASSIC_TEXT_LIMITS.typeCharacters + 1) })],
    ['document date', () => ({ ...documentAtLimits(), date: 'D'.repeat(CLASSIC_TEXT_LIMITS.dateCharacters + 1) })],
    ['topic count', () => ({ ...documentAtLimits(), topics: Array(CLASSIC_TEXT_LIMITS.topicCount + 1).fill('topic') })],
    ['topic length', () => ({ ...documentAtLimits(), topics: ['x'.repeat(CLASSIC_TEXT_LIMITS.topicCharacters + 1)] })],
  ])('rejects %s at max plus one with a clear field error', (_field, build) => {
    expect(() => assertClassicTextDocumentMetadata(build(), 'Fixture document'))
      .toThrow(/Fixture document/);
  });

  it.each([
    ['section id', () => ({ ...sectionAtLimits(), id: Number.MAX_SAFE_INTEGER + 1 })],
    ['document id', () => ({ ...sectionAtLimits(), documentId: `d${'x'.repeat(CLASSIC_TEXT_LIMITS.documentIdCharacters)}` })],
    ['section number', () => ({ ...sectionAtLimits(), sectionNumber: `s${'x'.repeat(CLASSIC_TEXT_LIMITS.sectionNumberCharacters)}` })],
    ['section title', () => ({ ...sectionAtLimits(), title: 'T'.repeat(CLASSIC_TEXT_LIMITS.sectionTitleCharacters + 1) })],
    ['section content', () => ({ ...sectionAtLimits(), content: 42 })],
    ['section topics JSON', () => ({ ...sectionAtLimits(), topics: '[' })],
    ['section topics shape', () => ({ ...sectionAtLimits(), topics: '{}' })],
    ['section topics values', () => ({ ...sectionAtLimits(), topics: '["topic",1]' })],
  ])('rejects %s at max plus one with a clear field error', (_field, build) => {
    expect(() => assertClassicTextSectionMetadata(build(), 'Fixture section'))
      .toThrow(/Fixture section/);
  });

  it('rejects identities that cannot form canonical resources instead of normalizing them', () => {
    expect(() => assertClassicTextDocumentMetadata({ ...documentAtLimits(), id: 'bad alias' }))
      .toThrow('cannot form a bounded canonical resource URI');
    expect(() => assertClassicTextSectionMetadata({ ...sectionAtLimits(), sectionNumber: '../bad' }))
      .toThrow('cannot form a bounded canonical resource URI');
  });

  it.each([null, '', '[]', '["topic",""]'])('accepts the stored topics boundary %j', topics => {
    expect(() => assertClassicTextSectionMetadata({ ...sectionAtLimits(), topics })).not.toThrow();
  });
});
