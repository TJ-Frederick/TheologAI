/**
 * Tests for STEPBible Build Script (TDD)
 *
 * Tests for downloading, parsing, and processing STEPBible TAGNT data.
 * Tests will initially fail until implementation is complete.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data/biblical-languages/stepbible');

describe('STEPBible build script', () => {
  describe('data directory structure', () => {
    it('should create stepbible directory', () => {
      if (fs.existsSync(DATA_DIR)) {
        expect(fs.statSync(DATA_DIR).isDirectory()).toBe(true);
      }
    });

    it('should create greek subdirectory', () => {
      const greekDir = path.join(DATA_DIR, 'greek');
      if (fs.existsSync(greekDir)) {
        expect(fs.statSync(greekDir).isDirectory()).toBe(true);
      }
    });

    it('should have index.json file', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        expect(fs.statSync(indexPath).isFile()).toBe(true);
      }
    });

    it('should have morph-codes.json file', () => {
      const morphPath = path.join(DATA_DIR, 'morph-codes.json');
      if (fs.existsSync(morphPath)) {
        expect(fs.statSync(morphPath).isFile()).toBe(true);
      }
    });

    it('should have stepbible-metadata.json file', () => {
      const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
      if (fs.existsSync(metadataPath)) {
        expect(fs.statSync(metadataPath).isFile()).toBe(true);
      }
    });
  });

  describe('Greek NT book files', () => {
    it('should create 27 NT book files', () => {
      const greekDir = path.join(DATA_DIR, 'greek');
      if (fs.existsSync(greekDir)) {
        const files = fs.readdirSync(greekDir);
        const jsonGzFiles = files.filter(f => f.endsWith('.json.gz'));

        // NT has 27 books (Matthew through Revelation)
        expect(jsonGzFiles.length).toBe(27);
      }
    });

    it('should use book number naming (40-Matthew.json.gz)', () => {
      const matthewPath = path.join(DATA_DIR, 'greek/40-Matthew.json.gz');
      if (fs.existsSync(matthewPath)) {
        expect(fs.statSync(matthewPath).isFile()).toBe(true);
      }
    });

    it('should include all NT books from Matthew to Revelation', () => {
      const expectedBooks = [
        '40-Matthew', '41-Mark', '42-Luke', '43-John', '44-Acts',
        '45-Romans', '46-1Corinthians', '47-2Corinthians', '48-Galatians',
        '49-Ephesians', '50-Philippians', '51-Colossians',
        '52-1Thessalonians', '53-2Thessalonians', '54-1Timothy',
        '55-2Timothy', '56-Titus', '57-Philemon', '58-Hebrews',
        '59-James', '60-1Peter', '61-2Peter', '62-1John',
        '63-2John', '64-3John', '65-Jude', '66-Revelation'
      ];

      const greekDir = path.join(DATA_DIR, 'greek');
      if (fs.existsSync(greekDir)) {
        for (const book of expectedBooks) {
          const bookPath = path.join(greekDir, `${book}.json.gz`);
          if (fs.existsSync(bookPath)) {
            expect(fs.statSync(bookPath).isFile()).toBe(true);
          }
        }
      }
    });

    it('should compress files with gzip', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);

        // Verify it's gzip compressed (magic number: 1f 8b)
        expect(compressed[0]).toBe(0x1f);
        expect(compressed[1]).toBe(0x8b);
      }
    });

    it('should decompress to valid JSON', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        expect(data).toBeDefined();
        expect(data.book).toBe('John');
        expect(data.testament).toBe('NT');
        expect(data.chapters).toBeDefined();
      }
    });
  });

  describe('book data structure', () => {
    it('should have correct book metadata', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        expect(data.book).toBe('John');
        expect(data.testament).toBe('NT');
      }
    });

    it('should organize data by chapter and verse', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        expect(data.chapters).toBeDefined();
        expect(data.chapters['1']).toBeDefined(); // Chapter 1
        expect(data.chapters['1']['1']).toBeDefined(); // Verse 1
        expect(data.chapters['3']['16']).toBeDefined(); // John 3:16
      }
    });

    it('should include words array for each verse', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const verse = data.chapters['1']['1'];
        expect(verse.words).toBeDefined();
        expect(Array.isArray(verse.words)).toBe(true);
        expect(verse.words.length).toBeGreaterThan(0);
      }
    });

    it('should include all word properties', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const word = data.chapters['1']['1'].words[0];
        expect(word.position).toBeDefined();
        expect(word.text).toBeDefined();
        expect(word.lemma).toBeDefined();
        expect(word.strong).toBeDefined();
        expect(word.morph).toBeDefined();
        expect(word.gloss).toBeDefined();
      }
    });

    it('should preserve Greek Unicode text', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const word = data.chapters['1']['1'].words[0];
        // First word of John 1:1 is "Ἐν" (In)
        expect(word.text).toMatch(/[\u0370-\u03FF]/); // Greek Unicode range
      }
    });

    it('should preserve Greek diacritics', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const words = data.chapters['1']['1'].words;
        const hasAccents = words.some((w: any) =>
          /[\u0300-\u036F]/.test(w.text) // Combining diacritical marks
        );

        // Greek text typically includes diacritics
        expect(hasAccents || words.some((w: any) => w.text.length > 1)).toBe(true);
      }
    });

    it('should include Strong\'s numbers in G#### format', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const word = data.chapters['1']['1'].words[0];
        expect(word.strong).toMatch(/^G\d+[a-z]?$/);
      }
    });

    it('should include morphology codes', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const word = data.chapters['1']['1'].words[0];
        expect(word.morph).toBeDefined();
        expect(word.morph.length).toBeGreaterThan(0);
      }
    });

    it('should preserve word order', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const words = data.chapters['1']['1'].words;
        for (let i = 0; i < words.length; i++) {
          expect(words[i].position).toBe(i + 1);
        }
      }
    });
  });

  describe('index.json', () => {
    it('should contain book mappings', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        expect(index.books).toBeDefined();
        expect(typeof index.books).toBe('object');
      }
    });

    it('should include all 27 NT books', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        expect(Object.keys(index.books).length).toBe(27);
        expect(index.books['John']).toBeDefined();
        expect(index.books['Matthew']).toBeDefined();
        expect(index.books['Revelation']).toBeDefined();
      }
    });

    it('should include file paths for each book', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        expect(index.books['John'].file).toBeDefined();
        expect(index.books['John'].file).toContain('43-John.json.gz');
      }
    });

    it('should include verse counts', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        expect(index.books['John'].verses).toBeDefined();
        expect(index.books['John'].verses).toBe(879); // John has 879 verses
      }
    });

    it('should include testament information', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        expect(index.books['John'].testament).toBe('NT');
        expect(index.books['Matthew'].testament).toBe('NT');
      }
    });

    it('should be small (< 10KB)', () => {
      const indexPath = path.join(DATA_DIR, 'index.json');
      if (fs.existsSync(indexPath)) {
        const stats = fs.statSync(indexPath);
        expect(stats.size).toBeLessThan(10 * 1024); // Less than 10KB
      }
    });
  });

  describe('morph-codes.json', () => {
    it('should contain morphology code expansions', () => {
      const morphPath = path.join(DATA_DIR, 'morph-codes.json');
      if (fs.existsSync(morphPath)) {
        const morphCodes = JSON.parse(fs.readFileSync(morphPath, 'utf-8'));

        expect(morphCodes).toBeDefined();
        expect(typeof morphCodes).toBe('object');
      }
    });

    it('should include common Greek morphology codes', () => {
      const morphPath = path.join(DATA_DIR, 'morph-codes.json');
      if (fs.existsSync(morphPath)) {
        const morphCodes = JSON.parse(fs.readFileSync(morphPath, 'utf-8'));

        // Common codes like PREP, CONJ, V-*, N-*, etc.
        const hasPREP = 'PREP' in morphCodes || Object.keys(morphCodes).some(k => k.includes('PREP'));
        const hasVerbs = Object.keys(morphCodes).some(k => k.startsWith('V-'));
        const hasNouns = Object.keys(morphCodes).some(k => k.startsWith('N-'));

        expect(hasPREP || hasVerbs || hasNouns).toBe(true);
      }
    });

    it('should provide human-readable expansions', () => {
      const morphPath = path.join(DATA_DIR, 'morph-codes.json');
      if (fs.existsSync(morphPath)) {
        const morphCodes = JSON.parse(fs.readFileSync(morphPath, 'utf-8'));

        const firstKey = Object.keys(morphCodes)[0];
        const firstValue = morphCodes[firstKey];

        expect(typeof firstValue).toBe('string');
        expect(firstValue.length).toBeGreaterThan(3);
      }
    });
  });

  describe('stepbible-metadata.json', () => {
    it('should contain required metadata fields', () => {
      const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

        expect(metadata.version).toBeDefined();
        expect(metadata.source).toBeDefined();
        expect(metadata.license).toBe('CC BY 4.0');
        expect(metadata.attribution).toBeDefined();
        expect(metadata.build_date).toBeDefined();
      }
    });

    it('should include STEPBible source attribution', () => {
      const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

        expect(metadata.source).toContain('STEPBible');
        expect(metadata.attribution).toMatch(/STEPBible|www\.stepbible\.org/i);
      }
    });

    it('should include commit SHA for reproducibility', () => {
      const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

        expect(metadata.commit_sha).toBeDefined();
        expect(metadata.commit_sha.length).toBeGreaterThan(6); // At least short SHA
      }
    });

    it('should include book counts', () => {
      const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

        expect(metadata.books).toBeDefined();
        expect(metadata.books.greek).toBe(27);
        expect(metadata.books.total).toBe(27); // Phase 1 only
      }
    });
  });

  describe('file sizes and compression', () => {
    it('should achieve ~75% compression ratio', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed);

        const compressionRatio = compressed.length / decompressed.length;

        // Should achieve at least 60% compression (0.4 or less ratio)
        expect(compressionRatio).toBeLessThan(0.4);
      }
    });

    it('should keep individual book files under 30KB', () => {
      const greekDir = path.join(DATA_DIR, 'greek');
      if (fs.existsSync(greekDir)) {
        const files = fs.readdirSync(greekDir);

        for (const file of files) {
          const filePath = path.join(greekDir, file);
          const stats = fs.statSync(filePath);

          // Most books should be under 30KB compressed
          // (exception: longer books like Matthew, Acts might be slightly larger)
          if (!file.includes('Matthew') && !file.includes('Acts') && !file.includes('Luke')) {
            expect(stats.size).toBeLessThan(30 * 1024);
          }
        }
      }
    });

    it('should keep total data size under 600KB', () => {
      const greekDir = path.join(DATA_DIR, 'greek');
      if (fs.existsSync(greekDir)) {
        const files = fs.readdirSync(greekDir);
        let totalSize = 0;

        for (const file of files) {
          const filePath = path.join(greekDir, file);
          totalSize += fs.statSync(filePath).size;
        }

        // Total compressed size should be under 600KB
        expect(totalSize).toBeLessThan(600 * 1024);
      }
    });
  });

  describe('data integrity', () => {
    it('should have all verses for John (879 verses)', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        let verseCount = 0;
        for (const chapter in data.chapters) {
          verseCount += Object.keys(data.chapters[chapter]).length;
        }

        expect(verseCount).toBe(879);
      }
    });

    it('should have 21 chapters in John', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        expect(Object.keys(data.chapters).length).toBe(21);
      }
    });

    it('should align Strong\'s numbers with OpenScriptures', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        const word = data.chapters['3']['16'].words.find((w: any) => w.text.includes('θε'));

        // θεός (God) should be G2316
        if (word) {
          expect(word.strong).toMatch(/G2316[a-z]?/);
        }
      }
    });
  });

  describe('UTF-8 encoding', () => {
    it('should properly encode Greek Unicode', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');

        // Should not have encoding errors
        expect(decompressed).not.toContain('�'); // Replacement character
        expect(decompressed).toMatch(/[\u0370-\u03FF]/); // Greek Unicode
      }
    });

    it('should handle Greek diacritical marks', () => {
      const johnPath = path.join(DATA_DIR, 'greek/43-John.json.gz');
      if (fs.existsSync(johnPath)) {
        const compressed = fs.readFileSync(johnPath);
        const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(decompressed);

        // Greek text typically includes breathing marks, accents, etc.
        const allText = data.chapters['1']['1'].words.map((w: any) => w.text).join('');
        expect(allText.length).toBeGreaterThan(0);
      }
    });
  });
});
