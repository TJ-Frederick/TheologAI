import { createHash } from 'node:crypto';
import { BIBLE_BOOKS } from '../src/kernel/books.js';
import type { DataManifestFile } from './d1-corpus-identity.js';

export const MORPHOLOGY_USAGE_IDENTITY_VERSION = 1;
export const MORPHOLOGY_USAGE_TRANSFORM_VERSION = 1;

export interface MorphologyUsageIdentityManifest {
  files: DataManifestFile[];
}

export interface MorphologyUsageCanonicalBook {
  number: number;
  stepbibleId: string;
  testament: 'OT' | 'NT';
}

export interface MorphologyUsageIdentityProjection {
  identityVersion: number;
  transformVersion: number;
  hashAlgorithm: 'sha256';
  canonicalBooks: Array<{ number: number; stepbibleId: string }>;
  morphologyArtifacts: Array<{
    bookOrder: number;
    stepbibleId: string;
    path: string;
    sha256: string;
  }>;
  hebrewLemmaSource: DataManifestFile;
  semantics: {
    occurrenceRows: {
      version: number;
      primaryKey: string[];
      columns: string[];
      strongsFilter: string;
      bookOrder: string;
      lemma: {
        greek: string;
        hebrew: string;
      };
      duplicatePolicy: string;
    };
    aggregates: {
      version: number;
      verseIdentity: string[];
      usageStats: Record<string, string>;
      bookStats: Record<string, string>;
      formStats: Record<string, string>;
    };
    keyset: {
      version: number;
      cursorWireVersion: number;
      order: string[];
      predicate: string;
      pageBoundary: string;
      minimumVerse: number;
      cursorBinding: string[];
    };
  };
}

const SHA256 = /^[a-f0-9]{64}$/u;
const HEBREW_LEMMA_SOURCE_PATH = 'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json';

/**
 * Canonical projection for public morphology-usage results and cursors.
 *
 * Deliberately independent of the whole D1 materialization identity: schema,
 * migrations, unrelated corpora, and table counts cannot stale an occurrence
 * cursor unless this scoped result contract or one of its source inputs changes.
 */
export function buildMorphologyUsageIdentityProjection(
  manifest: MorphologyUsageIdentityManifest,
  books: readonly MorphologyUsageCanonicalBook[] = BIBLE_BOOKS,
): MorphologyUsageIdentityProjection {
  const canonicalBooks = validateCanonicalBooks(books);
  const files = indexManifestFiles(manifest.files);
  const morphologyArtifacts = canonicalBooks.map(book => {
    const path = morphologyArtifactPath(book);
    const file = requiredFile(files, path);
    return {
      bookOrder: book.number,
      stepbibleId: book.stepbibleId,
      path,
      sha256: file.sha256,
    };
  });
  const hebrewLemmaSource = requiredFile(files, HEBREW_LEMMA_SOURCE_PATH);

  return {
    identityVersion: MORPHOLOGY_USAGE_IDENTITY_VERSION,
    transformVersion: MORPHOLOGY_USAGE_TRANSFORM_VERSION,
    hashAlgorithm: 'sha256',
    canonicalBooks: canonicalBooks.map(({ number, stepbibleId }) => ({ number, stepbibleId })),
    morphologyArtifacts,
    hebrewLemmaSource: { ...hebrewLemmaSource },
    semantics: {
      occurrenceRows: {
        version: 1,
        primaryKey: ['book', 'chapter', 'verse', 'position'],
        columns: [
          'book',
          'book_order',
          'chapter',
          'verse',
          'position',
          'word_text',
          'lemma',
          'strongs_number',
          'morph_code',
          'gloss',
        ],
        strongsFilter: "strongs_number IS NOT NULL AND strongs_number <> ''",
        bookOrder: 'canonicalBooks.number selected by exact artifact book stepbibleId',
        lemma: {
          greek: 'preserve a nonblank artifact token lemma; otherwise use an empty string',
          hebrew: 'preserve a nonblank artifact token lemma; otherwise use the trimmed tbesh-hebrew lemma for the normalized exact Strong\'s morphology key when available; otherwise use an empty string',
        },
        duplicatePolicy: 'first row for the occurrence primary key is retained',
      },
      aggregates: {
        version: 1,
        verseIdentity: ['book_order', 'chapter', 'verse'],
        usageStats: {
          token_count: 'raw filtered occurrence count by exact Strong\'s identity',
          verse_count: 'distinct verseIdentity count by exact Strong\'s identity',
          book_count: 'distinct book_order count by exact Strong\'s identity',
          form_count: 'distinct exact word_text count by exact Strong\'s identity',
        },
        bookStats: {
          grouping: 'exact Strong\'s identity, book, book_order',
          token_count: 'raw filtered occurrence count',
          verse_count: 'distinct verseIdentity count',
          order: 'book_order ascending',
        },
        formStats: {
          grouping: 'exact Strong\'s identity and exact word_text; punctuation and diacritics are significant',
          token_count: 'raw filtered occurrence count',
          verse_count: 'distinct verseIdentity count',
          first_occurrence: 'minimum book_order, chapter, verse, position tuple',
          order: 'token_count descending, verse_count descending, form_text ascending',
        },
      },
      keyset: {
        version: 1,
        cursorWireVersion: 1,
        order: ['book_order ASC', 'chapter ASC', 'verse ASC', 'position ASC'],
        predicate: '(book_order, chapter, verse, position) > cursor.after',
        pageBoundary: 'fetch limit + 1; emit the last returned tuple only when another row exists',
        minimumVerse: 0,
        cursorBinding: ['morphologyUsageIdentity', 'exactMorphologyKey'],
      },
    },
  };
}

export function computeMorphologyUsageIdentity(
  manifest: MorphologyUsageIdentityManifest,
  books: readonly MorphologyUsageCanonicalBook[] = BIBLE_BOOKS,
): string {
  return createHash('sha256')
    .update(JSON.stringify(buildMorphologyUsageIdentityProjection(manifest, books)))
    .digest('hex');
}

function validateCanonicalBooks(
  books: readonly MorphologyUsageCanonicalBook[],
): MorphologyUsageCanonicalBook[] {
  if (books.length !== 66) throw new Error(`Morphology usage identity requires 66 canonical books; received ${books.length}`);
  const stepbibleIds = new Set<string>();
  return books.map((book, index) => {
    if (book.number !== index + 1 || !/^[1-3]?[A-Za-z]+$/u.test(book.stepbibleId)
      || (book.testament !== 'OT' && book.testament !== 'NT') || stepbibleIds.has(book.stepbibleId)) {
      throw new Error(`Invalid canonical morphology book at position ${index + 1}`);
    }
    if ((book.number <= 39) !== (book.testament === 'OT')) {
      throw new Error(`Invalid testament for canonical morphology book ${book.number}`);
    }
    stepbibleIds.add(book.stepbibleId);
    return { number: book.number, stepbibleId: book.stepbibleId, testament: book.testament };
  });
}

function indexManifestFiles(files: readonly DataManifestFile[]): Map<string, DataManifestFile> {
  const indexed = new Map<string, DataManifestFile>();
  for (const file of files) {
    if (indexed.has(file.path)) throw new Error(`Duplicate manifest path: ${file.path}`);
    indexed.set(file.path, file);
  }
  return indexed;
}

function requiredFile(files: ReadonlyMap<string, DataManifestFile>, path: string): DataManifestFile {
  const file = files.get(path);
  if (!file || !SHA256.test(file.sha256)) {
    throw new Error(`Missing or invalid morphology usage source: ${path}`);
  }
  return file;
}

function morphologyArtifactPath(book: MorphologyUsageCanonicalBook): string {
  const testament = book.testament === 'OT' ? 'hebrew' : 'greek';
  return `data/biblical-languages/stepbible/${testament}/${String(book.number).padStart(2, '0')}-${book.stepbibleId}.json.gz`;
}
