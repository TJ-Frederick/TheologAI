# Confession Study Skill

Cross-tradition doctrinal comparison using TheologAI's historical document collection.

## When to Use

Use this workflow when the user asks about:
- What a creed or confession says about a topic
- Comparing Catholic, Reformed, Lutheran, Anglican, or Orthodox positions
- Historical theology and doctrinal development
- Catechism questions and answers
- How different traditions understand a doctrine

## Available Documents

TheologAI includes 25 historical documents and works: 17 legacy documents and
8 reviewed source-pack editions. Use the catalog and exact resources
returned by the server to establish what is available and what each document
says. The workflow must not assign a tradition or author from a title or from a
prewritten grouping.

Production advertises the v6 local-only `primary_source_search` contract.
Preview may advertise v7, which adds a separately reported CCEL discovery
provider. Preserve that provider's state and unreviewed metadata separately; a
disabled provider did not search or read CCEL.

## Methodology

### Step 1: Identify Relevant Documents

- Read `theologai://primary-sources/catalog` with MCP `resources/read` before
  selecting works. Treat its aliases as exact routing aids, not evidence.
- Treat any traditions named by the user as comparison interests, not as author
  filters or evidence that a document belongs to that tradition.
- Do not infer tradition, authorship, or creator role from a title or topic.

### Step 2: Search Across Traditions

- Call `primary_source_search` with one bounded local query plan, for example
  `{ "queries": [{ "id": "confession-topic", "text": "the doctrinal topic", "providers": ["local"], "match": "all_terms", "selection": "work_diversity", "limit": 5 }] }`.
- On a v7 endpoint, request the separate `ccel` provider only when a discovery
  lead is materially useful. It is never local catalog evidence.
- Treat returned snippets as discovery-only. Preserve document metadata, creator
  names, and creator roles exactly as returned.
- Do not claim the search covered sources outside the hosted collection, and do
  not treat missing hits as historical silence.

### Step 3: Read Specific Sections

- Select at most five unique returned sections and deduplicate locators.
- Preserve each local locator's canonical `sectionKey` and `sourceOrdinal`; the
  legacy display label is explanatory only, never a routing identity. Follow
  each selected canonical `resource_link` with MCP `resources/read` and
  confirm the returned URI matches the selected locator.
- Do not quote, characterize a position, or compare documents from snippets.
  Base those claims only on exact resources actually read.
- Treat local `editionReadiness` as authoritative per result: legacy entries
  remain fail-closed, while reviewed source-pack entries establish the edition
  and provenance status only for normalized public-domain text. Neither form
  authorizes redistribution of source scan artifacts.

### Step 3b: Close the Coverage Ledger

- **Searched:** copy only returned provider execution states.
- **Read:** record only exact local MCP resources or external pages successfully
  opened after discovery.
- **Deferred:** record selected leads intentionally left unread, with a reason.
- **Not searched:** record only a provider or scope the tool reports as not
  executed.

The server cannot observe later resource reads or intentional deferrals. Never
invent either from snippets alone.

### Step 4: Biblical Foundations

- Identify the key Scripture passages each confession cites
- Call `bible_lookup` on the most important proof texts
- Call `bible_cross_references` for wider discovery leads. Prefer its structured requested/resolved references, positioned rows, threshold-scoped result window, and provenance; preserve raw vote order, and do not infer relationship classification or directionality.

### Step 5: Comparison

Present a structured comparison:
1. **Doctrine**: Clear statement of the topic being examined
2. **Points of Agreement**: Where traditions converge
3. **Points of Divergence**: Where traditions differ, with charitable representation
4. **Scripture**: Key biblical texts cited by each tradition
5. **Historical Context**: Why each document was written and what it addressed

## Important Notes

- Represent each tradition charitably and accurately
- Quote primary sources rather than characterizing positions
- Preserve creator roles. Never relabel an issuing, drafting, revising, or
  compiling body as an author.
- Never infer a tradition or author attribution from a title, topic, or the
  user's requested comparison traditions.
- Note the historical context that shaped each document
- Distinguish between formal confessional positions and popular beliefs
- When traditions disagree, present the strongest version of each argument
