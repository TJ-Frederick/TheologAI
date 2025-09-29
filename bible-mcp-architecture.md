# Bible Study MCP Server - Architecture Plan

## 1. System Architecture

### 1.1 Component Overview
```
┌─────────────────────┐
│   Claude Desktop    │
└──────────┬──────────┘
           │ MCP Protocol
┌──────────▼──────────┐
│   MCP Server Core   │
├─────────────────────┤
│   Request Router    │
├─────────────────────┤
│   Tool Handlers     │
├─────────────────────┤
│  Service Layer      │
├─────────────────────┤
│  Data Adapters      │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────┬─────────┐
    │             │          │         │
┌───▼───┐  ┌─────▼────┐ ┌───▼───┐ ┌───▼───┐
│ESV API│  │NET Bible │ │ Local │ │ Cache │
└───────┘  └──────────┘ └───────┘ └───────┘
```

### 1.2 Core Components

**MCP Server Core**
- Entry point: `src/index.ts`
- Handles MCP protocol handshake and message routing
- Manages tool registration and lifecycle

**Request Router**
- Maps tool calls to appropriate handlers
- Parses and validates parameters
- Manages response formatting

**Tool Handlers**
- Individual handler for each MCP tool
- Coordinates between service layer and response formatting
- Handles tool-specific error cases

**Service Layer**
- Business logic for data retrieval and processing
- Combines data from multiple sources
- Implements caching strategies

**Data Adapters**
- Abstraction layer for external APIs
- Handles rate limiting and retries
- Normalizes data formats

## 2. Project Structure

```
bible-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # MCP server class
│   ├── tools/               
│   │   ├── index.ts         # Tool registry
│   │   ├── bibleLookup.ts   # Bible verse tool
│   │   ├── commentary.ts    # Commentary tool
│   │   ├── historical.ts    # Historical docs tool
│   │   └── topical.ts       # Topical search tool
│   ├── services/            
│   │   ├── bibleService.ts  # Bible text logic
│   │   ├── commentaryService.ts
│   │   ├── historicalService.ts
│   │   └── searchService.ts # Cross-resource search
│   ├── adapters/            
│   │   ├── esvApi.ts        # ESV API client
│   │   ├── netBibleApi.ts   # NET Bible client
│   │   └── localData.ts     # Local JSON handler
│   ├── utils/               
│   │   ├── parser.ts        # Reference parsing
│   │   ├── formatter.ts     # Response formatting
│   │   ├── cache.ts         # Simple cache
│   │   └── errors.ts        # Error handling
│   └── types/               
│       ├── index.ts         # Type definitions
│       └── mcp.ts           # MCP-specific types
├── data/                    
│   ├── confessions/         # JSON confession files
│   ├── creeds/              # JSON creed files
│   └── commentaries/        # Local commentary data
├── config/                  
│   └── default.json         # Configuration
├── package.json            
├── tsconfig.json           
└── README.md               
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

### 6.1 Simple Memory Cache (Phase 1)
```typescript
// src/utils/cache.ts
class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize = 1000;
  private ttl = 3600000; // 1 hour
  
  async get(key: string): Promise<any> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
}
```

### 6.2 Cache Keys
- Bible: `bible:${translation}:${reference}`
- Commentary: `commentary:${source}:${reference}`
- Historical: `historical:${document}:${query}`

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