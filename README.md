# TheologAI - Bible Study MCP Server

A Model Context Protocol (MCP) server that provides theological researchers and Bible students with programmatic access to biblical texts, commentaries, and historical Christian documents through natural language queries via Claude Desktop.

## Current Status: Phase 2 In Progress - CCEL Integration Complete! 🎉

TheologAI now provides comprehensive theological research tools with four main capabilities:

## Features

- **📖 Multi-Translation Bible Access**: ESV and NET Bible translations
- **📝 ESV Translation Notes**: Real textual variants and translation alternatives
- **🏛️ Historical Documents**: Search through creeds, confessions, and catechisms
- **📚 Classic Christian Texts**: Access thousands of classic works from CCEL
- **🔍 Smart Search**: Topic-based conceptual search across all historical documents
- **⚡ Fast & Reliable**: In-memory caching with 1-hour TTL for verses and footnotes
- **✨ Clean Formatting**: Beautiful markdown output with proper citations

## MCP Tools Available

### 🔍 `bible_lookup`
Look up any Bible verse or passage - returns clean Scripture text
- **Example**: "Look up John 3:16"
- **Example**: "Show me Romans 8:28-30 in NET"
- **Translations**: ESV (default), NET
- **Parameters**: `reference` (required), `translation` (optional), `includeCrossRefs` (optional)

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
Get ESV translation notes and textual commentary
- **Example**: "Get commentary on Romans 8:28"
- **Example**: "What are the textual variants for Matthew 17:21?"
- **Content**: Textual variants, translation alternatives, manuscript notes
- **Parameters**: `reference` (required), `commentator` (optional), `maxLength` (optional)

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

### Bible Translations
- **ESV (English Standard Version)** - Primary translation with full API access
- **NET (New English Translation)** - Alternative literal translation
- Both translations support verse lookup and passage retrieval
- ESV includes textual footnotes and translation notes

### Commentary & Translation Notes
- **ESV Translation Notes** - Real footnote content from ESV
- Textual variants (manuscript differences)
- Translation alternatives (alternative renderings)
- Available for verses where ESV provides footnotes
- Accessed via `commentary_lookup` tool

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

**Performance:**
- Bible verse cache: ~160ms → <1ms on repeated queries
- ESV footnotes cache: ~170ms → <1ms on repeated queries
- TOC caching: 24-hour TTL reduces API calls
- ESV API rate limit protection through intelligent caching

## Next Steps (Phase 3+)

**Potential Enhancements:**
- [ ] Additional public domain Bible translations (KJV, ASV via wldeh/bible-api)
- [ ] Public domain commentary integration (Matthew Henry, JFB)

**Future Enhancements:**
- [ ] Expanded commentary collection (Matthew Henry, Calvin)
- [ ] Cross-reference system integration
- [ ] Greek/Hebrew word study tools
- [ ] Advanced topical search across all resources

## Architecture

```
src/
├── index.ts                      # MCP server entry point
├── server.ts                     # Main server class
├── adapters/                     # External API adapters
│   ├── index.ts                 # Adapter exports
│   ├── esvApi.ts               # ESV Bible API
│   ├── netBibleApi.ts          # NET Bible API (translator notes)
│   ├── ccelApi.ts              # CCEL API (Scripture, Works, Fragments)
│   └── ccelToc.ts              # CCEL TOC parser with auto-resolution
├── services/                     # Business logic layer
│   ├── bibleService.ts          # Bible verse service
│   ├── historicalService.ts     # Historical documents
│   ├── commentaryService.ts     # Commentary notes
│   ├── ccelService.ts           # CCEL classic texts
│   └── sectionResolver.ts       # Natural language → section ID
├── tools/                        # MCP tool handlers
│   ├── index.ts                 # Tool registry
│   ├── bibleLookup.ts           # Bible verse lookup
│   ├── historicalSearch.ts      # Historical document search
│   ├── commentaryLookup.ts      # Commentary retrieval
│   └── classicTextLookup.ts     # CCEL classic text lookup
├── utils/                        # Utilities
│   ├── cache.ts                 # In-memory caching (Bible & TOC)
│   ├── formatter.ts             # Markdown formatting
│   └── errors.ts                # Error handling
└── types/                        # Type definitions
    └── index.ts                 # Common types
```

## License

ISC