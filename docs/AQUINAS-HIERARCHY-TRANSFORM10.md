# Aquinas hierarchy — Transform 10

Transform 10 retains one local-only, generic edition-scoped authority hierarchy
packet and standalone materializer. Normal release builds intentionally store
zero hierarchy rows and no Aquinas shared lineage. The standalone capacity
rehearsal materializes it only in a disposable copy. It is not registered as a
historical document, catalogue item, runtime composition dependency, MCP tool,
prompt, or resource. It creates no remote D1 operation, binding, deployment,
publication, or CCEL dependency.

## Approved edition scope

The profile is the English Dominican / Project Gutenberg electronic packet
`aquinas-summa-pg-v1`, with exactly these question ranges:

| Part | Included questions |
|---|---:|
| Prima | 1–119 |
| Prima Secundae | 1–114 |
| Secunda Secundae | 1–189 |
| Tertia | 1–90 |

This is not a complete traditional *Summa Theologiae*. Tertia questions 91 and
later and the Supplement are excluded, as are source wrappers, licenses,
tables of contents, editorial interludes, and structural metadata.

The immutable hierarchy is anchored by foreign keys to one source pack, work,
and edition in the existing historical provenance tables. It records the exact
five-shard packet and its four pinned Project Gutenberg authority artifacts:
17611, 17897, 18755, and 19950. The stored rights conclusion is precisely
`public_domain_in_usa`; the source evidence explicitly makes no worldwide
public-domain conclusion. It also preserves the English Dominican Province /
Benziger translation, Sandra K. Perry source e-text, David McClamrock electronic
edition, and CCEL-lineage disclosure facts.

## Storage model

`historical_edition_hierarchies`, `historical_edition_hierarchy_bodies`, and
`historical_edition_hierarchy_nodes` are generic edition-scoped tables. The
existing `historical_source_packs`, `historical_works`, `historical_editions`,
and `historical_source_artifacts` tables retain source authority rather than
duplicating it in hierarchy-specific rows. Every authority body is stored once: three part
prologues, 512 question preambles, and 2,669 articles (3,184 total). Nodes
form a stable flat preorder of four part landings, 512 question landings, and
2,669 article leaves (3,185 total).

`flat_ordinal` is the stable global preorder. `sibling_ordinal` is instead
locally contiguous `1..n` for one parent (the four root parts, each part’s
questions, and each question’s articles); it never copies a global source
ordinal.

`historical_edition_hierarchy_bodies_fts` is an FTS5 external-content index over the
body table with separately indexed `heading` and `content` columns. It has no
body-bearing `_content` shadow. Heading matches receive an explicit higher
BM25 weight than body-content matches; snippets remain bounded excerpts of the
content column only. The materializer proves row-ID/search parity and the
stored preorder is checked against an independent sibling-ordered traversal.

The dormant Node and D1 repositories expose hierarchy/artifact facts, direct
node context with its bounded root-to-parent ancestry, stable cursor/lookahead
pages for roots or immediate children, sibling neighbors, and discovery search.
Search returns bounded rank, snippet, body metadata, and breadcrumb only (with
explicit `all_terms` or `phrase` matching and a maximum of nine rows); exact
authority content is available only from direct retrieval. A question landing
returns its preamble only; it never concatenates descendants.

## Reproduction and capacity

The packet is manifest-bound and the local seed exporter uses one complete
authority-body INSERT per row. Every current reviewed body is below D1's 100KB
statement limit (the exporter fails closed if that ceases to be true), before
rebuilding the external-content FTS. Fresh local builds are verified for exact body text,
packet coverage, hierarchy constraints, FTS parity, and no document
projection.

The controlling future-capacity rehearsal is the disposable standalone
Transform-10 copy before `VACUUM`, after `ANALYZE`, against the 350 MiB ceiling.
Normal release capacity is measured separately from a zero-row build. The
capacity comparison reports the standalone schema measurement separately from
the normal-release baseline and older disposable A/B projections.
