# TheologAI

TheologAI is an MCP server for Bible study and theological research. It runs
locally over stdio or Streamable HTTP and on Cloudflare Workers with D1.

The current registry contains eleven tools, six guided prompts, eight English
Bible translations, six commentary sources, 17 locally indexed
historical documents, Strong's dictionaries, and Greek/Hebrew morphology.

<!-- theologai-public-contract tools=11 structured=bible_lookup,bible_verse_morphology,original_language_lookup,original_language_study,parallel_passages,primary_source_search -->

## Remote endpoint

The hosted anonymous endpoint is:

```text
https://theologai.tjfrederick.workers.dev/mcp
```

`/mcp` is canonical. `/` remains a temporary compatibility alias and may be
removed after its usage falls to zero.

## MCP capabilities

| Transport | Tools | Resources | Prompts | MCP Logging |
|---|---:|---:|---:|---:|
| stdio | Yes | Yes | Yes | Yes |
| Node Streamable HTTP | Yes | Yes | Yes | No |
| Cloudflare Streamable HTTP | Yes | Yes | Yes | No |

HTTP is intentionally anonymous and stateless. MCP Logging is limited to stdio
because `logging/setLevel` state cannot persist when each HTTP POST receives a
fresh server and transport.

### Tools

| Tool | Current behavior |
|---|---|
| `bible_lookup` | Retrieve a passage in ESV, NET, KJV, WEB, BSB, ASV, YLT, or DBY; arrays compare translations. |
| `bible_cross_references` | Query locally indexed OpenBible.info cross references. |
| `parallel_passages` | Return complete UBS source-attested parallel groups by default; legacy curated edges and OpenBible.info cross references require explicit selectors and remain separate. |
| `commentary_lookup` | Retrieve Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch (OT), or Tyndale notes. |
| `classic_text_lookup` | Search and browse the 17 locally indexed historical documents. Remote CCEL document bodies are not retrieved or republished. |
| `primary_source_search` | Execute a bounded local query plan with v3 structured results, relevance or deterministic work-diverse selection, honest result windows, exact work/creator and inclusive composition-year scope, explicit catalog coverage, and native links to exact section resources. Snippets remain discovery-only. |
| `original_language_lookup` | Look up or search Strong's entries, with opt-in exact corrected-corpus usage and bounded occurrence pages for exact identities. |
| `bible_verse_morphology` | Return bounded word-by-word morphology for one exact verse, with raw codes, nullable expansions, and separate pinned STEPBible morphology/lemma provenance. |
| `original_language_study` | Resolve and study one Greek or Hebrew token in one verse with contextual morphology, source-separated lexical evidence, and explicit interpretive limits. |
| `donation_config` | Return voluntary-donation recipient, asset, and chain configuration. |
| `verify_donation` | Classify a transaction and confirm only supported transfers to the configured recipient. |

`parallel_passages` defaults unconditionally to `corpora:
["ubs_source_attested"]`, with at most five complete groups. It does not fall
back to the legacy corpus when UBS has no match. Raw UBS alignment metadata is
opt-in. The older curated edge behavior remains available through
`corpora: ["theologai_legacy"]`; its `mode` and `maxParallels` controls retain
their prior item semantics. OpenBible.info rows are off by default and, when
requested with `includeOpenBibleCrossReferences`, are returned in a separate
collection. The deprecated `useCrossReferences` alias now also defaults false,
and conflicting old/new values are rejected.

For exact `original_language_lookup` calls, corpus usage is opt-in. `overview`
returns totals plus the complete canonical-book distribution only. `study`
adds the top 10 exact source variants and defaults to 8 raw occurrences (maximum
12). `technical` adds the top 25 variants and defaults to 20 raw occurrences
(maximum 25). Search mode and calls that omit `usage_level` retain their prior
responses.

All tools are annotated as read-only, non-destructive, and idempotent. Tool
inputs use closed, bounded JSON Schema 2020-12 contracts. `bible_lookup`,
`bible_verse_morphology`, `parallel_passages`, `primary_source_search`,
`original_language_lookup`, and `original_language_study`
also advertise versioned object-root `outputSchema`
contracts and return matching `structuredContent` beside the existing Markdown
content. Bible, verse-morphology, parallel-passage, and original-language structured results
include bounded, result-local provenance records. Primary-source results do not
invent edition provenance records: their evidence policy explicitly marks
edition provenance incomplete, and they link only canonical local sections with
exact UTF-8 sizes. Their result windows say only whether one additional match
was directly observed through private lookahead; they do not imply exhaustive
counts. All other tools retain their current Markdown-only result
contract.

### Resources

| URI | Description |
|---|---|
| `theologai://translations` | Available Bible translations. |
| `theologai://commentaries` | Available commentary sources. |
| `theologai://primary-sources/catalog` | JSON metadata inventory for the hosted primary-source collection; no document bodies or provenance URLs. |
| `theologai://documents/{slug}` | A locally indexed creed, confession, or catechism. |
| `theologai://strongs/{number}` | A Strong's dictionary entry such as `G26` or `H430`. |

### Guided prompts

| Prompt | Workflow |
|---|---|
| `word-study` | Strong's lookup/search, morphology, context, and synthesis. |
| `passage-exegesis` | Text, language, cross references, commentary, and historical theology. |
| `compare-translations` | Compare translation choices against morphology and lexical data. |
| `confession-study` | Inspect the hosted catalog, build a work-diverse doctrinal survey, then read selected exact sections. |
| `primary-source-research` | Inspect the catalog; use work diversity for topic/creator surveys or relevance within one work; then read at most five unique exact sections as evidence. |
| `donate` | Explain voluntary donation options. |

## Content scope and provenance

### Bible translations

- ESV through the ESV API when `ESV_API_KEY` is configured.
- NET through the NET Bible API.
- KJV, WEB, BSB, ASV, YLT, and DBY through HelloAO.

### Commentary

Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, and
Keil-Delitzsch are treated as public-domain source texts. Tyndale Open Study
Notes are CC BY-SA 4.0 and responses include attribution. See [NOTICE.md](NOTICE.md).

Scalar commentary is returned only when the provider exposes an exact,
trustworthy verse identity. For section-level commentary, use chapter lookup
as the truthful fallback rather than treating a section anchor as a verse span.

### Historical documents and external discovery

The local database contains 17 tracked creeds, confessions, and
catechisms. The exact count is enforced by `data/data-manifest.json`.

The public tools search and retrieve only the locally indexed collection. They
do **not** currently fetch CCEL search results or document bodies. Defensive
CCEL discovery adapters remain in the codebase as future provider architecture,
but CCEL is not requestable in the public input schema and is unreachable from
the public tool handler. The v3 output schema and structured result are also
strictly local-only; dormant external-provider result shapes remain internal.
Any future external provider rollout must remain discovery-only until
edition-specific rights and provider-policy gates are satisfied.

Local search metadata uses exact lookup-only aliases for routing, plus reviewed composition
date bounds when known, and explicitly named creators with their precise roles.
Roles use the closed vocabulary `author`, `issuing_body`, `drafting_body`,
`revising_body`, and `compiler`; a non-author role is not relabeled as
authorship. Stable metadata provenance IDs resolve to the checksum-pinned
companion review manifest. This metadata does not establish an edition, transcription
provenance, publication date, or rights status. Search snippets are discovery aids. Quote or analyze a
selected passage only after reading its exact `theologai://documents/...#section-...`
resource. The collection and every response are bounded and non-exhaustive.

### Language and reference data

- 14,298 Strong's entries from OpenScriptures.
- 447,748 indexed STEPBible morphology rows spanning all 66 books.
- STEPBible lexicon extensions and morphology-code expansions.
- OpenBible.info cross references.
- 2,193 UBS source-attested parallel groups (CC BY-SA 4.0), normalized into
  SQLite/D1 with pinned source provenance and artifact identity.
- A small bundled legacy curated parallel-passage corpus, available only by
  explicit selector.

Source hashes and expected database counts live in
`data/data-manifest.json`. The SQLite database is a derived, ignored artifact.

## Local development

Requirements:

- Node.js 22 (the exact tested version is in `.nvmrc`).
- npm.
- `sqlite3` for the D1 seed export/import workflow.

```bash
npm ci
npm run data:verify-sources
npm run build:db
npm run build
```

### stdio

Leave `PORT` unset:

```bash
npm start
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "theologai": {
      "command": "node",
      "args": ["/absolute/path/to/TheologAI/dist/index.js"]
    }
  }
}
```

### Node HTTP

```bash
PORT=3000 npm start
```

HTTP configuration:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Listen address. |
| `MCP_ALLOWED_HOSTS` | Loopback hosts | Additional accepted Host names. |
| `MCP_ALLOWED_ORIGINS` | `https://theologai.pages.dev` | Comma-separated exact browser origins. |
| `MCP_MAX_BODY_BYTES` | `1048576` | Maximum request body size. |
| `THEOLOGAI_DATABASE_PATH` | `data/theologai.db` | Explicit derived SQLite database path. |

Native MCP clients without an `Origin` header are supported. Browser requests
must supply an exact configured origin.

## Verification commands

```bash
npm test                    # unit + current-architecture integration
npm run test:unit           # fast unit tests
npm run test:coverage       # unit suite with enforced thresholds
npm run test:integration    # shared/Node/Worker registry contract
npm run test:worker-runtime # real Workerd endpoint with isolated D1
npm run test:e2e            # compiled Node HTTP process boundary
npm run test:conformance    # applicable official MCP server scenarios
npm run test:data           # fresh SQLite and deterministic D1 reconstruction
npm run d1:seed:verify-workerd # representative seed import through local D1
npm run test:all            # every deterministic local suite
npm run typecheck           # Node and Worker targets
npm run validate:worker-config
```

Some of these aggregate scripts are established by the current hardening work;
CI continues to call the named suites explicitly so failures remain diagnosable.

## Data workflows

```bash
npm run build:db
npm run data:verify-db
npm run d1:seed:export -- --clean
npm run d1:seed:verify
```

See [docs/D1-DATA-WORKFLOW.md](docs/D1-DATA-WORKFLOW.md). Generated D1 seed
files live under ignored `scripts/d1-seed/`; remote D1 migration or seeding is a
separate, explicitly authorized operation.

## Cloudflare operations and security

The Worker uses:

- exact browser-origin validation and native no-Origin support;
- bounded streamed request bodies;
- anonymous per-location rate limiting at 120 requests/minute per SHA-256
  IP + user-agent fingerprint;
- separate production and preview rate-limit namespaces;
- structured telemetry that omits raw identities, authorization values,
  session identifiers, query strings, arguments, and exception messages;
- D1 bindings and generated Wrangler types.

The fingerprint limit is abuse friction, not authenticated user accounting: a
caller can rotate user agents, and users behind the same NAT may share a bucket.

See [docs/worker-operations.md](docs/worker-operations.md). Normal pull requests
perform verification only; preview and production deployment require explicit
approval. Deployment does not automatically migrate or seed remote D1.

## Architecture

```text
src/
├── index.ts                 Node stdio/HTTP entrypoint
├── worker.ts                Cloudflare Worker orchestration
├── mcp/                     shared registration, validation, and protocol errors
├── http/                    Node and Worker transport policies
├── tools/                   Node and Worker composition roots and handlers
├── services/                target-independent business logic
├── adapters/data/           better-sqlite3 repositories
├── adapters/d1/             Cloudflare D1 repositories
├── adapters/                remote Bible/commentary/donation providers
├── kernel/                  domain types, ports, errors, references, caching
└── formatters/              pure Markdown formatting
```

Business services depend on shared repository ports. Node uses synchronous
SQLite repositories through async-compatible service boundaries; Workers uses
per-request D1 repositories. Both targets share one MCP registry.

## Known boundaries and roadmap

- The current tracked roadmap is [docs/ROADMAP.md](docs/ROADMAP.md), beginning
  after the PR #10 production baseline.
- Full CCEL discovery and search are future work.
- The local historical collection needs document-level edition, source, and
  license metadata before redistribution claims can be made.
- Hosted MCP Logging would require a deliberate stateful-session design.
- Authentication, saved workspaces, completions, and MCP tasks should be added
  only when a concrete workflow requires them. Structured output is currently
  limited to the two representative lookup tools above; further conversions
  require separate compatibility review.
- Remote D1 compatibility must be checked before any deployment; migration or
  corpus replacement requires separate review and approval.

The dated architecture assessment remains under ignored `test-output/` as
historical source context; it is not the current roadmap or product contract.
