#!/usr/bin/env tsx

/**
 * Build Script: Parse STEPBible TBESG/TBESH Lexicons
 *
 * Converts STEPBible's TSV lexicon files (TBESG for Greek, TBESH for Hebrew)
 * into JSON format keyed by Strong's numbers for fast lookups.
 *
 * Data Source: STEPBible Data (Tyndale House, Cambridge)
 * License: Creative Commons BY 4.0
 * URL: https://github.com/STEPBible/STEPBible-Data
 *
 * Based on: Abbott-Smith Manual Greek Lexicon (for Greek)
 *           Abridged BDB Hebrew Lexicon (for Hebrew)
 *
 * Usage:
 *   npx tsx scripts/build-stepbible-lexicons.ts
 *
 * Output:
 *   data/biblical-languages/stepbible-lexicons/tbesg-greek.json
 *   data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json
 *   data/biblical-languages/stepbible-lexicons/metadata.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEXICON_DIR = path.join(__dirname, '../data/biblical-languages/stepbible-lexicons');

interface LexiconEntry {
  strongsId: string;          // e.g., "G0025" or "H0430"
  extendedStrongs: string;    // e.g., "G0025" (extended notation)
  lemma: string;              // Greek/Hebrew word
  translit: string;           // Transliteration
  morph: string;              // Morphology code (e.g., "G:V" = Greek Verb)
  gloss: string;              // One-word gloss
  definition: string;         // Full definition (HTML with <BR/>, <ref>, etc.)
  source: string;             // "(AS)" = Abbott-Smith, "(ML)" = Middle Liddell, etc.
}

/**
 * Parse STEPBible TSV lexicon file
 */
function parseLexicon(filePath: string, testament: 'Greek' | 'Hebrew'): Record<string, LexiconEntry> {
  console.log(`\nParsing ${testament} lexicon: ${path.basename(filePath)}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const entries: Record<string, LexiconEntry> = {};
  let dataStarted = false;
  let lineCount = 0;
  let entryCount = 0;

  for (const line of lines) {
    lineCount++;

    // Skip header/metadata lines until we hit actual data
    if (!dataStarted) {
      // Data starts with lines like "G0001" or "H0001"
      if (testament === 'Greek' && line.startsWith('G')) {
        dataStarted = true;
      } else if (testament === 'Hebrew' && line.startsWith('H')) {
        dataStarted = true;
      } else {
        continue;
      }
    }

    // Skip empty lines or comment lines
    if (!line.trim() || line.startsWith('$') || line.startsWith('-')) {
      continue;
    }

    // Parse TSV line
    const fields = line.split('\t');

    // Need at least 7 fields: StrongsID, eStrong, dStrong, Greek/Hebrew, Translit, Morph, Gloss, Definition
    if (fields.length < 7) {
      continue;
    }

    const strongsId = fields[0].trim();
    const extendedStrongs = fields[1].trim();
    const lemma = fields[3].trim();
    const translit = fields[4].trim();
    const morph = fields[5].trim();
    const gloss = fields[6].trim();
    const definition = fields[7] ? fields[7].trim() : '';

    // Only process if we have a valid Strong's ID
    if (!strongsId || !strongsId.match(/^[GH]\d+[a-z]?$/)) {
      continue;
    }

    // Extract base Strong's number (without letter suffixes)
    const baseStrongsMatch = strongsId.match(/^([GH]\d+)/);
    if (!baseStrongsMatch) {
      continue;
    }
    const baseStrongs = baseStrongsMatch[1];

    // Extract source attribution
    let source = 'STEPBible';
    if (definition.includes('(AS)')) {
      source = 'Abbott-Smith';
    } else if (definition.includes('(ML)')) {
      source = 'Middle Liddell';
    } else if (definition.includes('(BDB)')) {
      source = 'Brown-Driver-Briggs';
    }

    const entry: LexiconEntry = {
      strongsId: baseStrongs,
      extendedStrongs: strongsId,
      lemma,
      translit,
      morph,
      gloss,
      definition,
      source
    };

    // Store by base Strong's number
    // If there are multiple entries for the same Strong's number (e.g., G0001G, G0001H),
    // we'll keep the first one for simplicity
    if (!entries[baseStrongs]) {
      entries[baseStrongs] = entry;
      entryCount++;
    }
  }

  console.log(`✓ Parsed ${entryCount} ${testament} lexicon entries from ${lineCount} lines`);
  return entries;
}

/**
 * Main build process
 */
function main() {
  console.log('Building STEPBible lexicon JSON files...\n');

  // Ensure output directory exists
  if (!fs.existsSync(LEXICON_DIR)) {
    fs.mkdirSync(LEXICON_DIR, { recursive: true });
  }

  // Parse Greek lexicon (TBESG)
  const greekFile = path.join(LEXICON_DIR, 'tbesg-greek.txt');
  if (!fs.existsSync(greekFile)) {
    console.error(`ERROR: Greek lexicon file not found: ${greekFile}`);
    console.error('Please download it first from:');
    console.error('https://github.com/STEPBible/STEPBible-Data/tree/master/Lexicons');
    process.exit(1);
  }

  const greekEntries = parseLexicon(greekFile, 'Greek');
  const greekOutput = path.join(LEXICON_DIR, 'tbesg-greek.json');
  fs.writeFileSync(greekOutput, JSON.stringify(greekEntries, null, 2));
  console.log(`✓ Wrote ${greekOutput}`);

  // Parse Hebrew lexicon (TBESH)
  const hebrewFile = path.join(LEXICON_DIR, 'tbesh-hebrew.txt');
  if (!fs.existsSync(hebrewFile)) {
    console.error(`ERROR: Hebrew lexicon file not found: ${hebrewFile}`);
    console.error('Please download it first from:');
    console.error('https://github.com/STEPBible/STEPBible-Data/tree/master/Lexicons');
    process.exit(1);
  }

  const hebrewEntries = parseLexicon(hebrewFile, 'Hebrew');
  const hebrewOutput = path.join(LEXICON_DIR, 'tbesh-hebrew.json');
  fs.writeFileSync(hebrewOutput, JSON.stringify(hebrewEntries, null, 2));
  console.log(`✓ Wrote ${hebrewOutput}`);

  // Write metadata
  const metadata = {
    version: '1.0.0',
    source: 'STEPBible Data (Tyndale House, Cambridge)',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    license: 'CC BY 4.0',
    attribution: 'Tyndale House, Cambridge (www.stepbible.org)',
    build_date: new Date().toISOString(),
    lexicons: {
      greek: {
        name: 'TBESG - Translators Brief Lexicon of Extended Strongs for Greek',
        source: 'Abbott-Smith Manual Greek Lexicon (1922), corrected by Tyndale scholars',
        entries: Object.keys(greekEntries).length,
        file: 'tbesg-greek.json'
      },
      hebrew: {
        name: 'TBESH - Translators Brief Lexicon of Extended Strongs for Hebrew',
        source: 'Abridged Brown-Driver-Briggs Hebrew Lexicon (1906)',
        entries: Object.keys(hebrewEntries).length,
        file: 'tbesh-hebrew.json'
      }
    }
  };

  const metadataOutput = path.join(LEXICON_DIR, 'metadata.json');
  fs.writeFileSync(metadataOutput, JSON.stringify(metadata, null, 2));
  console.log(`✓ Wrote ${metadataOutput}`);

  console.log('\n✓ STEPBible lexicon build complete!');
  console.log(`  Greek entries: ${metadata.lexicons.greek.entries}`);
  console.log(`  Hebrew entries: ${metadata.lexicons.hebrew.entries}`);
  console.log(`  Total: ${metadata.lexicons.greek.entries + metadata.lexicons.hebrew.entries}`);
}

main();
