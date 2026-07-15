import type { ProvenanceRecord } from './provenance.js';
import type { CanonicalCommentator } from './types.js';

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== 'object' || value === null) {
    return value as DeepReadonly<T>;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return (Object.isFrozen(value) ? value : Object.freeze(value)) as DeepReadonly<T>;
}

export const HELLOAO_COMMENTARY_DELIVERY_ID = 'helloao-commentary-delivery';

export const HELLOAO_COMMENTARY_DELIVERY = deepFreeze({
  id: HELLOAO_COMMENTARY_DELIVERY_ID,
  kind: 'delivery_provider',
  label: 'HelloAO commentary delivery',
  url: 'https://bible.helloao.org',
  attribution: 'HelloAO',
  status: 'provider_attributed',
  note: 'HelloAO supplies the commentary payload, which may come from the process-local one-hour response cache. Each result reports the provider corpus SHA-256, but that fingerprint does not identify or authenticate the underlying transcription edition.',
} as const satisfies ProvenanceRecord);

const UNPINNED_PUBLIC_DOMAIN_NOTE =
  'The work is public domain, but the exact edition and transcription delivered by the provider are not pinned.';

export type CommentaryScalarPolicy =
  | { readonly kind: 'chapter_only' }
  | { readonly kind: 'verse_number_only' }
  | { readonly kind: 'verse_number_or_typed_number' };

export interface CommentaryCatalogEntry {
  readonly canonicalName: CanonicalCommentator;
  readonly resultDisplayName: string;
  readonly aliases: readonly string[];
  readonly providerWorkId: string;
  readonly testamentCoverage: 'all' | 'old_testament';
  readonly scalarPolicy: CommentaryScalarPolicy;
  readonly publicCoverageDescription: string;
  readonly citation: {
    readonly source: string;
    readonly copyright: string;
    readonly url: 'https://bible.helloao.org';
  };
  readonly workProvenance: DeepReadonly<ProvenanceRecord>;
}

export const COMMENTARY_CATALOG = deepFreeze([
  {
    canonicalName: 'Matthew Henry', resultDisplayName: 'Matthew Henry', aliases: ['matthew henry'], providerWorkId: 'matthew-henry',
    testamentCoverage: 'all', scalarPolicy: { kind: 'chapter_only' },
    publicCoverageDescription: 'chapter-level lookup; numbered source sections can span multiple verses',
    citation: { source: 'Matthew Henry Commentary', copyright: 'Public Domain', url: 'https://bible.helloao.org' },
    workProvenance: Object.freeze({
      id: 'matthew-henry-commentary', kind: 'primary_text', label: "Matthew Henry's Commentary",
      rightsNotice: 'Public Domain', attribution: 'Matthew Henry', status: 'transcription_source_uncertain',
      note: UNPINNED_PUBLIC_DOMAIN_NOTE,
    }),
  },
  {
    canonicalName: 'Jamieson-Fausset-Brown', resultDisplayName: 'Jamieson-Fausset-Brown', aliases: ['jfb', 'jamieson-fausset-brown'],
    providerWorkId: 'jamieson-fausset-brown', testamentCoverage: 'all',
    scalarPolicy: { kind: 'verse_number_or_typed_number' },
    publicCoverageDescription: 'chapter lookup and exact-verse lookup when the provider supplies trustworthy verse identity',
    citation: { source: 'Jamieson-Fausset-Brown Commentary', copyright: 'Public Domain', url: 'https://bible.helloao.org' },
    workProvenance: Object.freeze({
      id: 'jamieson-fausset-brown-commentary', kind: 'primary_text', label: 'Jamieson-Fausset-Brown Bible Commentary',
      rightsNotice: 'Public Domain', attribution: 'Robert Jamieson, A. R. Fausset, and David Brown',
      status: 'transcription_source_uncertain', note: UNPINNED_PUBLIC_DOMAIN_NOTE,
    }),
  },
  {
    canonicalName: 'Adam Clarke', resultDisplayName: 'Adam Clarke', aliases: ['adam clarke', 'clarke'], providerWorkId: 'adam-clarke',
    testamentCoverage: 'all', scalarPolicy: { kind: 'verse_number_or_typed_number' },
    publicCoverageDescription: 'chapter lookup and exact-verse lookup when the provider supplies trustworthy verse identity',
    citation: { source: 'Adam Clarke Commentary', copyright: 'Public Domain', url: 'https://bible.helloao.org' },
    workProvenance: Object.freeze({
      id: 'adam-clarke-commentary', kind: 'primary_text', label: "Adam Clarke's Commentary",
      rightsNotice: 'Public Domain', attribution: 'Adam Clarke', status: 'transcription_source_uncertain',
      note: UNPINNED_PUBLIC_DOMAIN_NOTE,
    }),
  },
  {
    canonicalName: 'John Gill', resultDisplayName: 'John Gill', aliases: ['john gill', 'gill'], providerWorkId: 'john-gill',
    testamentCoverage: 'all', scalarPolicy: { kind: 'verse_number_only' },
    publicCoverageDescription: 'chapter lookup recommended; exact-verse lookup requires a genuine provider verseNumber, which the current feed normally does not supply',
    citation: { source: 'John Gill Commentary', copyright: 'Public Domain', url: 'https://bible.helloao.org' },
    workProvenance: Object.freeze({
      id: 'john-gill-commentary', kind: 'primary_text', label: "John Gill's Exposition of the Bible",
      rightsNotice: 'Public Domain', attribution: 'John Gill', status: 'transcription_source_uncertain',
      note: UNPINNED_PUBLIC_DOMAIN_NOTE,
    }),
  },
  {
    canonicalName: 'Keil-Delitzsch', resultDisplayName: 'Keil-Delitzsch', aliases: ['keil-delitzsch'], providerWorkId: 'keil-delitzsch',
    testamentCoverage: 'old_testament', scalarPolicy: { kind: 'chapter_only' },
    publicCoverageDescription: 'Old Testament chapter-level lookup; numbered source sections can span multiple verses',
    citation: { source: 'Keil-Delitzsch Commentary', copyright: 'Public Domain', url: 'https://bible.helloao.org' },
    workProvenance: Object.freeze({
      id: 'keil-delitzsch-commentary', kind: 'primary_text', label: 'Keil and Delitzsch Biblical Commentary on the Old Testament',
      rightsNotice: 'Public Domain', attribution: 'Carl Friedrich Keil and Franz Delitzsch',
      status: 'transcription_source_uncertain', note: UNPINNED_PUBLIC_DOMAIN_NOTE,
    }),
  },
  {
    canonicalName: 'Tyndale', resultDisplayName: 'Tyndale Open Study Notes', aliases: ['tyndale', 'tyndale open study notes'], providerWorkId: 'tyndale',
    testamentCoverage: 'all', scalarPolicy: { kind: 'verse_number_or_typed_number' },
    publicCoverageDescription: 'chapter lookup and exact-verse lookup when the provider supplies trustworthy verse identity',
    citation: {
      source: 'Tyndale Open Study Notes Commentary',
      copyright: 'CC BY-SA 4.0 — Tyndale House, Cambridge (https://creativecommons.org/licenses/by-sa/4.0/)',
      url: 'https://bible.helloao.org',
    },
    workProvenance: Object.freeze({
      id: 'tyndale-open-study-notes', kind: 'primary_text', label: 'Tyndale Open Study Notes',
      url: 'https://www.tyndalehouse.com/resources/open-study-notes/',
      license: { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      rightsNotice: 'CC BY-SA 4.0 — Tyndale House, Cambridge', attribution: 'Tyndale House, Cambridge',
      status: 'provider_attributed',
      note: 'The provider attributes this work and license. The per-result provider corpus SHA-256 does not identify a pinned underlying edition or transcription.',
    }),
  },
] as const satisfies readonly CommentaryCatalogEntry[]);

export const CANONICAL_COMMENTATORS = deepFreeze(
  COMMENTARY_CATALOG.map(entry => entry.canonicalName),
) as readonly CanonicalCommentator[];

const COMMENTARY_BY_ALIAS = new Map<string, CommentaryCatalogEntry>(
  COMMENTARY_CATALOG.flatMap(entry => entry.aliases.map(alias => [alias, entry] as const)),
);

export function resolveCommentaryCatalogEntry(value: string): CommentaryCatalogEntry | undefined {
  return COMMENTARY_BY_ALIAS.get(value.toLowerCase().trim());
}

export function commentaryCatalogEntry(commentator: CanonicalCommentator): CommentaryCatalogEntry {
  const entry = COMMENTARY_CATALOG.find(candidate => candidate.canonicalName === commentator);
  if (!entry) throw new Error(`No commentary catalog entry configured for ${commentator}`);
  return entry;
}
