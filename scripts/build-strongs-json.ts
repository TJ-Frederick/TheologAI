#!/usr/bin/env tsx

/**
 * Build Script: Generate Strong's Concordance JSON Files
 *
 * This script downloads OpenScriptures Strong's dictionaries (XML format)
 * and converts them to optimized JSON files for use in the MCP server.
 *
 * Data Source: OpenScriptures Strong's Hebrew and Greek Dictionaries
 * License: Public Domain
 * URL: https://github.com/openscriptures/strongs
 *
 * Usage:
 *   npx tsx scripts/build-strongs-json.ts
 *
 * Output:
 *   data/biblical-languages/strongs-greek.json (~2.5MB)
 *   data/biblical-languages/strongs-hebrew.json (~3MB)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as xml2js from 'xml2js';
import {
  OPENSCRIPTURES_STRONGS,
  deterministicBuildProvenance,
  sourceFile,
} from './biblical-language-sources.js';
import { downloadPinnedSource } from './download-pinned-source.js';
import { publishFilesAtomically } from './atomic-publication.js';

interface StrongsEntry {
  lemma: string;
  translit?: string;
  pronunciation?: string;
  def: string;
  derivation?: string;
}

interface StrongsDatabase {
  [key: string]: StrongsEntry;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.THEOLOGAI_LANGUAGE_OUTPUT_ROOT
  ? path.join(path.resolve(process.env.THEOLOGAI_LANGUAGE_OUTPUT_ROOT), 'biblical-languages')
  : path.join(__dirname, '../data/biblical-languages');
const GREEK_SOURCE = sourceFile(OPENSCRIPTURES_STRONGS, 'strongs-greek-xml');
const HEBREW_SOURCE = sourceFile(OPENSCRIPTURES_STRONGS, 'strongs-hebrew-xml');

// Ensure data directory exists
function ensureDataDirectory(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✓ Created directory: ${DATA_DIR}`);
  }
}

// Parse XML to JSON
async function parseXML(xmlContent: string): Promise<any> {
  const parser = new xml2js.Parser();
  return parser.parseStringPromise(xmlContent);
}

// Process Greek Strong's dictionary
async function processGreekDictionary(): Promise<StrongsDatabase> {
  console.log('\n=== Processing Greek Dictionary ===');
  const bytes = await downloadPinnedSource(GREEK_SOURCE);
  console.log(`✓ Downloaded and verified ${(bytes.length / 1024).toFixed(2)} KB`);
  const xmlContent = bytes.toString('utf8');
  const parsed = await parseXML(xmlContent);

  const database: StrongsDatabase = {};
  const entries = parsed.strongsdictionary?.entries?.[0]?.entry || [];

  for (const entry of entries) {
    const strongsNum = entry.$.strongs;
    const key = `G${parseInt(strongsNum, 10)}`; // Remove leading zeros

    // Extract Greek lemma from greek element
    const greekElement = entry.greek?.[0];
    const lemma = greekElement?.$.unicode || '';
    const translit = greekElement?.$.translit || undefined;

    // Extract pronunciation
    const pronunciationElement = entry.pronunciation?.[0];
    const pronunciation = pronunciationElement?.$.strongs || undefined;

    // Extract definition (clean up any embedded XML)
    let def = entry.strongs_def?.[0] || '';
    if (typeof def === 'object') {
      // Handle complex content with nested elements
      def = JSON.stringify(def);
    }
    def = def.toString().trim();

    // Extract derivation
    let derivation = entry.strongs_derivation?.[0] || undefined;
    if (derivation && typeof derivation === 'object') {
      derivation = JSON.stringify(derivation);
    }
    if (derivation) {
      derivation = derivation.toString().trim();
    }

    database[key] = {
      lemma,
      translit,
      pronunciation,
      def,
      derivation
    };
  }

  console.log(`✓ Processed ${Object.keys(database).length} Greek entries`);
  return database;
}

// Process Hebrew Strong's dictionary (OSIS format)
async function processHebrewDictionary(): Promise<StrongsDatabase> {
  console.log('\n=== Processing Hebrew Dictionary ===');
  const bytes = await downloadPinnedSource(HEBREW_SOURCE);
  console.log(`✓ Downloaded and verified ${(bytes.length / 1024).toFixed(2)} KB`);
  const xmlContent = bytes.toString('utf8');
  const parsed = await parseXML(xmlContent);

  const database: StrongsDatabase = {};
  // OSIS format: osis > osisText > div > div[type="entry"]
  const entries = parsed.osis?.osisText?.[0]?.div?.[0]?.div || [];

  for (const entry of entries) {
    const n = entry.$.n; // Entry number
    const key = `H${parseInt(n, 10)}`;

    // Extract word element with Hebrew lemma
    const wordElement = entry.w?.[0];
    if (!wordElement) continue;

    const lemma = wordElement.$.lemma || '';
    const translit = wordElement.$.xlit || undefined;
    const pronunciation = wordElement.$.POS || undefined;

    // Extract definition from list items
    const listItems = entry.list?.[0]?.item || [];
    const def = listItems.map((item: any) => {
      if (typeof item === 'string') return item;
      return item._;  // Handle objects with _ property
    }).filter(Boolean).join('; ');

    // Extract derivation from notes
    const notes = entry.note || [];
    let derivation: string | undefined;
    for (const note of notes) {
      if (note.$.type === 'exegesis') {
        derivation = typeof note === 'string' ? note : note._;
        break;
      }
    }

    database[key] = {
      lemma,
      translit,
      pronunciation,
      def: def || 'No definition available',
      derivation
    };
  }

  console.log(`✓ Processed ${Object.keys(database).length} Hebrew entries`);
  return database;
}

// Save JSON file
function saveJSON(outputDirectory: string, filename: string, data: unknown): void {
  const filePath = path.join(outputDirectory, filename);
  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonContent, 'utf8');

  const sizeKB = (jsonContent.length / 1024).toFixed(2);
  const sizeMB = (jsonContent.length / 1024 / 1024).toFixed(2);
  console.log(`✓ Saved: ${filename} (${sizeKB} KB / ${sizeMB} MB)`);
}

// Main execution
async function main() {
  console.log('Strong\'s Concordance JSON Builder');
  console.log('===================================\n');
  console.log('Data Source: OpenScriptures Strong\'s Dictionaries');
  console.log('License: Public Domain');
  console.log(`Pinned source: ${OPENSCRIPTURES_STRONGS.commitUrl}\n`);

  let stagingDirectory: string | undefined;
  try {
    ensureDataDirectory();
    stagingDirectory = fs.mkdtempSync(path.join(path.dirname(DATA_DIR), '.strongs-stage-'));

    // Process Greek dictionary
    const greekDatabase = await processGreekDictionary();
    saveJSON(stagingDirectory, 'strongs-greek.json', greekDatabase);

    // Process Hebrew dictionary
    const hebrewDatabase = await processHebrewDictionary();
    saveJSON(stagingDirectory, 'strongs-hebrew.json', hebrewDatabase);

    // Save metadata
    const metadata = {
      version: '1.0.0',
      source: 'OpenScriptures Strong\'s Hebrew and Greek Dictionaries',
      ...deterministicBuildProvenance(
        OPENSCRIPTURES_STRONGS,
        [GREEK_SOURCE, HEBREW_SOURCE],
        { id: 'theologai-strongs-json', version: 1 },
      ),
      license: 'Public Domain',
      attribution: 'Open Scriptures (openscriptures.org)',
      entries: {
        greek: Object.keys(greekDatabase).length,
        hebrew: Object.keys(hebrewDatabase).length,
        total: Object.keys(greekDatabase).length + Object.keys(hebrewDatabase).length
      }
    };

    saveJSON(stagingDirectory, 'strongs-metadata.json', metadata);

    if (metadata.entries.greek !== 5624 || metadata.entries.hebrew !== 8674 || metadata.entries.total !== 14298) {
      throw new Error(`Unexpected Strong's output counts: ${JSON.stringify(metadata.entries)}`);
    }
    if (JSON.stringify([greekDatabase, hebrewDatabase]).includes('\uFFFD')) {
      throw new Error("Staged Strong's output contains a Unicode replacement character");
    }
    for (const filename of ['strongs-greek.json', 'strongs-hebrew.json', 'strongs-metadata.json']) {
      JSON.parse(fs.readFileSync(path.join(stagingDirectory, filename), 'utf8'));
    }
    publishFilesAtomically(
      stagingDirectory,
      DATA_DIR,
      ['strongs-greek.json', 'strongs-hebrew.json', 'strongs-metadata.json'],
    );

    console.log('\n=== Build Complete! ===');
    console.log(`Total entries: ${metadata.entries.total}`);
    console.log(`  Greek: ${metadata.entries.greek}`);
    console.log(`  Hebrew: ${metadata.entries.hebrew}`);
    console.log(`\nFiles created in: ${DATA_DIR}`);

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exitCode = 1;
  } finally {
    if (stagingDirectory) fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

main();
