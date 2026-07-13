import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export interface StrongsDriftRecord {
  identity: string;
  field: string;
  tracked: unknown;
  reproduced: unknown;
  trackedReplacementCharacters: number;
  reproducedReplacementCharacters: number;
}

export interface MorphologyDriftRecord {
  path: string;
  book: string;
  chapter: string;
  verse: string;
  position: number;
  field: string;
  strong: string;
  morph: string;
  tracked: unknown;
  reproduced: unknown;
  trackedReplacementCharacters: number;
  reproducedReplacementCharacters: number;
}

export interface SemanticDriftReport {
  structuralIssues: string[];
  strongs: {
    records: StrongsDriftRecord[];
    entries: number;
    fields: number;
    replacementBearingFields: number;
    trackedReplacementCharacters: number;
    reproducedReplacementCharacters: number;
  };
  morphology: {
    records: MorphologyDriftRecord[];
    files: number;
    tokenFields: number;
    replacementBearingFields: number;
    trackedReplacementCharacters: number;
    reproducedReplacementCharacters: number;
  };
  inventorySha256: string;
}

function replacements(value: unknown): number {
  return typeof value === 'string' ? [...value].filter(character => character === '\uFFFD').length : 0;
}

function sameKeys(left: object, right: object, label: string, issues: string[]): string[] {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) issues.push(`${label} key inventory differs`);
  return [...new Set([...leftKeys, ...rightKeys])].sort();
}

function readGzipJson(path: string): any {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
}

export function computeBiblicalLanguageSemanticDrift(
  trackedRoot: string,
  reproducedRoot: string,
): SemanticDriftReport {
  const structuralIssues: string[] = [];
  const strongsRecords: StrongsDriftRecord[] = [];
  for (const filename of ['strongs-greek.json', 'strongs-hebrew.json']) {
    const tracked = JSON.parse(readFileSync(join(trackedRoot, filename), 'utf8')) as Record<string, Record<string, unknown>>;
    const reproduced = JSON.parse(readFileSync(join(reproducedRoot, filename), 'utf8')) as Record<string, Record<string, unknown>>;
    for (const identity of sameKeys(tracked, reproduced, filename, structuralIssues)) {
      const left = tracked[identity];
      const right = reproduced[identity];
      if (!left || !right) continue;
      for (const field of sameKeys(left, right, `${filename}/${identity}`, structuralIssues)) {
        if (left[field] === right[field]) continue;
        strongsRecords.push({
          identity,
          field,
          tracked: left[field],
          reproduced: right[field],
          trackedReplacementCharacters: replacements(left[field]),
          reproducedReplacementCharacters: replacements(right[field]),
        });
      }
    }
  }

  const morphologyRecords: MorphologyDriftRecord[] = [];
  for (const testament of ['greek', 'hebrew']) {
    const trackedDirectory = join(trackedRoot, 'stepbible', testament);
    const reproducedDirectory = join(reproducedRoot, 'stepbible', testament);
    const trackedFiles = readdirSync(trackedDirectory).filter(file => file.endsWith('.json.gz')).sort();
    const reproducedFiles = readdirSync(reproducedDirectory).filter(file => file.endsWith('.json.gz')).sort();
    if (JSON.stringify(trackedFiles) !== JSON.stringify(reproducedFiles)) {
      structuralIssues.push(`${testament} morphology file inventory differs`);
    }
    for (const filename of [...new Set([...trackedFiles, ...reproducedFiles])].sort()) {
      if (!trackedFiles.includes(filename) || !reproducedFiles.includes(filename)) continue;
      const tracked = readGzipJson(join(trackedDirectory, filename));
      const reproduced = readGzipJson(join(reproducedDirectory, filename));
      if (tracked.book !== reproduced.book || tracked.testament !== reproduced.testament) {
        structuralIssues.push(`${testament}/${filename} book metadata differs`);
      }
      for (const chapter of sameKeys(tracked.chapters, reproduced.chapters, `${testament}/${filename}/chapters`, structuralIssues)) {
        const leftChapter = tracked.chapters[chapter];
        const rightChapter = reproduced.chapters[chapter];
        if (!leftChapter || !rightChapter) continue;
        for (const verse of sameKeys(leftChapter, rightChapter, `${testament}/${filename}/${chapter}`, structuralIssues)) {
          const leftWords = leftChapter[verse]?.words;
          const rightWords = rightChapter[verse]?.words;
          if (!Array.isArray(leftWords) || !Array.isArray(rightWords) || leftWords.length !== rightWords.length) {
            structuralIssues.push(`${testament}/${filename}/${chapter}:${verse} word inventory differs`);
            continue;
          }
          for (let index = 0; index < leftWords.length; index++) {
            const left = leftWords[index] as Record<string, unknown>;
            const right = rightWords[index] as Record<string, unknown>;
            if (left.position !== right.position || typeof left.position !== 'number') {
              structuralIssues.push(`${testament}/${filename}/${chapter}:${verse} word ${index} position differs`);
            }
            for (const field of sameKeys(left, right, `${testament}/${filename}/${chapter}:${verse}#${index}`, structuralIssues)) {
              if (left[field] === right[field]) continue;
              morphologyRecords.push({
                path: `data/biblical-languages/stepbible/${testament}/${filename}`,
                book: String(tracked.book),
                chapter,
                verse,
                position: Number(left.position),
                field,
                strong: String(left.strong ?? ''),
                morph: String(left.morph ?? ''),
                tracked: left[field],
                reproduced: right[field],
                trackedReplacementCharacters: replacements(left[field]),
                reproducedReplacementCharacters: replacements(right[field]),
              });
            }
          }
        }
      }
    }
  }

  strongsRecords.sort((left, right) => `${left.identity}/${left.field}`.localeCompare(`${right.identity}/${right.field}`));
  morphologyRecords.sort((left, right) => (
    `${left.path}/${left.chapter.padStart(3, '0')}/${left.verse.padStart(3, '0')}/${String(left.position).padStart(3, '0')}/${left.field}`
      .localeCompare(`${right.path}/${right.chapter.padStart(3, '0')}/${right.verse.padStart(3, '0')}/${String(right.position).padStart(3, '0')}/${right.field}`)
  ));
  const inventorySha256 = createHash('sha256')
    .update(JSON.stringify({ strongs: strongsRecords, morphology: morphologyRecords }))
    .digest('hex');

  return {
    structuralIssues,
    strongs: {
      records: strongsRecords,
      entries: new Set(strongsRecords.map(record => record.identity)).size,
      fields: strongsRecords.length,
      replacementBearingFields: strongsRecords.filter(record => record.trackedReplacementCharacters > 0).length,
      trackedReplacementCharacters: strongsRecords.reduce((sum, record) => sum + record.trackedReplacementCharacters, 0),
      reproducedReplacementCharacters: strongsRecords.reduce((sum, record) => sum + record.reproducedReplacementCharacters, 0),
    },
    morphology: {
      records: morphologyRecords,
      files: new Set(morphologyRecords.map(record => record.path)).size,
      tokenFields: morphologyRecords.length,
      replacementBearingFields: morphologyRecords.filter(record => record.trackedReplacementCharacters > 0).length,
      trackedReplacementCharacters: morphologyRecords.reduce((sum, record) => sum + record.trackedReplacementCharacters, 0),
      reproducedReplacementCharacters: morphologyRecords.reduce((sum, record) => sum + record.reproducedReplacementCharacters, 0),
    },
    inventorySha256,
  };
}
