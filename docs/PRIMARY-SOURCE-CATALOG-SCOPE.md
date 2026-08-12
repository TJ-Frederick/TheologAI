# Primary-source catalog scope

## Historical Transform 6 catalog slice

The historical Transform 6 slice materializes the reviewed catalog manifest
for the 17 legacy hosted works. It adds no document bodies and grants no new
rights; it makes that already-hosted collection's work identities,
composition-date scope, and explicitly attributed creators machine-readable.

## Checked-out Transform 11 candidate and deployed Transform 9 baseline

The checked-out Transform 10 candidate retains an inactive Aquinas
edition-scoped authority hierarchy packet and standalone materializer. Normal
release builds deliberately exclude its hierarchy rows and shared lineage. It
is unpublished and has no document or catalog projection, runtime composition
dependency, or MCP surface. It leaves the active historical catalog boundary
unchanged through preparation: preview and production now serve the
Transform-11 35-work corpus after the protected PR #108 D1 cutover.

Transform 11 retains migration `0006_historical_source_packs` and schema
`0008`, but expands the manifest allowlist to three checked-in packs, 18 works,
18 reviewed editions, 43 pinned source artifacts, and 1,057 normalized
sections. Together with the 17 legacy documents, the checked-out catalog has
35 works and 4,111 sections. It adds no migration, aliases, hierarchy rows, or
publication rows. Its deterministic D1 corpus identity is
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
The Transform-9 deterministic D1 corpus identity was
`4e182bfd2953fe06e7c8d7e13a705988e85b5a58001e7fe72440333d34f6d442`; the
historical Transform 6 catalog identity remains
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` for that
earlier slice. These are checked-in build and seed identities, not Cloudflare
deployment identifiers.

PR95's Transform-9 normal preview release is historical, having used
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). The retained PR #101 preview
predecessor was deployment `070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). That former Transform-11 preview
binding is historical. The current preview baseline is PR #122 deployment
`13393917-fa91-4afc-aeaf-2809db6701a2`, Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe`, and schema-`0009` D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). The retained PR #101 production
rollback is older history: deployment `71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`). This schema-`0008` database was
unbound when remote readiness and
Transform-8/9 authority audits passed and Transform-10 normal-corpus exclusion
predicates proved hierarchy, publication, and Aquinas-lineage rows empty. The
protected workflow subsequently proved it as the sole active production
binding before and after bounded black-box audits. No hierarchy or publication
activation occurred.

PR #101's checked-in preview target is the schema-`0008` candidate
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`), with deterministic D1 corpus identity
`c43bfa2f5e7ff04c3641a228092bdc91d597edc60dc7d596507e8ca6c0ac90fe`. It was
unbound when its one-time 49-file, 1,627,474-row preparation completed: remote
readiness and Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. Protected PR #101 release evidence subsequently
proved the exact retained preview predecessor binding; dormant
hierarchy/publication runtime activation remained absent.

PR #107's Transform-11 preview candidate
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`). Its exact reviewed 49-file,
1,630,259-row seed has corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed while
unbound. Protected preview deployment now proves the current binding above;
production was unchanged by that preview release, and Transform-10
hierarchy/publication/Aquinas rows remain excluded.

The checked-in root production target was prepared unbound as Transform-11
candidate `theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). Its one-use ENAM preparation from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f`, exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`, imported the exact 49-file,
1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed. The
protected workflow `30496350408` subsequently deployed merge
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` as deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), bound to this D1. Historical
core passed 8/8, Transform-11 spine passed 10/10, original-language passed
11/11, edge stabilization matched attempt 4 and remained stable, and the
independent post-release review returned `SHIP`. For this schema-`0009`
cutover, the exact PR #108 pair is the immediately preceding primary rollback
unit: deployment `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). PR #101 is older rollback history,
not the immediate rollback claim for this cutover.

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
Transform 11 reuses migration 0006's generic source-pack tables with a new exact
manifest identity and inventory; it does not revise any historical deployment
record until a protected release succeeds.

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
