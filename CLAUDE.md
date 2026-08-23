# TheologAI — Development Guide

<!-- theologai-release-authority v1 role=developer-guide current=docs/CURRENT-RELEASE.md -->

This developer guide is not release-identity authority. For the sole active
production and preview-control snapshot, see
[`docs/CURRENT-RELEASE.md`](docs/CURRENT-RELEASE.md); release identities below
are dated historical evidence.

Production MCP server for theological research. Eleven tools, six prompts, eight Bible translations, six commentaries, 35 historical documents and works, Greek/Hebrew language tools, and on-chain donation support. Tools, resources, and prompts are available on every transport; MCP Logging is stdio-only because HTTP is stateless.

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
├── historical-documents/ # 17 legacy creeds, confessions, catechisms (JSON)
└── historical-source-packs/ # 18 reviewed, sectioned-only source-pack editions

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
| `classic_text_lookup` | Search and browse 35 local historical works; 18 reviewed source-pack editions are sectioned-only; no remote CCEL body retrieval |
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
| `theologai://documents/{slug}` | 35 historical works (17 legacy plus 18 reviewed source-pack editions; browseable) |
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
  preview exposes its disabled v7 discovery contract, production remains
  v6/local-only, and neither environment may execute a CCEL request without a
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

## Historical release-state evidence

The PR #108 record below is dated historical release evidence, not current
today. It merged as source commit
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6`. At the canonical endpoint
`https://mcp.theologai.xyz/mcp`, protected workflow `30496350408` proved the
same sole 100% Cloudflare production assignment before and after testing:
deployment `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). The historical core passed 8/8,
Transform-11 spine passed 10/10, `original_language_study` v2 passed 11/11,
primary-source edge stabilization matched on attempt 4 and remained stable,
and the independent post-release review returned `SHIP`.

PR #101 is the matched rollback record—not the active production binding:
deployment `71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`).

The stateless `original_language_study` v2 production audit passed 11/11 cases
in 14 exchanges (initialization, initialized notification, `tools/list`, and
11 calls), capped at 180 seconds end-to-end, 30 seconds per request, 256 KiB
per response, and 1 MiB aggregate. Fixture SHA-256:
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`. Stored
evidence is sanitized metadata and hashes only; it does not retain tool output
or source text.

PR #72 is the matched rollback record—not the active production binding:
merge `72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). The production `workers.dev`
endpoint still redirects ordinary requests to the canonical custom domain; the
documented abusive-poller tuple is rejected and the preview legacy endpoint
remains direct.

> **PR96 broad MCP smoke — PASS:** Completed in 8.834 seconds. Sanitized
> `production-mcp-smoke-audit.json` evidence SHA-256:
> `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
> It verified 26 MCP operations across 27 HTTP exchanges and 293,466 aggregate
> MCP response bytes, stateless with no retries or redirects. Pre/post identity
> was unchanged: deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

> **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
> post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
> Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
> SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
> 1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
> SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
> 848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
> Two automatic reconnect warnings and a maximum uninterrupted segment of about
> 19m12s mean this is neither a continuous 30-minute observation nor an
> exhaustive/global request count. Wrangler tail authoritatively cannot provide
> a request total: 2,172 observed events = 2,167 ok + 5 separately classified
> client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
> truncated events, and 0 unexpected release errors. Raw captures are private
> and unpublished because they contain request metadata. Final authoritative
> identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
> `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
> `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
> sole 100%; identity SHA-256
> `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

Transform 11 activates 18 reviewed sectioned-only source-pack editions in the
checked-out local corpus and both deployed 35-work catalogs. Norton and Aquinas
assets remain inactive; the incomplete
Aquinas hierarchy has no document, catalog, search, resource, runtime, or D1
projection.
`package.json` is private: npm distribution is unsupported.
