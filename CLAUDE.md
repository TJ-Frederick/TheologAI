# TheologAI — Development Guide

Production MCP server for theological research. 7 tools, 8 Bible translations, 6 commentaries, 18 historical documents, Greek/Hebrew language tools.

## Quick Start

```bash
npm run dev          # Start dev server (stdio, tsx watch)
npm run build        # TypeScript compile + copy data to dist/
npm test             # Run all tests (vitest)
npm run test:unit    # Unit tests only
npm start            # Production server (requires build first)
```

Set `PORT=3000` in `.env` for HTTP transport; omit for stdio.

## Architecture

```
src/
├── index.ts              # Entry point (stdio or HTTP transport)
├── server.ts             # MCP server setup, tool registration
├── tools/                # MCP tool handlers — thin: validate → service → format
├── services/             # Business logic — orchestrates adapters
├── adapters/             # External API clients + local data loaders
├── types/                # Shared TypeScript interfaces
├── utils/                # Cache, errors, formatters, mappers
├── data/                 # Compiled data (parallel-passages.json)
└── databases/            # SQL schemas (future use)

data/                     # Source data files
├── biblical-languages/   # Strong's concordance, STEPBible morphology/lexicons
├── cross-references/     # OpenBible.info cross-reference TSV
└── historical-documents/ # 18 creeds, confessions, catechisms (JSON)

test/
├── unit/                 # Fast, mocked tests
├── integration/          # Real services, mocked HTTP
├── e2e/                  # Full pipeline tests
├── fixtures/             # Shared test data
└── setup.ts              # Global test config
```

## Tools

| Tool | Description |
|------|-------------|
| `bible_lookup` | Verse retrieval across 8 translations (ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY) |
| `bible_cross_references` | Thematic connections via OpenBible.info data |
| `parallel_passages` | OT→NT quotations, synoptic parallels, thematic links |
| `commentary_lookup` | 6 commentaries (Matthew Henry, JFB, Clarke, Gill, K-D, Tyndale) |
| `classic_text_lookup` | 18 local docs + 1000+ CCEL works, unified search |
| `original_language_lookup` | Strong's concordance (14,298 entries), Greek/Hebrew word studies |
| `bible_verse_morphology` | Word-by-word grammatical analysis for all 66 books |

## External APIs

- **HelloAO** (`bible.helloao.org`) — Free, no auth, 1000+ translations + 6 commentaries
- **ESV API** — Requires `ESV_API_KEY` env var, 100k/day limit
- **NET Bible API** — Free, no auth, includes 60k translator notes
- **CCEL** (`ccel.org`) — Classic theological texts, free

## Conventions

- **ESM throughout** — `"type": "module"` in package.json; use `.js` extensions in imports
- **Error handling** — Use typed errors from `src/utils/errors.ts` (APIError, ValidationError, RateLimitError)
- **Caching** — Generic LRU cache in `src/utils/cache.ts` with 1-hour TTL for API responses
- **Testing** — Vitest with 30s timeout; coverage targets: 80% lines, 75% functions, 70% branches
- **Formatting** — Tools return Markdown-formatted responses via `src/utils/formatter.ts`

## Data Pipeline

Source data files in `data/` are the source of truth. Build scripts compile them:

```bash
npm run build:strongs           # Strong's concordance → src/data/
npm run build:stepbible         # STEPBible morphology → src/data/
npm run build:stepbible:lexicons # STEPBible lexicons → src/data/
```

Cross-references and historical documents are loaded directly from `data/` at runtime.
