/**
 * Biblical Languages Tools
 *
 * MCP tools for Greek and Hebrew biblical language study:
 * - Strong's Concordance lookups
 */

import { ToolHandler, StrongsLookupParams, StrongsResult } from '../types/index.js';
import { BiblicalLanguagesAdapter } from '../adapters/biblicalLanguagesAdapter.js';
import { handleToolError } from '../utils/errors.js';

const adapter = new BiblicalLanguagesAdapter();

// AI-generated hardcoded insights have been removed
// Now using STEPBible TBESG/TBESH lexicons (Abbott-Smith for Greek, abridged BDB for Hebrew)
// These provide scholarly definitions from recognized lexicographers

/**
 * Format simple output: concise overview with key insights
 */
function formatSimpleOutput(
  strongsNumber: string,
  lemma: string,
  transliteration: string | undefined,
  pronunciation: string | undefined,
  definition: string,
  enhanced: any,
  include_occurrences: boolean,
  include_morphology: boolean,
  adapter: BiblicalLanguagesAdapter
): string {
  let output = `**Strong's ${strongsNumber}: ${lemma}`;

  if (transliteration) {
    output += ` (${transliteration})`;
  }

  output += `**\n\n`;
  output += `**Definition:** ${definition}\n\n`;

  if (pronunciation) {
    output += `**Pronunciation:** ${pronunciation}\n\n`;
  }

  // Quick stats
  if (enhanced.extended) {
    output += `**Quick Stats:**\n`;

    if (include_occurrences && enhanced.extended.occurrences) {
      output += `- ${enhanced.extended.occurrences} occurrences in loaded books\n`;
    }

    if (include_morphology && enhanced.extended.morphology) {
      // Find most common form
      const morphEntries = Object.entries(enhanced.extended.morphology as Record<string, number>)
        .sort((a, b) => (b[1] as number) - (a[1] as number));

      if (morphEntries.length > 0) {
        const [topMorph, topCount] = morphEntries[0];
        const expansion = adapter.expandMorphology(topMorph);
        if (expansion) {
          output += `- Most common form: ${expansion} (${topCount}×)\n`;
        }
      }
    }

    output += `\n`;
  }

  output += `*Want more details? Use detail_level: "detailed" for etymology and morphology breakdown.*\n\n`;

  // Attribution
  const testament = strongsNumber.startsWith('G') ? 'Greek' : 'Hebrew';
  const lexicon = strongsNumber.startsWith('G') ? 'Abbott-Smith Manual Greek Lexicon' : 'Brown-Driver-Briggs Hebrew Lexicon (abridged)';
  output += `**Source:** ${lexicon} via STEPBible (Tyndale House, Cambridge) | CC BY 4.0\n`;

  return output;
}

/**
 * Format detailed output: comprehensive analysis
 */
function formatDetailedOutput(
  strongsNumber: string,
  lemma: string,
  transliteration: string | undefined,
  pronunciation: string | undefined,
  definition: string,
  derivation: string | undefined,
  enhanced: any,
  include_occurrences: boolean,
  include_morphology: boolean,
  adapter: BiblicalLanguagesAdapter,
  testament: string
): string {
  let output = `# Strong's ${strongsNumber}: ${lemma}\n\n`;

  // Basic information
  output += `**Definition:** ${definition}\n\n`;

  if (transliteration) {
    output += `**Transliteration:** ${transliteration}\n\n`;
  }

  if (pronunciation) {
    output += `**Pronunciation:** ${pronunciation}\n\n`;
  }

  // Etymology & derivation
  if (derivation) {
    output += `## Etymology & Derivation\n\n`;
    output += `${derivation}\n\n`;
  }

  // Enhanced data from STEPBible
  if (enhanced.extended) {
    // Occurrences
    if (include_occurrences && enhanced.extended.occurrences) {
      output += `## Occurrence Data\n\n`;
      output += `This word occurs **${enhanced.extended.occurrences} times** in the currently loaded books.\n\n`;
    }

    // Morphological analysis
    if (include_morphology && enhanced.extended.morphology) {
      output += `## Morphological Analysis\n\n`;
      const morphEntries = Object.entries(enhanced.extended.morphology as Record<string, number>)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 15); // Top 15 most common forms

      for (const [morphCode, count] of morphEntries) {
        const expansion = adapter.expandMorphology(morphCode);
        if (expansion) {
          output += `- **${morphCode}** (${expansion}): ${count}×\n`;
        } else {
          output += `- **${morphCode}**: ${count}×\n`;
        }
      }

      output += `\n**What this means:** `;

      // Add interpretation based on most common forms
      const topMorph = morphEntries[0]?.[0];
      if (topMorph) {
        if (topMorph.startsWith('V-A')) {
          output += `The predominance of aorist forms suggests emphasis on completed, decisive action rather than ongoing process.\n\n`;
        } else if (topMorph.startsWith('V-P')) {
          output += `The predominance of present forms suggests emphasis on continuous or habitual action.\n\n`;
        } else if (topMorph.startsWith('N-')) {
          output += `The distribution across different cases shows how this noun functions grammatically in various contexts.\n\n`;
        } else {
          output += `The morphological distribution reveals how this word is used grammatically across different contexts.\n\n`;
        }
      }
    }
  }

  output += `## Further Study\n\n`;
  output += `- Use \`bible_verse_morphology\` to see this word in specific verses with full grammatical context\n`;
  output += `- Search for related Strong's numbers to explore the semantic field\n`;
  output += `- Compare usage across different ${testament === 'NT' ? 'NT' : 'OT'} authors to see theological development\n\n`;

  // Attribution
  const lexicon = strongsNumber.startsWith('G') ? 'Abbott-Smith Manual Greek Lexicon (1922)' : 'Brown-Driver-Briggs Hebrew Lexicon (1906, abridged)';
  output += `---\n**Source:** ${lexicon} via STEPBible (Tyndale House, Cambridge)\n`;
  output += `**License:** CC BY 4.0 | **URL:** https://github.com/STEPBible/STEPBible-Data\n`;

  return output;
}

export const originalLanguageLookupHandler: ToolHandler = {
  name: 'original_language_lookup',
  description: 'Look up biblical Greek or Hebrew words using Strong\'s Concordance numbers (G#### for Greek, H#### for Hebrew). Returns original language word, transliteration, definition, morphology, and usage statistics. Perfect for word studies. Data from Abbott-Smith Manual Greek Lexicon (1922) and Brown-Driver-Briggs Hebrew Lexicon (1906), via STEPBible (Tyndale House, Cambridge | CC BY 4.0).',
  inputSchema: {
    type: 'object',
    properties: {
      strongs_number: {
        type: 'string',
        description: 'Strong\'s Concordance number. Format: "G####" for Greek (e.g., "G25" for agapaō - to love) or "H####" for Hebrew (e.g., "H430" for elohim - God). Supports extended notation (e.g., "G1722a"). Greek numbers: G1-G5624. Hebrew numbers: H1-H8674.',
        pattern: '^[GH]\\d+[a-z]?$'
      },
      detail_level: {
        type: 'string',
        enum: ['simple', 'detailed'],
        default: 'simple',
        description: 'Output detail level. "simple" (default): Quick overview with definition, pronunciation, and basic statistics. "detailed": Comprehensive analysis including etymology and full morphology breakdown.'
      },
      include_extended: {
        type: 'boolean',
        default: true,
        description: 'Include extended Strong\'s data from STEPBible (sense disambiguations, enhanced glosses). Default: true.'
      },
      include_morphology: {
        type: 'boolean',
        default: true,
        description: 'Include morphological analysis showing the grammatical forms this word appears in (noun cases, verb tenses, etc.). Default: true.'
      },
      include_occurrences: {
        type: 'boolean',
        default: true,
        description: 'Include count of how many times this word occurs in currently loaded books. Default: true.'
      },
      include_cross_references: {
        type: 'boolean',
        default: false,
        description: 'Include cross-references to related Strong\'s numbers (not yet implemented)'
      }
    },
    required: ['strongs_number']
  },
  handler: async (params: StrongsLookupParams) => {
    try {
      // Validate input
      if (!params.strongs_number) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Missing required parameter: strongs_number'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Normalize input
      let strongsNumber = params.strongs_number.toUpperCase().trim();

      // Validate format (now supports extended notation like G1722a)
      if (!/^[GH]\d+[a-z]?$/.test(strongsNumber)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Invalid Strong's number format: ${params.strongs_number}`,
              suggestion: 'Expected format: G#### for Greek or H#### for Hebrew (e.g., G25, H430, G1722a)'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Apply defaults for enhanced features (default to true)
      const include_extended = params.include_extended !== undefined ? params.include_extended : true;
      const include_morphology = params.include_morphology !== undefined ? params.include_morphology : true;
      const include_occurrences = params.include_occurrences !== undefined ? params.include_occurrences : true;
      const detail_level = params.detail_level || 'simple';

      // Check if enhanced features requested
      const useEnhanced = include_extended || include_morphology || include_occurrences;

      // Lookup entry (try enhanced first if requested)
      let entry;
      if (useEnhanced) {
        const enhanced = adapter.enrichStrongsWithStepBible(strongsNumber);
        if (enhanced) {
          entry = enhanced;
        } else {
          // Fall back to base lookup
          const baseStrong = strongsNumber.replace(/[a-z]$/, '');
          entry = adapter.lookupStrongs(baseStrong);
        }
      } else {
        // Standard lookup (strip extended notation for base lookup)
        const baseStrong = strongsNumber.replace(/[a-z]$/, '');
        entry = adapter.lookupStrongs(baseStrong);
      }

      if (!entry) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Strong's number ${strongsNumber} not found`,
              suggestion: strongsNumber.startsWith('G') ?
                'Greek Strong\'s numbers range from G1 to G5624' :
                'Hebrew Strong\'s numbers range from H1 to H8674'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Determine testament
      const testament = strongsNumber.startsWith('G') ? 'NT' : 'OT';
      const testamentName = testament === 'NT' ? 'Greek (New Testament)' : 'Hebrew (Old Testament)';

      // Extract properties safely from either type
      const lemma = 'lemma' in entry ? entry.lemma : '';
      const transliteration = 'transliteration' in entry ? entry.transliteration : ('translit' in entry ? entry.translit : undefined);
      const pronunciation = 'pronunciation' in entry ? entry.pronunciation : undefined;
      const definition = 'definition' in entry ? entry.definition : ('def' in entry ? entry.def : '');
      const derivation = 'derivation' in entry ? entry.derivation : undefined;

      // Format result
      const result: StrongsResult = {
        strongs_number: strongsNumber,
        testament,
        lemma,
        transliteration,
        pronunciation,
        definition,
        derivation,
        citation: {
          source: `OpenScriptures Strong's ${testamentName} Dictionary`,
          url: 'https://github.com/openscriptures/strongs',
          copyright: 'Public Domain'
        }
      };

      // Format output based on detail level
      const enhanced = entry as any;
      let output = '';

      if (detail_level === 'simple') {
        // SIMPLE MODE: Quick overview with key insights
        output = formatSimpleOutput(strongsNumber, lemma, transliteration, pronunciation, definition, enhanced, include_occurrences, include_morphology, adapter);
      } else {
        // DETAILED MODE: Comprehensive analysis
        output = formatDetailedOutput(strongsNumber, lemma, transliteration, pronunciation, definition, derivation, enhanced, include_occurrences, include_morphology, adapter, testament);
      }

      // Add attribution footer
      output += `\n---\n\n`;
      output += `*Source: ${result.citation.source}*\n`;
      output += `*License: ${result.citation.copyright}*\n`;

      // Add STEPBible attribution if enhanced features were used
      if (enhanced.extended) {
        output += `*Enhanced data: STEPBible TAGNT (CC BY 4.0) - www.stepbible.org*\n`;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };

    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};

export const bibleVerseMorphologyHandler: ToolHandler = {
  name: 'bible_verse_morphology',
  description: 'Get word-by-word morphological analysis of Bible verses. Shows original Hebrew (OT) or Greek (NT) text, lemma (dictionary form), Strong\'s numbers, grammatical parsing codes, and English glosses for each word. Supports all 66 Bible books (39 OT + 27 NT). Requires STEPBible data (CC BY 4.0).',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference. Formats: "John 3:16", "Jn 3:16", "Genesis 1:1", "Gen 1.1". Supports all 66 books with common abbreviations (Gen, Exo, Ps, Mt, Jn, etc.).',
        pattern: '^([1-3]?\\s?[A-Za-z]+)\\s*[:.\\s]+\\d+[:.]+\\d+$'
      },
      expand_morphology: {
        type: 'boolean',
        default: false,
        description: 'Expand morphology codes to human-readable descriptions. Greek example: "V-AAI-3S" → "Verb, Aorist, Active, Indicative, 3rd person, Singular". Hebrew example: "HVqp3ms" → "Hebrew, Verb, Qal, Perfect, 3rd person, masculine, singular".'
      }
    },
    required: ['reference']
  },
  handler: async (params) => {
    try {
      // Validate input
      if (!params.reference) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Missing required parameter: reference'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Get verse data
      const verseData = adapter.getVerseWithMorphology(params.reference);

      if (!verseData) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Could not find verse: ${params.reference}`,
              suggestion: 'Make sure the reference is valid and STEPBible data is available. Run "npm run build:stepbible" to generate the data. Supports all 66 books (39 OT Hebrew + 27 NT Greek).'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Determine language based on data characteristics
      const bookName = params.reference.split(' ')[0]; // "Daniel", "Ezra", "Genesis", etc.
      const firstMorph = verseData.words.length > 0 ? verseData.words[0].morph : '';
      const hasEmptyMorphology = firstMorph === '';

      let language: string;
      let testament: string;

      if (firstMorph.startsWith('H')) {
        // Has Hebrew morphology codes
        language = 'Hebrew';
        testament = 'OT';
      } else if (hasEmptyMorphology && (bookName.includes('Daniel') || bookName.includes('Ezra'))) {
        // Empty morphology in Daniel/Ezra = Aramaic portions
        language = 'Aramaic';
        testament = 'OT';
      } else if (hasEmptyMorphology) {
        // Empty morphology elsewhere = probably Hebrew with missing data
        language = 'Hebrew';
        testament = 'OT';
      } else {
        // Has Greek morphology codes (or other)
        language = 'Greek';
        testament = 'NT';
      }

      // Format output
      let output = `# ${params.reference} - Word-by-Word Analysis\n\n`;
      output += `**Language:** ${language} (${testament})\n`;
      output += `**Total words:** ${verseData.words.length}\n\n`;
      output += `---\n\n`;

      // Table header (dynamic based on language)
      output += `| # | ${language} | Lemma | Strong's | Morph | Gloss |\n`;
      output += `|---|-------|-------|----------|-------|-------|\n`;

      for (const word of verseData.words) {
        const pos = word.position;
        const text = word.text;
        const lemma = word.lemma;
        const strong = word.strongExtended || word.strong;
        const morph = word.morph;
        const gloss = word.gloss;

        // Format morphology (expand if requested)
        let morphDisplay = morph;
        if (params.expand_morphology && morph) {
          const expanded = adapter.expandMorphology(morph);
          if (expanded) {
            morphDisplay = `${morph} (${expanded})`;
          }
        }

        output += `| ${pos} | ${text} | ${lemma} | ${strong} | ${morphDisplay} | ${gloss} |\n`;
      }

      output += `\n---\n\n`;
      if (language === 'Hebrew' || language === 'Aramaic') {
        output += `*Source: STEPBible Tagged Hebrew Bible (CC BY 4.0) - www.stepbible.org*\n`;
        output += `*${language} text with morphological tagging from Westminster Hebrew Morphology*\n`;
      } else {
        output += `*Source: STEPBible TAGNT (CC BY 4.0) - www.stepbible.org*\n`;
        output += `*Greek text with morphological tagging from Translators Amalgamated Greek NT*\n`;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };

    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};
