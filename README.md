# TheologAI - Bible Study MCP Server

A Model Context Protocol (MCP) server that provides theological researchers and Bible students with programmatic access to biblical texts, commentaries, and historical Christian documents through natural language queries via Claude Desktop.

## Current Status: Phase 3.3 Complete - Bible Translations & Commentaries! 🎉

TheologAI now provides comprehensive theological research tools with extensive Bible study capabilities:

## Features

- **📖 8 Bible Translations**: ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY (all with verse lookup)
- **📝 Footnotes Support**: Translation notes, textual variants, and alternative readings
- **💬 6 Public Domain Commentaries**: Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale
- **🏛️ Historical Documents**: Search through creeds, confessions, and catechisms
- **📚 Classic Christian Texts**: Access thousands of classic works from CCEL
- **🔍 Smart Search**: Topic-based conceptual search across all historical documents
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
  - `includeCrossRefs` (optional): Include cross-references (not yet implemented)

### 🏛️ `historical_search`
Search historical Christian documents
- **Example**: "What do the creeds say about the Trinity?"
- **Example**: "Search for 'salvation' in confessions"
- **Parameters**: `query` (required), `document`, `docType`

### 📚 `classic_text_lookup` ✨ NEW!
Access classic Christian texts from CCEL with natural language queries
- **Example**: "Look up Calvin's Institutes Book 1 Chapter 1"
- **Example**: "Show me Aquinas Summa Part 1 Question 2"
- **Example**: "Get Augustine's Confessions Book 4"
- **Parameters**: `work` (e.g., "calvin/institutes"), `query` (natural language)
- **No section IDs needed** - automatic resolution from natural language!

### 📝 `commentary_lookup`
Access 6 public domain commentaries on any Bible verse
- **Example**: "Get commentary on Romans 8:28"
- **Example**: "What does Matthew Henry say about John 3:16?"
- **Example**: "Get JFB commentary on Genesis 1:1"
- **Commentaries**: Matthew Henry, Jamieson-Fausset-Brown (JFB), Adam Clarke, John Gill, Keil-Delitzsch (OT only), Tyndale
- **Parameters**:
  - `reference` (required): Bible verse reference
  - `commentator` (optional): Commentator name (default: Matthew Henry)
  - `maxLength` (optional): Maximum length in characters

## Available Documents

### Creeds
- **Apostles' Creed** (c. 390 AD)
- **Nicene Creed** (325/381 AD)

### Confessions & Catechisms
- **Westminster Confession of Faith** (1646) - Sample sections
- **Heidelberg Catechism** (1563) - Sample questions

### Classic Christian Texts (CCEL) ✨ NEW!
Access thousands of works from the Christian Classics Ethereal Library:
- **Calvin's Institutes of the Christian Religion**
- **Aquinas' Summa Theologica** (with Part/Question/Article hierarchy support)
- **Augustine's Confessions**
- **Bunyan's Pilgrim's Progress**
- **Luther's Works**
- And hundreds more...

**Features:**
- Natural language section resolution (no manual section IDs!)
- Automatic TOC parsing and caching
- Support for complex hierarchies (Books, Chapters, Parts, Questions, Articles)
- Clean text extraction from HTML

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

2. **Build the Server**
   ```bash
   npm run build
   ```

3. **Configure Claude Desktop**

   Add to your Claude Desktop configuration file (`claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "theologai": {
         "command": "node",
         "args": ["/path/to/TheologAI/dist/index.js"]
       }
     }
   }
   ```

   Replace `/path/to/TheologAI` with the full path to your project directory.

4. **Test the Connection**

   Start Claude Desktop and try these queries:

   **Bible Lookup:**
   - "Look up John 3:16"
   - "Show me Psalm 119:105"
   - "What does Ephesians 2:8-10 say about grace?"

   **Historical Documents:**
   - "What do the creeds say about the Trinity?"
   - "Show me the Apostles' Creed"
   - "Search for 'comfort' in the Heidelberg Catechism"

   **Classic Texts:**
   - "Look up Calvin's Institutes Book 1 Chapter 1"
   - "Show me Aquinas Summa Part 1 Question 2"
   - "Get Augustine's Confessions Book 4"

   **Commentary:**
   - "Get commentary on John 1:1"
   - "What do the notes say about Genesis 1:1?"

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Start the server
npm start

# Clean build artifacts
npm run clean
```

## MCP Tools

### `bible_lookup`

Look up Bible verses by reference.

**Parameters:**
- `reference` (required): Bible verse reference (e.g., "John 3:16")
- `translation` (optional): Bible translation (default: "ESV")
- `includeContext` (optional): Include surrounding verses
- `includeCrossRefs` (optional): Include cross-references

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

**Performance:**
- Bible verse cache: ~160ms → <1ms on repeated queries
- HelloAO API calls: ~200ms (no rate limits!)
- TOC caching: 24-hour TTL reduces API calls
- ESV API rate limit protection through intelligent caching

## Next Steps (Phase 4+)

**Potential Enhancements:**
- [ ] Cross-reference system (Treasury of Scripture Knowledge)
- [ ] Additional HelloAO translations (1000+ available)
- [ ] Greek/Hebrew word study tools (Strong's concordance)
- [ ] Advanced topical search across all resources
- [ ] More historical texts and confessions

## Architecture

```
src/
├── index.ts                      # MCP server entry point
├── server.ts                     # Main server class
├── adapters/                     # External API adapters
│   ├── index.ts                 # Adapter exports
│   ├── esvApi.ts               # ESV Bible API
│   ├── netBibleApi.ts          # NET Bible API (translator notes)
│   ├── helloaoApi.ts           # HelloAO Bible API (commentaries & translations)
│   ├── helloaoBibleAdapter.ts  # HelloAO translation adapter (KJV, WEB, BSB, ASV, YLT, DBY)
│   ├── publicCommentaryAdapter.ts # HelloAO commentary adapter
│   ├── ccelApi.ts              # CCEL API (Scripture, Works, Fragments)
│   └── ccelToc.ts              # CCEL TOC parser with auto-resolution
├── services/                     # Business logic layer
│   ├── bibleService.ts          # Bible verse service (8 translations)
│   ├── historicalService.ts     # Historical documents
│   ├── commentaryService.ts     # Commentary notes (6 commentaries)
│   ├── ccelService.ts           # CCEL classic texts
│   └── sectionResolver.ts       # Natural language → section ID
├── tools/                        # MCP tool handlers
│   ├── index.ts                 # Tool registry
│   ├── bibleLookup.ts           # Bible verse lookup (8 translations + footnotes)
│   ├── historicalSearch.ts      # Historical document search
│   ├── commentaryLookup.ts      # Commentary retrieval (6 commentaries)
│   └── classicTextLookup.ts     # CCEL classic text lookup
├── utils/                        # Utilities
│   ├── cache.ts                 # In-memory caching (Bible & TOC)
│   ├── formatter.ts             # Markdown formatting (with footnotes)
│   ├── helloaoMapper.ts         # Book name/code mapping for HelloAO
│   ├── commentaryMapper.ts      # Commentary reference mapping
│   └── errors.ts                # Error handling
└── types/                        # Type definitions
    └── index.ts                 # Common types (includes Footnote interface)
```

## License

ISC