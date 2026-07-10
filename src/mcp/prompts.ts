import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { validatePromptArguments } from './validation.js';

export interface RecommendedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

const TRANSLATIONS = new Set(['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']);

function translation(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase();
  return normalized && TRANSLATIONS.has(normalized) ? normalized : 'ESV';
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
      return /^[GH]\d+[a-z]?$/i.test(word)
        ? [{ tool: 'original_language_lookup', arguments: { strongs_number: word.toUpperCase(), include_extended: true, detail_level: 'detailed' } }]
        : [{ tool: 'original_language_lookup', arguments: { query: word, limit: 10 } }];
    }
    case 'passage-exegesis': {
      const reference = args?.reference ?? '';
      return [
        { tool: 'bible_lookup', arguments: { reference, translation: translation(args?.translation), includeFootnotes: true } },
        { tool: 'bible_lookup', arguments: { reference, translation: 'KJV' } },
        { tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } },
        { tool: 'bible_cross_references', arguments: { reference } },
        { tool: 'parallel_passages', arguments: { reference } },
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

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    validatePromptArguments(name, args);
    const calls = recommendedToolCallsForPrompt(name, args);

    let text: string;
    switch (name) {
      case 'word-study': {
        const word = args?.word ?? '';
        const testament = args?.testament;
        const testamentHint = testament
          ? ` Focus on the ${testament.toUpperCase() === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.`
          : '';
        text = `Conduct a thorough word study on "${word}".${testamentHint}

1. **Identify the original term** — ${callText(calls[0])}. If this is a search, choose the best matching Strong's number and make an exact detailed lookup.
2. **Examine morphological usage** — Find a key verse and use \`bible_verse_morphology\` to study its grammatical form.
3. **Study contextual meaning** — Read 2–3 significant passages with \`bible_lookup\` and compare translations.
4. **Explore cross-references** — Use \`bible_cross_references\` on a key verse.
5. **Synthesize** — Summarize semantic range, theological significance, and English-rendering nuances.`;
        break;
      }
      case 'passage-exegesis': {
        const reference = args?.reference ?? '';
        text = `Perform a systematic exegesis of ${reference}.

1. **Read the text** — ${callText(calls[0])}; compare with ${callText(calls[1])}.
2. **Examine the original language** — ${callText(calls[2])}, then make exact \`original_language_lookup\` calls for significant Strong's numbers.
3. **Explore connections** — ${callText(calls[3])} and ${callText(calls[4])}.
4. **Consult commentaries** — ${callText(calls[5])} and ${callText(calls[6])}; note agreement and divergence.
5. **Check historical theology** — ${callText(calls[7])}.
6. **Synthesize** — Explain original context, interpretive decisions, implications, and application.`;
        break;
      }
      case 'compare-translations': {
        const reference = args?.reference ?? '';
        const lookupCalls = calls.slice(0, -1).map(call => `- ${callText(call)}`).join('\n');
        text = `Compare ${reference} across multiple Bible translations.

1. **Retrieve each translation**
${lookupCalls}
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
