# TheologAI — Development Guide

Production MCP server for theological research. Eleven tools, six prompts, eight Bible translations, six commentaries, 17 historical documents, Greek/Hebrew language tools, and on-chain donation support. Tools, resources, and prompts are available on every transport; MCP Logging is stdio-only because HTTP is stateless.

<!-- theologai-public-contract tools=11 structured=bible_cross_references,bible_lookup,bible_verse_morphology,classic_text_lookup,commentary_lookup,donation_config,original_language_lookup,original_language_study,parallel_passages,primary_source_search,verify_donation -->

## Quick Start

```bash
npm run dev          # Start dev server (stdio, tsx watch)
npm run build        # TypeScript compile + copy data to dist/
npm run build:db     # Rebuild SQLite database from source data
npm test             # Run all tests (vitest)
npm run test:unit    # Unit tests only
npm start            # Production server (requires build first)
```

Set `PORT=3000` in `.env` for HTTP transport; omit for stdio.

## Architecture

```
src/
├── index.ts              # Entry point — stdio or HTTP transport (Node.js)
├── worker.ts             # Entry point — Cloudflare Workers (Streamable HTTP)
├── server.ts             # Node wrapper around the shared MCP registrar
├── worker-server.ts      # Worker wrapper around the shared MCP registrar
├── mcp/                  # Shared tools/resources/prompts, schemas, and errors
├── http/                 # Node and Worker transport policies
├── worker-env.ts         # Env type for Workers bindings (D1, secrets, vars)
├── tools/v2/             # Tool handlers + Node.js composition root
│   └── index.ts          # createCompositionRoot() — Node.js wiring (better-sqlite3)
├── tools/worker/         # Workers composition root
│   └── index.ts          # createWorkerCompositionRoot() — D1 wiring (per-request)
├── services/             # Business logic — async, works with both SQLite and D1
│   ├── bible/            # BibleService, CrossReferenceService, ParallelPassageService
│   ├── commentary/       # CommentaryService
│   ├── historical/       # HistoricalDocumentService
│   ├── languages/        # StrongsService, MorphologyService
│   └── donation/         # DonationService
├── adapters/             # External API clients + data repositories
│   ├── bible/            # EsvAdapter, NetBibleAdapter, HelloAoAdapter
│   ├── commentary/       # HelloAoCommentaryAdapter, metadata-only CcelSearchAdapter
│   ├── donation/         # OnChainVerifier
│   ├── data/             # SQLite repositories (Node.js — better-sqlite3)
│   ├── d1/               # D1 repositories (Workers — Cloudflare D1)
│   └── shared/           # Database.ts, HttpClient.ts, HtmlParser.ts
├── formatters/           # Pure Markdown formatting functions
├── kernel/               # Shared domain primitives
│   ├── reference.ts      # THE canonical Bible reference parser
│   ├── books.ts          # 66-book registry with all external format codes
│   ├── repositories.ts   # Async repository interfaces (shared by SQLite + D1)
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── errors.ts         # Typed error hierarchy
│   └── cache.ts          # Generic LRU cache with TTL
└── data/                 # Compiled data (parallel-passages.json)

data/                     # Source data files
├── theologai.db          # SQLite database (built from source data)
├── biblical-languages/   # Strong's concordance, STEPBible morphology/lexicons
├── cross-references/     # OpenBible.info cross-reference TSV
└── historical-documents/ # 17 creeds, confessions, catechisms (JSON)

skills/                   # Agent skill workflows
├── word-study/           # Greek/Hebrew word study methodology
├── passage-exegesis/     # Systematic exegetical analysis
└── confession-study/     # Cross-tradition doctrinal comparison

test/
├── unit/                 # Fast unit, contract, parity, and boundary tests
│   ├── kernel/           # reference, books, cache, errors (94 tests)
│   ├── formatters/       # bibleFormatter, commentary, historical, languages (75 tests)
│   ├── services/         # bible/, commentary/, historical/, languages/, async-compat/ (64 tests)
│   ├── adapters/d1/      # D1 repository tests (61 tests)
│   ├── tools/worker/     # Worker composition root (11 tests)
│   └── worker/           # Worker entry point and policy tests
├── integration/current/  # Shared Node/Worker MCP contract tests
├── worker-runtime/       # Real Workerd endpoint with isolated D1
├── helpers/              # Reusable test utilities (mockD1.ts)
├── fixtures/             # Shared test data
└── setup.ts              # Global test config
```

## MCP Capabilities

### Tools (11)

| Tool | Description |
|------|-------------|
| `bible_lookup` | Verse retrieval across 8 translations (ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY) |
| `bible_cross_references` | OpenBible.info discovery leads with raw vote ranking, unspecified relationship semantics, bounded result windows, and pinned snapshot provenance |
| `parallel_passages` | Complete UBS source-attested groups by default; explicit legacy curated edges and separate OpenBible.info rows |
| `commentary_lookup` | 6 commentaries (Matthew Henry, JFB, Clarke, Gill, K-D, Tyndale) |
| `classic_text_lookup` | Search and browse 17 locally indexed historical documents; no remote CCEL body retrieval |
| `primary_source_search` | Run bounded local-only primary-source query plans with exact local section locators |
| `original_language_lookup` | Strong's concordance plus opt-in exact corrected-corpus usage and bounded occurrence pages |
| `bible_verse_morphology` | Word-by-word grammatical analysis for all 66 books |
| `original_language_study` | Context-first study of one Greek or Hebrew token in one verse, with structured evidence and interpretive limits |
| `donation_config` | Structured voluntary-donation configuration: public web URL, recipient address, and ordered native/token assets; no feature unlocks or asset rankings |
| `verify_donation` | Structured, fail-closed receipt classification across Ethereum, Base, and Radius; no confirmation-depth or finality claim |

All tools have annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.

Exact `original_language_lookup` corpus-usage budgets are fixed: `overview`
returns totals and complete books only; `study` returns the top 10 exact source
variants plus 8 occurrences by default (12 maximum); `technical` returns the
top 25 variants plus 20 occurrences by default (25 maximum). Omission preserves
the legacy response.

### Resources

| URI | Description |
|-----|-------------|
| `theologai://translations` | Available Bible translations |
| `theologai://commentaries` | Available commentators with coverage info |
| `theologai://documents/{slug}` | 17 historical documents (browseable) |
| `theologai://strongs/{number}` | Strong's dictionary entries (G####, H####) |

### Prompts (Guided Workflows)

These prompts provide structured research methodologies. **Auto-trigger**: when a user request matches one of these workflows, invoke the corresponding prompt before proceeding — do not wait for the user to type the slash command.

| Prompt | Slash Command | Trigger When User Asks To... |
|--------|---------------|------------------------------|
| `word-study` | `/mcp__theologai__word-study` | Study a Greek/Hebrew word, explore a Strong's number, or understand a biblical term's meaning |
| `passage-exegesis` | `/mcp__theologai__passage-exegesis` | Exegete a passage, do deep analysis of verses, or study a text systematically |
| `compare-translations` | `/mcp__theologai__compare-translations` | Compare how different translations render a passage, or explore translation differences |
| `confession-study` | `/mcp__theologai__confession-study` | Compare doctrines across creeds, confessions, and catechisms from different traditions |
| `primary-source-research` | `/mcp__theologai__primary-source-research` | Survey a topic or search one exact local work, then read selected exact sections as evidence |
| `donate` | `/mcp__theologai__donate` | Donate, support the project, contribute financially, or ask about donations |

When a user asks "what can you do?" or seems unsure how to proceed, mention these workflows as available research modes.

### Logging

Structured MCP logging via `server.sendLoggingMessage()` is advertised only on
stateful stdio. Stateless Node and Worker HTTP intentionally omit the Logging
capability.

## External APIs

- **HelloAO** (`bible.helloao.org`) — Free, no auth, 1000+ translations + 6 commentaries
- **ESV API** — Requires `ESV_API_KEY` env var, 100k/day limit
- **NET Bible API** — Free, no auth, includes 60k translator notes
- **CCEL discovery adapter** (`ccel.org`) — bounded future-provider architecture;
  preview exposes only its disabled v5 discovery contract, production remains
  v4/local-only, and neither environment may execute a CCEL request without a
  separate release gate. The legacy body reader has been retired; see `NOTICE.md`.

## Conventions

- **ESM throughout** — `"type": "module"` in package.json; use `.js` extensions in imports
- **Dual deployment** — Node.js (stdio/HTTP via `src/index.ts`) and Cloudflare Workers (Streamable HTTP via `src/worker.ts`)
- **Composition roots** — Node.js wiring in `src/tools/v2/index.ts` (better-sqlite3); Workers wiring in `src/tools/worker/index.ts` (D1, per-request)
- **Error handling** — Typed errors from `src/kernel/errors.ts` (APIError, ValidationError, AdapterError, NotFoundError)
- **Caching** — Generic LRU cache in `src/kernel/cache.ts` with 1-hour TTL for API responses
- **Data storage** — SQLite via `better-sqlite3` (Node.js) or Cloudflare D1 (Workers); async repository interfaces in `src/kernel/repositories.ts`
- **Testing** — Vitest with 30s timeout; coverage targets: 80% lines, 75% functions, 70% branches
- **Formatting** — Tools return Markdown via pure functions in `src/formatters/`

## Data Pipeline

Source data files in `data/` are the source of truth. Build scripts compile into SQLite:

```bash
npm run build:db                # Build SQLite database from all sources
npm run build:strongs           # Strong's concordance → src/data/
npm run build:stepbible         # STEPBible morphology → src/data/
npm run build:stepbible:lexicons # STEPBible lexicons → src/data/
```

The SQLite database (`data/theologai.db`) is a derived artifact. Cross-references, Strong's, morphology, and historical documents are all queried via FTS5-indexed SQLite.

## Release-state boundary

PR #92 merged as `cd3d1c38fdf0f939a33a41d4b6d5044eb7f44562`; its exact
reviewed head `3a2b5a57b322dce525f27cfa91c9f667d080bca9` is deployed to
preview only as Cloudflare deployment `04e7a69a-78d2-447b-ac71-e9fb0bef3695`,
Worker `576517dd-84a8-4b5f-a5ea-ed8f124db63d`, and D1
`theologai-preview-20260722-b`
(`94c4938b-7800-4d68-9097-0df33c31fdc1`). Exact-head CI attempt 2 run
`30017722596` and protected preview run `30039858274` passed. The parallel
audit passed 22/22 cases; the Transform-8 audit recorded 48 rate-counted
requests, 53 total HTTP records, and 11/11 assertion groups. The
`deploy-preview` authorization was removed and revocation run `30040550778`
passed. This is not a production deployment. Production remains the deployed
PR #72 baseline: Cloudflare deployment `a4697fd1-deda-4dae-a16c-635454218bc8`,
Worker `762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). The production `workers.dev`
endpoint redirects ordinary requests to the canonical custom domain; the exact
abusive-poller tuple is rejected instead, while the preview legacy endpoint
remains direct. Repository-only U3-T7/PR #83 work remains outside production.

The checked-in production-binding candidate names
`theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`). It passed migrations `0001`–`0005`,
deterministic seeding, strict readiness, and the Transform-8 authority audit,
but no live production Worker is bound to it. The live production deployment,
Worker, and old D1 above remain the matched rollback pair; checked-in config is
not deployment evidence.

The preview-only D1 has migrations `0004` / transform 7 and `0005` / transform
8 materialized. Transform 7's UBS adapters remain runtime-inactive: U3-T7's
in-memory compiler, native-to-normalized coordinate bridge, and content-free
audit do not register an MCP surface or alter current output. Transform 8 is
active in preview's historical repositories: the existing `classic_text_lookup`
has the Baltimore hard cut and canonical/legacy resolution, changing preview
output without adding a tool. The live production Worker and its bound old D1
lack both transforms.
A production D1 release, later UBS runtime activation, Norton transform 9, and
later edition transforms remain separately owner-gated.
`package.json` is private: npm distribution is unsupported.
