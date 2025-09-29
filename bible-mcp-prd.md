# Bible Study MCP Server - Product Requirements Document

## 1. Executive Summary

### 1.1 Product Vision
A Model Context Protocol (MCP) server that provides theological researchers and Bible students with programmatic access to biblical texts, commentaries, and historical Christian documents through natural language queries via Claude Desktop and other MCP clients.

### 1.2 Success Criteria
- Successfully integrate with Claude Desktop for natural language Bible/theology queries
- Response time under 3 seconds for typical queries
- Access to at least 3 distinct resource types (Bible, commentaries, historical documents)
- Clean, maintainable TypeScript codebase suitable for AI-assisted development

## 2. User Stories & Requirements

### 2.1 Primary User Stories

**As a theological researcher using Claude, I want to:**

1. **Look up specific Bible verses** so I can quickly reference Scripture in context
   - Input: "John 3:16" or "Romans 8:28-39"
   - Output: Full text of requested verses with book/chapter/verse citations

2. **Access commentary on passages** so I can understand scholarly and historical interpretations
   - Input: "What does Matthew Henry say about Genesis 1:1?"
   - Output: Relevant commentary excerpts with proper attribution

3. **Search historical theological documents** so I can understand doctrinal development
   - Input: "What does the Westminster Confession say about predestination?"
   - Output: Relevant sections from confessions/creeds

4. **Find cross-references** so I can see biblical connections and themes
   - Input: "What verses cross-reference with John 3:16?"
   - Output: List of related verses with their text

5. **Perform topical searches** so I can study themes across resources
   - Input: "Find passages about justification by faith"
   - Output: Relevant Bible verses and commentary excerpts

### 2.2 Functional Requirements

#### Core Capabilities (MVP - Phase 1)

**FR1: Bible Text Retrieval**
- Support verse lookup by standard references (Book Chapter:Verse)
- Return appropriate context (surrounding verses when relevant)
- Support verse ranges (e.g., "John 3:16-21")
- Primary translations: ESV (via API), KJV (public domain)
- Include NET Bible translator notes when available

**FR2: Commentary Access**
- Matthew Henry's Complete Commentary (priority)
- Calvin's Commentaries (secondary)
- NET Bible translation notes
- Return commentary linked to specific passages

**FR3: Historical Document Search**
- Westminster Confession of Faith
- Heidelberg Catechism
- Apostles' and Nicene Creeds
- Support topical/keyword searches within documents

**FR4: Cross-Reference Support**
- Provide verse cross-references from available sources
- Return actual verse text, not just references
- Group by theme/topic when possible

**FR5: Natural Language Response**
- Format responses in readable markdown
- Include proper citations and attributions
- Structure parallel texts in readable format
- Maintain context awareness for follow-up queries

#### Future Capabilities (Phase 2+)
- Expanded commentary collection
- Greek/Hebrew word studies
- Topical indexes and concordances
- Offline caching of frequently accessed content
- User preferences and saved searches

### 2.3 Non-Functional Requirements

**NFR1: Performance**
- Response time < 3 seconds for 95% of queries
- Support up to 10 concurrent users initially
- Graceful degradation when external APIs are slow/unavailable

**NFR2: Reliability**
- Handle API rate limits gracefully
- Provide meaningful error messages
- Fallback options when primary sources fail

**NFR3: Maintainability**
- Clear TypeScript code structure suitable for AI-assisted development
- Comprehensive inline documentation
- Modular architecture for easy feature additions

**NFR4: MCP Compatibility**
- Full compliance with MCP protocol specification
- Compatible with Claude Desktop client
- Support for streaming responses where appropriate

## 3. Data Sources Priority

**Phase 1 (Week 1-2):**
- ESV API (api.esv.org) - 5000 requests/day free
- NET Bible API - Translation notes
- Local JSON files - Confessions, creeds, basic commentaries

**Phase 2 (Week 3-4):**
- Additional Bible translations via public APIs
- Matthew Henry Commentary (processed from public domain sources)
- Calvin's Commentaries (if freely available)

**Phase 3 (Future):**
- SWORD module integration
- CCEL API integration
- Archive.org theological texts

*Note: See Architecture Plan document for technical implementation details*

## 4. Tool Specifications

### 4.1 MCP Tools to Implement

#### Tool 1: `bible_lookup`
**Purpose:** Retrieve Bible passages by reference
```typescript
{
  name: "bible_lookup",
  description: "Look up Bible verses by reference",
  parameters: {
    reference: string,  // e.g., "John 3:16" or "Romans 8:28-39"
    translation?: string, // Default: "ESV"
    includeContext?: boolean, // Include surrounding verses
    includeCrossRefs?: boolean // Include cross-references
  }
}
```

#### Tool 2: `commentary_lookup`
**Purpose:** Get commentary on specific passages
```typescript
{
  name: "commentary_lookup",
  description: "Get commentary on a Bible passage",
  parameters: {
    reference: string, // Bible reference
    commentator?: string, // "matthew_henry", "calvin", "net_notes"
    maxLength?: number // Maximum response length
  }
}
```

#### Tool 3: `historical_search`
**Purpose:** Search confessions and historical documents
```typescript
{
  name: "historical_search",
  description: "Search historical Christian documents",
  parameters: {
    query: string, // Search terms
    document?: string, // Specific document to search
    docType?: string // "confession", "creed", "catechism"
  }
}
```

#### Tool 4: `topical_search`
**Purpose:** Search across all resources by topic
```typescript
{
  name: "topical_search",
  description: "Search for topics across Bible and theological resources",
  parameters: {
    topic: string, // Topic or theme
    resourceTypes?: string[], // ["bible", "commentary", "historical"]
    maxResults?: number
  }
}
```

### 4.2 Response Format

All tools return structured data that gets formatted into natural language:

```typescript
{
  success: boolean,
  data: {
    primaryContent: string, // Main response text
    citations: Citation[], // Source citations
    crossReferences?: Reference[], // Related passages
    metadata: {
      source: string,
      copyright?: string,
      retrievalTime: number
    }
  },
  error?: {
    message: string,
    code: string,
    suggestion?: string
  }
}
```

## 5. User Experience Guidelines

### 5.1 Natural Language Processing
- Accept flexible verse reference formats
- Handle book name abbreviations and variations
- Understand contextual queries ("show me the next verse")
- Support compound requests ("John 3:16 in ESV and KJV")

### 5.2 Response Formatting
- Use markdown for structure and emphasis
- Cite sources clearly and consistently
- Format parallel translations in columns when appropriate
- Limit response length to maintain readability
- Include verse numbers inline for easy reference

### 5.3 Error Handling
- Provide helpful suggestions for malformed references
- Offer alternatives when resources are unavailable
- Clearly indicate when content is from cache vs. live
- Never fail silently - always provide feedback

## 6. Development Phases

### Phase 1: MVP (Week 1-2)
**Goal:** Basic working MCP server with essential Bible lookup

**Deliverables:**
1. Basic MCP server setup in TypeScript
2. ESV API integration for verse lookup
3. Simple commentary access (NET Bible notes)
4. Local JSON storage for 2-3 confessions
5. Basic error handling and response formatting

**Success Metrics:**
- Successfully connects to Claude Desktop
- Can retrieve any Bible verse from ESV
- Returns formatted, readable responses
- Handles basic errors gracefully

### Phase 2: Enhancement (Week 3-4)
**Goal:** Expand resource coverage and improve UX

**Deliverables:**
1. Additional Bible translation (KJV)
2. Matthew Henry commentary integration
3. Cross-reference support
4. Improved natural language understanding
5. Basic caching for common queries

### Phase 3: Optimization (Week 5+)
**Goal:** Performance improvements and advanced features

**Deliverables:**
1. Response time optimization
2. Advanced caching strategies
3. Additional commentary sources
4. Topical index building
5. Preparation for hosted deployment

## 7. Technical Constraints & Decisions

### 7.1 Core Decisions
- **Language:** TypeScript
- **Runtime:** Node.js
- **Primary Framework:** Official MCP SDK
- **Initial Deployment:** Local development
- **Data Storage:** JSON files initially, database later

### 7.2 Development Environment
- **IDE:** Cursor
- **Version Control:** GitHub
- **Package Manager:** npm or yarn

*Note: See Architecture Plan document for detailed technical implementation*

## 8. Success Metrics

### 8.1 Technical Metrics
- Average response time < 3 seconds
- API error rate < 5%
- Cache hit rate > 60% (Phase 2+)
- Zero critical bugs in production

### 8.2 Functional Metrics
- Support for 100+ common Bible references
- Access to 1000+ commentary entries
- Coverage of major Reformed confessions
- Successful Claude Desktop integration

### 8.3 User Experience Metrics
- Natural language understanding accuracy > 90%
- Helpful error messages for 100% of failures
- Consistent response formatting
- Positive user feedback on usefulness

## 9. Risks & Mitigations

### 9.1 Technical Risks
**Risk:** API rate limits exceeded
**Mitigation:** Implement caching, queue management, multiple API keys

**Risk:** External API downtime
**Mitigation:** Fallback data sources, cached responses, graceful degradation

**Risk:** Complex natural language queries
**Mitigation:** Start with structured queries, gradually improve NLP

### 9.2 Content Risks
**Risk:** Copyright concerns with commentaries
**Mitigation:** Use only public domain or properly licensed content

**Risk:** Theological bias in responses
**Mitigation:** Clearly attribute all sources, provide multiple perspectives

## 10. Future Considerations

### 10.1 Scaling Path
1. Local development and testing
2. Small-scale hosted deployment
3. Commercial offering with micropayments
4. Enterprise/institutional licenses

### 10.2 Feature Roadmap
- Original language tools (Greek/Hebrew)
- Audio Bible integration
- Liturgical calendar support
- Study plan generation
- Collaborative study features
- Mobile app integration

### 10.3 Monetization Options
- Pay-per-query via x402 protocol
- Subscription tiers
- Premium commentary access
- Institutional licenses
- API access for third parties

## Appendices

### A. Example Queries and Expected Responses

**Query:** "Show me John 3:16"
**Response:** 
```
**John 3:16 (ESV)**
"For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life."

*Source: ESV Bible, Crossway Publishers*
```

**Query:** "What does Matthew Henry say about Genesis 1:1?"
**Response:**
```
**Matthew Henry Commentary on Genesis 1:1**
"In the beginning God created the heaven and the earth."

Henry notes: "The first verse of the Bible gives us a satisfying and useful account of the origin of the earth and the heavens. The faith of humble Christians understands this better than the fancy of the most learned men..."

*Source: Matthew Henry's Complete Commentary on the Bible (Public Domain)*
```

### B. Reference Documentation
- MCP Protocol: https://modelcontextprotocol.io/
- ESV API: https://api.esv.org/
- NET Bible: https://netbible.org/
- Public Domain Commentaries: https://www.ccel.org/

### C. Development Setup Checklist
- [ ] Node.js and npm installed
- [ ] TypeScript configured
- [ ] MCP SDK installed
- [ ] ESV API key obtained
- [ ] GitHub repository created
- [ ] Claude Desktop MCP configuration ready
- [ ] Sample confession/creed JSON files prepared