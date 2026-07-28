# Primary-source catalog scope

## Historical Transform 6 catalog slice

The historical Transform 6 slice materializes the reviewed catalog manifest
for the 17 legacy hosted works. It adds no document bodies and grants no new
rights; it makes that already-hosted collection's work identities,
composition-date scope, and explicitly attributed creators machine-readable.

## Current local Transform 10 candidate and preview-bound Transform 9 extension

The checked-out Transform 10 candidate retains an inactive Aquinas
edition-scoped authority hierarchy packet and standalone materializer. Normal
release builds deliberately exclude its hierarchy rows and shared lineage. It
is unpublished and has no document or catalog projection, runtime composition
dependency, or MCP surface. It leaves the active historical catalog boundary
unchanged: preview remains the Transform-9 25-work collection and production
uses the normal 25-work corpus.

The current preview Transform 9 catalog materialization is migration
`0006_historical_source_packs`. It retains the Transform 6 legacy catalog slice
and adds one checked-in pack (`theologai-core-eight`, revision 1), eight works,
eight reviewed editions, 25 pinned source artifacts, and 512 normalized
sections. The current deterministic D1 corpus identity is
`4e182bfd2953fe06e7c8d7e13a705988e85b5a58001e7fe72440333d34f6d442`; the
historical Transform 6 catalog identity remains
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` for that
earlier slice. These are checked-in build and seed identities, not Cloudflare
deployment identifiers.

PR95's Transform-9 normal preview release is historical, having used
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). The current preview baseline is PR
#101 deployment `070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). Before the proposed cutover, the
current production baseline is PR #104 deployment
`07bbd8aa-5c69-4b0c-a9df-c756f537bb97`, Worker
`09fa6471-eb50-480e-85b2-bc04b742dcb3` (#94), and D1
`theologai-production-20260728-normal-a`
(`a3d26bba-7adc-44b0-86d0-562b2ced6bd3`). The separately prepared schema-`0008` production candidate
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`) was unbound when remote readiness and
Transform-8/9 authority audits passed and Transform-10 normal-corpus exclusion
predicates proved hierarchy, publication, and Aquinas-lineage rows empty. The
checked-in root target names it for protected verification, not as evidence of
a current live Worker binding or hierarchy/publication activation. Production
release remains separately gated.

PR #101's checked-in preview target is the schema-`0008` candidate
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`), with deterministic D1 corpus identity
`c43bfa2f5e7ff04c3641a228092bdc91d597edc60dc7d596507e8ca6c0ac90fe`. It was
unbound when its one-time 49-file, 1,627,474-row preparation completed: remote
readiness and Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. Protected PR #101 release evidence subsequently
proved the exact current preview binding; dormant hierarchy/publication runtime
activation remains absent.

## Source and materialization

- `data/historical-document-catalog.json` is the reviewed machine-readable
  source of truth. `data/historical-document-catalog-provenance.json` is its
  companion review record: stable provenance IDs, source title, publisher,
  authoritative-source URL, authority class, exact field mappings, and a
  bounded review note for every creator/date claim.
- Every entry has exact lookup-only aliases, a display date, optional paired
  composition-year bounds, explicit creator roles, and one metadata status:
  `reviewed`, `anonymous`, `collective`, or `unknown`.
- The database builder validates one-to-one coverage of all 17 legacy historical JSON
  files, validates complete provenance-field coverage, and stores the catalog
  object in `documents.metadata.catalog` alongside existing topics. The
  materialized `documents.date` comes from the reviewed catalog label rather
  than an unreviewed legacy display value.
- The historical Transform 6 catalog slice and corpus identity
  `c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707`
  bind the legacy metadata change. It was not a marker-only transition: its
  release required a fresh deterministic seed and complete readiness gate.
  Transform 9/migration 0006 is a separate, current preview-bound
  materialization with the identities and inventory stated above; it does not
  revise that historical production deployment record.

Creator roles use an exact closed vocabulary: `author`, `issuing_body`,
`drafting_body`, `revising_body`, and `compiler`. An issuing, drafting,
revising, or compiling role is never relabeled as authorship. Empty
creator lists for anonymous or collective works are preserved as incomplete
metadata rather than filled by association or influence.

The review prefers official denominational sources (Church of England, CRCNA,
GOARCH, LCMS, OPC, USCCB, and the Holy See), with bounded confessional or
institutional archives where no official page makes the historical claim.
Deterministic builds never fetch these mutable pages: both checked-in manifests
are checksum-pinned in `data/data-manifest.json`, and an explicit review is
required to change a claim or source mapping. This provenance concerns catalog
metadata only; it neither imports source-page content nor establishes edition,
transcription, or republication rights.

The source review corrected conservative catalog drift: the official Articles
text says 1562, USCCB dates the Baltimore Catechism's origin to 1884, the Synod
of Dort spans 1618-1619, and CRCNA describes the Heidelberg project as a team
of ministers and university theologians. The Athanasian catalog entry follows
an official LCMS overview: it retains an approximate sixth-century display
label but no machine-filterable year or creator. The present
Niceno-Constantinopolitan text matches 381 only; Nicaea 325 remains historical
origin context and does not make intervening years eligible. The London Baptist
confession matches composition-year scope only at 1677;
the 1689 General Assembly remains title and reception context and is not
modeled as a continuous 1677-1689 interval.

## Query behavior

The listed, readable `theologai://primary-sources/catalog` resource exposes the
hosted inventory as `application/json`. Its versioned payload includes only
reviewed work metadata already materialized in `documents.metadata.catalog`:
identity, title, document type, exact lookup aliases, composition interval,
creator names and roles, metadata status, and stable provenance IDs. It embeds
no work body and no provenance URL. Its policy object states that scope is the
hosted collection only and aliases are routing-only. Legacy works retain
incomplete edition provenance and rights status; reviewed source-pack works
carry a URL-free edition/provenance summary and a normalized-text-only rights
screen. The catalog never exposes source artifact locators.

Each query may include one exact `work`, one exact reviewed creator name in
`author`, and inclusive `startYear`/`endYear` bounds. Date matching uses interval
overlap: a work is eligible when its reviewed composition interval overlaps the
requested interval. Multi-creator research uses separate query-plan entries so
coverage and misses cannot be blended.

Each query accepts `selection: relevance | work_diversity`; omission defaults
to `relevance`. Relevance selection preserves FTS rank followed by stable
section identity and is the appropriate within-work locator. Work diversity is
deterministic round-robin selection: the best matching section from each work
precedes every second-best section, then every third-best section, with
relevance and stable section identity breaking ties inside a round. SQLite and
D1 use the same SQL generator and ordering contract.

Lookup aliases are exact routing aids only. They are not creator/date metadata,
historical evidence, or text shown as a research result. Generic labels such as
`Confession of Faith`, `Larger Catechism`, and `Articles of Religion` are
rejected because they could silently route a query to the wrong hosted work.
The structured evidence policy discloses this separation as
`lookupAliasUse: exact_routing_only_not_metadata_evidence`.

The local provider returns a bounded `scope` containing:

- `matched`, `catalog_miss`, or `metadata_incomplete`;
- the normalized requested restrictions;
- the total eligible work count;
- at most eight eligible work identities and a truncation flag.

Provider status `catalog_miss` means no hosted catalog work positively matched
every restriction and no text search was broadened. Its scope is
`metadata_incomplete` when one or more unknown creator/date fields prevented a
definitive catalog assessment; otherwise the scope is `catalog_miss`.
`no_results` means eligible works were searched but their indexed sections did
not match the text query. Unknown metadata is never treated as a positive match.
Local hits include at most four stable `metadataProvenanceIds`, allowing an
auditor to resolve each runtime creator/date claim to the companion manifest
without embedding source descriptions or URLs in every result.

Structured output schema v3 adds the query's required
`normalizedSelection` and a required provider `resultWindow`. Local searched
queries privately request `limit + 1`, return at most `limit`, and report only
`additional_match_observed` or `no_additional_match_observed`. Unsearched,
unavailable, unsupported, catalog-miss, and dormant external-provider results
use `not_evaluated`. This is deliberately not a total count or an exhaustiveness
claim. If a plan-wide or presentation boundary removes returned matches, the
public window changes to `additional_match_observed` and preserves a
partial/fail-closed envelope where applicable.

Search snippets remain discovery-only. Clients must call MCP `resources/read`
on selected canonical section links before quotation, author/work comparison,
or substantive conclusions. The per-result evidence policy distinguishes
legacy incomplete provenance, reviewed normalized source packs, and mixed
inventories; a reviewed source pack never claims scan-artifact redistribution
rights.

The `primary-source-research` and `confession-study` prompts read the catalog
before search. Topic and creator comparisons use work diversity; exact-work
location uses relevance. Creator comparisons remain separate query items, use
no proxy for an absent requested creator, deduplicate exact locators, and read
no more than five exact section resources before synthesis.
