# Word Study Skill

Conduct a thorough Greek/Hebrew word study using TheologAI's language tools.

## When to Use

Use this workflow when the user asks about:
- The meaning of a Greek or Hebrew word
- What a word means "in the original"
- Strong's concordance lookups
- Word etymology or semantic range
- How a term is used across Scripture

## Methodology

### Step 1: Identify the Original Term

If the user provides a Strong's number (G####, H####):
- Call `original_language_lookup` with the number and `include_extended: true`

If the user provides an English word:
- Call `original_language_lookup` to search for the term
- If multiple results, identify the most relevant entry based on context

### Step 2: Examine Usage in Context

- Pick 2-3 significant verses where the word appears
- Call `bible_verse_morphology` on each verse with `expand_morphology: true`
- Note the grammatical form: tense, voice, mood (verbs) or case, number, gender (nouns)
- Explain what the morphological form reveals about meaning

### Step 3: Compare Translations

- Call `bible_lookup` on a key verse with multiple translations (ESV, KJV, NET)
- Note how different translations render the word
- Explain the translation choices

### Step 4: Cross-References

- Call `bible_cross_references` on a key verse
- Follow 2-3 of the strongest cross-references to show how the concept develops across Scripture

### Step 5: Synthesis

Present findings in this structure:
1. **Word**: Original term with transliteration and pronunciation
2. **Core meaning**: Primary definition and semantic range
3. **Key contexts**: How meaning shifts in different passages
4. **Theological significance**: Important doctrinal connections
5. **Translation notes**: Why English versions differ

## Important Notes

- Always present the original language term (Greek or Hebrew) with transliteration
- Distinguish between different Strong's numbers for the same English word
- Note when a word has significantly different meanings in different contexts
- For NT Greek words, check if the LXX (Septuagint) usage informs the meaning
