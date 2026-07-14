import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { parseReference } from '../kernel/reference.js';
import { parseStrongsIdentity } from '../kernel/strongs.js';
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
      const strongsIdentity = parseStrongsIdentity(word);
      const lexical = strongsIdentity
        ? [{ tool: 'original_language_lookup', arguments: { strongs_number: strongsIdentity.publicId, include_extended: true, detail_level: 'detailed', usage_level: 'overview' } }]
        : [{ tool: 'original_language_lookup', arguments: { query: word, limit: 10 } }];
      return reference
        ? [
          { tool: 'bible_lookup', arguments: { reference, translation: 'ESV', includeFootnotes: true } },
          { tool: 'bible_lookup', arguments: { reference, translation: 'KJV' } },
          ...(isSingleVerseReference(reference)
            ? [{ tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } }]
            : []),
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
      const singleVerse = isSingleVerseReference(reference);
      const requested = (args?.translations || 'ESV,KJV,NET,BSB')
        .split(',')
        .map(item => item.trim().toUpperCase())
        .filter(item => TRANSLATIONS.has(item));
      const translations = [...new Set(requested)].slice(0, 8);
      const selected = translations.length > 0 ? translations : ['ESV', 'KJV', 'NET', 'BSB'];
      return [
        ...selected.map(item => ({ tool: 'bible_lookup', arguments: { reference, translation: item } })),
        ...(singleVerse ? [{ tool: 'bible_verse_morphology', arguments: { reference, expand_morphology: true } }] : []),
      ];
    }
    case 'confession-study': {
      const topic = args?.topic ?? '';
      return [{
        tool: 'primary_source_search',
        arguments: {
          queries: [{
            id: 'confession-topic',
            text: topic,
            providers: ['local'],
            match: 'all_terms',
            selection: 'work_diversity',
            limit: 5,
          }],
        },
      }];
    }
    case 'primary-source-research': {
      const topic = args?.topic?.trim() ?? '';
      const work = args?.work?.trim();
      const requestedLimit = Number(args?.maxSections?.trim() || '3');
      const limit = Number.isSafeInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 5
        ? requestedLimit
        : 3;
      const authors = (args?.authors ?? '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 4);
      const startYear = args?.startYear === undefined ? undefined : Number(args.startYear.trim());
      const endYear = args?.endYear === undefined ? undefined : Number(args.endYear.trim());
      const scoped = {
        ...(work ? { work } : {}),
        ...(startYear !== undefined ? { startYear } : {}),
        ...(endYear !== undefined ? { endYear } : {}),
      };
      return [{
        tool: 'primary_source_search',
        arguments: {
          queries: (authors.length ? authors : [undefined]).map((author, index) => ({
            id: author ? `creator-${index + 1}` : work ? 'exact-local-work' : 'topic-survey',
            text: topic,
            providers: ['local'],
            match: 'all_terms',
            selection: work ? 'relevance' : 'work_diversity',
            ...scoped,
            ...(author ? { author } : {}),
            limit,
          })),
        },
      }];
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
      {
        name: 'primary-source-research',
        description: 'Find and read bounded evidence from the locally indexed historical collection',
        arguments: [
          { name: 'topic', description: 'Topic or terms to find in the local historical collection', required: true },
          { name: 'work', description: 'Optional exact local work title or slug; not an author name', required: false },
          { name: 'authors', description: 'Optional comma-separated canonical creator names. Each creator becomes a separate query; creator roles remain explicit.', required: false },
          { name: 'startYear', description: 'Optional inclusive composition-year lower bound as an integer string.', required: false },
          { name: 'endYear', description: 'Optional inclusive composition-year upper bound as an integer string.', required: false },
          { name: 'maxSections', description: 'Maximum selected sections as a string integer from 1 to 5. Default: 3.', required: false },
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
        const exactStrongs = parseStrongsIdentity(word) !== undefined;
        const testament = args?.testament;
        const testamentHint = testament
          ? ` Focus on the ${testament.toUpperCase() === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.`
          : '';
        text = reference
          ? `Conduct a context-first word study on "${word}" in ${reference}.${testamentHint}

1. **Read the context** — ${callText(calls[0])}; compare ${callText(calls[1])}.
2. **Resolve the verse token** — ${callText(calls[2])}. Identify the source form, lemma, Strong's identifier, or exact local gloss corresponding to the user's term. Then call \`original_language_study\` with ${reference} and that verse-local target. If it returns \`needs_disambiguation\`, select a candidate only from sentence context and call it again with that source position; do not guess.
3. **Consult lexical and corpus evidence** — ${callText(calls[3])}.${exactStrongs ? '' : ' This first call is discovery only. After it resolves the relevant Strong\'s identity, make a subsequent exact `original_language_lookup` call with that returned `strongs_number`, `include_extended: true`, `detail_level: "detailed"`, and `usage_level: "overview"`; do not invent or hard-code an identifier.'} Keep OpenScriptures lexicon claims, STEPBible lexicon metadata, and counted \`corpusUsage\` source-separated. Present corpus frequency only after the verse-local meaning and never use it to select the sense.
4. **Synthesize in this order** — Begin with **Meaning here, in plain English**, then explain why it fits the verse, the word identity, and grammar. Put broader lexical evidence after the contextual explanation.
5. **Apply safeguards** — Context controls sense. A gloss is not a definition; a Strong's number is an identifier; morphology constrains but does not settle meaning; roots and etymology do not prove present meaning; never import every possible sense into one occurrence. Do not infer Aramaic from an H identifier.`
          : `Provide a lexical overview of "${word}".${testamentHint}

1. **Identify candidate terms** — ${callText(calls[0])}. ${exactStrongs ? 'This is already an exact Strong\'s lookup.' : 'Treat this as discovery. After resolving the relevant candidate from the returned entries, make a subsequent exact `original_language_lookup` call with that returned `strongs_number`, `include_extended: true`, `detail_level: "detailed"`, and `usage_level: "overview"`; do not invent or hard-code an identifier.'} Prefer structured \`mode\`, \`entries\`, \`detailLevel\`, optional \`corpusUsage\`, and \`provenanceIds\`, with Markdown as fallback.
2. **Label the scope honestly** — There is no verse context, so do not claim a contextual meaning. Invite a passage-specific study.
3. **Apply safeguards** — Do not treat one English gloss as exhausting the term's semantic range. Counted morphology tokens are distinct from lexicon occurrence metadata. Frequency, a gloss, Strong's number, morphology, root, or etymology does not establish meaning in a verse, and do not import every possible sense into every occurrence.`;
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
        const lookupCalls = calls.filter(call => call.tool === 'bible_lookup').map(call => `- ${callText(call)}`).join('\n');
        const morphologyCall = calls.find(call => call.tool === 'bible_verse_morphology');
        text = `Compare ${reference} across multiple Bible translations.

1. **Retrieve each translation**
${lookupCalls}
Use structured \`passages[]\` when available, compare by its \`translation\`, report every \`failures[]\` item, and keep each citation/provenance link attached to the relevant translation. Fall back to the Markdown text when structured fields are unavailable.
2. **Examine the original language** — ${morphologyCall ? `${callText(morphologyCall)}.` : 'This is not one exact verse. Select at most three consequential individual verses and call `bible_verse_morphology` separately for each; never pass the range or chapter to the single-verse tool.'}
3. **Investigate divergences** — Make exact \`original_language_lookup\` calls for the relevant Strong's numbers. Request \`usage_level: "overview"\` only when distribution materially helps, keep it after verse-local analysis, and never infer contextual meaning from frequency.
4. **Summarize** — Compare literal/dynamic choices and any theologically significant differences.`;
        break;
      }
      case 'confession-study': {
        const topic = args?.topic ?? '';
        const traditions = args?.traditions;
        const hint = traditions ? ` Focus on: ${traditions.split(',').map(item => item.trim()).join(', ')}.` : '';
        text = `Cross-tradition doctrinal comparison on "${topic}".${hint}

1. **Inspect the hosted catalog** — Read \`theologai://primary-sources/catalog\` with MCP \`resources/read\`. Use only its reviewed work and creator metadata to plan the comparison; aliases route exact work lookups but are not metadata evidence. Do not substitute another creator or work for one absent from this catalog.
2. **Run bounded local discovery** — ${callText(calls[0])}. The work-diverse selection builds a deterministic topic survey across hosted works. Treat snippets as discovery-only and do not claim the search covered sources outside the hosted collection. The requested tradition names are comparison interests, not author filters or evidence that a work belongs to that tradition.
3. **Preserve source metadata** — Keep each hit's creator names and creator roles exactly as returned. Never relabel an issuing, drafting, revising, or compiling body as an author, and never infer a work's tradition or author attribution from its title, topic, or the user's requested traditions.
4. **Read exact evidence** — Before quotation, doctrinal claims, or comparison, follow at most five unique canonical \`resource_link\` blocks with MCP \`resources/read\` and confirm each returned URI matches the selected locator. Deduplicate repeated locators and do not rely on snippets alone.
5. **Biblical foundations** — Use \`bible_lookup\` and \`bible_cross_references\` for passages actually identified in the sections you read.
6. **Compare cautiously** — Explain agreement, divergence, Scripture use, and historical context only from exact sections read. Distinguish document statements from interpretation, and do not treat missing search hits as historical silence.`;
        break;
      }
      case 'primary-source-research': {
        const topic = args?.topic ?? '';
        const work = args?.work?.trim();
        const authors = args?.authors?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
        text = `Research primary-source evidence about "${topic}"${work ? ` within the exact local work "${work}"` : ' across the locally indexed collection'}${authors.length ? ` for the separately scoped creators ${authors.map(value => `"${value}"`).join(', ')}` : ''}.

1. **Inspect the hosted catalog** — Read \`theologai://primary-sources/catalog\` with MCP \`resources/read\`. Confirm requested exact works and creator names there before searching. If Calvin, Erasmus, Luther, or any other requested creator is absent, report that catalog gap; never use a confession or similarly themed work as a proxy.
2. **Run bounded discovery** — ${callText(calls[0])}. This workflow is local-only: do not claim it searched CCEL, the web, an exhaustive catalog, or works outside the server's collection. Topic and creator surveys use deterministic work diversity; exact within-work location uses relevance.
3. **Use the v3 structured result** — Preserve each separate creator query, \`normalizedSelection\`, provider status, \`resultWindow\`, catalog \`scope\` status/count/work list/truncation, rank, notices, creator roles, document type/date, locator, and \`evidencePolicy\`. \`additional_match_observed\` means only that at least one more match was seen beyond the returned window, not that the corpus was exhaustively counted. A \`catalog_miss\` means the hosted catalog did not match the restriction; \`no_results\` means eligible hosted works were searched but no text hit matched. Treat every snippet as \`discovery_only\`.
4. **Read selected evidence before quotation or comparison** — Follow at most ${args?.maxSections?.trim() || '3'} unique canonical \`resource_link\` blocks using MCP \`resources/read\`. Deduplicate locators and confirm that every returned URI matches the selected locator. Do not quote, compare creators/works, or draw substantive conclusions from snippets alone.
5. **Report provenance honestly** — Edition provenance is incomplete and rights status is not established by the catalog resource. Do not invent an author, edition, transcription source, publication date, or rights status. Work-level type/date metadata is not edition metadata.
6. **Synthesize with limits** — Distinguish what the selected sections say from your interpretation. Name searches that returned no results or unsupported filters; do not treat missing hits as historical silence.

This workflow supports a topic survey, exact local-work search, inclusive overlapping composition-year scope, and up to four creator scopes. Creator comparisons always use separate query-plan items and only sections actually read; a drafting or issuing body is never relabeled as an author. Never issue more than four query groups or read more than five exact section resources in one workflow.`;
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
