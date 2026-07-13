import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { parseReference } from '../kernel/reference.js';
import { validatePromptArguments } from './validation.js';

export interface RecommendedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

const TRANSLATIONS = new Set(['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']);

/**
 * The upstream SDK's strict string record throws an unclassified ZodError before
 * our handler can return MCP InvalidParams. Accept unknown values at the wire
 * boundary, then classify them explicitly with validatePromptArguments.
 */
const ClassifiedGetPromptRequestSchema = GetPromptRequestSchema.extend({
  params: GetPromptRequestSchema.shape.params.extend({
    name: z.unknown(),
    arguments: z.unknown().optional(),
  }),
});

function translation(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase();
  return normalized && TRANSLATIONS.has(normalized) ? normalized : 'ESV';
}

function isSingleVerseReference(value: string): boolean {
  try {
    const reference = parseReference(value);
    return reference.startVerse != null && reference.endVerse == null;
  } catch {
    return false;
  }
}

/**
 * Machine-checkable calls used by prompt prose. Keeping these structured lets
 * tests prove that guided workflows remain executable as tool schemas evolve.
 */
export function recommendedToolCallsForPrompt(
  name: string,
  args: Record<string, string> | undefined,
): RecommendedToolCall[] {
  switch (name) {
    case 'word-study': {
      const word = args?.word?.trim() ?? '';
      const reference = args?.reference?.trim();
      const lexical = /^[GH]\d+[a-z]?$/i.test(word)
        ? [{ tool: 'original_language_lookup', arguments: { strongs_number: word.toUpperCase(), include_extended: true, detail_level: 'detailed' } }]
        : [{ tool: 'original_language_lookup', arguments: { query: word, limit: 10 } }];
      return reference
        ? [
          { tool: 'bible_lookup', arguments: { reference, translation: 'ESV', includeFootnotes: true } },
          { tool: 'bible_lookup', arguments: { reference, translation: 'KJV' } },
          { tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } },
          ...lexical,
        ]
        : lexical;
    }
    case 'passage-exegesis': {
      const reference = args?.reference ?? '';
      const singleVerse = isSingleVerseReference(reference);
      return [
        { tool: 'bible_lookup', arguments: { reference, translation: translation(args?.translation), includeFootnotes: true } },
        { tool: 'bible_lookup', arguments: { reference, translation: 'KJV' } },
        ...(singleVerse ? [{ tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } }] : []),
        ...(singleVerse ? [{ tool: 'bible_cross_references', arguments: { reference } }] : []),
        { tool: 'parallel_passages', arguments: { reference, corpora: ['ubs_source_attested'], maxGroups: 5 } },
        { tool: 'commentary_lookup', arguments: { reference, commentator: 'Matthew Henry' } },
        { tool: 'commentary_lookup', arguments: { reference, commentator: 'John Gill' } },
        { tool: 'classic_text_lookup', arguments: { query: `themes in ${reference}` } },
      ];
    }
    case 'compare-translations': {
      const reference = args?.reference ?? '';
      const requested = (args?.translations || 'ESV,KJV,NET,BSB')
        .split(',')
        .map(item => item.trim().toUpperCase())
        .filter(item => TRANSLATIONS.has(item));
      const translations = [...new Set(requested)].slice(0, 8);
      const selected = translations.length > 0 ? translations : ['ESV', 'KJV', 'NET', 'BSB'];
      return [
        ...selected.map(item => ({ tool: 'bible_lookup', arguments: { reference, translation: item } })),
        { tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } },
      ];
    }
    case 'confession-study': {
      const topic = args?.topic ?? '';
      return [
        { tool: 'classic_text_lookup', arguments: { listWorks: true } },
        { tool: 'classic_text_lookup', arguments: { query: topic } },
      ];
    }
    case 'donate':
      return [{ tool: 'donation_config', arguments: {} }];
    default:
      return [];
  }
}

function callText(call: RecommendedToolCall): string {
  return `\`${call.tool}\` with \`${JSON.stringify(call.arguments)}\``;
}

export function registerPromptHandlers(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'word-study',
        description: "Guided Greek/Hebrew word study using Strong's concordance, morphology, and lexicon data",
        arguments: [
          { name: 'word', description: 'The English word, Greek/Hebrew term, or Strong\'s number (e.g. "love", "agape", "G26")', required: true },
          { name: 'testament', description: 'Focus on OT (Hebrew) or NT (Greek). Default: auto-detect.', required: false },
          { name: 'reference', description: 'One verse providing context for the word. Without it, the workflow is a lexical overview, not a claim about meaning in a verse.', required: false },
        ],
      },
      {
        name: 'passage-exegesis',
        description: 'Systematic exegesis of a Bible passage: text, cross-references, commentary, and original language analysis',
        arguments: [
          { name: 'reference', description: 'Bible reference (e.g. "John 3:16", "Romans 8:28-30")', required: true },
          { name: 'translation', description: 'Primary translation. Default: ESV.', required: false },
        ],
      },
      {
        name: 'compare-translations',
        description: 'Compare a passage across multiple Bible translations to highlight differences in rendering',
        arguments: [
          { name: 'reference', description: 'Bible reference (e.g. "Philippians 2:6-8")', required: true },
          { name: 'translations', description: 'Comma-separated list of translations. Default: ESV,KJV,NET,BSB.', required: false },
        ],
      },
      {
        name: 'confession-study',
        description: 'Cross-tradition doctrinal comparison across creeds, confessions, and catechisms',
        arguments: [
          { name: 'topic', description: 'The doctrine or topic to compare', required: true },
          { name: 'traditions', description: 'Comma-separated traditions to focus on', required: false },
        ],
      },
      { name: 'donate', description: 'Guide for donating to support TheologAI development', arguments: [] },
    ],
  }));

  server.setRequestHandler(ClassifiedGetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    validatePromptArguments(name, args);
    // validatePromptArguments narrows both values after the permissive wire boundary.
    if (typeof name !== 'string') throw new Error('Unreachable prompt-name validation state');
    const calls = recommendedToolCallsForPrompt(name, args);

    let text: string;
    switch (name) {
      case 'word-study': {
        const word = args?.word ?? '';
        const reference = args?.reference?.trim();
        const testament = args?.testament;
        const testamentHint = testament
          ? ` Focus on the ${testament.toUpperCase() === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.`
          : '';
        text = reference
          ? `Conduct a context-first word study on "${word}" in ${reference}.${testamentHint}

1. **Read the context** — ${callText(calls[0])}; compare ${callText(calls[1])}.
2. **Resolve the verse token** — ${callText(calls[2])}. Identify the source form, lemma, Strong's identifier, or exact local gloss corresponding to the user's term. Then call \`original_language_study\` with ${reference} and that verse-local target. If it returns \`needs_disambiguation\`, select a candidate only from sentence context and call it again with that source position; do not guess.
3. **Consult lexical evidence** — ${callText(calls[3])}. Keep OpenScriptures and STEPBible claims source-separated.
4. **Synthesize in this order** — Begin with **Meaning here, in plain English**, then explain why it fits the verse, the word identity, and grammar. Put broader lexical evidence after the contextual explanation.
5. **Apply safeguards** — Context controls sense. A gloss is not a definition; a Strong's number is an identifier; morphology constrains but does not settle meaning; roots and etymology do not prove present meaning; never import every possible sense into one occurrence. Do not infer Aramaic from an H identifier.`
          : `Provide a lexical overview of "${word}".${testamentHint}

1. **Identify candidate terms** — ${callText(calls[0])}. Prefer structured \`mode\`, \`entries\`, \`detailLevel\`, and \`provenanceIds\`, with Markdown as fallback.
2. **Label the scope honestly** — There is no verse context, so do not claim a contextual meaning. Invite a passage-specific study.
3. **Apply safeguards** — Do not treat one English gloss as exhausting the term's semantic range. Keep source claims separate; a gloss, Strong's number, morphology, root, or etymology does not establish meaning in a verse, and do not import every possible sense into every occurrence.`;
        break;
      }
      case 'passage-exegesis': {
        const reference = args?.reference ?? '';
        const morphologyCall = calls.find(call => call.tool === 'bible_verse_morphology');
        const crossReferenceCall = calls.find(call => call.tool === 'bible_cross_references');
        text = `Perform a systematic exegesis of ${reference}.

1. **Read the text** — ${callText(calls[0])}; compare with ${callText(calls[1])}. Prefer structured \`passages[]\` and retain each translation's \`provenanceIds\`; distinguish an unavailable translation in \`failures[]\` from a translation whose text is absent.
2. **Trace the passage before selecting terms** — Explain literary and discourse flow first. ${morphologyCall ? `For this single verse, ${callText(morphologyCall)}.` : 'This is a range: select at most three key individual verses and call `bible_verse_morphology` separately for each; never pass the range to a single-verse tool.'}
3. **Study only consequential terms** — For a term affecting a real translation or interpretive question, call \`original_language_study\` with one exact verse and the verse-local target. Resolve ambiguity by source position rather than guessing.
4. **Explore connections without conflating sources** — Use \`parallel_passages\` with \`corpora: ["ubs_source_attested"]\` for complete UBS source-attested groups. Preserve group membership and source order; because the source labels directionality unspecified, do not infer quotation, dependence, synoptic direction, or a thematic relationship. ${crossReferenceCall ? `${callText(crossReferenceCall)} separately for broader OpenBible.info discovery.` : 'This is not one exact verse: select at most three consequential individual verses and call `bible_cross_references` separately for each; never pass a chapter or range.'} Treat those community-ranked links as thematic leads, not UBS-attested parallels or evidence that one passage quotes another, and retain their separate attribution.
5. **Consult commentaries and historical theology** — Use \`commentary_lookup\` and \`classic_text_lookup\`; note agreement and divergence.
6. **Synthesize distinctly** — Separate observation, lexical evidence, interpretation, theological synthesis, and application. Context controls sense; never derive contextual meaning from a gloss, Strong's identifier, morphology, root, etymology, frequency, or every possible lexicon sense.`;
        break;
      }
      case 'compare-translations': {
        const reference = args?.reference ?? '';
        const lookupCalls = calls.slice(0, -1).map(call => `- ${callText(call)}`).join('\n');
        text = `Compare ${reference} across multiple Bible translations.

1. **Retrieve each translation**
${lookupCalls}
Use structured \`passages[]\` when available, compare by its \`translation\`, report every \`failures[]\` item, and keep each citation/provenance link attached to the relevant translation. Fall back to the Markdown text when structured fields are unavailable.
2. **Examine the original language** — ${callText(calls.at(-1)!)}.
3. **Investigate divergences** — Make exact \`original_language_lookup\` calls for the relevant Strong's numbers.
4. **Summarize** — Compare literal/dynamic choices and any theologically significant differences.`;
        break;
      }
      case 'confession-study': {
        const topic = args?.topic ?? '';
        const traditions = args?.traditions;
        const hint = traditions ? ` Focus on: ${traditions.split(',').map(item => item.trim()).join(', ')}.` : '';
        text = `Cross-tradition doctrinal comparison on "${topic}".${hint}

1. **Identify documents** — ${callText(calls[0])}.
2. **Search the local collection** — ${callText(calls[1])}.
3. **Read sections** — Browse the relevant documents.
4. **Biblical foundations** — Use \`bible_lookup\` and \`bible_cross_references\` for passages identified in the documents.
5. **Compare** — Explain agreement, divergence, Scripture use, and historical context.`;
        break;
      }
      case 'donate':
        text = `The user wants to donate to TheologAI. Donations are voluntary and all features remain free.

**Easiest option:** Use [theologai.pages.dev](https://theologai.pages.dev/), which provides wallet connection support.

For current recipient, token, contract, and chain details, call ${callText(calls[0])}. If a wallet MCP tool is available, use those returned details to help the user prepare the transfer.`;
        break;
      default:
        // validatePromptArguments rejects unknown names before this branch.
        return { messages: [] };
    }

    return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
  });
}
