# Passage Exegesis Skill

Systematic exegetical analysis of a Bible passage using all available TheologAI tools.

## When to Use

Use this workflow when the user asks for:
- Exegesis or exposition of a passage
- Deep study of a Bible text
- Understanding what a passage means
- Sermon preparation help
- Theological analysis of a text

## Methodology

### Step 1: Establish the Text

- Call `bible_lookup` with the reference in the user's preferred translation (default: ESV)
- Also retrieve KJV for a second perspective
- If NET is available, retrieve it too for the translator notes
- Read the passage carefully before analyzing

### Step 2: Original Language Analysis

- Trace the passage's literary and discourse flow before selecting terms.
- For a range, select at most three key individual verses. Never pass a range to `bible_verse_morphology` or `original_language_study`.
- Study only terms affecting an actual translation or interpretive question.
- Call `original_language_study` with one verse and the verse-local target. Resolve returned ambiguity by source position, not guesswork.
- Request `usage_level: "overview"` from an exact `original_language_lookup`
  only after the verse-local analysis and only when global distribution is
  consequential. Overview is totals plus complete books only. Do not request
  global usage from `original_language_study`.
- Treat morphology as constraining evidence, not a self-sufficient interpretation.

### Step 3: Literary Context

- Start with `parallel_passages` using exactly `reference`, `corpora: ["ubs_source_attested"]`, `maxGroups: 5`, and `includeText: false`. Browse returned structured source-attested metadata only; do not flatten group membership into inferred pairwise relationships.
- Preserve every returned group's member order, source order, and provenance. The source labels directionality unspecified, so never infer quotation, dependence, synoptic direction, or a thematic relationship.
- Continue only when `sourceAttestedResultWindow.additionalMatchStatus` is `additional_match_observed`, it includes `nextCursor`, and another page could materially help. Pass `nextCursor` unchanged as `groupCursor` while preserving exactly the same `reference`, `corpora`, and `maxGroups`. Omit `includeText`, `translation`, `includeAlignment`, legacy controls, and OpenBible controls. Never inspect, decode, or rewrite the cursor.
- Stop when the result window is terminal, the evidence is sufficient, or after two continuation calls (at most three pages / 15 groups). If the cap ends a potentially useful survey, state that the survey was bounded.
- From the browsed metadata, select at most two materially relevant groups in returned source order. Preserve each selected group and every member intact; do not dedupe or flatten the groups. Only when comparison text materially helps, construct a separate text-enrichment queue by traversing selected groups and their members in returned source order. Dedupe only that queue by `normalizedReference`, keeping its first occurrence. Use direct `bible_lookup` only for the first 12 unique queue references; label every later unique queue reference `budget_omitted` before lookup. Record lookup failures and budget omissions; never backfill with later references. Never combine `groupCursor` with `includeText`.
- Use `corpora: ["theologai_legacy"]` only when the user specifically wants the older curated relationship labels (`synoptic`, `quotation`, `allusion`, or `thematic`).
- Request `includeOpenBibleCrossReferences: true` only for a separate, broader cross-reference list; do not present those rows as UBS-attested group members.
- Call `bible_cross_references` to identify broader OpenBible.info discovery leads across Scripture. Prefer its structured requested/resolved references, positioned rows, threshold-scoped result window, and provenance; preserve raw vote order. Keep this evidence separate from UBS groups, and do not infer a relationship classification or directionality.
- Treat those links as candidates for contextual investigation, not proof of quotation, literary dependence, a source-attested parallel, or even a shared theme until the passages themselves support that conclusion.
- Follow useful cross-references to build a biblical-theological framework while labeling the resulting synthesis as interpretation rather than dataset-attested relationship metadata.

### Step 4: Commentary Tradition

- Call `commentary_lookup` with the containing chapter for at least two commentators:
  - Matthew Henry (devotional/practical; chapter-level source sections)
  - John Gill (theological/exegetical; current scalar identity is insufficient)
  - Jamieson-Fausset-Brown or Adam Clarke for additional perspectives
- Exact-verse coverage varies by commentary provider. If an exact-verse lookup has no trustworthy match, request the containing chapter or another commentator. Keep chapter commentary labeled at chapter level; never attribute it to the requested verse.
- Prefer structured `coverage`, `commentary`, `retrieval`, and `provenance`; use the legacy Markdown as fallback. Treat `exact_verse` only as the returned provider identity evidence states and `chapter_aggregate` only as chapter-level evidence. Never infer a section span, and keep the commentary work's rights/provenance distinct from cached-or-live HelloAO delivery. Per-result cache status is not exposed.
- Note areas of agreement (likely settled interpretation) and disagreement (debated points)

### Step 5: Historical Theology

- Call `classic_text_lookup` with a query related to the passage's themes. Treat
  snippets as discovery only; read the selected canonical `sectionKey` resource
  before quotation. A reviewed sectioned-only work has a landing and bounded
  cursor directory, and only an exact section resource carries a body.
- Check if any creeds, confessions, or catechisms address the doctrines in the passage
- This connects the passage to the broader theological tradition

### Step 6: Synthesis

Present findings as:
1. **Text & Translation**: The passage with any significant translation notes
2. **Structure**: Outline or flow of the passage
3. **Key Terms**: Important Greek/Hebrew words with their significance
4. **Context**: How the passage fits in its book and in biblical theology
5. **Interpretation**: What the passage meant in its original context
6. **Theological Connections**: Links to systematic theology and historical confessions
7. **Application**: Practical implications (if appropriate)

## Important Notes

- Always start with the text before consulting secondary sources
- Let the original language inform interpretation, not the other way around
- Present multiple views fairly when interpretation is debated
- Distinguish between what the text says, what it means, and how it applies
- Separate observation, lexical evidence, interpretation, theological synthesis, and application.
- Never derive contextual meaning from a gloss, Strong's identifier, morphology, root, etymology, frequency, or the sum of every lexicon sense.
- Keep source claims and provenance attached to their evidence.
