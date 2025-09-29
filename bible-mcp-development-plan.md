# Bible Study MCP Server - Development Plan

## Phase 1: MVP Foundation (Days 1-7)

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
- [ ] MCP server starts without errors
- [ ] Claude Desktop recognizes the server
- [ ] Mock tool responds to queries

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
- [ ] Real Bible verses returned
- [ ] Handles single verses and ranges
- [ ] Graceful error handling for invalid references

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
- [ ] Confessions searchable by topic
- [ ] NET Bible notes linked to verses
- [ ] Clean formatting of historical documents

### Day 7: Testing & Refinement

**Goal:** Ensure MVP is stable and usable

**Steps:**
1. **Comprehensive Testing**
   - Test all tools with various inputs
   - Document any issues
   - Fix critical bugs

2. **Add Basic Cache**
   - Implement simple memory cache
   - Cache API responses for 1 hour
   - Test cache hit/miss scenarios

3. **Documentation**
   - Update README with setup instructions
   - Document all available commands
   - Create example queries document

## Phase 2: Enhancement (Days 8-14)

### Day 8-9: Additional Bible Translations

**Goal:** Add KJV and improve translation handling

**Steps:**
1. **Add KJV Support**
   - Find public domain KJV API or data
   - Create KJV adapter
   - Allow translation selection in queries

2. **Parallel Translation Display**
   - Modify formatter for side-by-side display
   - Handle multiple translation requests
   - Test formatting in Claude

**Test Queries:**
```
"Show me John 3:16 in ESV and KJV"
"Compare Genesis 1:1 across translations"
```

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

### Day 12-13: Matthew Henry Commentary

**Goal:** Add substantial commentary resource

**Steps:**
1. **Process Commentary Data**
   - Find public domain Matthew Henry text
   - Convert to searchable JSON format
   - Index by verse reference

2. **Integrate Commentary Tool**
   - Link commentary to verses
   - Handle verse ranges
   - Format for readability

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

### Optional Enhancements

1. **Topical Search**
   - Build topic index across resources
   - Implement relevance scoring
   - Cross-resource search results

2. **Persistent Cache**
   - Migrate to SQLite for cache
   - Pre-warm common passages
   - Cache statistics tracking

3. **Additional Resources**
   - Calvin's Commentaries
   - More confessions/catechisms
   - Greek/Hebrew word studies

## Testing Checklist

### For Each Phase:

**Functional Tests:**
- [ ] Each tool responds correctly
- [ ] Error cases handled gracefully
- [ ] Response formatting is clean
- [ ] Cache works as expected

**Integration Tests:**
- [ ] Claude Desktop connection stable
- [ ] Natural language queries understood
- [ ] Multiple sequential queries work
- [ ] Rate limiting doesn't break server

**User Experience Tests:**
- [ ] Responses are helpful and complete
- [ ] Citations properly formatted
- [ ] Error messages guide users
- [ ] Performance under 3 seconds

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

### Phase 1 Complete When:
- [ ] All 3 basic tools working (bible, commentary, historical)
- [ ] ESV API integrated successfully
- [ ] Local confessions searchable
- [ ] Claude Desktop integration stable

### Phase 2 Complete When:
- [ ] Multiple Bible translations available
- [ ] Cross-references functional
- [ ] Matthew Henry commentary integrated
- [ ] Performance under 3 seconds consistently

### Ready for Others When:
- [ ] Documentation complete and clear
- [ ] Setup process under 10 minutes
- [ ] No critical bugs
- [ ] Example queries provided
- [ ] Error messages helpful

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