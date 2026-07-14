import type { ProvenanceRecord } from '../kernel/provenance.js';
import type { OriginalLanguageStudyDomainResult, StudyToken } from '../services/languages/OriginalLanguageStudyService.js';
import { normalizeLexiconText } from '../kernel/lexiconText.js';
import { createStepBibleProvenance } from '../kernel/stepBibleSource.js';

export const INTERPRETIVE_LIMITS = [
  ['context_controls_sense', 'Context controls the sense of a word in a verse.'],
  ['gloss_is_not_definition', 'A local gloss is a translation cue, not a complete definition.'],
  ['strongs_is_identifier', "A Strong's number links evidence; it is not a semantic analysis."],
  ['etymology_not_determinative', 'Derivation and roots do not determine contextual meaning.'],
  ['morphology_not_determinative', 'Grammar constrains interpretation but rarely settles it alone.'],
  ['avoid_illegitimate_totality_transfer', 'Do not import every possible sense into one occurrence.'],
  ['corpus_scope_limit', 'Source classification is Greek or Hebrew; this result does not infer Aramaic. The exact pinned STEPBible revision is identified in provenance.'],
].map(([code, message]) => ({ code, message }));

export function presentOriginalLanguageStudy(result: OriginalLanguageStudyDomainResult, position?: number): Record<string, unknown> {
  const provenanceIds = new Set(['stepbible-morphology']);
  const token = (value: StudyToken) => ({ ...value, provenanceIds: ['stepbible-morphology'] });
  const lexical = result.dictionary;
  const evidence: Record<string, unknown>[] = [];
  if (lexical) {
    const stepOnly = lexical.sourceKind === 'stepbible_lexicon';
    evidence.push({
      sourceId: stepOnly ? 'stepbible-lexicon' : 'openscriptures-strongs',
      kind: stepOnly ? 'stepbible_lexicon' : 'dictionary',
      ...(lexical.lemma ? { lemma: lexical.lemma } : {}),
      ...(lexical.definition ? { definition: normalizeLexiconText(lexical.definition) } : {}),
      ...(lexical.derivation ? { derivation: lexical.derivation } : {}),
      provenanceIds: [stepOnly ? 'stepbible-lexicon' : 'openscriptures-strongs'],
    });
    provenanceIds.add(stepOnly ? 'stepbible-lexicon' : 'openscriptures-strongs');
  }
  if (result.stepBible && lexical?.sourceKind !== 'stepbible_lexicon') {
    evidence.push({ sourceId: 'stepbible-lexicon', kind: 'stepbible_lexicon', ...(result.stepBible.gloss ? { gloss: result.stepBible.gloss } : {}), ...(result.stepBible.definition ? { definition: normalizeLexiconText(result.stepBible.definition) } : {}), ...(result.stepBible.source ? { lexicon: result.stepBible.source } : {}), provenanceIds: ['stepbible-lexicon'] });
    provenanceIds.add('stepbible-lexicon');
  }
  return {
    schemaVersion: '1', kind: 'original_language_study', status: result.status,
    request: { reference: result.reference, target: result.target, ...(position !== undefined ? { position } : {}) },
    context: { reference: result.reference, language: result.language, ...(result.selectedToken ? { selectedToken: token(result.selectedToken) } : {}), ...(result.candidates ? { candidates: result.candidates.map(token) } : {}) },
    ...(result.identity ? { identity: { ...result.identity, provenanceIds: result.dictionary ? (result.dictionary.sourceKind === 'stepbible_lexicon' ? ['stepbible-lexicon', 'stepbible-morphology'] : ['openscriptures-strongs', 'stepbible-morphology']) : ['stepbible-morphology'] } } : {}),
    ...(result.grammar ? { grammar: { ...result.grammar, provenanceIds: ['stepbible-morphology'] } } : {}),
    lexiconEvidence: evidence, interpretiveLimits: INTERPRETIVE_LIMITS, provenance: provenanceRecords().filter(record => provenanceIds.has(record.id)), warnings: result.warnings,
  };
}

function provenanceRecords(): ProvenanceRecord[] {
  return [
    createStepBibleProvenance({ id: 'stepbible-morphology', kind: 'morphology_dataset', label: 'STEPBible TAGNT/TAHOT' }),
    { id: 'openscriptures-strongs', kind: 'lexicon', label: "Strong's Concordance", url: 'https://github.com/openscriptures/strongs', license: { label: 'Public Domain' }, attribution: 'OpenScriptures', status: 'verified_source' },
    createStepBibleProvenance({ id: 'stepbible-lexicon', kind: 'lexicon', label: 'STEPBible lexicon data' }),
  ];
}
