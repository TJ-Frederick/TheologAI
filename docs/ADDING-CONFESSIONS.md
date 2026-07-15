# Adding Historical Documents to TheologAI

> **Legacy guide warning:** The download-and-parse workflow below records a
> historical implementation technique; it is not approved for new ingestion.
> In particular, do not download, copy, or republish CCEL-hosted text through
> this workflow. New documents must follow the current rights-aware process in
> [ROADMAP.md](ROADMAP.md) and the edition-specific provenance and licensing
> requirements in [NOTICE.md](../NOTICE.md). The age of the underlying work does
> not establish rights to a particular transcription, edition, or translation.
> Do not acquire source text, create a parser, or add JSON until a review has
> recorded the exact edition, source, license or public-domain basis,
> transcription provenance, required attribution, and approval to redistribute.

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

## Adding a New Document After Rights Approval

Every method below begins only after the hard approval prerequisite above is
met. The examples describe data shaping after an approved source is already in
hand; they do not authorize acquiring or copying a source.

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

#### Historical parsing process (used for Westminster Confession)

**1. Record the approved source**
   - Record the exact edition, transcription provenance, source URL, rights
     basis, license, attribution, and approval evidence.
   - CCEL hosting is not rights evidence and CCEL text must not be downloaded or
     republished through this process.
   - Continue only with the exact source approved by the rights review.

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

## Candidate Inventory — Not Approved to Add

Every candidate below requires rights, edition, license, and transcription-
provenance review and explicit approval before source acquisition or ingestion.
The modern *Catechism of the Catholic Church* is not presumed public domain.

### Reformed/Presbyterian:
- **Westminster Shorter Catechism** (Q&A format, ~107 questions) — rights/edition/license/provenance review required
- **Westminster Larger Catechism** (Q&A format, ~196 questions) — rights/edition/license/provenance review required
- **Belgic Confession** (37 articles) — rights/edition/license/provenance review required
- **Canons of Dort** (5 heads of doctrine) — rights/edition/license/provenance review required
- **Second Helvetic Confession** (30 chapters) — rights/edition/license/provenance review required
- **Scots Confession** (25 chapters) — rights/edition/license/provenance review required

### Lutheran:
- **Augsburg Confession** (28 articles + 21 articles) — rights/edition/license/provenance review required
- **Small Catechism** (Luther, Q&A format) — rights/edition/license/provenance review required
- **Large Catechism** (Luther, chapters) — rights/edition/license/provenance review required
- **Formula of Concord** (12 articles) — rights/edition/license/provenance review required

### Anglican:
- **Thirty-Nine Articles** (39 articles) — rights/edition/license/provenance review required

### Baptist:
- **London Baptist Confession** (1689, 32 chapters) — rights/edition/license/provenance review required
- **New Hampshire Confession** (18 articles) — rights/edition/license/provenance review required

### Roman Catholic:
- **Catechism of the Catholic Church** (~700 pages, 2865 articles) — modern
  edition/translation; rights/edition/license/provenance review required
- **Council of Trent** (decrees and canons) — rights/edition/license/provenance review required
- **First Vatican Council** (4 constitutions) — rights/edition/license/provenance review required

### Eastern Orthodox:
- **Confession of Dositheus** (18 decrees) — rights/edition/license/provenance review required
- **Longer Catechism** (Philaret of Moscow, Q&A) — rights/edition/license/provenance review required
- **Confession of Peter Mogila** (articles) — rights/edition/license/provenance review required

## Estimated Sizes

Based on Westminster Confession (34 chapters = 80KB = 12,770 words):

| Document | Sections | Est. Size | Format | Status |
|----------|----------|-----------|--------|--------|
| Westminster Shorter Cat. | 107 Q | ~40 KB | Q&A | Rights/edition/license/provenance review required |
| Westminster Larger Cat. | 196 Q | ~150 KB | Q&A | Rights/edition/license/provenance review required |
| Belgic Confession | 37 art. | ~80 KB | Articles | Rights/edition/license/provenance review required |
| Augsburg Confession | 28 art. | ~60 KB | Articles | Rights/edition/license/provenance review required |
| Canons of Dort | 5 heads | ~70 KB | Heads/Articles | Rights/edition/license/provenance review required |
| Catechism of Catholic Church | 2865 art. | ~3 MB | Articles | Modern edition; rights/edition/license/provenance review required |

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
