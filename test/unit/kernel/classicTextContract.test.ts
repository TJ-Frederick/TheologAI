import { describe, expect, it } from 'vitest';
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
    title: 'T'.repeat(CLASSIC_TEXT_LIMITS.titleCharacters),
    content: '',
    topics: '["topic",""]',
  });

  it('accepts every stored document and section field at its exact maximum', () => {
    expect(() => assertClassicTextDocumentMetadata(documentAtLimits())).not.toThrow();
    expect(() => assertClassicTextSectionMetadata(sectionAtLimits())).not.toThrow();
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
    ['section title', () => ({ ...sectionAtLimits(), title: 'T'.repeat(CLASSIC_TEXT_LIMITS.titleCharacters + 1) })],
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
