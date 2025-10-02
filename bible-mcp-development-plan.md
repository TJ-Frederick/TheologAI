# Bible Study MCP Server - Development Plan

**Current Status: Phase 2 - CCEL Integration Complete ✅**
- Repository: https://github.com/TJ-Frederick/TheologAI
- Phase 1: Complete (ESV Bible, Historical Docs, Mock Commentary)
- Phase 2: CCEL Integration Complete (Classic Christian Texts)
- All integration tests passing

## Phase 1: MVP Foundation (Days 1-7) - ✅ COMPLETE

### Day 1-2: Project Setup & Basic MCP Server

**Goal:** Get a minimal MCP server running and connected to Claude Desktop

**Steps:**
1. **Initialize Project**
```bash
mkdir bible-mcp-server
cd bible-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk typescript @types/node
npm install -D tsx nodemon
```

2. **Configure TypeScript**
```bash
npx tsc --init
# Update tsconfig.json: target: "ES2022", module: "Node16", outDir: "./dist"
```

3. **Create Basic MCP Server**
   - Create `src/index.ts` with minimal MCP server
   - Implement one simple tool (`bible_lookup`) that returns mock data
   - Test connection with Claude Desktop

4. **Configure Claude Desktop**
   - Add server to Claude Desktop config
   - Verify "Look up John 3:16" returns mock response

**Success Criteria:**
- [x] MCP server starts without errors
- [x] Claude Desktop recognizes the server
- [x] Mock tool responds to queries

### Day 3-4: ESV API Integration

**Goal:** Connect to real Bible API for verse retrieval

**Steps:**
1. **Get ESV API Key**
   - Register at https://api.esv.org/
   - Store in `.env` file

2. **Create ESV Adapter**
   - Implement `src/adapters/esvApi.ts`
   - Add proper error handling
   - Test with various verse formats

3. **Wire Up Bible Service**
   - Create `src/services/bibleService.ts`
   - Connect adapter to tool handler
   - Format responses in markdown

**Test Queries:**
```
"Look up John 3:16"
"Show me Genesis 1:1-3"
"What does Romans 8:28 say?"
```

**Success Criteria:**
- [x] Real Bible verses returned
- [x] Handles single verses and ranges
- [x] Graceful error handling for invalid references
- [x] **BONUS:** Intelligent caching implemented (160ms → <1ms)

### Day 5-6: Local Data & Commentary

**Goal:** Add local JSON data for confessions and basic commentary

**Steps:**
1. **Set Up Local Data**
```bash
mkdir -p data/confessions data/creeds
# Add Westminster Confession, Apostles Creed as JSON files
```

2. **Create Historical Search Tool**
   - Implement `src/tools/historical.ts`
   - Create local data adapter
   - Add search functionality

3. **Add NET Bible Notes**
   - Integrate NET Bible API for translation notes
   - Create commentary tool handler
   - Link to verse references

**Test Queries:**
```
"What does the Westminster Confession say about Scripture?"
"Show me the Apostles Creed"
"Get NET Bible notes on John 1:1"
```

**Success Criteria:**
- [x] Confessions searchable by topic
- [x] NET Bible notes linked to verses (mock data for 4 verses)
- [x] Clean formatting of historical documents
- [x] **BONUS:** Section-level topic tagging for conceptual searches

### Day 7: Testing & Refinement - ✅ COMPLETE

**Goal:** Ensure MVP is stable and usable

**Steps:**
1. **Comprehensive Testing** ✅
   - Test all tools with various inputs ✅
   - Document any issues ✅
   - Fix critical bugs ✅
   - **9/9 tests passing**

2. **Add Basic Cache** ✅
   - Implement simple memory cache ✅
   - Cache API responses for 1 hour (TTL) ✅
   - LRU eviction strategy ✅
   - Test cache hit/miss scenarios ✅

3. **Documentation** ✅
   - Update README with setup instructions ✅
   - Document all available commands ✅
   - Create example queries document ✅

4. **Git & GitHub** ✅
   - Initialize git repository ✅
   - Create initial commit ✅
   - Push to GitHub ✅
   - Tag v1.0.0-phase1 release ✅

## Phase 2: Enhancement (Days 8-14)

### CCEL Integration - ✅ COMPLETE

**Goal:** Integrate Christian Classics Ethereal Library for access to classic theological texts

**Accomplished:**
1. **CCEL API Adapter** ✅
   - Created `src/adapters/ccelApi.ts` with three endpoints:
     - Scripture API (alternative Bible source, XML format)
     - Work Section API (full sections of classic works, HTML format)
     - Work Fragments API (quotations from works)
   - HTML content extraction targeting book-content div
   - Comprehensive error handling and validation

2. **TOC Parser with Auto-Resolution** ✅
   - Created `src/adapters/ccelToc.ts` for parsing work TOCs
   - Automatic section ID resolution from natural language
   - Support for complex hierarchies (Book/Chapter/Part/Question/Article)
   - Part number inheritance for nested structures (e.g., Summa Theologica)
   - 24-hour caching of parsed TOCs (LRU eviction)

3. **Section Resolver Service** ✅
   - Created `src/services/sectionResolver.ts`
   - Natural language query → section ID mapping
   - Confidence scoring (exact/high/medium/low)
   - Alternative suggestions when confidence is low
   - Structured query parsing ("Book 1 Chapter 1", "Part 1 Question 2")

4. **CCEL Service Layer** ✅
   - Created `src/services/ccelService.ts`
   - Popular works catalog (Calvin, Aquinas, Augustine, Bunyan, Luther)
   - Clean integration with adapter and resolver
   - Proper title formatting and error messages

5. **Classic Text Lookup Tool** ✅
   - Created `src/tools/classicTextLookup.ts`
   - Four modes: list works, browse sections, search works, retrieve content
   - Automatic resolution - users never need section IDs
   - Clean markdown formatting

6. **Integration Tests** ✅
   - CCEL adapter tests: 8/8 passing
   - Section resolver tests: 4/4 passing
   - End-to-end integration validated
   - Tested with Calvin's Institutes and Aquinas' Summa

**Key Features:**
- No manual section IDs required - natural language only!
- Supports Summa's Part/Question/Article hierarchy
- Prioritizes structured search over fuzzy matching
- Reverse pattern matching ("First Part" → part: 1)
- Generic solution works across all CCEL works

**Performance:**
- TOC caching: 24-hour TTL reduces API calls
- Fast section resolution (<100ms typical)
- Clean text extraction from HTML

### Phase 2.5: ESV Footnotes & Multi-Translation - ✅ COMPLETE

**Goal:** Real footnote content from ESV and multi-translation support

**Accomplished:**
1. **ESV HTML Endpoint Integration** ✅
   - Created `getPassageWithNotes()` method using HTML endpoint
   - Parses footnotes from `<div class="footnotes">` section
   - Categorizes notes by type: variant, translation, other
   - 1-hour caching for footnote responses
   - Separate cache for HTML responses

2. **Real Footnote Content** ✅
   - Textual variants (e.g., "Some manuscripts God works all things...")
   - Translation alternatives (e.g., "Or For this is how God loved...")
   - Graceful handling when no footnotes exist
   - Returns verse + helpful message instead of error

3. **Multi-Translation Support** ✅
   - ESV (primary translation with footnotes)
   - NET Bible (alternative literal translation)
   - Translation routing in BibleService
   - Clean separation: bible_lookup vs commentary_lookup

4. **Tool Architecture** ✅
   - `bible_lookup`: Clean Scripture text only (no footnotes by default)
   - `commentary_lookup`: ESV text + footnotes when available
   - No errors for verses without footnotes (e.g., John 1:1, 1 John 5:7)
   - Clear tool descriptions guide users to correct tool

**Research Findings:**
- **NO Bible API provides full theological commentary** (all proprietary/copyright)
- Study Bible notes (ESV Study Bible, NIV Study Bible) not API-accessible
- ESV footnotes focus on textual/translation variants, NOT theological commentary
- NET Bible API only provides note markers (`<n id="X" />`), not actual content
- labs.bible.org API has note markers but no content retrieval endpoint
- API.Bible, Biblia API, Bolls.life - none have comprehensive study notes

**What Users Get:**
- Real textual variant notes from ESV
- Translation alternatives for clarity
- Manuscript differences and textual criticism
- Multi-translation Bible text (ESV, NET)

**What Users Don't Get:**
- Theological commentary (e.g., "This teaches about God's sovereignty...")
- Cultural/historical context
- Word studies or deeper exposition
- Study Bible notes (require separate public domain commentary integration)

**Test Coverage:**
- 6 ESV footnote tests passing
- 10 NET Bible tests passing
- 8 CCEL tests passing
- Commentary service integration validated
- Build successful with no errors

**Commits:**
- 2b861c3: feat: Add NET Bible API integration for translator notes detection
- f9f2028: feat: Add ESV footnotes and multi-translation support
- 9103a42: fix: Handle verses without footnotes gracefully

### Day 8-9: Additional Public Domain Bible Translations

**Status:** Pending (moved to Phase 3)

**Goal:** Add more translations via rate-limit-free APIs

**Priority:** Use public domain APIs for KJV, WEB, ASV

**Recommended Approach:**
1. **Integrate wldeh/bible-api** (GitHub CDN)
   - No API keys required
   - 200+ versions available (KJV, WEB, ASV, BBE, Darby, YLT, etc.)
   - Create adapter for GitHub CDN endpoints
   - Add to BibleService translation routing

2. **Add Priority Translations**
   - KJV (King James Version) - Most recognized
   - WEB (World English Bible) - Modern public domain
   - ASV (American Standard Version) - Scholarly option

3. **Parallel Translation Display**
   - Modify formatter for side-by-side display
   - Handle multiple translation requests in single query

### Day 10-11: Cross-References

**Goal:** Add cross-reference support to verses

**Steps:**
1. **Integrate Cross-Reference Data**
   - Add Treasury of Scripture Knowledge or similar
   - Create cross-reference service
   - Link to verse lookups

2. **Format Cross-References**
   - Show references inline with verses
   - Option to expand full text
   - Group by theme if available

### Day 12-13: Real Commentary Integration

**Status:** Partially Complete (ESV footnotes only)

**Completed:**
- ✅ ESV translation notes (textual variants, translation alternatives)
- ✅ NET Bible integrated as translation option (not for commentary)

**Remaining:** Public Domain Theological Commentary

**Goal:** Add real theological commentary from public domain sources

**Priority for Phase 3:**
1. **Matthew Henry's Commentary** (Complete, Public Domain)
   - Find public domain Matthew Henry text (Project Gutenberg or similar)
   - Convert to searchable JSON format
   - Index by verse reference
   - Link commentary to verses
   - Handle verse ranges
   - Format for readability
   - Integrate into commentary_lookup tool

2. **Additional Public Domain Commentaries:**
   - Jamieson-Fausset-Brown (JFB) Commentary
   - Barnes' Notes on the Bible
   - Adam Clarke's Commentary
   - Consider priority based on availability and quality

**Why This Matters:**
- ESV footnotes only provide textual/translation notes
- Users need actual theological commentary for deeper study
- Public domain = no API restrictions, full content access
- Can provide rich exposition and application

### Day 14: Polish & Optimization

**Goal:** Improve performance and user experience

**Steps:**
1. **Performance Tuning**
   - Implement request deduplication
   - Optimize cache strategy
   - Add response streaming for long content

2. **Error Message Improvement**
   - Add helpful suggestions for errors
   - Better handling of rate limits
   - Clearer reference format guidance

## Phase 3: Advanced Features (Days 15+)

### Current Status: Ready to Begin

**Recommended Priority Order:**

### Priority 1: Public Domain Commentary Integration (HIGH VALUE)

**Goal:** Add real theological commentary from public domain sources

**Why Priority 1:**
- Fills the biggest gap (theological commentary vs textual notes)
- Public domain = no API/copyright restrictions
- High user value for Bible study
- Relatively straightforward implementation

**Implementation Steps:**
1. Research available sources:
   - Matthew Henry's Commentary (most comprehensive)
   - Jamieson-Fausset-Brown (concise, scholarly)
   - Barnes' Notes (detailed, accessible)
   - Adam Clarke's Commentary (extensive)

2. Data acquisition & conversion:
   - Find structured text sources (Project Gutenberg, Christian Classics)
   - Convert to JSON format with verse indexing
   - Handle verse ranges and cross-references
   - Clean formatting for readability

3. Integration:
   - Create commentary adapter/service
   - Add to commentary_lookup tool
   - Support multiple commentators
   - Cache commentary responses

**Success Criteria:**
- Users can request commentary by verse
- Multiple commentators available
- Clean, readable formatting
- Fast response times with caching

### Priority 2: Additional Public Domain Bible Translations (EASY WIN)

**Goal:** Add KJV, WEB, ASV via wldeh/bible-api

**Why Priority 2:**
- Easy to implement (GitHub CDN, no API keys)
- Immediate user value
- No ongoing maintenance
- Expands multi-translation support

**Implementation:**
- Create wldeh/bible-api adapter
- Add KJV, WEB, ASV to translation routing
- Update bible_lookup tool with new options
- Test parallel translation display

### Priority 3: Cross-Reference System (MEDIUM COMPLEXITY)

**Goal:** Add Treasury of Scripture Knowledge integration

**Why Priority 3:**
- Enhances Bible study capabilities
- Links related verses automatically
- Moderate complexity
- Clear user value

**Implementation:**
- Integrate Treasury of Scripture Knowledge data
- Create cross-reference service
- Add to commentary_lookup output
- Format cross-refs with verse previews

### Priority 4: Advanced Features (OPTIONAL)

1. **Topical Search Tool**
   - Build topic index across all resources
   - Implement relevance scoring
   - Cross-resource search results

2. **Greek/Hebrew Word Studies**
   - Strong's concordance integration
   - Lexicon data (public domain)
   - Original language display

3. **Persistent Cache**
   - Migrate to SQLite for cache
   - Pre-warm common passages
   - Cache statistics tracking

4. **Additional Resources**
   - More confessions/catechisms (full versions)
   - Calvin's Commentaries
   - Interlinear Bible display

## Testing Checklist

### For Each Phase:

**Functional Tests (Phase 1):**
- [x] Each tool responds correctly
- [x] Error cases handled gracefully
- [x] Response formatting is clean
- [x] Cache works as expected

**Integration Tests (Phase 1):**
- [x] Claude Desktop connection stable
- [x] Natural language queries understood
- [x] Multiple sequential queries work
- [x] Rate limiting protection via caching

**User Experience Tests (Phase 1):**
- [x] Responses are helpful and complete
- [x] Citations properly formatted
- [x] Error messages guide users
- [x] Performance under 3 seconds (cache: <1ms, API: ~160ms)

**Phase 2 Testing Goals:**
- [x] Multiple translation support working (ESV, NET)
- [ ] Parallel translation display formatted correctly (pending KJV, WEB, ASV)
- [x] ESV footnotes integration (textual variants, translation alternatives)
- [ ] Theological commentary integration (pending Matthew Henry, etc.)
- [ ] Cross-references linked properly (pending)

## Common Issues & Solutions

### Issue: "Tool not found" in Claude
**Solution:** Check server registration and Claude Desktop config

### Issue: ESV API rate limit hit
**Solution:** Implement caching, check daily limit status

### Issue: Malformed verse references
**Solution:** Add more parsing patterns, provide format examples

### Issue: Memory cache growing too large
**Solution:** Implement LRU eviction, reduce TTL

### Issue: Claude Desktop won't connect
**Solution:** Check logs, verify path in config, restart Claude

## Git Workflow

### Branch Strategy
```bash
main           # Stable releases
├── develop    # Integration branch
    ├── feature/esv-api
    ├── feature/commentary
    └── feature/cross-refs
```

### Commit Message Format
```
feat: Add ESV API integration
fix: Handle malformed verse references
docs: Update setup instructions
refactor: Extract response formatter
```

### Daily Workflow
```bash
# Start of day
git pull origin develop
git checkout -b feature/today-task

# During development
git add .
git commit -m "feat: description"

# End of day
git push origin feature/today-task
# Create PR to develop
```

## Monitoring & Debugging

### Logging Strategy
```typescript
console.error('[ERROR]', error.message);  // Errors only
console.log('[INFO]', 'Server started');  // Important events
console.debug('[DEBUG]', data);           // Dev only
```

### Debug Commands
```bash
# Run with debug output
DEBUG=* npm run dev

# Test specific tool
echo '{"method":"tools/call","params":{"name":"bible_lookup","arguments":{"reference":"John 3:16"}}}' | node dist/index.js

# Check Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp-*.log  # macOS
```

## Deployment Preparation

### Pre-deployment Checklist
- [ ] Remove all debug console.log statements
- [ ] Ensure all API keys in environment variables
- [ ] Update README with clear setup instructions
- [ ] Test fresh install on clean system
- [ ] Verify all tools working
- [ ] Document rate limits and quotas

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "echo 'Add tests in Phase 2'",
    "clean": "rm -rf dist"
  }
}
```

## Success Metrics

### Phase 1 Complete ✅
- [x] All 3 basic tools working (bible, commentary, historical)
- [x] ESV API integrated successfully with caching
- [x] Local confessions searchable with section-level topics
- [x] Claude Desktop integration stable
- [x] **BONUS:** Performance optimization (cache reduces 160ms → <1ms)
- [x] **BONUS:** Conceptual search via topic tagging

### Phase 2 Status: Partially Complete ⚠️
**Completed:**
- [x] CCEL integration (classic Christian texts)
- [x] ESV footnotes (textual variants, translation alternatives)
- [x] Multi-translation support (ESV, NET)
- [x] Performance optimized (caching system working)

**Remaining for Phase 2 Completion:**
- [ ] Additional public domain translations (KJV, WEB, ASV)
- [ ] Cross-references functional
- [ ] Public domain theological commentary (Matthew Henry, JFB)

**Phase 3 Goals:**
- [ ] Priority 1: Matthew Henry commentary integration
- [ ] Priority 2: KJV, WEB, ASV translations
- [ ] Priority 3: Cross-reference system
- [ ] Priority 4: Advanced features (word studies, topical search)

### Ready for Others ✅
- [x] Documentation complete and clear
- [x] Setup process under 10 minutes
- [x] No critical bugs
- [x] Example queries provided
- [x] Error messages helpful
- [x] GitHub repository published
- [x] v1.0.0-phase1 released

## Resources & References

### Essential Documentation
- [MCP SDK Docs](https://modelcontextprotocol.io/docs)
- [ESV API Docs](https://api.esv.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Helpful Examples
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)
- [Bible API Examples](https://api.esv.org/docs/samples/)

### Troubleshooting Resources
- MCP Discord/Community (if available)
- Claude Desktop Logs Location
- Stack Overflow for TypeScript issues