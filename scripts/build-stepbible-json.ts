#!/usr/bin/env tsx

/**
 * Build Script: Generate STEPBible Data Files
 *
 * Downloads STEPBible TAGNT (Greek NT) data and converts to optimized JSON files
 * for use in the MCP server with morphological analysis.
 *
 * Data Source: STEPBible Data (Translators Amalgamated Greek NT)
 * License: Creative Commons BY 4.0
 * URL: https://github.com/STEPBible/STEPBible-Data
 *
 * Usage:
 *   npx tsx scripts/build-stepbible-json.ts
 *
 * Output:
 *   data/biblical-languages/stepbible/index.json (~5KB)
 *   data/biblical-languages/stepbible/morph-codes.json (~50KB)
 *   data/biblical-languages/stepbible/stepbible-metadata.json
 *   data/biblical-languages/stepbible/greek/*.json.gz (27 files, ~400KB total)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data/biblical-languages/stepbible');
const GREEK_DIR = path.join(DATA_DIR, 'greek');
const HEBREW_DIR = path.join(DATA_DIR, 'hebrew');

// STEPBible TAGNT data URLs (Greek NT - split into two files)
const TAGNT_URLS = [
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt',
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt'
];

// STEPBible TAHOT data URLs (Hebrew OT - split into four files)
const TAHOT_URLS = [
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt'
];

// Book name mappings (book number -> name)
const BOOK_NAMES: Record<string, string> = {
  // Old Testament (01-39)
  '01': 'Genesis', '02': 'Exodus', '03': 'Leviticus', '04': 'Numbers', '05': 'Deuteronomy',
  '06': 'Joshua', '07': 'Judges', '08': 'Ruth', '09': '1Samuel', '10': '2Samuel',
  '11': '1Kings', '12': '2Kings', '13': '1Chronicles', '14': '2Chronicles',
  '15': 'Ezra', '16': 'Nehemiah', '17': 'Esther', '18': 'Job', '19': 'Psalms',
  '20': 'Proverbs', '21': 'Ecclesiastes', '22': 'SongOfSolomon', '23': 'Isaiah',
  '24': 'Jeremiah', '25': 'Lamentations', '26': 'Ezekiel', '27': 'Daniel',
  '28': 'Hosea', '29': 'Joel', '30': 'Amos', '31': 'Obadiah', '32': 'Jonah',
  '33': 'Micah', '34': 'Nahum', '35': 'Habakkuk', '36': 'Zephaniah',
  '37': 'Haggai', '38': 'Zechariah', '39': 'Malachi',
  // New Testament (40-66)
  '40': 'Matthew', '41': 'Mark', '42': 'Luke', '43': 'John', '44': 'Acts',
  '45': 'Romans', '46': '1Corinthians', '47': '2Corinthians', '48': 'Galatians',
  '49': 'Ephesians', '50': 'Philippians', '51': 'Colossians',
  '52': '1Thessalonians', '53': '2Thessalonians', '54': '1Timothy',
  '55': '2Timothy', '56': 'Titus', '57': 'Philemon', '58': 'Hebrews',
  '59': 'James', '60': '1Peter', '61': '2Peter', '62': '1John',
  '63': '2John', '64': '3John', '65': 'Jude', '66': 'Revelation'
};

// Book abbreviation mappings for STEPBible format
const BOOK_ABBREV: Record<string, string> = {
  // Old Testament
  'Gen': '01', 'Exo': '02', 'Lev': '03', 'Num': '04', 'Deu': '05',
  'Jos': '06', 'Jdg': '07', 'Rut': '08', '1Sa': '09', '2Sa': '10',
  '1Ki': '11', '2Ki': '12', '1Ch': '13', '2Ch': '14',
  'Ezr': '15', 'Neh': '16', 'Est': '17', 'Job': '18', 'Psa': '19',
  'Pro': '20', 'Ecc': '21', 'Sng': '22', 'Isa': '23',
  'Jer': '24', 'Lam': '25', 'Ezk': '26', 'Dan': '27',
  'Hos': '28', 'Jol': '29', 'Amo': '30', 'Oba': '31', 'Jon': '32',
  'Mic': '33', 'Nam': '34', 'Hab': '35', 'Zep': '36',
  'Hag': '37', 'Zec': '38', 'Mal': '39',
  // New Testament
  'Mat': '40', 'Mrk': '41', 'Luk': '42', 'Jhn': '43', 'Act': '44',
  'Rom': '45', '1Co': '46', '2Co': '47', 'Gal': '48', 'Eph': '49',
  'Php': '50', 'Col': '51', '1Th': '52', '2Th': '53', '1Ti': '54',
  '2Ti': '55', 'Tit': '56', 'Phm': '57', 'Heb': '58', 'Jas': '59',
  '1Pe': '60', '2Pe': '61', '1Jn': '62', '2Jn': '63', '3Jn': '64',
  'Jud': '65', 'Rev': '66'
};

interface VerseWord {
  position: number;
  text: string;
  lemma: string;
  strong: string;
  strongExtended?: string;
  morph: string;
  gloss: string;
}

interface VerseData {
  words: VerseWord[];
}

interface BookData {
  book: string;
  testament: 'NT' | 'OT';
  chapters: Record<string, Record<string, VerseData>>;
}

interface StepBibleIndex {
  books: Record<string, {
    file: string;
    verses: number;
    testament: 'NT' | 'OT';
  }>;
}

// Ensure directories exist
function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✓ Created directory: ${DATA_DIR}`);
  }
  if (!fs.existsSync(GREEK_DIR)) {
    fs.mkdirSync(GREEK_DIR, { recursive: true });
    console.log(`✓ Created directory: ${GREEK_DIR}`);
  }
  if (!fs.existsSync(HEBREW_DIR)) {
    fs.mkdirSync(HEBREW_DIR, { recursive: true });
    console.log(`✓ Created directory: ${HEBREW_DIR}`);
  }
}

// Download file from URL
function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`Following redirect to: ${redirectUrl}`);
          return downloadFile(redirectUrl).then(resolve).catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        console.log(`✓ Downloaded ${(data.length / 1024).toFixed(2)} KB`);
        resolve(data);
      });
    }).on('error', reject);
  });
}

// Parse TSV data (works for both TAGNT and TAHOT)
function parseSTEPBibleData(tsvContent: string, testament: 'NT' | 'OT'): Map<string, BookData> {
  const lines = tsvContent.split('\n');
  const books = new Map<string, BookData>();
  const morphCodes = new Set<string>();

  console.log(`\nParsing STEPBible ${testament} data (${lines.length} lines)...`);

  // Find header line (looks for "Word & Type" or "Eng (Heb) Ref & Type" column header)
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for Greek NT header (TAGNT)
    if (line.includes('Word & Type') && line.includes('Greek') && line.includes('translation')) {
      headerIndex = i;
      break;
    }
    // Check for Hebrew OT header (TAHOT)
    if (line.includes('Eng (Heb) Ref & Type') && line.includes('Hebrew') && line.includes('Translation')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === 0) {
    throw new Error('Could not find column header line in TSV file');
  }

  const headers = lines[headerIndex].split('\t').map(h => h.trim());
  console.log(`Headers found at line ${headerIndex}: ${headers.length} columns`);
  console.log(`First few headers: ${headers.slice(0, 6).join(', ')}`);

  // Column structure differs by testament:
  //
  // TAGNT (Greek NT):
  // 0: Word & Type (Mat.1.1#01)
  // 1: Greek (Βίβλος)
  // 2: English translation
  // 3: dStrongs = Grammar (G0976=N-NSF)
  // 4: Dictionary form = Gloss (βίβλος=book)
  //
  // TAHOT (Hebrew OT):
  // 0: Eng (Heb) Ref & Type (Gen.1.1#01=L)
  // 1: Hebrew (בְּ/רֵאשִׁ֖ית)
  // 2: Transliteration (be./re.Shit)
  // 3: Translation (in/ beginning)
  // 4: dStrongs ({H7225G} or H9003/{H7225G})
  // 5: Grammar (HR/Ncfsa)
  //
  const colRef = 0;
  const colText = 1;     // "Greek" for NT, "Hebrew" for OT
  const colTranslit = testament === 'NT' ? -1 : 2;  // TAHOT only
  const colEnglish = testament === 'NT' ? 2 : 3;    // Translation column
  const colStrongGrammar = testament === 'NT' ? 3 : 4;  // dStrongs column
  const colGrammar = testament === 'NT' ? -1 : 5;   // Grammar column (TAHOT only)
  const colDictGloss = testament === 'NT' ? 4 : -1;  // Dictionary (TAGNT only)

  console.log(`Column mapping: ref=${colRef}, text=${colText}, english=${colEnglish}, strong+grammar=${colStrongGrammar}, dict+gloss=${colDictGloss}, grammar=${colGrammar}`);

  let wordCount = 0;
  let currentBook = '';
  let currentChapter = '';
  let currentVerse = '';
  let currentPosition = 0;

  // Process data lines
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('$')) continue;

    const fields = line.split('\t');
    if (fields.length < 6) continue;

    // Column 0: "Word & Type" format: "Mat.1.1#01=NKO"
    const wordAndType = fields[colRef]?.trim();
    if (!wordAndType || wordAndType.startsWith('#')) continue;

    // Parse reference from "Mat.1.1#01=NKO"
    const refMatch = wordAndType.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)/);
    if (!refMatch) continue;

    const bookAbbr = refMatch[1];
    const chapter = refMatch[2];
    const verse = refMatch[3];

    // Map abbreviation to book number using lookup table
    const bookNum = BOOK_ABBREV[bookAbbr];

    if (!bookNum || !BOOK_NAMES[bookNum]) continue;

    const bookName = BOOK_NAMES[bookNum];

    // Initialize book if needed
    if (!books.has(bookName)) {
      books.set(bookName, {
        book: bookName,
        testament,
        chapters: {}
      });
    }

    const book = books.get(bookName)!;

    // Initialize chapter if needed
    if (!book.chapters[chapter]) {
      book.chapters[chapter] = {};
    }

    // Initialize verse if needed or changed
    if (currentBook !== bookName || currentChapter !== chapter || currentVerse !== verse) {
      currentBook = bookName;
      currentChapter = chapter;
      currentVerse = verse;
      currentPosition = 0;

      if (!book.chapters[chapter][verse]) {
        book.chapters[chapter][verse] = { words: [] };
      }
    }

    currentPosition++;

    // Extract word data from columns
    // Column 1: "Greek" (NT) or "Hebrew" (OT) - may have transliteration in parens
    const textField = fields[colText]?.trim() || '';
    const textMatch = textField.match(/^([^\(]+)/);
    const text = textMatch ? textMatch[1].trim() : textField;

    // Column 2: "English translation" - "[The] book"
    const gloss = fields[colEnglish]?.trim() || '';

    // Column 3: "dStrongs = Grammar"
    // Format differs by testament:
    //   - Greek TAGNT: "G0976=N-NSF" (Strong=Morph)
    //   - Hebrew TAHOT: "{H1254A}" or "H9003/{H7225G}" (root in braces, morph in next column)
    const strongGrammar = fields[colStrongGrammar]?.trim() || '';

    let strong = '';
    let morph = '';

    if (testament === 'NT') {
      // Greek: extract from "G0976=N-NSF" format
      const sgMatch = strongGrammar.match(/([GH]\d+[a-z]?)=([A-Z-]+)/);
      strong = sgMatch ? sgMatch[1] : '';
      morph = sgMatch ? sgMatch[2] : '';
    } else {
      // Hebrew: extract primary root from curly braces
      // Examples:
      //   "{H1254A}" → H1254
      //   "H9003/{H7225G}" → H7225
      //   "H9002/H9009/{H0776G}" → H0776

      // Match content within curly braces: {H####} or {H####Letter}
      const braceMatch = strongGrammar.match(/\{([HG]\d+)[A-Z]?\}/);
      if (braceMatch) {
        strong = braceMatch[1]; // Strip letter suffixes (A, G, etc.)
      }

      // Hebrew morphology is in the Grammar column (column 5 in TAHOT)
      // Format: "HVqp3ms" (always starts with H for Hebrew)
      const grammarField = fields[colGrammar]?.trim() || '';
      if (grammarField && grammarField.startsWith('H')) {
        morph = grammarField; // e.g., "HVqp3ms", "HNcmpa"
      }
    }

    // Column 4: "Dictionary form = Gloss" - "βίβλος=book"
    const dictGloss = fields[colDictGloss]?.trim() || '';
    const dgMatch = dictGloss.match(/^([^=]+)=/);
    const lemma = dgMatch ? dgMatch[1].trim() : '';

    // Track morphology codes
    if (morph) {
      morphCodes.add(morph);
    }

    const word: VerseWord = {
      position: currentPosition,
      text,
      lemma,
      strong,
      morph,
      gloss
    };

    // Add extended Strong's if present (e.g., G1722a)
    if (strong.match(/[a-z]$/)) {
      word.strongExtended = strong;
      word.strong = strong.replace(/[a-z]$/, '');
    }

    book.chapters[chapter][verse].words.push(word);
    wordCount++;

    if (wordCount % 10000 === 0) {
      console.log(`  Processed ${wordCount} words...`);
    }
  }

  console.log(`✓ Parsed ${wordCount} words from ${books.size} books`);
  console.log(`✓ Found ${morphCodes.size} unique morphology codes`);

  return books;
}

// Generate morphology expansion table
function generateMorphologyExpansions(): Record<string, string> {
  // Robinson's morphology codes for Greek
  const expansions: Record<string, string> = {
    // Part of speech codes
    'PREP': 'Preposition',
    'CONJ': 'Conjunction',
    'ADV': 'Adverb',
    'PRT': 'Particle',
    'INJ': 'Interjection',
    'ARAM': 'Aramaic',
    'HEB': 'Hebrew',

    // Noun cases
    'N-NSM': 'Noun, Nominative, Singular, Masculine',
    'N-GSM': 'Noun, Genitive, Singular, Masculine',
    'N-DSM': 'Noun, Dative, Singular, Masculine',
    'N-ASM': 'Noun, Accusative, Singular, Masculine',
    'N-VSM': 'Noun, Vocative, Singular, Masculine',

    'N-NSF': 'Noun, Nominative, Singular, Feminine',
    'N-GSF': 'Noun, Genitive, Singular, Feminine',
    'N-DSF': 'Noun, Dative, Singular, Feminine',
    'N-ASF': 'Noun, Accusative, Singular, Feminine',

    'N-NSN': 'Noun, Nominative, Singular, Neuter',
    'N-GSN': 'Noun, Genitive, Singular, Neuter',
    'N-DSN': 'Noun, Dative, Singular, Neuter',
    'N-ASN': 'Noun, Accusative, Singular, Neuter',

    // Add more common patterns...
  };

  // Generate pattern-based rules for codes not in the table
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^N-([NGDAV])([SP])([MFN])$/, (m) => {
      const cases = { N: 'Nominative', G: 'Genitive', D: 'Dative', A: 'Accusative', V: 'Vocative' };
      const numbers = { S: 'Singular', P: 'Plural' };
      const genders = { M: 'Masculine', F: 'Feminine', N: 'Neuter' };
      return `Noun, ${cases[m[1] as keyof typeof cases]}, ${numbers[m[2] as keyof typeof numbers]}, ${genders[m[3] as keyof typeof genders]}`;
    }],
    [/^V-([A-Z]{3})-([123])([SP])$/, (m) => {
      const persons = { '1': '1st person', '2': '2nd person', '3': '3rd person' };
      const numbers = { S: 'Singular', P: 'Plural' };
      return `Verb, ${m[1]}, ${persons[m[2] as keyof typeof persons]}, ${numbers[m[3] as keyof typeof numbers]}`;
    }]
  ];

  return expansions;
}

// Compress and save book data
function saveBook(bookName: string, bookNum: string, bookData: BookData): void {
  const testament = bookData.testament;
  const dir = testament === 'NT' ? GREEK_DIR : HEBREW_DIR;
  const subdir = testament === 'NT' ? 'greek' : 'hebrew';
  const filename = `${bookNum}-${bookName}.json.gz`;
  const filepath = path.join(dir, filename);

  const json = JSON.stringify(bookData, null, 0); // No whitespace for compression
  const compressed = zlib.gzipSync(json, { level: 9 });

  fs.writeFileSync(filepath, compressed);

  const originalSize = (json.length / 1024).toFixed(2);
  const compressedSize = (compressed.length / 1024).toFixed(2);
  const ratio = ((compressed.length / json.length) * 100).toFixed(1);

  console.log(`  ✓ ${bookName}: ${compressedSize} KB (${ratio}% of ${originalSize} KB)`);
}

// Generate index file
function generateIndex(books: Map<string, BookData>): void {
  const index: StepBibleIndex = { books: {} };

  for (const [bookNum, bookName] of Object.entries(BOOK_NAMES)) {
    const bookData = books.get(bookName);
    if (!bookData) continue;

    let verseCount = 0;
    for (const chapter of Object.values(bookData.chapters)) {
      verseCount += Object.keys(chapter).length;
    }

    const subdir = bookData.testament === 'NT' ? 'greek' : 'hebrew';
    index.books[bookName] = {
      file: `${subdir}/${bookNum}-${bookName}.json.gz`,
      verses: verseCount,
      testament: bookData.testament
    };
  }

  const indexPath = path.join(DATA_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`✓ Generated index.json (${Object.keys(index.books).length} books)`);
}

// Generate metadata file
function generateMetadata(greekBooks: Map<string, BookData>, hebrewBooks: Map<string, BookData>): void {
  const metadata = {
    version: '1.0.0',
    source: 'STEPBible Data - Translators Amalgamated OT+NT',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    commit_sha: 'master', // Will be updated when we pin a specific commit
    license: 'CC BY 4.0',
    attribution: 'STEP Bible (www.stepbible.org)',
    build_date: new Date().toISOString(),
    books: {
      greek: greekBooks.size,
      hebrew: hebrewBooks.size,
      total: greekBooks.size + hebrewBooks.size
    }
  };

  const metadataPath = path.join(DATA_DIR, 'stepbible-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`✓ Generated stepbible-metadata.json`);
}

// Combine multiple TSV files into one (skipping headers)
function combineTsvFiles(tsvParts: string[]): string {
  if (tsvParts.length === 0) return '';
  if (tsvParts.length === 1) return tsvParts[0];

  const result: string[] = [tsvParts[0]];

  for (let i = 1; i < tsvParts.length; i++) {
    const lines = tsvParts[i].split('\n');
    let dataStartIndex = 0;

    // Find where data starts (skip header)
    for (let j = 0; j < lines.length; j++) {
      if (!lines[j].startsWith('#') && lines[j].trim().length > 0) {
        dataStartIndex = j + 1; // Skip header line
        break;
      }
    }

    result.push(lines.slice(dataStartIndex).join('\n'));
  }

  return result.join('\n');
}

// Main execution
async function main() {
  console.log('STEPBible Data Builder');
  console.log('=====================\n');
  console.log('Data Source: STEPBible TAGNT (Greek NT) + TAHOT (Hebrew OT)');
  console.log('License: Creative Commons BY 4.0');
  console.log('URL: https://github.com/STEPBible/STEPBible-Data\n');

  try {
    ensureDirectories();

    // Download and process Greek NT (TAGNT)
    console.log('=== Processing Greek NT (TAGNT) ===\n');
    console.log(`Downloading TAGNT data (${TAGNT_URLS.length} files)...`);
    const tagntParts: string[] = [];
    for (let i = 0; i < TAGNT_URLS.length; i++) {
      console.log(`  File ${i + 1}/${TAGNT_URLS.length}...`);
      const content = await downloadFile(TAGNT_URLS[i]);
      tagntParts.push(content);
    }

    console.log('Combining TAGNT files...');
    const tagntTsv = combineTsvFiles(tagntParts);
    console.log(`✓ Combined ${tagntTsv.split('\n').length} lines`);

    console.log('Parsing TAGNT data...');
    const greekBooks = parseSTEPBibleData(tagntTsv, 'NT');

    // Download and process Hebrew OT (TAHOT)
    console.log('\n=== Processing Hebrew OT (TAHOT) ===\n');
    console.log(`Downloading TAHOT data (${TAHOT_URLS.length} files)...`);
    const tahotParts: string[] = [];
    for (let i = 0; i < TAHOT_URLS.length; i++) {
      console.log(`  File ${i + 1}/${TAHOT_URLS.length}...`);
      const content = await downloadFile(TAHOT_URLS[i]);
      tahotParts.push(content);
    }

    console.log('Combining TAHOT files...');
    const tahotTsv = combineTsvFiles(tahotParts);
    console.log(`✓ Combined ${tahotTsv.split('\n').length} lines`);

    console.log('Parsing TAHOT data...');
    const hebrewBooks = parseSTEPBibleData(tahotTsv, 'OT');

    // Merge both datasets
    const allBooks = new Map([...greekBooks, ...hebrewBooks]);

    // Save each book as compressed JSON
    console.log('\n=== Saving Book Files ===\n');
    for (const [bookNum, bookName] of Object.entries(BOOK_NAMES)) {
      const bookData = allBooks.get(bookName);
      if (bookData) {
        saveBook(bookName, bookNum, bookData);
      }
    }

    // Generate morphology expansions
    console.log('\nGenerating morphology expansions...');
    const morphExpansions = generateMorphologyExpansions();
    const morphPath = path.join(DATA_DIR, 'morph-codes.json');
    fs.writeFileSync(morphPath, JSON.stringify(morphExpansions, null, 2));
    console.log(`✓ Generated morph-codes.json (${Object.keys(morphExpansions).length} codes)`);

    // Generate index
    console.log('\nGenerating index...');
    generateIndex(allBooks);

    // Generate metadata
    console.log('Generating metadata...');
    generateMetadata(greekBooks, hebrewBooks);

    // Calculate total size
    let totalSize = 0;
    for (const dir of [GREEK_DIR, HEBREW_DIR]) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          totalSize += fs.statSync(path.join(dir, file)).size;
        }
      }
    }

    console.log('\n=== Build Complete! ===');
    console.log(`Greek NT Books: ${greekBooks.size}`);
    console.log(`Hebrew OT Books: ${hebrewBooks.size}`);
    console.log(`Total Books: ${allBooks.size}`);
    console.log(`Total compressed size: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`Files created in: ${DATA_DIR}`);
    console.log('\nAttribution: STEP Bible (www.stepbible.org)');
    console.log('License: Creative Commons BY 4.0');

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

main();
