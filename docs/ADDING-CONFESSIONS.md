# Adding Historical Documents to TheologAI

This guide documents the systematic approach for adding lengthy confessional documents (creeds, confessions, catechisms) to the TheologAI MCP server.

## Directory Structure

All historical documents are stored in a single directory:
```
data/historical-documents/
```

Each document is a JSON file with metadata fields:
- `title`: Full document name
- `type`: "creed", "confession", or "catechism"
- `date`: Publication date
- `topics`: Array of searchable keywords
- `sections`: Array of document sections (chapters, articles, or Q&A)

## Adding a New Document

### Method 1: Short Documents (Creeds)
For brief documents like the Apostles' Creed, manually create the JSON file.

**Example structure:**
```json
{
  "title": "Document Name",
  "type": "creed",
  "date": "325 AD",
  "topics": ["trinity", "jesus christ", "salvation"],
  "sections": [
    {
      "title": "Section Title",
      "content": "Full text content...",
      "topics": ["specific", "keywords"]
    }
  ]
}
```

### Method 2: Lengthy Documents (Confessions, Catechisms)
For large documents like Westminster Confession, use the parsing approach.

#### Step-by-Step Process (Used for Westminster Confession):

**1. Download Source Text**
   - Find reliable plain text source (CCEL, denominational websites, Project Gutenberg)
   - Prefer sources with clear structure and minimal formatting
   - Example: `curl -o /tmp/westminster-confession.txt https://www.ccel.org/creeds/westminster-confession.txt`

**2. Analyze Document Structure**
   ```bash
   # Find chapter markers
   grep -n "^CHAPTER" /tmp/westminster-confession.txt

   # Check total lines
   wc -l /tmp/westminster-confession.txt

   # Sample content
   head -200 /tmp/westminster-confession.txt
   ```

**3. Create Parser Script**
   - See `parse-westminster.py` as reference template
   - Key functions needed:
     - `parse_structure()` - Identify chapters/articles/questions
     - `clean_content()` - Remove reference numbers, formatting artifacts
     - `extract_topics()` - Auto-generate topic keywords from titles
     - `generate_json()` - Output structured JSON

**4. Parser Requirements**
   ```python
   def parse_document(input_file, output_file):
       """Parse document from plain text to JSON"""
       # 1. Read line by line
       # 2. Detect structural markers (chapters, articles)
       # 3. Extract titles
       # 4. Collect content paragraphs
       # 5. Clean formatting (brackets, reference numbers, variants)
       # 6. Assign topics based on keywords
       # 7. Generate JSON with proper schema
   ```

**5. Topic Keyword Mapping**
   Create a dictionary mapping title keywords to searchable topics:
   ```python
   chapter_keywords = {
       "holy scripture": ["scripture", "revelation", "authority"],
       "god": ["god", "trinity", "attributes"],
       "justification": ["justification", "faith", "salvation"],
       # ... etc
   }
   ```

**6. Content Cleaning**
   Common artifacts to remove:
   - Reference numbers: `[6.001]`
   - Denominational variants: `[PCUS text] [UPCUSA alternate]`
   - Book lists (when parsing chapter on Scripture)
   - Extra whitespace and formatting

**7. Run Parser**
   ```bash
   python3 parse-westminster.py
   # Output: data/historical-documents/westminster-confession.json
   ```

**8. Verify Output**
   ```bash
   # Check JSON is valid
   cat data/historical-documents/westminster-confession.json | python3 -m json.tool

   # Check file size
   du -h data/historical-documents/westminster-confession.json

   # Count sections
   cat data/historical-documents/westminster-confession.json | grep '"chapter"' | wc -l
   ```

**9. Test Integration**
   ```bash
   # Rebuild
   npm run build

   # Start server (check logs)
   node dist/index.js

   # Test search
   node -e "
   import('./dist/adapters/localData.js').then(m => {
     const adapter = new m.LocalDataAdapter();
     const results = adapter.searchDocuments('justification', 'westminster');
     console.log(\`Found \${results.length} results\`);
   });
   "
   ```

## Parser Template

The `parse-westminster.py` script serves as a reusable template. To adapt for other documents:

1. **Modify structural markers:**
   ```python
   # Westminster uses: ^CHAPTER [IVX]+ \(PCUS\)
   # Belgic would use: ^Article \d+
   # Catechisms would use: ^Q\. \d+
   ```

2. **Adjust title extraction:**
   ```python
   # Westminster: "Of the Holy Scripture"
   # Belgic: Inline in article text
   # Heidelberg: Question text becomes title
   ```

3. **Update schema for Q&A format:**
   ```python
   # For catechisms, use:
   {
     "question": "1",
     "q": "Question text?",
     "a": "Answer text.",
     "topics": [...]
   }
   ```

4. **Customize cleaning rules:**
   - Each source has unique artifacts
   - Add regex patterns specific to source formatting

## Documents Ready to Add

### Reformed/Presbyterian:
- **Westminster Shorter Catechism** (Q&A format, ~107 questions)
- **Westminster Larger Catechism** (Q&A format, ~196 questions)
- **Belgic Confession** (37 articles)
- **Canons of Dort** (5 heads of doctrine)
- **Second Helvetic Confession** (30 chapters)
- **Scots Confession** (25 chapters)

### Lutheran:
- **Augsburg Confession** (28 articles + 21 articles)
- **Small Catechism** (Luther, Q&A format)
- **Large Catechism** (Luther, chapters)
- **Formula of Concord** (12 articles)

### Anglican:
- **Thirty-Nine Articles** (39 articles)

### Baptist:
- **London Baptist Confession** (1689, 32 chapters)
- **New Hampshire Confession** (18 articles)

### Roman Catholic:
- **Catechism of the Catholic Church** (~700 pages, 2865 articles)
- **Council of Trent** (decrees and canons)
- **First Vatican Council** (4 constitutions)

### Eastern Orthodox:
- **Confession of Dositheus** (18 decrees)
- **Longer Catechism** (Philaret of Moscow, Q&A)
- **Confession of Peter Mogila** (articles)

## Estimated Sizes

Based on Westminster Confession (34 chapters = 80KB = 12,770 words):

| Document | Sections | Est. Size | Format |
|----------|----------|-----------|--------|
| Westminster Shorter Cat. | 107 Q | ~40 KB | Q&A |
| Westminster Larger Cat. | 196 Q | ~150 KB | Q&A |
| Belgic Confession | 37 art. | ~80 KB | Articles |
| Augsburg Confession | 28 art. | ~60 KB | Articles |
| Canons of Dort | 5 heads | ~70 KB | Heads/Articles |
| Catechism of Catholic Church | 2865 art. | ~3 MB | Articles |

**Total estimated (all documents): ~4-6 MB**

## Maintenance

- Keep `parse-westminster.py` as reference template
- Document source URLs in comments
- Maintain topic keyword dictionaries for consistency
- Test searches after adding new documents
- Update this guide with lessons learned

## Notes

- The parser approach scales to any structured document
- Manual JSON creation is fine for short texts (<500 words)
- Topic keywords enable cross-document theological searches
- File organization: single `historical-documents/` directory, type distinguished by metadata
