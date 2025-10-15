# TheologAI - Bible Study MCP Server

A Model Context Protocol (MCP) server that provides theological researchers and Bible students with programmatic access to biblical texts, commentaries, and historical Christian documents through natural language queries via Claude Desktop.

## Current Status: Phase 3.5 Complete - Unified Historical Documents & Cross-References! 🎉

TheologAI now provides comprehensive theological research tools with extensive Bible study capabilities:

## Features

- **📖 8 Bible Translations**: ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY (all with verse lookup)
- **📝 Footnotes Support**: Translation notes, textual variants, and alternative readings
- **🔗 Cross-References**: Treasury of Scripture Knowledge integration for verse connections
- **💬 6 Public Domain Commentaries**: Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale
- **🏛️ 18 Historical Documents**: Major creeds, confessions, and catechisms (Nicene, Westminster, Heidelberg, 39 Articles, and more)
- **📚 1000+ Classic Christian Texts**: Complete CCEL catalog access with unified search
- **🔍 Unified Search**: Single tool searches local documents first, then entire CCEL catalog
- **📖 Bible Verse → Commentary**: Direct verse lookup in Calvin's commentaries (auto-routing to correct volume)
- **🗂️ Work Discovery**: Browse 40+ curated works or search entire CCEL catalog dynamically
- **⚡ Fast & Reliable**: In-memory caching with 1-hour TTL for verses and footnotes
- **💰 Zero Cost**: All HelloAO resources (6 translations + 6 commentaries) are free with no rate limits
- **✨ Clean Formatting**: Beautiful markdown output with proper citations

## MCP Tools Available

### 🔍 `bible_lookup`
Look up any Bible verse or passage with 8 translation options and footnotes
- **Example**: "Look up John 3:16"
- **Example**: "Show me Romans 8:28-30 in KJV"
- **Example**: "Get 1 John 5:7 in BSB with footnotes"
- **Translations**: ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY
- **Parameters**:
  - `reference` (required): Bible verse reference
  - `translation` (optional): Translation code (default: ESV)
  - `includeFootnotes` (optional): Include translation notes and textual variants

### 🔗 `bible_cross_references`
Get cross-references for Bible verses using Treasury of Scripture Knowledge
- **Example**: "Get cross-references for John 3:16"
- **Example**: "Show related verses for Romans 8:28"
- **Parameters**: `reference` (required)

### 📚 `classic_text_lookup` ✨ UNIFIED TOOL!
**Primary tool for ALL historical Christian documents** - searches local documents first, then CCEL
- **Local Documents (18)**: Creeds (Apostles, Nicene, Chalcedonian, Athanasian), Confessions (Westminster, Augsburg, Belgic, Dort, 39 Articles, London Baptist 1689, Dositheus, Trent), Catechisms (Westminster Larger/Shorter, Heidelberg, Philaret, Baltimore)
- **CCEL (1000+)**: Church Fathers, Medieval theologians, Reformers, Puritans, and more

**Examples:**
- **Search all documents**: `{ query: "trinity" }` → searches local + CCEL
- **Local document**: `{ work: "nicene-creed" }` → full Nicene Creed
- **Search in local doc**: `{ work: "westminster-confession", query: "scripture" }`
- **CCEL work**: `{ work: "calvin/institutes", query: "Book 3 Chapter 21" }`
- **Browse sections**: `{ work: "philaret-catechism", browseSections: true }`
- **Discover works**: `{ listWorks: true }` → 40+ CCEL works by era

**Parameters**:
  - `work` (optional): Work identifier (e.g., "calvin/institutes", "nicene-creed")
  - `query` (optional): Natural language section reference or search term
  - `topic` (optional): Search sections within a work by keyword
  - `listWorks` (optional): Browse available CCEL works
  - `browseSections` (optional): List all sections in a work

### 📝 `commentary_lookup`
Access 6 public domain commentaries on any Bible verse
- **Example**: "Get commentary on Romans 8:28"
- **Example**: "What does Matthew Henry say about John 3:16?"
- **Example**: "Get JFB commentary on Genesis 1:1"
- **NEW**: Works seamlessly with Calvin's commentaries via `classic_text_lookup`
- **Commentaries**: Matthew Henry, Jamieson-Fausset-Brown (JFB), Adam Clarke, John Gill, Keil-Delitzsch (OT only), Tyndale
- **Parameters**:
  - `reference` (required): Bible verse reference
  - `commentator` (optional): Commentator name (default: Matthew Henry)
  - `maxLength` (optional): Maximum length in characters

**Pro Tip:** For Calvin's detailed commentaries, use `classic_text_lookup` with:
- `work: "calvin/calcom43"` and `query: "1 Timothy 2:14"` - Direct verse lookup!
- Auto-routing handles meta-works (no need to know volume numbers)

## Available Documents

### Local Historical Documents (18 Total)

**Creeds (4):**
- **Apostles' Creed** (c. 390 AD)
- **Nicene Creed** (325/381 AD)
- **Chalcedonian Definition** (451 AD)
- **Athanasian Creed** (c. 500 AD)

**Confessions (8):**
- **Westminster Confession of Faith** (1646) - Complete
- **Augsburg Confession** (1530) - Lutheran
- **Belgic Confession** (1561) - Reformed
- **Canons of Dort** (1619) - Reformed
- **Thirty-Nine Articles** (1571) - Anglican
- **London Baptist Confession** (1689) - Baptist
- **Confession of Dositheus** (1672) - Eastern Orthodox
- **Council of Trent** (1545-1563) - Roman Catholic

**Catechisms (6):**
- **Westminster Shorter Catechism** (1647) - Complete
- **Westminster Larger Catechism** (1648) - Complete
- **Heidelberg Catechism** (1563) - Complete
- **Philaret's Catechism** (1823) - Eastern Orthodox
- **Baltimore Catechism** (1885) - Roman Catholic

### Classic Christian Texts (CCEL) ✨ ENHANCED!
Access 1000+ works from the Christian Classics Ethereal Library with dynamic discovery:
- **Calvin's Institutes of the Christian Religion**
- **Calvin's Commentaries** (45 volumes covering all books he commented on)
- **Aquinas' Summa Theologica** (with Part/Question/Article hierarchy support)
- **Augustine's Confessions & City of God**
- **Bunyan's Pilgrim's Progress & Grace Abounding**
- **Luther's Works** (16+ volumes)
- **Edwards, Wesley, Spurgeon, Owen, and many more...**

**Features:**
- **NEW: Dynamic Catalog Discovery** - Search entire CCEL catalog (1000+ works), not just curated list
- **NEW: Bible Verse → Commentary** - "1 Timothy 2:14" auto-matches commentary sections
- **NEW: Topic Search Within Works** - Find sections about "grace" in Calvin's Institutes
- **NEW: Calvin Commentary Auto-Routing** - Automatically routes to correct volume (calcom01-calcom45)
- Natural language section resolution (no manual section IDs!)
- Automatic TOC parsing and caching (24-hour TTL)
- Support for complex hierarchies (Books, Chapters, Parts, Questions, Articles)
- Clean text extraction from HTML with proper nested div handling

### Bible Translations (8 Total)

**ESV & NET (via dedicated APIs):**
- **ESV (English Standard Version)** - Modern formal equivalence
- **NET (New English Translation)** - With extensive translator notes

**HelloAO Translations (Public Domain, Zero Rate Limits):**
- **KJV (King James Version 1611)** - Most recognized English translation
- **WEB (World English Bible)** - Modern public domain translation
- **BSB (Berean Standard Bible)** - Clean, modern text with footnotes
- **ASV (American Standard Version 1901)** - Scholarly literal translation
- **YLT (Young's Literal Translation)** - Extremely literal word-for-word
- **DBY (Darby Translation)** - Alternative literal translation

All translations support:
- Single verse lookup (John 3:16)
- Verse ranges (Romans 8:28-30)
- All 66 books including numbered books (1 John, 2 Samuel, etc.)

**Footnotes Feature:**
- Available for most HelloAO translations (BSB, WEB, etc.)
- Includes translation notes, alternative readings, textual variants
- Displayed at bottom of verse text with verse references
- Enable with `includeFootnotes: true` parameter

### Public Domain Commentaries (6 Total via HelloAO)
- **Matthew Henry's Complete Commentary** - Comprehensive devotional commentary on all 66 books
- **Jamieson-Fausset-Brown (JFB)** - Concise scholarly commentary
- **Adam Clarke's Commentary** - In-depth exegetical notes
- **John Gill's Exposition** - Detailed theological exposition
- **Keil-Delitzsch Commentary** - OT-only scholarly Hebrew analysis
- **Tyndale Open Study Notes** - Modern accessible study notes

All commentaries accessible via HelloAO Bible API with zero rate limits!

## Installation & Setup

1. **Clone and Install**
   ```bash
   cd TheologAI
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env and set PORT=3000 (or your preferred port)
   ```

3. **Build and Start the Server**
   ```bash
   npm run build
   npm start
   ```
   
   The server will start on the port specified in your `.env` file (default: 3000).

4. **Configure Claude Desktop**

   Add to your Claude Desktop configuration file (`claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "theologai": {
         "transport": {
           "type": "http",
           "host": "localhost",
           "port": 3000
         }
       }
     }
   }
   ```

   Make sure the port matches the one in your `.env` file.

4. **Test the Connection**

   Start Claude Desktop and try these queries:

   **Bible Lookup:**
   - "Look up John 3:16"
   - "Show me Psalm 119:105"
   - "What does Ephesians 2:8-10 say about grace?"

   **Historical Documents:**
   - "What do the creeds say about the Trinity?"
   - "Show me the Nicene Creed"
   - "Search for 'justification' in the Westminster Confession"
   - "What does the Heidelberg Catechism say about comfort?"

   **Classic Texts:**
   - "Look up Calvin's Institutes Book 1 Chapter 1"
   - "Show me Aquinas Summa Part 1 Question 2"
   - "Get Augustine's Confessions Book 4"

   **Commentary:**
   - "Get commentary on John 1:1"
   - "What does Matthew Henry say about Romans 8:28?"

   **Cross-References:**
   - "Get cross-references for John 3:16"
   - "Show related verses for Psalm 23:1"

## Development

```bash
# Set up environment file
cp .env.example .env
# Edit .env and set PORT=3000

# Run in development mode with auto-reload
PORT=3000 npm run dev

# Build for production
npm run build

# Start the server (reads PORT from .env)
npm start

# Clean build artifacts
npm run clean
```

**Server Modes:**
- **HTTP Mode**: Set `PORT` in `.env` file to run as HTTP server
- **Default Port**: 3000 (configurable via `.env` file)
- **CORS**: Enabled for web client compatibility

## MCP Tools Summary

TheologAI provides 4 primary tools:

1. **`bible_lookup`** - Look up verses in 8 translations with footnotes
2. **`bible_cross_references`** - Get related verses via Treasury of Scripture Knowledge
3. **`commentary_lookup`** - Access 6 public domain commentaries
4. **`classic_text_lookup`** - Search 18 local historical documents + 1000+ CCEL works (unified tool)

## Development Progress

### Phase 1 Complete! ✅
- ✅ Full ESV API integration with 5000 verses/day
- ✅ Historical document search with section-level topic tagging
- ✅ Commentary and translation notes system (mock data)
- ✅ Clean MCP tool interface with proper error handling
- ✅ In-memory caching (1-hour TTL, LRU eviction)
- ✅ Comprehensive test suite

### Phase 2: CCEL Integration ✅
- ✅ CCEL API adapter with Scripture, Work Section, and Fragment endpoints
- ✅ Automatic section resolution from natural language queries
- ✅ TOC parsing with 24-hour caching
- ✅ Support for complex hierarchies (Book/Chapter/Part/Question/Article)
- ✅ Part number inheritance for nested structures (e.g., Summa Theologica)
- ✅ Clean HTML content extraction
- ✅ Integration tests for section resolver and adapter

### Phase 2.5: ESV Footnotes & Multi-Translation ✅
- ✅ ESV HTML endpoint integration with footnote extraction
- ✅ Real textual variant and translation alternative notes
- ✅ Multi-translation support (ESV, NET)
- ✅ Separate tools for clean text vs. study notes
- ✅ Comprehensive footnote parsing and categorization

### Phase 3: Commentary & Translation Integration ✅

**Phase 3.1: Matthew Henry via CCEL**
- ✅ Matthew Henry's Complete Commentary (66 books)
- ✅ CCEL HTML parsing and text extraction
- ✅ Integration with commentary_lookup tool

**Phase 3.2: HelloAO Bible API Integration**
- ✅ 6 public domain commentaries (Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale)
- ✅ 1000+ Bible translations via HelloAO API
- ✅ Zero rate limits, zero API keys

**Phase 3.3: HelloAO Bible Translations**
- ✅ 6 additional translations (KJV, WEB, BSB, ASV, YLT, DBY)
- ✅ Footnotes support with translation notes
- ✅ All numbered books working (1 John, 2 Samuel, etc.)
- ✅ 8 total Bible translations available

**Phase 3.4: Enhanced Discovery & Commentary Navigation** ✅
- ✅ Dynamic CCEL catalog scraping (1000+ works discoverable)
- ✅ Bible verse → commentary section matching (e.g., "1 Timothy 2:14" → exact section)
- ✅ Calvin commentary auto-routing (meta-works → specific volumes)
- ✅ Topic search within works (find sections by keyword)
- ✅ Expanded popular works list (40+ works organized by era/tradition)
- ✅ Improved HTML parsing (proper nested div handling)
- ✅ Comprehensive test suite (95.6% success rate, 43/45 tests passing)

**Phase 3.5: Unified Historical Documents & Cross-References** ✅
- ✅ Added 11 major historical documents (18 total local documents)
- ✅ Complete Westminster Confession, Larger/Shorter Catechisms
- ✅ Major confessions: Augsburg, Belgic, Dort, 39 Articles, London Baptist 1689, Dositheus, Trent
- ✅ Additional creeds: Chalcedonian, Athanasian
- ✅ Catechisms: Heidelberg (complete), Philaret (Orthodox), Baltimore (Catholic)
- ✅ Unified `classic_text_lookup` tool (replaces deprecated `historical_search`)
- ✅ Priority search: local documents first, then CCEL
- ✅ Cross-reference system via `bible_cross_references` tool
- ✅ Treasury of Scripture Knowledge integration

**Performance:**
- Bible verse cache: ~160ms → <1ms on repeated queries
- HelloAO API calls: ~200ms (no rate limits!)
- TOC caching: 24-hour TTL reduces API calls
- Catalog scraping: ~2-3s per letter, 5-minute cache
- Cache hit time: < 10ms across all resources
- ESV API rate limit protection through intelligent caching

## Next Steps (Phase 4+)

**Potential Enhancements:**
- [ ] Additional HelloAO translations (1000+ available)
- [ ] Greek/Hebrew word study tools (Strong's concordance)
- [ ] Advanced topical search across all resources
- [ ] More historical texts and catechisms
- [ ] Search history and bookmarking
- [ ] Export/citation tools for research
- [ ] Parallel passage viewing
- [ ] Theological topic indexing

## Architecture

```
src/
├── index.ts                      # MCP server entry point
├── server.ts                     # Main server class
├── adapters/                     # External API adapters
│   ├── index.ts                 # Adapter exports
│   ├── esvApi.ts               # ESV Bible API
│   ├── netBibleApi.ts          # NET Bible API (translator notes)
│   ├── helloaoApi.ts           # HelloAO Bible API (commentaries, translations, cross-refs)
│   ├── helloaoBibleAdapter.ts  # HelloAO translation adapter (KJV, WEB, BSB, ASV, YLT, DBY)
│   ├── publicCommentaryAdapter.ts # HelloAO commentary adapter
│   ├── localData.ts            # Local historical documents adapter (18 documents)
│   ├── ccelApi.ts              # CCEL API (Scripture, Works, Fragments)
│   ├── ccelToc.ts              # CCEL TOC parser with auto-resolution
│   └── ccelCatalogScraper.ts   # CCEL catalog scraper (1000+ works)
├── services/                     # Business logic layer
│   ├── bibleService.ts          # Bible verse service (8 translations)
│   ├── historicalService.ts     # Historical documents service
│   ├── commentaryService.ts     # Commentary notes (6 commentaries)
│   ├── crossReferenceService.ts # Cross-reference service (Treasury of Scripture Knowledge)
│   ├── ccelService.ts           # CCEL classic texts
│   └── sectionResolver.ts       # Natural language → section ID
├── tools/                        # MCP tool handlers
│   ├── index.ts                 # Tool registry
│   ├── bibleLookup.ts           # Bible verse lookup (8 translations + footnotes)
│   ├── bibleCrossReferences.ts  # Cross-reference lookup
│   ├── commentaryLookup.ts      # Commentary retrieval (6 commentaries)
│   └── classicTextLookup.ts     # Unified historical documents + CCEL (replaces historicalSearch)
├── utils/                        # Utilities
│   ├── cache.ts                 # In-memory caching (Bible & TOC)
│   ├── formatter.ts             # Markdown formatting (with footnotes)
│   ├── helloaoMapper.ts         # Book name/code mapping for HelloAO
│   ├── commentaryMapper.ts      # Commentary reference mapping
│   ├── ccelCommentaryMapper.ts  # Calvin commentary volume mapper
│   └── errors.ts                # Error handling
└── types/                        # Type definitions
    └── index.ts                 # Common types (includes Footnote interface)
```

## License

ISC