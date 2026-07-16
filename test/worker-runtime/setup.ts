import { beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../src/kernel/ubsParallelSource.js';
import generatedUbsCorpus from '../../src/data/ubs-parallel-passages.generated.json';

declare global {
  namespace Cloudflare {
    interface Env {
      THEOLOGAI_DB: D1Database;
      THEOLOGAI_RATE_LIMITER: RateLimit;
      TEST_MIGRATIONS: D1Migration[];
      THEOLOGAI_VERSION: string;
      THEOLOGAI_REQUEST_LOGS: string;
      THEOLOGAI_ALLOWED_ORIGINS: string;
      THEOLOGAI_MAX_REQUEST_BYTES: string;
      THEOLOGAI_EXPOSE_CCEL_DISCOVERY: string;
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: string;
      THEOLOGAI_ENABLE_CCEL_COORDINATOR: string;
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.THEOLOGAI_DB, env.TEST_MIGRATIONS);

  await env.THEOLOGAI_DB.batch([
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO cross_references (from_verse, to_verse, votes)
      VALUES (?, ?, ?)
    `).bind('John.3.16', 'Rom.5.8', 42),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO strongs (
        strongs_number,
        testament,
        lemma,
        transliteration,
        pronunciation,
        definition,
        derivation
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'G0026',
      'NT',
      'ἀγάπη',
      'agapē',
      'ag-ah-pay',
      'love, goodwill, benevolence',
      'from G25',
    ),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO strongs_fts (
        strongs_number,
        lemma,
        transliteration,
        definition
      ) VALUES (?, ?, ?, ?)
    `).bind('G0026', 'ἀγάπη', 'agapē', 'love, goodwill, benevolence'),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO morphology (
        book,
        chapter,
        verse,
        position,
        word_text,
        lemma,
        strongs_number,
        morph_code,
        gloss,
        book_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('John', 3, 16, 1, 'Οὕτως', 'οὕτως', 'G3779', 'ADV', 'thus', 43),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO morphology (
        book, chapter, verse, position, word_text, lemma,
        strongs_number, morph_code, gloss, book_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('John', 3, 16, 2, 'ἀγάπη·', 'ἀγάπη', 'G0026', 'N-NSF', 'love', 43),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO strongs_usage_stats
        (strongs_key, token_count, verse_count, book_count, form_count)
      VALUES (?, ?, ?, ?, ?)
    `).bind('G0026', 1, 1, 1, 1),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO strongs_book_stats
        (strongs_key, book, book_order, token_count, verse_count)
      VALUES (?, ?, ?, ?, ?)
    `).bind('G0026', 'John', 43, 1, 1),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO strongs_form_stats (
        strongs_key, form_text, token_count, verse_count,
        first_book, first_book_order, first_chapter, first_verse, first_position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('G0026', 'ἀγάπη·', 1, 1, 'John', 43, 3, 16, 2),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO morph_codes (code, expansion)
      VALUES (?, ?)
    `).bind('ADV', 'Adverb'),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO documents (id, title, type, date, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      'apostles-creed',
      "Apostles' Creed",
      'Creed',
      'c. 390',
      JSON.stringify({
        topics: ['Trinity', 'Resurrection'],
        catalog: {
          lookupAliases: ["The Apostles' Creed", "Apostles' Creed", 'Apostles Creed'],
          composition: { label: 'Before the end of the 4th century (present form)' },
          creators: [],
          metadataStatus: 'anonymous',
          metadataProvenanceIds: ['hist-meta-crc-apostles'],
        },
      }),
    ),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO document_sections (
        id,
        document_id,
        section_number,
        title,
        content,
        topics
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      1,
      'apostles-creed',
      '1',
      'The First Article',
      'I believe in God the Father almighty, maker of heaven and earth.',
      JSON.stringify(['God', 'Creation']),
    ),
    env.THEOLOGAI_DB.prepare(`
      INSERT INTO sections_fts (rowid, title, content, topics)
      VALUES (?, ?, ?, ?)
    `).bind(
      1,
      'The First Article',
      'I believe in God the Father almighty, maker of heaven and earth.',
      'God Creation',
    ),
  ]);

  const source = UBS_PARALLEL_PASSAGE_PROVENANCE;
  await env.THEOLOGAI_DB.batch([
    env.THEOLOGAI_DB.prepare(`INSERT INTO ubs_parallel_sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      source.sourceId, 'ubs-parallel-passages.v2', source.transformVersion, UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
      source.title, source.publisher, source.copyright, source.license, source.licenseUrl, source.sourceUrl,
      source.sourcePath, source.sourceCommit, source.sourceCommitDate, source.sourceBlob, source.sourceBytes,
      source.sourceSha256, 1, source.modificationNote, 'source_attested_parallel', 'unspecified',
    ),
  ]);
  const requiredGroups = (generatedUbsCorpus as any).groups.filter((group: any) => group.members.some((member: any) =>
    member.normalizedReference === 'Mark 10:19'
      || member.normalizedReference === '2 Kings 18:13'
      || member.normalizedReference === 'Matthew 3:3'
      || member.segments.some((segment: any) => segment.bookNumber === 42 && segment.chapter === 6
        && segment.startVerse <= 35 && segment.endVerse >= 35)));
  for (const group of requiredGroups) {
    await env.THEOLOGAI_DB.batch([
      env.THEOLOGAI_DB.prepare(`INSERT INTO ubs_parallel_groups VALUES (?,?,?,?,?)`).bind(
        group.groupId, source.sourceId, group.sourceOrdinal, group.label, group.directionality,
      ),
      ...group.members.map((member: any) => env.THEOLOGAI_DB.prepare(`INSERT INTO ubs_parallel_members VALUES (?,?,?,?,?,?,?)`).bind(
        group.groupId, member.sourceOrder, member.sourceReference, member.normalizedReference,
        member.languageMarker, member.alignmentBasis, member.alignmentRaw,
      )),
      ...group.members.flatMap((member: any) => member.segments.map((segment: any, index: number) =>
        env.THEOLOGAI_DB.prepare(`INSERT INTO ubs_parallel_segments VALUES (?,?,?,?,?,?,?)`).bind(
          group.groupId, member.sourceOrder, index + 1, segment.bookNumber, segment.chapter, segment.startVerse, segment.endVerse,
        ))),
    ]);
  }
});
