# Augustine / Pusey strict edition preparation

Status: **local-only, inactive preparation**

This packet prepares one exact English source: Project Gutenberg eBook 3296,
*The Confessions of St. Augustine*, translated by E. B. Pusey (Edward
Bouverie). It does not add the work to a catalog or database, expose it in a
tool or resource, change an MCP response, or alter Cloudflare configuration.

## What is prepared

The adjacent package and report are both deterministic, reviewable artifacts:

- `data/historical-sources/project-gutenberg/pg3296/augustine-pusey.strict-edition-package.json`
- `data/historical-sources/project-gutenberg/pg3296/augustine-pusey.strict-normalization-report.json`

The package uses `edition-provenance-foundation.v1`. It freezes 14 sections in
source order: `front-matter`, then `book-1` through `book-13`. Their joined
content is exactly 602,961 UTF-8 bytes after the stated transformations; the
largest section is Book 10 at 86,537 UTF-8 bytes.

## Source and provenance boundary

The offline compiler pins and verifies three checked-in source artifacts:

- the PG3296 UTF-8 text;
- its RDF metadata; and
- the separate Project Gutenberg policy/license reference.

The package types E. B. Pusey as the sole edition contributor, with role
`translator`. Project Gutenberg is identified separately as the evidenced
artifact publisher/provider. Robert S. Munday is preserved only as an untyped
source-colophon credit: the source’s `Credits:` line is reported without
inventing an editorial, transcription, or other contributor role.

The source records its electronic transcription as released on 2002-06-01 and
updated on 2023-05-05. Its relationship to a particular historic print
transcription is deliberately recorded as `verified_with_uncertainty`.

The pinned RDF says “Public domain in the USA.” This is a United States
public-domain basis, not a worldwide legal conclusion. Users outside the
United States must check local law. Project Gutenberg policy/reference remains
in the adjacent report and is not included in the delivered body.

## Exact transformation

The compiler applies only:

1. fatal strict UTF-8 decoding;
2. CRLF to LF conversion; and
3. removal of the exact Gutenberg START/END wrapper lines and only their
   adjacent blank lines.

It performs no modernization, spelling change, whitespace reflow, semantic
cleanup, or editorial reconstruction. The source acquisition record establishes
the date `2026-07-18`, but no time of day; the foundation accepts that canonical
date instead of inventing a timestamp.

## Offline verification

No package script is registered. Run the direct command locally:

```bash
npx tsx scripts/prepare-augustine-pusey-strict-package.ts --verify
npx vitest run test/unit/scripts/augustinePuseyStrictPackage.test.ts
```

`--write` deterministically regenerates only the two adjacent prepared
artifacts. It is not a publication or runtime activation command.

## Explicit non-goals and later gate

This packet creates no migration, transform, SQLite/D1 seed, data manifest,
catalog entry, repository, runtime wiring, MCP registration, Wrangler change,
workflow, preview deployment, or production deployment. A later separately
authorized release must re-evaluate rights, runtime behavior, delivery scope,
and environment rollout before any public use.
