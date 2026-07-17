import type { IMorphologyRepository, IStrongsRepository, MorphWord } from '../../kernel/repositories.js';
import type { EnhancedStrongsResult } from '../../kernel/types.js';
import { parseReference, toStepBible, formatReference } from '../../kernel/reference.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';
import { NotFoundError, ValidationError } from '../../kernel/errors.js';
import { StrongsService } from './StrongsService.js';

export type StudyStatus = 'complete' | 'partial' | 'needs_disambiguation';

export interface StudyToken {
  position: number;
  text: string;
  lemma: string;
  strongsNumber: string | null;
  morphologyCode: string | null;
  gloss: string | null;
}

export interface OriginalLanguageStudyDomainResult {
  status: StudyStatus;
  reference: string;
  language: 'Greek' | 'Hebrew';
  target: string;
  selectedToken?: StudyToken;
  candidates?: StudyToken[];
  identity?: {
    publicStrongs: string;
    morphologyKey: string;
    sourceStrongs: string;
    lemma: string;
    transliteration?: string;
    pronunciation?: string;
    joinKind: 'exact' | 'base' | 'none';
  };
  grammar?: { code: string; expansion?: string; certainty: 'expanded' | 'unknown' };
  dictionary?: EnhancedStrongsResult;
  stepBible?: NonNullable<EnhancedStrongsResult['extended']>;
  warnings: string[];
}

export class OriginalLanguageStudyService {
  private strongs: StrongsService;

  constructor(
    private morphologyRepo: IMorphologyRepository,
    strongsRepo: IStrongsRepository,
  ) {
    this.strongs = new StrongsService(strongsRepo);
  }

  async study(input: { reference: string; target: string; position?: number }): Promise<OriginalLanguageStudyDomainResult> {
    const ref = parseReference(input.reference);
    if (ref.startVerse == null || ref.endVerse != null) {
      throw new ValidationError('reference', 'original_language_study requires exactly one Bible verse.');
    }
    const target = input.target.trim();
    if (!target) throw new ValidationError('target', 'target must not be blank.');

    const sb = toStepBible(ref);
    const words = await this.morphologyRepo.getVerseMorphology(sb.book, ref.chapter, ref.startVerse);
    if (words.length === 0) throw new NotFoundError('morphology', `No morphology data for ${formatReference(ref)}`);

    const matches = await this.matchVerseTokens(words, target);
    const positioned = input.position === undefined
      ? matches
      : matches.filter(word => word.position === input.position);
    if (input.position !== undefined && positioned.length === 0) {
      const actual = words.find(word => word.position === input.position);
      if (!actual) throw new ValidationError('position', `No token exists at position ${input.position}.`);
      throw new ValidationError('position', `Token at position ${input.position} does not match target "${target}".`);
    }
    if (positioned.length === 0) {
      throw new NotFoundError('target', `No token in ${formatReference(ref)} matches "${target}".`);
    }

    const base = {
      reference: formatReference(ref),
      language: (ref.book.testament === 'NT' ? 'Greek' : 'Hebrew') as 'Greek' | 'Hebrew',
      target,
      warnings: [] as string[],
    };
    if (positioned.length > 1) {
      return { ...base, status: 'needs_disambiguation', candidates: positioned.map(toStudyToken) };
    }

    const word = positioned[0];
    const result: OriginalLanguageStudyDomainResult = {
      ...base,
      status: 'complete',
      selectedToken: toStudyToken(word),
      warnings: [],
    };
    if (word.morph_code) {
      const expansion = await this.morphologyRepo.expandMorphCode(word.morph_code);
      result.grammar = { code: word.morph_code, ...(expansion ? { expansion } : {}), certainty: expansion ? 'expanded' : 'unknown' };
      if (!expansion) {
        result.status = 'partial';
        result.warnings.push('The source morphology code has no available expansion.');
      }
    } else {
      result.status = 'partial';
      result.warnings.push('The selected source token has no morphology code.');
    }

    const identity = word.strongs_number ? parseStrongsIdentity(word.strongs_number) : undefined;
    if (!identity) {
      result.status = 'partial';
      result.warnings.push('The selected source token has no usable Strong\'s identity, so lexical evidence is unavailable.');
      return result;
    }

    try {
      const lexical = await this.strongs.lookup(identity.publicId, true);
      result.dictionary = lexical;
      if (lexical.extended) result.stepBible = lexical.extended;
      const lexicalIdentity = parseStrongsIdentity(lexical.strongs_number);
      result.identity = {
        publicStrongs: identity.publicId,
        morphologyKey: identity.morphologyKey,
        sourceStrongs: word.strongs_number!,
        lemma: word.lemma || lexical.lemma,
        ...(lexical.transliteration ? { transliteration: lexical.transliteration } : {}),
        ...(lexical.pronunciation ? { pronunciation: lexical.pronunciation } : {}),
        joinKind: lexicalIdentity?.publicId === identity.publicId ? 'exact' : lexicalIdentity?.number === identity.number ? 'base' : 'none',
      };
      if (lexical.evidencePolicy) {
        if (lexical.evidencePolicy.semanticEvidence === 'unavailable') result.status = 'partial';
        result.warnings.push(lexical.evidencePolicy.notice);
      }
      if (!result.stepBible) {
        result.status = 'partial';
        result.warnings.push('No separate STEPBible lexicon evidence is available for this identity.');
      }
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      result.status = 'partial';
      result.identity = {
        publicStrongs: identity.publicId,
        morphologyKey: identity.morphologyKey,
        sourceStrongs: word.strongs_number!,
        lemma: word.lemma,
        joinKind: 'none',
      };
      result.warnings.push('No dictionary or lexicon entry could be joined to the selected source token.');
    }
    return result;
  }

  private async matchVerseTokens(words: MorphWord[], target: string): Promise<MorphWord[]> {
    const identity = parseStrongsIdentity(target);
    if (identity) {
      return words.filter(word => {
        const candidate = word.strongs_number ? parseStrongsIdentity(word.strongs_number) : undefined;
        return candidate?.publicId === identity.publicId;
      });
    }
    const normalized = normalize(target);
    const direct = words.filter(word => [word.word_text, word.lemma, word.gloss]
      .some(value => value != null && normalize(value) === normalized));
    if (direct.length > 0) return direct;

    const compoundGloss = words.filter(word => {
      const segment = selectAlignedHebrewGlossSegment(word);
      return segment !== undefined && normalize(segment) === normalized;
    });
    if (compoundGloss.length > 0) return compoundGloss;

    const matches: MorphWord[] = [];
    const cache = new Map<string, EnhancedStrongsResult | null>();
    for (const word of words) {
      if (!word.strongs_number) continue;
      const parsed = parseStrongsIdentity(word.strongs_number);
      if (!parsed) continue;
      if (!cache.has(parsed.publicId)) {
        try {
          cache.set(parsed.publicId, await this.strongs.lookup(parsed.publicId));
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
          cache.set(parsed.publicId, null);
        }
      }
      const entry = cache.get(parsed.publicId);
      if (entry?.transliteration && normalize(entry.transliteration) === normalized) matches.push(word);
    }
    return matches;
  }
}

function toStudyToken(word: MorphWord): StudyToken {
  return {
    position: word.position,
    text: word.word_text,
    lemma: word.lemma,
    strongsNumber: word.strongs_number,
    morphologyCode: word.morph_code,
    gloss: word.gloss,
  };
}

function normalize(value: string): string {
  // Canonical decomposition followed by Unicode Mark removal makes exact
  // script comparison insensitive to Greek accents/breathings and Hebrew
  // niqqud/cantillation while preserving every base letter and its order.
  return value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('en-US');
}

const CONTENT_BEARING_HEBREW_PARTS = new Set(['N', 'V', 'A', 'D', 'P']);

/**
 * Select the one English gloss segment that is safely aligned with a Hebrew
 * token's lexical identity. STEPBible uses slash-delimited morphemes, but a
 * slash alone is not enough evidence: all three aligned fields must have the
 * same non-empty shape, and selection must resolve to exactly one segment.
 */
function selectAlignedHebrewGlossSegment(word: MorphWord): string | undefined {
  const identity = word.strongs_number ? parseStrongsIdentity(word.strongs_number) : undefined;
  if (identity?.prefix !== 'H' || !word.morph_code || !word.gloss) return undefined;

  const sourceSegments = splitNonEmptySegments(word.word_text);
  const morphologySegments = splitNonEmptySegments(word.morph_code);
  const glossSegments = splitNonEmptySegments(word.gloss);
  if (!sourceSegments || !morphologySegments || !glossSegments
    || sourceSegments.length < 2
    || sourceSegments.length !== morphologySegments.length
    || sourceSegments.length !== glossSegments.length
    || !morphologySegments[0].startsWith('H')) {
    return undefined;
  }

  const normalizedMorphology = [
    morphologySegments[0].slice(1),
    ...morphologySegments.slice(1),
  ];
  if (normalizedMorphology.some(segment => segment.length === 0 || segment.startsWith('H'))) {
    return undefined;
  }

  const normalizedLemma = normalizeIdentitySegment(word.lemma);
  const lemmaMatches = normalizedLemma
    ? sourceSegments.flatMap((segment, index) => normalizeIdentitySegment(segment) === normalizedLemma ? [index] : [])
    : [];
  if (lemmaMatches.length === 1) return glossSegments[lemmaMatches[0]];

  const contentBearing = normalizedMorphology.flatMap((segment, index) =>
    CONTENT_BEARING_HEBREW_PARTS.has(segment[0]) ? [index] : []);
  return contentBearing.length === 1 ? glossSegments[contentBearing[0]] : undefined;
}

function splitNonEmptySegments(value: string): string[] | undefined {
  const segments = value.split('/').map(segment => segment.trim());
  return segments.length >= 2 && segments.every(segment => segment.length > 0) ? segments : undefined;
}

function normalizeIdentitySegment(value: string): string {
  return normalize(value).replace(/^\p{P}+|\p{P}+$/gu, '').trim();
}
