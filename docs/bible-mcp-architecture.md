# Bible Study MCP Server - Architecture Plan

> **Historical architecture plan:** This document describes an earlier
> mock-era design. It is not the current product contract or implementation
> status. See [README.md](../README.md) and [docs/ROADMAP.md](ROADMAP.md) for
> the current capabilities and sequence.


**Current Status: Production Ready - Beta Launch (v3.4.1)**

This document serves as the **architecture plan** for TheologAI MCP Server. Implementation status is annotated throughout:
- ✅ = Implemented as planned
- ⚠️ = Implemented differently than planned
- 📋 = Planned but not yet implemented

## 1. System Architecture

### 1.1 Component Overview
```
┌─────────────────────┐
│   Claude Desktop    │
└──────────┬──────────┘
           │ MCP Protocol (stdio)
┌──────────▼──────────┐
│   MCP Server Core   │  (src/index.ts, src/server.ts)
├─────────────────────┤
│   Tool Handlers     │  (src/tools/)
│  - bibleLookup      │  ✅ Implemented
│  - historicalSearch │  ✅ Implemented (enhanced with topic tagging)
│  - commentaryLookup │  ✅ Implemented (mock data)
├─────────────────────┤
│  Service Layer      │  (src/services/)
│  - BibleService     │  ✅ Implemented
│  - HistoricalService│  ✅ Implemented
│  - CommentaryService│  ✅ Implemented (mock)
├─────────────────────┤
│  Data Adapters      │  (src/adapters/)
│  - ESVAdapter       │  ✅ Implemented with cache
│  - LocalDataAdapter │  ✅ Implemented with section-level topics
└──────────┬──────────┘
           │
    ┌──────┴──────┬─────────┬─────────┐
    │             │         │         │
┌───▼───┐  ┌─────▼────┐ ┌──▼──┐ ┌───▼────┐
│ESV API│  │Local JSON│ │Cache│ │NET Mock│
│(5k/day)│  │  Data    │ │(TTL)│ │  Data  │
└───────┘  └──────────┘ └─────┘ └────────┘
           (creeds,                (4 verses)
            confessions)
```

### 1.2 Core Components

**MCP Server Core** ✅
- Entry point: `src/index.ts` ✅
- Handles MCP protocol handshake and message routing ✅
- Manages tool registration and lifecycle ✅

**Tool Handlers** ✅
- Individual handler for each MCP tool ✅
- Coordinates between service layer and response formatting ✅
- Handles tool-specific error cases ✅
- **Actual:** Three handlers implemented (bible_lookup, historical_search, commentary_lookup)

**Service Layer** ✅
- Business logic for data retrieval and processing ✅
- Combines data from multiple sources ✅
- Implements caching strategies ✅
- **Actual:** Three services: BibleService, HistoricalService, CommentaryService

**Data Adapters** ✅
- Abstraction layer for external APIs ✅
- Handles rate limiting via caching ✅
- Normalizes data formats ✅
- **Actual:** ESVAdapter (with cache), LocalDataAdapter (enhanced with section-level topics)

## 2. Project Structure

```
TheologAI/                      # ✅ Implemented
├── src/
│   ├── index.ts              # ✅ MCP server entry point
│   ├── server.ts             # ✅ MCP server class
│   ├── tools/
│   │   ├── index.ts         # ✅ Tool registry
│   │   ├── bibleLookup.ts   # ✅ Bible verse tool
│   │   ├── commentaryLookup.ts  # ✅ Commentary tool (was commentary.ts)
│   │   ├── historicalSearch.ts  # ✅ Historical docs tool (was historical.ts)
│   │   └── topical.ts       # 📋 Topical search tool (planned for Phase 3)
│   ├── services/
│   │   ├── bibleService.ts  # ✅ Bible text logic
│   │   ├── commentaryService.ts  # ⚠️ Mock data (4 verses), real NET API in Phase 2
│   │   ├── historicalService.ts  # ✅ (enhanced with section-level topics)
│   │   └── searchService.ts # 📋 Cross-resource search (Phase 3)
│   ├── adapters/
│   │   ├── esvApi.ts        # ✅ ESV API client with cache
│   │   ├── netBibleApi.ts   # 📋 NET Bible client (Phase 2)
│   │   ├── localData.ts     # ✅ Local JSON handler with section topics
│   │   └── index.ts         # ✅ Adapter exports
│   ├── utils/
│   │   ├── parser.ts        # 📋 Reference parsing (Phase 2)
│   │   ├── formatter.ts     # ✅ Response formatting
│   │   ├── cache.ts         # ✅ In-memory cache with TTL & LRU
│   │   └── errors.ts        # ✅ Error handling
│   └── types/
│       └── index.ts         # ✅ Type definitions (consolidated)
├── data/                    # ✅ Implemented
│   ├── confessions/         # ✅ Westminster, Heidelberg (samples)
│   ├── creeds/              # ✅ Apostles, Nicene (with section topics)
│   └── commentaries/        # 📋 Local commentary data (Phase 2)
├── config/                  # ⚠️ Not using config files, using .env instead
├── package.json             # ✅
├── tsconfig.json            # ✅
├── .env                     # ✅ Environment variables
├── .env.example             # ✅ Example env file
├── README.md                # ✅ Complete documentation
├── bible-mcp-prd.md         # ✅ Product requirements
├── bible-mcp-architecture.md # ✅ This document
└── bible-mcp-development-plan.md  # ✅ Development plan
```

## 3. Key TypeScript Patterns

### 3.1 MCP Server Setup
```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BibleMCPServer } from './server.js';

const server = new BibleMCPServer();
const transport = new StdioServerTransport();

async function main() {
  await server.connect(transport);
  console.error('Bible MCP Server running');
}

main().catch(console.error);
```

### 3.2 Tool Handler Pattern
```typescript
// src/tools/bibleLookup.ts
import { ToolHandler } from '../types';

export const bibleLookupHandler: ToolHandler = {
  name: 'bible_lookup',
  description: 'Look up Bible verses by reference',
  inputSchema: {
    type: 'object',
    properties: {
      reference: { type: 'string' },
      translation: { type: 'string', default: 'ESV' },
      includeContext: { type: 'boolean', default: false }
    },
    required: ['reference']
  },
  handler: async (params) => {
    try {
      const result = await bibleService.lookup(params);
      return formatResponse(result);
    } catch (error) {
      return handleError(error);
    }
  }
};
```

### 3.3 Service Pattern
```typescript
// src/services/bibleService.ts
export class BibleService {
  constructor(
    private esvAdapter: ESVAdapter,
    private cache: Cache
  ) {}

  async lookup(params: BibleLookupParams): Promise<BibleResult> {
    const cacheKey = this.getCacheKey(params);
    const cached = await this.cache.get(cacheKey);
    
    if (cached) return cached;
    
    const result = await this.esvAdapter.getPassage(params);
    await this.cache.set(cacheKey, result);
    
    return result;
  }
}
```

## 4. Data Flow

### 4.1 Request Flow
1. Claude sends MCP tool request
2. Server validates and routes to handler
3. Handler calls appropriate service
4. Service checks cache
5. If miss, service calls adapter(s)
6. Adapter makes external API call
7. Response flows back through layers
8. Formatted response sent to Claude

### 4.2 Error Handling Flow
- Adapters throw specific errors (RateLimitError, NetworkError)
- Services catch and potentially retry or fallback
- Handlers format errors for user-friendly messages
- Server ensures MCP-compliant error responses

## 5. External API Integration

### 5.1 ESV API Adapter
```typescript
// src/adapters/esvApi.ts
class ESVAdapter {
  private baseURL = 'https://api.esv.org/v3/passage/text/';
  private apiKey = process.env.ESV_API_KEY;
  
  async getPassage(reference: string): Promise<PassageResult> {
    const response = await fetch(
      `${this.baseURL}?q=${reference}`,
      { headers: { 'Authorization': `Token ${this.apiKey}` }}
    );
    
    if (!response.ok) {
      throw new APIError(response.status, 'ESV API error');
    }
    
    return this.parseResponse(await response.json());
  }
}
```

### 5.2 Rate Limiting Strategy
```typescript
// src/utils/rateLimiter.ts
class RateLimiter {
  private queue: Map<string, QueueItem[]> = new Map();
  private limits: Map<string, Limit> = new Map([
    ['esv', { requests: 5000, window: 86400000 }], // Daily
  ]);
  
  async execute(api: string, fn: Function): Promise<any> {
    await this.waitIfNeeded(api);
    try {
      return await fn();
    } finally {
      this.recordRequest(api);
    }
  }
}
```

## 6. Caching Strategy

### 6.1 Simple Memory Cache (Phase 1) ✅
```typescript
// src/utils/cache.ts - ✅ Implemented
class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize = 100;           // ✅ Implemented (100 entries)
  private ttlMs = 3600000;         // ✅ 1 hour TTL

  get(key: string): T | undefined {
    // ✅ Checks expiry, updates lastAccessed for LRU
  }

  set(key: string, value: T): void {
    // ✅ LRU eviction when cache full
  }

  // ✅ Additional methods: has(), clear(), size(), cleanup()
}
```

**Implementation Status:**
- ✅ Generic type support for type safety
- ✅ LRU eviction strategy implemented
- ✅ TTL-based expiration
- ✅ Integrated into ESVAdapter
- **Performance:** Reduces API calls from ~160ms to <1ms

### 6.2 Cache Keys ⚠️
**Planned:**
- Bible: `bible:${translation}:${reference}`
- Commentary: `commentary:${source}:${reference}`
- Historical: `historical:${document}:${query}`

**Actual (Phase 1):**
- Bible: `${reference}:${JSON.stringify(options)}` (in ESVAdapter)
- Historical: No caching (local data, instant)
- Commentary: No caching (mock data, instant)

## 7. Response Formatting

### 7.1 Standard Response Structure
```typescript
interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
```

### 7.2 Markdown Formatting
```typescript
function formatBibleResponse(data: BibleData): string {
  return `
**${data.reference} (${data.translation})**
${data.text}

${data.crossRefs ? `*Cross References:* ${data.crossRefs}` : ''}
*Source: ${data.copyright}*
  `.trim();
}
```

## 8. Configuration

### 8.1 Environment Variables
```bash
# .env
ESV_API_KEY=your_key_here
NET_BIBLE_API_KEY=optional_key
CACHE_TTL=3600000
MAX_CACHE_SIZE=1000
LOG_LEVEL=info
```

### 8.2 Config File
```json
// config/default.json
{
  "server": {
    "name": "bible-mcp-server",
    "version": "1.0.0"
  },
  "apis": {
    "esv": {
      "baseUrl": "https://api.esv.org/v3",
      "rateLimit": 5000,
      "timeout": 5000
    }
  },
  "cache": {
    "enabled": true,
    "maxSize": 1000,
    "ttl": 3600000
  }
}
```

## 9. Error Handling

### 9.1 Error Types
```typescript
class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super('Rate limit exceeded');
  }
}
```

### 9.2 User-Friendly Messages
```typescript
function getUserMessage(error: Error): string {
  if (error instanceof RateLimitError) {
    return "I'm temporarily limited on Bible API requests. Try again in a few minutes.";
  }
  if (error instanceof ValidationError) {
    return `Invalid reference format. Try something like "John 3:16" or "Genesis 1:1-5"`;
  }
  return "I encountered an error retrieving that information. Please try again.";
}
```

## 10. Testing Approach

### 10.1 Manual Testing (Phase 1)
```bash
# Test commands for Claude Desktop
"Look up John 3:16"
"What does the Westminster Confession say about God?"
"Show me Matthew Henry's commentary on Genesis 1:1"
```

### 10.2 Unit Testing (Phase 2)
- Test reference parsing with various formats
- Mock external API responses
- Validate cache behavior
- Error handling scenarios

## 11. Deployment Instructions

### 11.1 Local Development Setup
```bash
# Clone and install
git clone [repo]
cd bible-mcp-server
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Build and run
npm run build
npm run dev
```

### 11.2 Claude Desktop Configuration
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "bible": {
      "command": "node",
      "args": ["/path/to/bible-mcp-server/dist/index.js"],
      "env": {
        "ESV_API_KEY": "your_key"
      }
    }
  }
}
```

## 12. Performance Optimizations

### 12.1 Quick Wins
- Cache all API responses with 1-hour TTL
- Batch cross-reference lookups
- Pre-load common passages on startup
- Use streaming for long responses

### 12.2 Future Optimizations
- SQLite for persistent cache
- Background cache warming
- Request deduplication
- Parallel API calls where possible
