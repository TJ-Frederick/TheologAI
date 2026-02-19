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

- Call `bible_verse_morphology` on the key verse(s) with `expand_morphology: true`
- Identify theologically significant words (look for key verbs, important nouns)
- Call `original_language_lookup` on 2-3 key terms with `include_extended: true`
- Note verb tenses, imperative/indicative distinctions, key prepositions

### Step 3: Literary Context

- Call `parallel_passages` to find synoptic parallels (Gospels) or OT quotations
- If parallels exist, compare the accounts to note unique contributions
- Call `bible_cross_references` to identify related themes across Scripture
- Follow the strongest cross-references to build a biblical-theological framework

### Step 4: Commentary Tradition

- Call `commentary_lookup` with at least two commentators:
  - Matthew Henry (devotional/practical)
  - John Gill (theological/exegetical)
  - Jamieson-Fausset-Brown or Adam Clarke for additional perspectives
- Note areas of agreement (likely settled interpretation) and disagreement (debated points)

### Step 5: Historical Theology

- Call `classic_text_lookup` with a query related to the passage's themes
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
