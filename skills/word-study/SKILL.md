# Word Study Skill

Conduct a context-first Greek/Hebrew word study using TheologAI's language tools.

## When to Use

Use this workflow when the user asks about:
- The meaning of a Greek or Hebrew word
- What a word means "in the original"
- Strong's concordance lookups
- Word etymology or semantic range
- How a term is used across Scripture

## Methodology

### Step 1: Establish the Scope

- If the user asks what a word means in a verse, require one exact verse and read it with `bible_lookup` in the requested/default translation plus one comparison translation.
- If no verse is supplied, label the result a lexical overview, not a contextual meaning, and invite a passage-specific study.

### Step 2: Resolve the Verse Token

- Call `original_language_study` with the exact verse and target.
- If it returns `needs_disambiguation`, use sentence context to select a returned candidate and call again with that source `position`. Never guess.

### Step 3: Consult Lexical Evidence

If the user provides a Strong's number (G####, H####):
- Call `original_language_lookup` with the number, `include_extended: true`, and
  `usage_level: "overview"`. Treat `corpusUsage` as global distribution evidence
  that follows the verse-local analysis, never as a way to select a contextual
  sense. Overview contains totals and the complete canonical-book distribution
  only; request `study` or `technical` only when bounded forms or raw tokens are
  genuinely needed.

If the user provides an English word without verse context:
- Call `original_language_lookup` to search for the term
- If multiple results, present candidates unless context supports a selection

### Step 4: Compare Translations

- Call `bible_lookup` on a key verse with multiple translations (ESV, KJV, NET)
- Note how different translations render the word
- Explain the translation choices

### Step 5: Synthesize

Present contextual findings in this order:
1. **Meaning here, in plain English**
2. **Why that reading fits the verse**
3. **Word identity**: source form, lemma, transliteration, Strong's identifier
4. **Grammar**: cautious explanation, then raw source code
5. **Source-separated lexical evidence** and limitations

## Important Notes

- Always present the original language term (Greek or Hebrew) with transliteration
- Distinguish between different Strong's numbers for the same English word
- Note when a word has significantly different meanings in different contexts
- Context controls sense. A gloss is not a complete definition.
- Strong's numbers identify linked evidence; they are not semantic analyses.
- Morphology constrains interpretation but rarely settles it alone.
- Roots and etymology do not prove present contextual meaning.
- Never import every possible sense into one occurrence.
- Keep OpenScriptures and STEPBible evidence separately attributed.
- Keep lexicon `extended.occurrences` distinct from counted morphology
  `corpusUsage.totals.tokenCount`; they are different source claims.
- Exact source surface variants preserve punctuation, accents, breathing marks,
  and cantillation and are not normalized linguistic forms.
- Do not infer Aramaic from an H identifier; current source classification is Greek or Hebrew.
