# Public-domain historical source preparation

This directory is an offline, migration-inert preparation area. Nothing here is registered in the historical catalog, database migrations, D1 seed inputs, runtime composition roots, MCP handlers, package scripts, workflows, Wrangler configuration, preview, or production.

`SOURCE_LOCK.json` is the immutable acquisition lock. It records exact official URLs, local paths, byte counts, SHA-256 hashes, edition/translator evidence, rights evidence, territorial caveats, and the Project Gutenberg transformation notice relevant to PG19950. The raw sources remain in their provider-specific directories. `NORMALIZATION_REPORT.json` and the three `*.sections.json` files are deterministic derived artifacts; each derived artifact is explicitly `inactive` and `sectioned_only`.

The normalizer performs no network access. It verifies every locked artifact before compiling, uses fatal UTF-8 decoding, rejects BOM, NUL, replacement characters, and lone carriage returns, changes CRLF to LF, removes only the Project Gutenberg START/END marker lines and their adjacent wrapper blank lines, preserves whitespace at internal section boundaries, and performs no spelling, punctuation, citation, or vocabulary modernization.

Prepared scopes:

- PG45001 and PG64392 are one locked John Allen, Sixth American Edition in two volumes: 80 chapter sections spanning books I–IV plus seven front-matter/book-boundary sections, so book arguments and edition matter are not silently attached to the wrong chapter or discarded.
- PG19950 is limited to Tertia Pars questions 73–83: 11 question-preface sections and 84 article sections. Question 84 is the exclusive end boundary. Objections, sed contra, respondeo, and replies remain verbatim inside article sections.
- PG3296 is the E. B. Pusey Confessions: one edition-front-matter section followed by 13 book sections.

## Cyril hard stop

Internet Archive item `a566189200cypruoft` was acquired only through its official item endpoints: metadata, MARC/meta/scandata XML, DjVuTXT, DjVuXML, the linked public-domain instrument, and two exact page images. No PDF was acquired.

Scandata identifies leaf 13 as the title page. The inspected series title page says “Translated by members of the English Church”; the work title page says “Translated, with notes and indices.” The item metadata lists Richard William Church and John Henry Newman as creators but assigns no roles. Because the individual translator/editor roles cannot be established from the authoritative locked evidence without inference, Cyril is blocked and has no normalized artifact. The OCR scope boundaries were nevertheless audited: lectures XIX–XXIII begin at DjVuXML object pages 312, 317, 321, 324, and 327.

Reproduce and verify locally with:

```bash
tsx scripts/prepare-public-domain-historical-sources.ts
vitest run test/unit/scripts/publicDomainHistoricalSources.test.ts
```
