# Parallel Passages Tool - Implementation Specification

## Project Context

This is a **Model Context Protocol (MCP) server** for Bible study and theological research. The server currently has 4 tools:

1. **bible_lookup** - Fetches Bible verse text (supports multiple translations)
2. **bible_cross_references** - Finds related verses using OpenBible.info data
3. **commentary_lookup** - Provides theological commentary from public domain sources
4. **classic_text_lookup** - Searches historical documents (creeds, confessions, catechisms) and CCEL

## Your Task

Implement a new tool called **parallel_passages** that helps users compare parallel passages across Scripture.

## Use Cases

### 1. Gospel Harmony (Primary Use Case)
Compare the same event across Matthew, Mark, Luke, and John.

**Example:** User wants to compare "Feeding of the 5000" across all four Gospels
- Input: `Matthew 14:13-21`
- Tool finds: Mark 6:30-44, Luke 9:10-17, John 6:1-15
- Shows side-by-side comparison with unique details highlighted

### 2. OT Quotations in NT
When NT quotes OT, show both passages with context.

**Example:** User studies Hebrews 1:5
- Tool identifies quotes from Psalm 2:7 and 2 Samuel 7:14
- Shows original OT context vs. NT usage
- Explains typological fulfillment

### 3. Thematic Parallels
Compare how different authors treat the same theme.

**Example:** Compare Paul's teaching on justification
- Romans 3:21-26, Galatians 2:16, Ephesians 2:8-9
- Also show James 2:14-26 (apparent tension)

## Tool Architecture

### Integration with Existing Tools

The parallel_passages tool should:
1. **Use cross_references internally** - To discover potential parallels automatically
2. **Call bible_lookup** - To fetch actual verse text (when includeText=true)
3. **Provide metadata** - Allow flexible workflows (fetch text later if needed)

### Tool Schema

```typescript
{
  name: 'parallel_passages',
  description: 'Find and compare parallel passages across Scripture (Gospel harmony, OT quotations in NT, thematic parallels). Integrates with bible_lookup and cross_references for discovery and text retrieval.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Primary verse/passage to find parallels for (e.g., "Matthew 14:13-21")'
      },
      mode: {
        type: 'string',
        enum: ['auto', 'synoptic', 'quotation', 'thematic'],
        default: 'auto',
        description: 'Type of parallels to find. auto: let tool decide, synoptic: Gospel parallels only, quotation: OT quotes in NT, thematic: same topic across authors'
      },
      includeText: {
        type: 'boolean',
        default: true,
        description: 'If true, fetch verse text via bible_lookup. If false, return metadata only (references + relationships)'
      },
      translation: {
        type: 'string',
        default: 'ESV',
        description: 'Bible translation to use when includeText=true'
      },
      showDifferences: {
        type: 'boolean',
        default: true,
        description: 'Highlight unique elements in each parallel account'
      },
      useCrossReferences: {
        type: 'boolean',
        default: true,
        description: 'Use cross_references tool to augment parallel discovery'
      },
      maxParallels: {
        type: 'number',
        default: 10,
        description: 'Maximum number of parallel passages to return'
      }
    },
    required: ['reference']
  }
}
```

### Response Format

#### When includeText=true (Full Response)
```typescript
{
  primary: {
    reference: string;
    text: string;
    translation: string;
    context?: string;  // Brief note about context
  },
  parallels: Array<{
    reference: string;
    text: string;
    translation: string;
    relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
    confidence: number;  // 0-100
    uniqueElements?: string[];  // When showDifferences=true
    notes?: string;
  }>,
  analysis?: {
    commonElements: string[];  // Shared across all accounts
    variations: Record<string, any>;  // Key differences
    chronology?: string[];  // If applicable (e.g., Gospel events)
  },
  citation: {
    source: string;
    parallelData: string;  // e.g., "Synoptic parallel database v1.0"
  }
}
```

#### When includeText=false (Metadata Only)
```typescript
{
  primary: string;
  parallels: Array<{
    reference: string;
    relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
    confidence: number;
    notes?: string;
  }>,
  suggestedWorkflow: string;  // e.g., "Use bible_lookup to fetch text"
}
```

## Data Sources

### 1. Built-in Parallel Database (Priority)
Create a JSON file with known parallels. Start with common ones:

**Synoptic Gospels:**
```json
{
  "matthew_14_13-21": {
    "event": "Feeding of 5000",
    "parallels": ["mark_6_30-44", "luke_9_10-17", "john_6_1-15"],
    "uniqueDetails": {
      "matthew": ["withdrawing by boat", "evening mentioned"],
      "mark": ["green grass", "groups of 50/100"],
      "john": ["testing Philip", "Passover timing"]
    }
  }
}
```

**Focus on these major events first:**
- Birth narratives (Matthew 1-2, Luke 1-2)
- Temptation (Matthew 4, Mark 1, Luke 4)
- Calling of disciples (Matthew 4, Mark 1, Luke 5, John 1)
- Sermon on Mount/Plain (Matthew 5-7, Luke 6)
- Feeding of 5000 (all 4 Gospels)
- Transfiguration (Matthew 17, Mark 9, Luke 9)
- Triumphal entry (all 4 Gospels)
- Last Supper (all 4 Gospels)
- Crucifixion (all 4 Gospels)
- Resurrection (all 4 Gospels)

**OT Quotations in NT:**
Common ones like:
- Isaiah 53 → NT passion references
- Psalm 110:1 → NT exaltation passages
- Genesis 15:6 → Romans/Galatians/James on faith

### 2. Cross-Reference Integration
Use the existing cross_references tool to discover additional parallels:
```typescript
// Augment with cross-reference data
const crossRefs = await crossRefService.getCrossReferences(reference, {
  maxResults: 20,
  minVotes: 10
});

// Filter for likely parallels
const likelyParallels = crossRefs.references.filter(ref =>
  this.seemsLikeParallel(primaryRef, ref)
);
```

**Heuristics for "seems like parallel":**
- Different synoptic Gospel = likely parallel event
- OT → NT with high votes = likely quotation
- Same theme keywords + high votes = thematic parallel

## Implementation Steps

### Phase 1: Core Infrastructure
1. Create `src/services/parallelPassageService.ts`
2. Create `src/data/parallel-passages.json` with ~20 major Gospel events
3. Create `src/tools/parallelPassages.ts` with MCP tool handler
4. Implement basic discovery (no text fetching yet)

### Phase 2: Integration
1. Integrate with cross_references for discovery augmentation
2. Integrate with bible_lookup for text fetching (when includeText=true)
3. Implement difference highlighting algorithm

### Phase 3: Analysis Features
1. Detect common elements across parallels
2. Identify unique details per account
3. Generate insights (e.g., "Mark's account is most detailed")

## File Structure

```
src/
├── services/
│   └── parallelPassageService.ts      # Core logic
├── tools/
│   └── parallelPassages.ts            # MCP tool handler
├── data/
│   └── parallel-passages.json         # Parallel database
└── types/
    └── index.ts                       # Add ParallelPassage types

test/
└── integration/
    └── parallel-passages-test.ts      # Comprehensive tests
```

## Testing Requirements

Create tests for:
1. **Synoptic parallels** - Feeding of 5000 across 4 Gospels
2. **OT quotations** - Hebrews 1:5 → Psalm 2:7
3. **Metadata mode** - includeText=false returns only references
4. **Cross-reference integration** - Discovers parallels not in database
5. **Difference highlighting** - Detects unique elements per account
6. **Invalid input** - Graceful handling of unknown passages

## Example Workflows

### Workflow 1: Seminary Student Studying Sermon on the Mount
```typescript
// Step 1: Discover parallels
const metadata = await parallelPassages({
  reference: "Matthew 5:1-12",
  mode: "synoptic",
  includeText: false
});
// Returns: Luke 6:20-26 (Sermon on Plain)

// Step 2: Fetch text
const comparison = await parallelPassages({
  reference: "Matthew 5:1-12",
  mode: "synoptic",
  includeText: true,
  showDifferences: true
});
// Shows Beatitudes side-by-side with differences highlighted
```

### Workflow 2: Pastor Preparing Sermon on Resurrection
```typescript
const allAccounts = await parallelPassages({
  reference: "Matthew 28",
  mode: "synoptic",
  includeText: true,
  showDifferences: true
});
// Returns Mark 16, Luke 24, John 20 with unique details per Gospel
```

### Workflow 3: Student Researching NT Use of OT
```typescript
const quotations = await parallelPassages({
  reference: "Isaiah 53:5",
  mode: "quotation",
  includeText: true,
  useCrossReferences: true
});
// Finds 1 Peter 2:24, Acts 8:32-33, etc.
```

## Output Format Example

```
Feeding of the 5000 - Parallel Accounts

PRIMARY: Matthew 14:13-21 (ESV)
─────────────────────────────────────────────────────
Now when Jesus heard this, he withdrew from there in a boat to a
desolate place by himself. But when the crowds heard it, they followed
him on foot from the towns. [... full text ...]

PARALLELS:

[1] Mark 6:30-44 (Synoptic - 95% confidence)
─────────────────────────────────────────────────────
The apostles returned to Jesus and told him all that they had done and
taught. [... full text ...]

UNIQUE TO MARK:
• "green grass" (vivid eyewitness detail)
• People sat in groups of "hundreds and fifties"
• Mentions disciples needed 200 denarii

[2] Luke 9:10-17 (Synoptic - 95% confidence)
─────────────────────────────────────────────────────
[... text ...]

UNIQUE TO LUKE:
• Location specified as "Bethsaida"
• Jesus spoke about "kingdom of God"

[3] John 6:1-15 (Synoptic - 90% confidence)
─────────────────────────────────────────────────────
[... text ...]

UNIQUE TO JOHN:
• "Passover was near" (chronological marker)
• Philip tested: "Where shall we buy bread?"
• Andrew identified the boy with loaves
• People wanted to make Jesus king (he withdrew)

COMMON ELEMENTS:
✓ 5 loaves and 2 fish
✓ 5000 men fed
✓ 12 baskets of leftovers
✓ Disciples distributed food
✓ Jesus blessed/gave thanks

THEOLOGICAL EMPHASES:
• Matthew: Jesus as compassionate Shepherd (echoes Ezekiel 34)
• Mark: Vivid details suggest eyewitness (Peter's influence)
• Luke: Kingdom teaching and prayer before miracle
• John: Messianic sign pointing to Jesus as Bread of Life (ch 6 discourse)

Data sources: Synoptic Parallel Database, OpenBible.info cross-references
```

## Technical Notes

1. **Use existing services** - Import BibleService, CrossReferenceService
2. **Follow existing patterns** - Match the style of other tools (see bibleLookup.ts, crossReferences.ts)
3. **TypeScript types** - Create proper interfaces in types/index.ts
4. **Error handling** - Use existing error utilities (handleToolError)
5. **Formatting** - Use existing formatters (formatToolResponse, formatMarkdown)

## Questions to Consider

1. Should the tool support comparing user-specified arbitrary passages (not just discovered parallels)?
   - e.g., `{ references: ["Romans 8:28", "Philippians 4:13", "Jeremiah 29:11"] }`

2. Should it support multiple translations simultaneously?
   - e.g., Show Matthew in ESV, Mark in KJV for comparison?

3. Should it include commentary on the parallels?
   - e.g., Auto-fetch commentary explaining why accounts differ?

## Success Criteria

The tool is successful when:
1. ✅ Seminary students can compare Gospel accounts side-by-side
2. ✅ Pastors can quickly see all resurrection narratives together
3. ✅ Researchers can trace OT quotations through NT usage
4. ✅ Tool integrates seamlessly with existing bible_lookup and cross_references
5. ✅ Tests demonstrate all major use cases work correctly

---

## Ready to Start?

Begin with Phase 1:
1. Create the parallel passages database JSON (start with 10-15 major Gospel events)
2. Implement ParallelPassageService with basic discovery
3. Create the MCP tool handler
4. Write tests to validate synoptic parallels work

Focus on **Gospel harmony (synoptic mode)** first, as that's the highest-value feature.
