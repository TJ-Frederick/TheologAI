import { beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

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
        gloss
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('John', 3, 16, 1, 'Οὕτως', 'οὕτως', 'G3779', 'ADV', 'thus'),
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
      JSON.stringify({ topics: ['Trinity', 'Resurrection'] }),
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
});
