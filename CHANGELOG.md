# Changelog

All notable changes to TheologAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- theologai-public-contract tools=11 structured=bible_cross_references,bible_lookup,bible_verse_morphology,classic_text_lookup,commentary_lookup,donation_config,original_language_lookup,original_language_study,parallel_passages,primary_source_search,verify_donation -->

### Changed

- Recorded the PR #96 production identity: source commit
  `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
  `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, canonical endpoint
  `https://mcp.theologai.xyz/mcp` (server `3.6.0`), deployment
  `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
  `7a3f5078-37bc-453e-bac7-a0743afd508a`, and D1
  `theologai-production-20260723-a`
  (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`). Identity checks before and after
  the audit found that same version at the sole 100% production assignment.
  The stateless `original_language_study` v2 audit passed 11/11 cases in 14
  exchanges under 180-second end-to-end, 30-second per-request, 256 KiB
  per-response, and 1 MiB aggregate limits. Its fixture SHA-256 is
  `dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`; evidence
  retains sanitized metadata and hashes only.

  PR #72 is now the explicit rollback record, not the current release: merge
  `72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
  `a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
  `762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
  `theologai-production-20260715-a`
  (`c6535a4a-1953-4279-b277-7368445fc61a`).

  **PR96 broad MCP smoke — PASS:** completed in 8.834 seconds. Sanitized
  `production-mcp-smoke-audit.json` SHA-256:
  `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
  It verified 26 MCP operations / 27 HTTP exchanges and 293,466 aggregate MCP
  response bytes, stateless with no retries or redirects. Pre/post identity
  remained deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
  `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
  `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

  **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
  post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
  `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
  Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
  SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
  1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
  SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
  848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
  Two automatic reconnect warnings and a maximum uninterrupted segment of about
  19m12s mean this is neither a continuous 30-minute observation nor an
  exhaustive/global request count. Wrangler tail authoritatively cannot provide
  a request total: 2,172 observed events = 2,167 ok + 5 separately classified
  client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
  truncated events, and 0 unexpected release errors. Raw captures are private
  and unpublished because they contain request metadata. Final authoritative
  identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
  `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
  `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
  `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
  sole 100%; identity SHA-256
  `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

- Completed the historical runtime-inert UBS Hebrew U3-T7 compiler, canonical
  native-to-normalized bridge, content-free reproducibility audit, embedded
  rights/provenance notice, and full-corpus integrity verification. The full
  semantic artifact remains untracked. M4A completes migration `0004`,
  transform 7, SQLite materialization, deterministic D1 seed/import
  verification, and inactive Node/D1 adapters at that historical stage. PR #96
  later deployed the prepared production D1 and the audited
  `original_language_study` v2 surface; the release record above is the
  authority for its live behavior.
  `SOURCE.json` remains the historical acquisition-gate snapshot rather than
  deployment evidence. Its pre-PR96 release-gating language is historical; the
  production binding and bounded public v2 audit are recorded above.

- Clarified endpoint migration behavior: ordinary production `workers.dev`
  requests temporarily redirect to the canonical custom domain, while the
  documented abusive-poller IP-plus-user-agent tuple is rejected and preview
  `workers.dev` remains a direct compatibility endpoint. Production keeps the
  primary-source v6/local-only schema; preview keeps the v5 discovery-only
  schema, with CCEL execution disabled in both environments.

- Preserved the acquired UBS source packet's pre-PR96 local/preview history:
  preview D1 holds its `0004`/transform 7 and `0005`/transform 8 materialized
  state. PR #96's production D1 binding and public v2 audit supersede the
  former claim that production was unactivated; they do not by themselves
  establish the runtime status of Norton transform 9 or later edition
  transforms.

- Retired the unreachable CCEL body reader while retaining the bounded,
  disabled discovery adapter. npm distribution remains unsupported and the
  package remains private.

- Centralized the historical-work catalog and search-scope capacity at the
  existing 100-work hard ceiling, using one D1-safe JSON/`json_each` bind for
  scoped work IDs. The hosted corpus and readiness inventory remain 17 works;
  this changes no database schema, public contract version, or transform.

- Updated the v4 guided primary-source workflow for CCEL's lack of reviewed
  composition-date filtering. Requested year bounds remain exact on hosted-
  local queries; the one external discovery call omits them and repeats a
  bounded warning at search and synthesis. Direct CCEL queries containing a
  year bound remain `unsupported_filter` before adapter or coordinator
  admission. No contract version, rollout flag, or live authorization changed.

- Withheld the Online-Bible-derived TBESH Hebrew `Meaning` field from lookup,
  study, and Strong's-resource output. Exact identities, Hebrew forms,
  transliteration, morphology, lemma, and Tyndale-created brief glosses remain;
  structured and Markdown output now disclose when semantic definition
  evidence is unavailable instead of fabricating a replacement.

- Added a closed v1 structured contract to all four `classic_text_lookup`
  modes while preserving their Markdown. It exposes the complete local work
  inventory as metadata summaries without body reads or native catalog links;
  directory locators are unsized, while directly selected work and search
  evidence retains exact byte-sized MCP resources. The 100-work and
  2,000-section complete-result ceilings fail explicitly instead of truncating.
  Invalid stored document or section locators now fail closed as integrity
  hardening rather than being omitted or attributed approximately.
- Established `mcp.theologai.xyz/mcp` and `preview-mcp.theologai.xyz/mcp` as
  the canonical production and preview MCP addresses. The Pages alias remains
  available; production `workers.dev` is a redirect and preview `workers.dev`
  remains direct for compatibility/rollback.
- Released the primary-source profile split: preview advertises v5
  discovery-only inputs while production is v4/local-only. Live CCEL search
  and coordinator execution remain disabled, so external preview queries stop
  before adapter, Durable Object, or network work.

## [3.6.0] - 2026-07-15

### Added

- Added stable MCP 2025-11-25 structured output and server-side schema
  validation for `bible_lookup`, `bible_cross_references`, `parallel_passages`,
  `bible_verse_morphology`, `primary_source_search`, `original_language_lookup`,
  `original_language_study`, `commentary_lookup`, `donation_config`, and `verify_donation`, while keeping
  their Markdown content available for legacy clients.
- Added versioned `commentary_lookup` results whose exact-verse claims come
  from explicit provider identity evidence rather than request shape. Matthew
  Henry and Keil-Delitzsch are structurally chapter-only; John Gill exact
  results require `verseNumber`; JFB, Clarke, and Tyndale may also use a
  provider entry explicitly typed as a verse. Results label commentary text as
  Markdown and separate conservative work rights from cached-or-live HelloAO
  delivery. Retrieval reports that per-result cache status is not exposed,
  validates response-container work/book/chapter identity, and surfaces the
  provider corpus SHA-256 without presenting it as edition provenance.
- Added versioned `donation_config` results with explicit voluntary/no-feature-
  unlock policy, the shared public donation URL, recipient address, and ordered
  native/token asset metadata. The structure makes native addresses null,
  rejects address/kind contradictions, retains exact token contract addresses,
  and marks configured display order explicitly as non-ranking without implying price,
  liquidity, bridge, or wallet capability.
- Added versioned `verify_donation` results with exact three-chain coverage,
  seven correlated classifications, bounded status-relevant transfers, exact
  pre-bound counts, allowlisted explorer links, and fail-closed evidence
  handling. A successful receipt is explicitly
  `receipt_observed_no_confirmation_depth`, not a finality claim.
- Added versioned `bible_cross_references` results with requested and canonical
  references, effective query values, raw OpenBible.info ranking semantics,
  bounded positions, threshold-scoped result windows, and exact snapshot
  provenance. The existing Markdown response is unchanged.
- Added bounded, result-local provenance records and structured-first guidance
  to the word-study, passage-exegesis, and compare-translations prompts.
- Added versioned grouped output and provenance for `parallel_passages`, with a
  hard default to complete UBS source-attested groups. Legacy curated edges and
  OpenBible.info rows remain available only through explicit, separate selectors.
- Added `primary_source_search`, an explicit, bounded local research-plan tool.
  Its versioned structured output keeps query/provider grouping and evidence
  policy, while native resource links resolve selected canonical local sections
  with exact byte sizes. It does not advertise or invoke inactive CCEL adapters.
- Added the local-only `primary-source-research` prompt for bounded topic surveys
  or exact-work searches followed by explicit MCP section reads.
- Added v3 primary-source research bundles: relevance or deterministic
  round-robin work selection, limit-plus-one result-window evidence, a
  metadata-only `theologai://primary-sources/catalog` JSON resource, and guided
  topic, exact-work, and separate-creator workflows. Markdown remains available.
- Added `original_language_study`, a context-first study of one verse token that
  combines morphology and source-separated lexical evidence while stating its
  interpretive limits.
- Added exact Strong's identity preservation, including extended STEPBible
  identities such as `G21502` and `H9001`, across SQLite, D1, resources, lookup,
  morphology, and structured output.
- Added the pinned CC BY-SA 4.0 UBS/Paratext source compiler, strict source and
  generated-artifact verification, D1 materialization, and a hard default to
  source-attested UBS parallel groups. Raw alignment remains opt-in, and legacy
  and OpenBible.info evidence remain explicitly separate.

### Corrected

- Reconciled the pending public contract at version 3.6.0: eleven tools, six
  prompts, 17 local historical documents, and transport-specific Logging.
- Scoped D1 readiness to both schema and materialization identity. Remote D1
  preparation and preview/production deployment remained separate operational
  gates and were performed only through their authorized release workflows.
- Removed public CCEL document-body retrieval and reconciled both historical
  tools with the currently local-only provider contract. Defensive external
  discovery architecture remains inactive for a separately reviewed future rollout.
- Removed dormant external-provider branches from the public
  `primary_source_search` v3 output schema and structured result while retaining
  the inactive internal adapter and service architecture.
- Completed structured source metadata for ESV, NET, and the bundled legacy
  parallel corpus without asserting an open license for copyrighted translations.
- Corrected Tyndale Open Study Notes licensing to CC BY-SA 4.0.

## [4.0.0-draft] - Not released

> This section was written as a future release draft. It is retained as design
> history, but its feature counts and CCEL scope are not the current product
> contract. See the README and the Unreleased corrections above.

### Added — Cloudflare Workers Remote MCP Deployment

#### Remote MCP Server
- Cloudflare Workers entry point (`src/worker.ts`) serving MCP over Streamable HTTP via the Agents SDK
- Worker MCP server (`src/worker-server.ts`) with all 7 tools, 4 resources, 4 prompts, and logging
- Live at `https://theologai.tjfrederick.workers.dev/mcp` — no authentication required
- CORS configured for Claude.ai browser connections (`Mcp-Session-Id` exposed)

#### D1 Database Layer
- 4 D1-backed repository adapters replacing better-sqlite3 for the worker runtime
  - `D1CrossReferenceRepository`, `D1StrongsRepository`, `D1MorphologyRepository`, `D1HistoricalDocumentRepository`
- Async repository interfaces (`src/kernel/repositories.ts`) shared by both SQLite and D1 adapters
- Worker composition root (`src/tools/worker/index.ts`) with per-request D1 wiring and module-scope HTTP adapter caching
- D1 export script (`scripts/export-for-d1.sh`) to migrate SQLite data

#### Async Service Layer
- All services (`CrossReferenceService`, `StrongsService`, `MorphologyService`, `HistoricalDocumentService`, `ParallelPassageService`) converted to async
- Backward-compatible: `await syncValue` resolves immediately, so Node.js server is unaffected

#### confession-study Prompt
- New `confession-study` prompt for cross-tradition doctrinal comparison across creeds, confessions, and catechisms
- Available in both Node.js and Workers servers (4 prompts total)

### Fixed
- Missing `await` in Node.js server resource handlers (broken by async migration)

### Testing
- 107 new tests for Workers/D1 layer (332 total)
  - D1 repository unit tests (61 tests)
  - Worker composition root, MCP server, and entry point tests (38 tests)
  - Async/sync parity tests proving dual-target compatibility (8 tests)
  - Reusable `mockD1` test helper

## 3.4.0 - 2025-10-09

### Added - Enhanced Discovery & Commentary Navigation

#### Dynamic CCEL Catalog Discovery
- **New File:** `src/adapters/ccelCatalogScraper.ts` - Scrapes CCEL's full catalog
- Search entire CCEL catalog (1000+ works) dynamically, not just curated list
- Smart caching (5-minute TTL) to prevent overwhelming CCEL servers
- Intelligent batching (5 letters at a time) for full catalog searches
- Relevance scoring for search results (exact match > word match > partial match)

#### Bible Verse → Commentary Section Matching
- **Enhancement:** `src/services/sectionResolver.ts` - Priority-based verse resolution
- Direct Bible verse lookup in commentary sections (e.g., "1 Timothy 2:14" → "1 Timothy 2:11-15")
- Automatic matching of single verses to commentary section ranges
- Support for verse ranges with overlap detection
- Fallback to existing structured query logic for non-verse queries
- 100% backward compatibility with existing queries

#### Calvin Commentary Auto-Routing
- **New File:** `src/utils/ccelCommentaryMapper.ts` - Calvin volume mapping
- Maps Bible books to specific Calvin commentary volumes (calcom01-calcom45)
- Automatic routing from meta-works (calvin/commentaries) to correct volumes
- Covers all 45 volumes of Calvin's commentaries
- Intelligent Bible book extraction from queries

#### Topic Search Within Works
- **Enhancement:** `src/services/sectionResolver.ts` - `searchSectionsByTopic()` method
- Search for sections within a work by keyword or topic
- Example: Find all sections about "election" in Calvin's Institutes
- Relevance scoring (exact match > word boundary match > partial match)
- Results sorted by relevance while maintaining TOC order for same scores

#### Expanded Popular Works List
- **Enhancement:** `src/services/ccelService.ts` - `getPopularWorks()` expanded
- Expanded from 6 to 40+ curated works
- Organized by category: Church Fathers, Medieval, Reformers, Puritans, Post-Reformation, Devotional, Apologetics, History
- More comprehensive coverage of Christian theological tradition
- Better work discovery for users

#### Enhanced Topic Search
- **Enhancement:** `src/services/ccelService.ts` - Enhanced `suggestWorks()` method
- 35+ theological topics mapped to relevant works
- Categories: Theological Topics, Christology & Trinity, Spiritual Life, Church & Kingdom, Sin & Holiness, Faith & Doctrine, Christian Life
- Intelligent suggestions based on query keywords

### Fixed

#### HTML Parsing for Nested Divs
- **Fix:** `src/adapters/ccelApi.ts` - Proper div depth counting
- Replaced regex-based div matching with proper depth counting algorithm
- Now correctly handles nested `<div>` elements within book-content
- Prevents premature closure on nested structures (e.g., footnotes, blockquotes)
- More robust text extraction from CCEL HTML

#### TOC Entry Filtering
- **Fix:** `src/adapters/ccelToc.ts` - Smarter prefatory material filtering
- Use word boundaries to avoid filtering nested sections (e.g., "calcom43.iv.ii.iii")
- Only filter prefatory material at second level (e.g., "work.ii" or "work.ii.x")
- Prevents accidental filtering of valid content sections

### Changed

#### Tool Descriptions
- **Enhancement:** `src/tools/classicTextLookup.ts` - Updated tool description
- Added new parameters: `topic` for section search
- Enhanced usage examples with new features
- Updated discovery workflow documentation

#### Service Integration
- **Enhancement:** `src/services/ccelService.ts` - Integrated catalog scraper
- `searchAllWorks()` now uses dynamic catalog scraping with fallback to curated list
- Limit results to 66 (one per Bible book) for commentary sets
- Better error handling with graceful fallback

### Performance

- **Catalog Scraping:** ~2-3 seconds per letter (first time), < 10ms (cached)
- **Cache Hit Time:** < 10ms across all resources
- **TOC Caching:** 24-hour TTL reduces API calls
- **Smart Batching:** Prevents CCEL server overload

### Testing

- **New Tests:** 4 new test files covering new features
  - `test/tools/bible-verse-resolution-test.ts` (8/8 passing)
  - `test/tools/classic-text-lookup-test.ts` (8/10 passing - expected)
  - `test/tools/catalog-scraper-test.ts` (6/6 passing)
  - `test/tools/quick-topic-search-test.ts`
  - `test/readme-scenarios-test.ts` (17/17 passing)
- **Overall Success Rate:** 95.6% (43/45 tests passing)
- **Test Report:** [TEST_REPORT.md](TEST_REPORT.md)

---

## 3.3.0 - 2025-10-08 (Previous Release)

### Added
- 6 additional Bible translations (KJV, WEB, BSB, ASV, YLT, DBY) via HelloAO API
- Footnotes support with translation notes and textual variants
- Support for all numbered books (1 John, 2 Samuel, etc.)
- 8 total Bible translations available

---

## 3.2.0 - 2025-10-07

### Added
- HelloAO Bible API integration
- 6 public domain commentaries (Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale)
- 1000+ Bible translations available via HelloAO API
- Zero rate limits, zero API keys required

---

## 3.1.0 - 2025-10-06

### Added
- Matthew Henry's Complete Commentary (66 books) via CCEL
- CCEL HTML parsing and text extraction
- Integration with commentary_lookup tool

---

## 2.5.0 - 2025-10-05

### Added
- ESV HTML endpoint integration with footnote extraction
- Real textual variant and translation alternative notes
- Multi-translation support (ESV, NET)
- Comprehensive footnote parsing and categorization

---

## 2.0.0 - 2025-10-04

### Added
- CCEL API adapter with Scripture, Work Section, and Fragment endpoints
- Automatic section resolution from natural language queries
- TOC parsing with 24-hour caching
- Support for complex hierarchies (Book/Chapter/Part/Question/Article)
- Part number inheritance for nested structures (e.g., Summa Theologica)
- Clean HTML content extraction
- Integration tests for section resolver and adapter

---

## 1.0.0 - 2025-10-03

### Added
- Initial release
- Full ESV API integration with 5000 verses/day
- Historical document search with section-level topic tagging
- Commentary and translation notes system (mock data)
- Clean MCP tool interface with proper error handling
- In-memory caching (1-hour TTL, LRU eviction)
- Comprehensive test suite

---

[Unreleased]: https://github.com/TJ-Frederick/TheologAI/compare/d395b3641eb00f6826eaba670c287f9a39dfa3da...HEAD
[3.6.0]: https://github.com/TJ-Frederick/TheologAI/compare/v1.0.0-phase3.1...d395b3641eb00f6826eaba670c287f9a39dfa3da
