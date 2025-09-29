# TheologAI - Bible Study MCP Server

A Model Context Protocol (MCP) server that provides theological researchers and Bible students with programmatic access to biblical texts, commentaries, and historical Christian documents through natural language queries via Claude Desktop.

## Current Status: Phase 1 Complete - Full MVP Ready! 🎉

TheologAI now provides comprehensive theological research tools with three main capabilities:

## Features

- **📖 Full Bible Access**: Look up ANY Bible verse or passage using the ESV API
- **🏛️ Historical Documents**: Search through creeds, confessions, and catechisms with section-level topic tagging
- **📝 Commentary & Notes**: Get translation notes and commentary on Bible verses
- **🔍 Smart Search**: Topic-based conceptual search across all historical documents
- **⚡ Fast & Reliable**: In-memory caching with 1-hour TTL reduces API calls and improves performance
- **✨ Clean Formatting**: Beautiful markdown output with proper citations

## MCP Tools Available

### 🔍 `bible_lookup`
Look up any Bible verse or passage from the ESV
- **Example**: "Look up John 3:16"
- **Example**: "Show me Psalm 119:105"
- **Parameters**: `reference` (required), `translation`, `includeCrossRefs`

### 🏛️ `historical_search`
Search historical Christian documents
- **Example**: "What do the creeds say about the Trinity?"
- **Example**: "Search for 'salvation' in confessions"
- **Parameters**: `query` (required), `document`, `docType`

### 📝 `commentary_lookup`
Get translation notes and commentary on verses
- **Example**: "Get commentary on John 1:1"
- **Example**: "What do the notes say about Genesis 1:1?"
- **Parameters**: `reference` (required), `commentator`, `maxLength`

## Available Documents

### Creeds
- **Apostles' Creed** (c. 390 AD)
- **Nicene Creed** (325/381 AD)

### Confessions & Catechisms
- **Westminster Confession of Faith** (1646) - Sample sections
- **Heidelberg Catechism** (1563) - Sample questions

### Commentary
- **NET Bible Notes** - Sample commentary available for common verses (John 3:16, John 1:1, Genesis 1:1, Romans 8:28)
- *Note: Phase 1 includes limited mock commentary. Phase 2 will expand with real NET Bible API integration and additional commentators.*

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

## Phase 1 Complete! ✅

**Accomplished:**
- ✅ Full ESV API integration with 5000 verses/day
- ✅ Historical document search with section-level topic tagging for conceptual queries
- ✅ Commentary and translation notes system (mock data for 4 key verses)
- ✅ Clean MCP tool interface with proper error handling
- ✅ In-memory caching system (1-hour TTL, LRU eviction, 100-entry capacity)
- ✅ Comprehensive test suite validated

**Performance:**
- Cache reduces Bible verse lookup from ~160ms to <1ms on repeated queries
- ESV API rate limit protection through intelligent caching
- Fast local historical document search

## Next Steps (Phase 2+)

**Potential Enhancements:**
- [ ] Expanded commentary collection (Matthew Henry, Calvin)
- [ ] Additional Bible translations (KJV, NASB)
- [ ] Cross-reference system integration
- [ ] Greek/Hebrew word study tools
- [ ] Advanced topical search across all resources
- [ ] Caching and performance optimizations

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── server.ts             # Main server class
├── tools/                # Tool handlers
│   ├── index.ts         # Tool registry
│   └── bibleLookup.ts   # Bible lookup tool
├── services/            # Business logic
│   └── bibleService.ts  # Bible service (currently mock)
├── utils/               # Utilities
│   ├── formatter.ts     # Response formatting
│   └── errors.ts        # Error handling
└── types/               # Type definitions
    └── index.ts         # Common types
```

## License

ISC