# TheologAI — Development Guide

Production MCP server for theological research. 7 tools, 4/4 MCP capabilities (Tools, Resources, Prompts, Logging), 8 Bible translations, 6 commentaries, 18 historical documents, Greek/Hebrew language tools.

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
├── index.ts              # Entry point (stdio or HTTP transport)
├── server.ts             # MCP server — tools, resources, prompts, logging
├── tools/v2/             # Tool handlers + composition root (DI wiring)
│   └── index.ts          # createCompositionRoot() — single wiring point
├── services/             # Business logic — orchestrates adapters
│   ├── bible/            # BibleService, CrossReferenceService, ParallelPassageService
│   ├── commentary/       # CommentaryService, CcelService
│   ├── historical/       # HistoricalDocumentService
│   └── languages/        # StrongsService, MorphologyService
├── adapters/             # External API clients + data repositories
│   ├── bible/            # EsvAdapter, NetBibleAdapter, HelloAoAdapter
│   ├── commentary/       # HelloAoCommentaryAdapter, CcelAdapter
│   ├── data/             # SQLite repositories (CrossRef, Strongs, Morphology, Historical)
│   └── shared/           # Database.ts, HttpClient.ts, HtmlParser.ts
├── formatters/           # Pure Markdown formatting functions
├── kernel/               # Shared domain primitives
│   ├── reference.ts      # THE canonical Bible reference parser
│   ├── books.ts          # 66-book registry with all external format codes
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── errors.ts         # Typed error hierarchy
│   └── cache.ts          # Generic LRU cache with TTL
└── data/                 # Compiled data (parallel-passages.json)

data/                     # Source data files
├── theologai.db          # SQLite database (built from source data)
├── biblical-languages/   # Strong's concordance, STEPBible morphology/lexicons
├── cross-references/     # OpenBible.info cross-reference TSV
└── historical-documents/ # 18 creeds, confessions, catechisms (JSON)

skills/                   # Agent skill workflows
├── word-study/           # Greek/Hebrew word study methodology
├── passage-exegesis/     # Systematic exegetical analysis
└── confession-study/     # Cross-tradition doctrinal comparison

test/
├── unit/                 # Fast, mocked tests
│   ├── kernel/           # reference, books, cache, errors (94 tests)
│   ├── formatters/       # bibleFormatter, commentary, historical, languages (75 tests)
│   ├── services/         # bible/, commentary/, historical/, languages/ (56 tests)
│   └── utils/            # Legacy utils tests (69 tests, kept until old code deleted)
├── fixtures/             # Shared test data
└── setup.ts              # Global test config
```

## MCP Capabilities

### Tools (7)

| Tool | Description |
|------|-------------|
| `bible_lookup` | Verse retrieval across 8 translations (ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY) |
| `bible_cross_references` | Thematic connections via OpenBible.info data |
| `parallel_passages` | OT→NT quotations, synoptic parallels, thematic links |
| `commentary_lookup` | 6 commentaries (Matthew Henry, JFB, Clarke, Gill, K-D, Tyndale) |
| `classic_text_lookup` | 18 local docs + 1000+ CCEL works, unified search |
| `original_language_lookup` | Strong's concordance (14,298 entries), Greek/Hebrew word studies |
| `bible_verse_morphology` | Word-by-word grammatical analysis for all 66 books |

All tools have annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.

### Resources

| URI | Description |
|-----|-------------|
| `theologai://translations` | Available Bible translations |
| `theologai://commentaries` | Available commentators with coverage info |
| `theologai://documents/{slug}` | 18 historical documents (browseable) |
| `theologai://strongs/{number}` | Strong's dictionary entries (G####, H####) |

### Prompts (Guided Workflows)

These prompts provide structured research methodologies. **Auto-trigger**: when a user request matches one of these workflows, invoke the corresponding prompt before proceeding — do not wait for the user to type the slash command.

| Prompt | Slash Command | Trigger When User Asks To... |
|--------|---------------|------------------------------|
| `word-study` | `/mcp__theologai__word-study` | Study a Greek/Hebrew word, explore a Strong's number, or understand a biblical term's meaning |
| `passage-exegesis` | `/mcp__theologai__passage-exegesis` | Exegete a passage, do deep analysis of verses, or study a text systematically |
| `compare-translations` | `/mcp__theologai__compare-translations` | Compare how different translations render a passage, or explore translation differences |

When a user asks "what can you do?" or seems unsure how to proceed, mention these workflows as available research modes.

### Logging

Structured logging via `server.sendLoggingMessage()` with levels: debug, info, warning, error.

## External APIs

- **HelloAO** (`bible.helloao.org`) — Free, no auth, 1000+ translations + 6 commentaries
- **ESV API** — Requires `ESV_API_KEY` env var, 100k/day limit
- **NET Bible API** — Free, no auth, includes 60k translator notes
- **CCEL** (`ccel.org`) — Classic theological texts, free

## Conventions

- **ESM throughout** — `"type": "module"` in package.json; use `.js` extensions in imports
- **Composition root** — All DI wiring in `src/tools/v2/index.ts`; services receive adapters via constructor
- **Error handling** — Typed errors from `src/kernel/errors.ts` (APIError, ValidationError, AdapterError, NotFoundError)
- **Caching** — Generic LRU cache in `src/kernel/cache.ts` with 1-hour TTL for API responses
- **Data storage** — SQLite via `better-sqlite3` for all local data (replaces in-memory Maps)
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
