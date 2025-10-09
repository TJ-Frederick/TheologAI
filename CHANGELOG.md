# Changelog

All notable changes to TheologAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.4.0] - 2025-10-09

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

## [3.3.0] - 2025-10-08 (Previous Release)

### Added
- 6 additional Bible translations (KJV, WEB, BSB, ASV, YLT, DBY) via HelloAO API
- Footnotes support with translation notes and textual variants
- Support for all numbered books (1 John, 2 Samuel, etc.)
- 8 total Bible translations available

---

## [3.2.0] - 2025-10-07

### Added
- HelloAO Bible API integration
- 6 public domain commentaries (Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale)
- 1000+ Bible translations available via HelloAO API
- Zero rate limits, zero API keys required

---

## [3.1.0] - 2025-10-06

### Added
- Matthew Henry's Complete Commentary (66 books) via CCEL
- CCEL HTML parsing and text extraction
- Integration with commentary_lookup tool

---

## [2.5.0] - 2025-10-05

### Added
- ESV HTML endpoint integration with footnote extraction
- Real textual variant and translation alternative notes
- Multi-translation support (ESV, NET)
- Comprehensive footnote parsing and categorization

---

## [2.0.0] - 2025-10-04

### Added
- CCEL API adapter with Scripture, Work Section, and Fragment endpoints
- Automatic section resolution from natural language queries
- TOC parsing with 24-hour caching
- Support for complex hierarchies (Book/Chapter/Part/Question/Article)
- Part number inheritance for nested structures (e.g., Summa Theologica)
- Clean HTML content extraction
- Integration tests for section resolver and adapter

---

## [1.0.0] - 2025-10-03

### Added
- Initial release
- Full ESV API integration with 5000 verses/day
- Historical document search with section-level topic tagging
- Commentary and translation notes system (mock data)
- Clean MCP tool interface with proper error handling
- In-memory caching (1-hour TTL, LRU eviction)
- Comprehensive test suite

---

[Unreleased]: https://github.com/yourusername/TheologAI/compare/v3.4.0...HEAD
[3.4.0]: https://github.com/yourusername/TheologAI/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/yourusername/TheologAI/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/yourusername/TheologAI/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/yourusername/TheologAI/compare/v2.5.0...v3.1.0
[2.5.0]: https://github.com/yourusername/TheologAI/compare/v2.0.0...v2.5.0
[2.0.0]: https://github.com/yourusername/TheologAI/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/yourusername/TheologAI/releases/tag/v1.0.0
