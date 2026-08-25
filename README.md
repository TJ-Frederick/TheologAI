# TheologAI

<!-- theologai-release-authority v1 role=project-entrypoint current=docs/CURRENT-RELEASE.md -->

TheologAI is an MCP server for Bible study and theological research. It runs
locally over stdio or Streamable HTTP and on Cloudflare Workers with D1.

The checked-out local registry contains eleven tools, six guided prompts, eight
English Bible translations, six commentary sources, 35 locally indexed
historical works, Strong's dictionaries, and Greek/Hebrew morphology. The
checked-out Transform 11 release adds ten reviewed editions to the former
25-work baseline. The current release snapshot records the active 35-work
assignment; the separately protected PR #108 D1 cutover is historical evidence.

The integrated Transform 10 candidate is local-only and unpublished. Its
Aquinas packet, schema, and standalone materializer are retained for future
work, while normal release builds prove its hierarchy and shared lineage are
absent; it adds no document or catalog projection and is not wired into runtime or MCP surfaces.

<!-- theologai-public-contract tools=11 structured=bible_cross_references,bible_lookup,bible_verse_morphology,classic_text_lookup,commentary_lookup,donation_config,original_language_lookup,original_language_study,parallel_passages,primary_source_search,verify_donation -->

## Current release snapshot

The [current release snapshot](docs/CURRENT-RELEASE.md) is the designated
current snapshot for this entry document and the named reconciliation documents.
The historical release records below preserve point-in-time evidence; they are
not current identity authority.

## Public website and remote endpoints

The public website is [theologai.xyz](https://theologai.xyz). The hosted
anonymous production MCP endpoint is:

```text
https://mcp.theologai.xyz/mcp
```

`/mcp` is canonical. `/` remains a temporary compatibility alias and may be
removed after its usage falls to zero.

The preview MCP endpoint is
`https://preview-mcp.theologai.xyz/mcp`. The legacy addresses have deliberately
different migration behavior:

- Website: `https://theologai.pages.dev/`
- Production MCP: `https://theologai.tjfrederick.workers.dev/mcp` is a
  temporary, no-store HTTP 308 redirect to the canonical production endpoint
  for ordinary requests. The one documented abusive-poller IP-plus-user-agent
  tuple is rejected instead, and browser CORS preflight remains local.
- Preview MCP: `https://theologai-preview.tjfrederick.workers.dev/mcp` remains
  a direct compatibility and rollback endpoint for the preview Worker.

Remote MCP client configuration:

```json
{
  "mcpServers": {
    "theologai": {
      "url": "https://mcp.theologai.xyz/mcp"
    }
  }
}
```

Use the preview URL only for explicitly authorized release testing. The
following is the historical PR #122 production baseline, not current today:
`86475ecf8288cb0ebcb6467c77c0fd0998a8f1c2` (tree
`8150aa29e7e4a22141edbfc9ab568df933f9c9b3`). Protected workflow
`31631924636` deployed Cloudflare deployment
`e62698f3-f6b0-4145-97bf-28abdeae0e3a`, serving Worker
`02174f95-abe2-480b-84bf-3e8c1a3a0320` (#100) as the sole active assignment,
bound to schema-`0009` D1 `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`). Remote readiness and authority,
historical core, Transform-11 spine, original-language, edge stabilization,
final Worker identity, preview-control, and environment-isolation checks all
passed. CCEL execution remains disabled.

The exact captured PR #108 Worker/D1 pair is the immediately preceding primary
rollback unit in that dated release record; it is not current today: deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). PR #101 is older retained rollback
history, not the immediate rollback claim.

The successor delivery program is tracked in
[Phase 3B](docs/PHASE-3B-PLAN.md). It begins with release hygiene and dual-era
MCP modernization before the separate historical-research project.

The historical PR #96 `original_language_study` schema-v2 audit passed 11/11
cases.
It made 14 stateless HTTP exchanges (initialization, initialized notification,
`tools/list`, and 11 tool calls), with a 180-second end-to-end cap, 30-second
per-request cap, 256 KiB per-response cap, and 1 MiB aggregate cap. The
audited v2 fixture SHA-256 is
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`; retained
evidence is sanitized metadata and hashes, not live tool output or source text.

PR #72 is retained only as the matched rollback record: merge
`72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). It is not the active production
binding.

> **PR96 broad MCP smoke — PASS:** Completed in 8.834 seconds. Sanitized
> `production-mcp-smoke-audit.json` evidence SHA-256:
> `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
> It verified 26 MCP operations across 27 HTTP exchanges and 293,466 aggregate
> MCP response bytes, stateless with no retries or redirects. Pre/post identity
> was unchanged: deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

> **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
> post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
> Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
> SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
> 1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
> SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
> 848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
> Two automatic reconnect warnings and a maximum uninterrupted segment of about
> 19m12s mean this is neither a continuous 30-minute observation nor an
> exhaustive/global request count. Wrangler tail authoritatively cannot provide
> a request total: 2,172 observed events = 2,167 ok + 5 separately classified
> client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
> truncated events, and 0 unexpected release errors. Raw captures are private
> and unpublished because they contain request metadata. Final authoritative
> identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
> `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
> `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
> sole 100%; identity SHA-256
> `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

PR95's Transform9 source-pack release is historical preview evidence:
Cloudflare deployment `3467d062-9097-4ffe-9ff1-db900838f538` served Worker
`8d516c26-6cfe-451c-889a-7dd580b1f4ca` at 100% with
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). The reviewed core-eight made that
historical checked-out catalog 25 works. The integrated Transform-10 Aquinas work
remains local-only and unpublished: it has no document/catalog projection or
runtime activation.

The protected PR #101 preview release deployed Cloudflare deployment
`070b292b-0bae-400a-b983-3d72157b5a96`, serving Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), bound to
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). It was unbound when prepared from the
reviewed 49-file, 1,627,474-row deterministic seed for schema `0008`; remote
readiness passed, Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. The protected release subsequently proved this
exact binding; it is the retained compatible preview predecessor and makes no
production claim.

PR #107's preview candidate `theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`). Its one-use schema-`0008` import
applied the exact reviewed 49-file, 1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and the complete
Transform-11 source-pack authority audit (`1/1/1/1/1/1/133/17` pages) passed.
Protected preview deployment `5e812152-355b-4a5f-a123-2485e89f1550`
historically served Worker `06b9a603-8339-42b6-a246-ef9238563043` (#140) with
that exact D1 and is the immediate predecessor to PR #122. Production was
unchanged by that preview release. Transform-10 hierarchy,
publication, and Aquinas material remain excluded.

That historical PR #107 preview Worker predates PR #115's repository-only,
unpublished pin to `https://www.ccel.org/home3/search`. It is not a valid
code/resource-equivalent `100` predecessor for a `111` canary built from
current `main`. PR #122 has since completed the schema-`0009` preview
bind/deploy/audit stage. The separately prepared schema-`0009` production
candidate remains unbound; production bind/deploy/audit and read-only
environment-isolation verification remain separately gated. Completion of the
preview stage does not authorize credential work or the canary; see the
[CCEL canary transaction](docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md).

PR #101's former production assignment is older retained rollback history:
deployment `71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`). It was unbound when its reviewed
49-file, 1,627,474-row schema-`0008` preparation completed: remote readiness
passed, Transform-8/9 authority audits passed, and Transform-10 normal-corpus
exclusion predicates proved hierarchy, publication, and Aquinas-lineage rows
empty. The protected production workflow subsequently proved the exact binding
before and after its black-box audits. Production primary-source stabilization
matched on attempt 1, `original_language_study` v2 passed 11/11 cases, and all
eight reviewed Transform-9 core works passed. This release activates no
Transform-10 hierarchy or publication rows.

The protected PR #108 production release activated the separately prepared
Transform-11 candidate `theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). It was created once in ENAM from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f`, exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`, and the reviewed 49-file,
1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed.
Protected workflow `30496350408` then deployed
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), from merge
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` and bound it to that exact D1.
Historical core passed 8/8, Transform-11 spine passed 10/10,
`original_language_study` passed 11/11, primary-source edge stabilization
matched on attempt 4 and remained stable, and independent post-release review
returned `SHIP`. The exact PR #108 Worker/D1 pair above is the primary
immediate rollback unit for this schema-`0009` cutover; PR #101 remains older
retained rollback history only.
For a preview-client rollback without changing server state, use the direct preview
`workers.dev` address above; the production `workers.dev` address intentionally
redirects rather than serving a separate legacy Worker.

In the historical PR #122 record, production and preview used their distinct
audited schema-`0009` Candidate-C D1 databases. Earlier local-only and preview-only activation
statements are historical. The historical PR #96 public
`original_language_study` v2 audit does not independently establish the runtime
path for every later historical transform. The pinned packet's `SOURCE.json`
remains a historical acquisition-gate snapshot, not deployment evidence.
Production v6/local-only and preview v7/discovery-only remain deployed with
CCEL execution disabled before adapter, coordinator, or fetch.

### Schema-0009 preview release state

The protected release targeted the prepared preview D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). The workflow re-checked the
candidate, deployed it, proved the active preview binding, and completed its
audit. It validated the fixed production control against the checked-in
production D1 name/UUID and fresh inventory before deployment, immediately
afterward, and again after the final preview audit.
PR #123 subsequently deployed exact source
`7fb3ec5113a16ed86bfc4a403a3ec3678d4d4dd0` (tree
`28e555808ad3840d145a7ddd7e57934dc30e45c2`) as preview Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (#144) through deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, retaining the same schema-`0009` D1.
All fixed audits and three production-control observations passed. The
authorization label was removed and revocation run `31645546905` succeeded.
PR #122 deployment `13393917-fa91-4afc-aeaf-2809db6701a2` and Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe` (#142) are the immediate retained
same-D1 predecessor. The detailed sanitized evidence is in
[docs/PREVIEW-RELEASE-RECONCILIATION.md](docs/PREVIEW-RELEASE-RECONCILIATION.md).
This post-release evidence commit postdates the deployed source and makes no new
runtime claim.
Production is separately bound to schema-`0009` D1
`theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`) by the protected PR #122 release. The
CCEL canary gate remains unrecorded and inert. The exact preparation identity,
seed evidence, and release boundary are recorded in
[docs/D1-DATA-WORKFLOW.md](docs/D1-DATA-WORKFLOW.md).

## MCP capabilities

| Transport | Tools | Resources | Prompts | MCP Logging |
|---|---:|---:|---:|---:|
| stdio | Yes | Yes | Yes | Yes |
| Node Streamable HTTP | Yes | Yes | Yes | No |
| Cloudflare Streamable HTTP | Yes | Yes | Yes | No |

HTTP is intentionally anonymous and stateless. MCP Logging is limited to stdio
because `logging/setLevel` state cannot persist when each HTTP POST receives a
fresh server and transport.

### Tools

| Tool | Current behavior |
|---|---|
| `bible_lookup` | Retrieve a passage in ESV, NET, KJV, WEB, BSB, ASV, YLT, or DBY; arrays compare translations. |
| `bible_cross_references` | Query locally indexed OpenBible.info cross references with raw vote ranking, explicit discovery-only semantics, threshold-scoped result windows, and pinned snapshot provenance. |
| `parallel_passages` | Return complete UBS source-attested parallel groups by default; legacy curated edges and OpenBible.info cross references require explicit selectors and remain separate. |
| `commentary_lookup` | Retrieve Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch (OT), or Tyndale notes. |
| `classic_text_lookup` | The checked-out Transform 11 catalog searches and browses 35 historical works with canonical source-first section keys; 18 reviewed source-pack editions use bounded sectioned delivery. Preview and production serve the 35-work Transform-11 catalog. Exact sections are the only body route, and remote CCEL document bodies are not retrieved or republished. |
| `primary_source_search` | Execute bounded primary-source query plans. Production v6/local-only is deployed; preview runs the audited v7/discovery-only contract with CCEL execution disabled before adapter, coordinator, or fetch. The Transform-9 preview corpus release does not change that CCEL policy. Local locators use canonical section keys plus source ordinals; snippets remain discovery-only and research workflows maintain explicit searched/read/deferred/not-searched coverage ledgers. |
| `original_language_lookup` | Look up or search Strong's entries, with opt-in rights-reviewed STEPBible metadata, exact corrected-corpus usage, and bounded occurrence pages for exact identities. The Online-Bible-derived TBESH Hebrew `Meaning` field is withheld. |
| `bible_verse_morphology` | Return bounded word-by-word morphology for one exact verse, with raw codes, nullable expansions, and separate pinned STEPBible morphology/lemma provenance. |
| `original_language_study` | Resolve and study one Greek or Hebrew token in one verse with contextual morphology and source-separated lexical evidence. Schema v2 preserves the complete prior study under `study` and adds bounded Hebrew semantic candidates with summary/detailed views and opaque continuation cursors. |
| `donation_config` | Return versioned structured voluntary-donation configuration with the public web URL, recipient, and ordered native/token assets; donations do not unlock features. |
| `verify_donation` | Return bounded, structured transaction evidence and verify only a successful receipt with a supported asset sent to the configured recipient; receipt observation does not claim confirmation depth or finality. |

`parallel_passages` defaults unconditionally to `corpora:
["ubs_source_attested"]`, with at most five complete groups. It does not fall
back to the legacy corpus when UBS has no match. Raw UBS alignment metadata is
opt-in. Its structured result includes a bounded UBS result window: the server
reports only whether one additional source-attested group was directly observed
beyond `maxGroups`, never a total or exhaustive-coverage claim. When another
group is observed, schema v4 returns an opaque cursor in structured output at
`sourceAttestedResultWindow.nextCursor`. Pass that same opaque value back as the
input `groupCursor`; it is bound to the exact ordered passage segments, UBS
artifact, operation, `maxGroups` page size, and last returned source ordinal.
The server validates the claimed ordinal and cumulative page boundary against
its current UBS result set before continuing.
Continuation is UBS-only and rejects legacy/OpenBible controls and
`includeText: true`; the lookahead group is not returned, reconstructed, or
text-enriched. The older curated edge behavior remains available through
`corpora: ["theologai_legacy"]`; its `mode` and `maxParallels` controls retain
their prior item semantics. OpenBible.info rows are off by default and, when
requested with `includeOpenBibleCrossReferences`, are returned in a separate
collection. The deprecated `useCrossReferences` alias now also defaults false,
and conflicting old/new values are rejected.

When `includeText` is true, enrichment has a fixed budget of 12 unique
canonical passage lookups and concurrency four. Targets are selected once in
UBS group/member/segment order followed by legacy order, with cross-corpus
deduplication; cache hits do not refund slots and failures do not trigger
backfill. Complete parallel metadata is always retained. Structured schema v4
reports the aggregate `textEnrichment` outcome and a required
`textEnrichmentStatus` on every UBS member and legacy item; successful UBS
segment text appears only in `excerpts`.
The remote Bible-adapter ceiling of two HTTP retries therefore permits at most 36 upstream
attempts for the 12 scheduled lookups, preserving headroom below the
50-subrequest Worker limit; this relationship is executable policy, not only
documentation.

For exact `original_language_lookup` calls, corpus usage is opt-in. `overview`
returns totals plus the complete canonical-book distribution only. `study`
adds the top 10 exact source variants and defaults to 8 raw occurrences (maximum
12). `technical` adds the top 25 variants and defaults to 20 raw occurrences
(maximum 25). Search mode and calls that omit `usage_level` retain their prior
responses.

For Hebrew STEPBible extensions, TheologAI retains exact Strong's identities,
forms, transliteration, morphology, lemma, and the Tyndale-created brief gloss.
It does not return or use the TBESH `Meaning` field, whose source notice says
permission should be obtained from Online Bible before project use. Structured
results mark this evidence policy explicitly; a missing Hebrew semantic
definition remains unavailable rather than being reconstructed from a gloss,
frequency, morphology, or other metadata. OpenScriptures definitions and Greek
STEPBible evidence are unaffected.

All tools are annotated as read-only, non-destructive, and idempotent. Tool
inputs use closed, bounded JSON Schema 2020-12 contracts. All eleven tools
advertise versioned object-root `outputSchema` contracts and return matching
`structuredContent` beside the existing Markdown content: `bible_lookup`,
`bible_cross_references`, `bible_verse_morphology`, `parallel_passages`,
`commentary_lookup`, `classic_text_lookup`, `primary_source_search`,
`original_language_lookup`, `original_language_study`, `donation_config`, and
`verify_donation`. Bible,
cross-reference, verse-morphology, parallel-passage, and original-language structured results
include bounded, result-local provenance records. Primary-source results retain
the legacy fail-closed edition-readiness record for unreviewed local documents
and use a separate URL-free established-readiness record for the eight reviewed
normalized source packs; they link only canonical local sections with exact
UTF-8 sizes. Their result windows say only whether one additional match
was directly observed through private lookahead; they do not imply exhaustive
counts. Donation configuration returns
`assetOrderMeaning: configured_display_order_not_ranking`, preserving its
configured display order while explicitly saying only that the order is not a
ranking or recommendation. Clients must not infer preference, price, liquidity,
bridge availability, or wallet support from the configuration;
native assets have a null structured address and tokens retain their exact
contract address. Donation verification exposes exactly three supported-chain
checks, fail-closed coverage, status-relevant transfers capped at 100 with an
exact classified total, allowlisted explorer links, and an explicit
`receipt_observed_no_confirmation_depth` finality limit. `commentary_lookup`
returns provider-attested coverage evidence, Markdown commentary text, and
separate work/delivery provenance beside its unchanged Markdown fallback.
Its retrieval mode is `remote_cached_or_live`: HelloAO responses use a
process-local one-hour cache, and an individual result's cache status is not
exposed. Each response validates the requested work, book, and chapter against
the provider container and reports HelloAO's corpus SHA-256 as the provider
revision; that fingerprint identifies provider corpus bytes, not an edition or
transcription source.
`classic_text_lookup` preserves its Markdown result for complete documents and also
returns a closed versioned structured contract. Catalog mode is a metadata
summary of the complete local work inventory: it exposes validated, unsized
structured resource locators, emits no native links, and never reads document
bodies. The work-inventory contract is intentionally bounded at 100 works;
the server fails rather than truncating if the inventory exceeds that ceiling.
Complete-document directory mode exposes its complete index with unsized canonical
source-first locators, caps native links at 32, and similarly fails above 2,000
sections. Reviewed source-pack works use a distinct landing plus fixed-32,
opaque-cursor metadata directory under the `sectioned_only` delivery contract;
they have no whole body or directory on the landing and exact canonical sections
are the sole body route. Search exposes at
most ten discovery-only snippets plus one private lookahead; selected work and
search resources retain exact UTF-8 sizes. Read a selected exact resource
before quotation. Invalid stored resource identities fail closed as integrity
hardening. The contract is local-only: remote document bodies are disabled.
Its per-result evidence policy distinguishes legacy incomplete provenance,
reviewed normalized source packs, and mixed inventories.

### Resources

| URI | Description |
|---|---|
| `theologai://translations` | Available Bible translations. |
| `theologai://commentaries` | Available commentary sources. |
| `theologai://primary-sources/catalog` | v2 JSON metadata inventory for the hosted primary-source collection; no document bodies, provenance URLs, source hashes, or rights instruments. Each work carries a fail-closed edition-readiness disclosure. |
| `theologai://documents/{slug}` | One of 35 locally indexed historical works: 17 legacy creeds/confessions/catechisms and 18 reviewed source-pack editions. |
| `theologai://strongs/{number}` | A Strong's dictionary entry such as `G26` or `H430`. |

### Guided prompts

| Prompt | Workflow |
|---|---|
| `word-study` | Strong's lookup/search, morphology, context, and synthesis. |
| `passage-exegesis` | Text, language, cross references, commentary, and historical theology. |
| `compare-translations` | Compare translation choices against morphology and lexical data. |
| `confession-study` | Inspect the hosted catalog, build a work-diverse doctrinal survey, then read selected exact sections. |
| `primary-source-research` | Inspect the catalog; use work diversity for topic/creator surveys or relevance within one work; then read at most five unique exact sections as evidence. |
| `donate` | Explain voluntary donation options. |

## Content scope and provenance

### Bible translations

- ESV through the ESV API when `ESV_API_KEY` is configured.
- NET through the NET Bible API.
- KJV, WEB, BSB, ASV, YLT, and DBY through HelloAO.

### Commentary

Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, and
Keil-Delitzsch are treated as public-domain source texts. Tyndale Open Study
Notes are CC BY-SA 4.0 and responses include attribution. See [NOTICE.md](NOTICE.md).

Scalar coverage varies by commentary provider and is returned only when the
provider exposes an exact, trustworthy verse identity. When no exact match is
available, request the containing chapter or another commentator. Keep chapter
commentary labeled at chapter level rather than attributing it to one verse.
Matthew Henry and Keil-Delitzsch currently expose multi-verse sections, so they
are chapter-level sources. John Gill's current feed normally lacks the stronger
exact-verse identity required for scalar lookup; use its chapter lookup instead.
Structured commentary makes those rules machine-readable: Matthew Henry and
Keil-Delitzsch cannot claim `exact_verse`; John Gill can do so only from a
genuine provider `verseNumber`; and JFB, Clarke, and Tyndale may additionally
use a provider entry explicitly typed as `verse`. The commentary text is
explicitly `text/markdown`. Public-domain work provenance remains
`transcription_source_uncertain` because HelloAO does not pin an edition or
transcription; delivery provenance is recorded separately. Tyndale's
provider-attributed CC BY-SA 4.0 rights and attribution remain explicit. The
validated provider corpus SHA-256 does not resolve the underlying edition or
transcription uncertainty.

### Historical documents and external discovery

The checked-out Transform 11 catalog contains 35 historical works: 17 tracked
legacy creeds, confessions, and catechisms plus 18 reviewed, normalized
public-domain source-pack editions. In addition to the core eight, the candidate
adds Augustine's *On Christian Doctrine*, Basil, both Gregories, Justin Martyr,
Origen, Hooker Book I, Julian of Norwich, *The Imitation of Christ*, and
Pascal's *Pensées*. The three packs are sectioned-only, contribute 1,057
canonical sections, and add no legacy aliases; exact resources disclose the
reviewed edition and normalized-text rights boundary. Preview serves the
35-work Transform-11 catalog, and production now serves the same corpus after
the protected PR #108 cutover. The exact checked-out count is
enforced by `data/data-manifest.json`.

Approved UBS Hebrew artifacts plus the separately acquired Norton and Aquinas
public-domain packets are checked into the repository for deterministic
verification and release work. Those acquisition packets remain outside the
deployed catalog. Transform 10 retains an Aquinas packet, schema, and
standalone materializer only; normal builds exclude its hierarchy and lineage,
and it adds neither a document/catalog projection nor a runtime or MCP surface.
The reviewed PR95 core-eight remains part of both deployed baselines and the
checked-out 35-work candidate described above. M4A's
local/preview materialization and inactive-adapter statements are historical;
PR #96 historically recorded a production D1 binding and bounded public
`original_language_study` v2 audit. U3-T7 provides the in-memory semantic compiler,
native-to-normalized coordinate bridge, and content-free compilation audit;
M4A provides capacity and seed verification. The PR #96 audit does not
independently establish the runtime status of later transforms.
PR95's Transform9 core-eight remains included in the checked-out and deployed
catalogs. Norton and Aquinas assets remain inactive. Transform 12 adds the
generic Candidate-C storage lifecycle, seal, and dormant `sectioned_only`
schema seam, but the canonical build, generated D1 seed, and readiness contract
contain zero Norton rows. A separate disposable local-only command proves the
1,250-row Norton authority in copied SQLite and isolated Workerd databases; it
cannot write the canonical seed or use a remote binding. Cyril remains blocked
with zero output pending reliable translator attribution.

Production v6/local-only and preview v7/discovery-only currently search and
retrieve the 35-work Transform-11 collection.
Both deployed environments do **not** currently fetch CCEL search results or document bodies.
Preview's existing `classic_text_lookup` provides the Baltimore hard cut and
canonical/legacy resolution without adding a tool. Its deployed v7
CCEL-discovery profile returns a disabled provider result before adapter
invocation. That happens before adapter, Durable Object lookup/RPC, or fetch.
Production does not expose that preview-only discovery behavior. MCP clients should
reconnect and reinitialize after any endpoint/profile change because tool and
prompt schemas may be cached for an existing connection.

The retained `CcelSearchAdapter` remains in the codebase as bounded future
provider architecture.
The dormant adapter is restricted to page 1, one non-following/non-retried
upstream GET per admitted cache miss, at most five metadata hits, and at most
240 Unicode characters per discovery snippet. It accepts only structurally
reviewed Bootstrap result cards and reduces a tracking-bearing “Read online”
link to a canonical allowlisted CCEL exact-section path; tracking query and hash
values are discarded. Balanced-card parsing uses explicit title/author roles,
and a no-results marker is accepted only when no competing result structure is
present. These safeguards do not authorize or enable live use.
CCEL does not provide reviewed composition-year filtering. The v7 guided
primary-source workflow therefore keeps any requested year bounds on its local
queries, sends its single external discovery query without year fields, and
repeats an explicit warning that CCEL results cannot establish membership in
the requested historical period. Direct v7 queries that combine CCEL with
either year field remain `unsupported_filter` before adapter or coordinator
admission; the public tool schema documents that strict boundary.
Any future external provider rollout must remain discovery-only until
edition-specific rights and provider-policy gates are satisfied.

Local search metadata uses exact lookup-only aliases for routing, plus reviewed composition
date bounds when known, and explicitly named creators with their precise roles.
Roles use the closed vocabulary `author`, `issuing_body`, `drafting_body`,
`revising_body`, and `compiler`; a non-author role is not relabeled as
authorship. Stable metadata provenance IDs resolve to the checksum-pinned
companion review manifest. This metadata does not establish an edition, transcription
provenance, publication date, or rights status. Search snippets are discovery aids. Quote or analyze a
selected passage only after reading its exact `theologai://documents/...#section-...`
resource. The collection and every response are bounded and non-exhaustive.

### Language and reference data

- 14,298 Strong's entries from OpenScriptures.
- 447,748 indexed STEPBible morphology rows spanning all 66 books.
- Rights-reviewed STEPBible lexicon metadata and morphology-code expansions;
  the TBESH Hebrew `Meaning` field is withheld while its separately sourced
  identity, form, lemma, morphology, transliteration, and brief gloss remain.
- OpenBible.info cross references.
- 2,193 UBS source-attested parallel groups (CC BY-SA 4.0), normalized into
  SQLite/D1 with pinned source provenance and artifact identity.
- A small bundled legacy curated parallel-passage corpus, available only by
  explicit selector.

Source hashes and expected database counts live in
`data/data-manifest.json`. The SQLite database is a derived, ignored artifact.

## Local development

Requirements:

- Node.js 22 (the exact tested version is in `.nvmrc`).
- npm.
- `sqlite3` for the D1 seed export/import workflow.

This repository declares npm publication unsupported (`package.json` sets
`"private": true`): it is run from a Git checkout or deployed to Cloudflare,
not published as an npm package. `npm pack` remains an unmanaged diagnostic
only; it is not a supported distribution artifact.

```bash
npm ci
npm run data:verify-sources
npm run data:verify-ubs-hebrew-coordinate-bridge
npm run data:verify-ubs-hebrew-semantic-compilation
npm run build:db
npm run build
```

The two U3-T7 commands reproduce and verify inactive repository artifacts only;
they do not create a supported npm distribution or migrate SQLite/D1.

### stdio

Leave `PORT` unset:

```bash
npm start
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "theologai": {
      "command": "node",
      "args": ["/absolute/path/to/TheologAI/dist/index.js"]
    }
  }
}
```

### Node HTTP

```bash
PORT=3000 npm start
```

HTTP configuration:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Listen address. |
| `MCP_ALLOWED_HOSTS` | Loopback hosts | Additional accepted Host names. |
| `MCP_ALLOWED_ORIGINS` | `https://theologai.pages.dev` | Comma-separated exact browser origins. Hosted Workers explicitly accept both `https://theologai.xyz` and this legacy website origin during migration. |
| `MCP_MAX_BODY_BYTES` | `1048576` | Maximum request body size. |
| `THEOLOGAI_DATABASE_PATH` | `data/theologai.db` | Explicit derived SQLite database path. |

Native MCP clients without an `Origin` header are supported. Browser requests
must supply an exact configured origin.

## Verification commands

```bash
npm test                    # unit + current-architecture integration
npm run test:unit           # fast unit tests
npm run test:coverage       # unit suite with enforced thresholds
npm run test:integration    # shared/Node/Worker registry contract
npm run test:worker-runtime # real Workerd endpoint with isolated D1
npm run test:e2e            # compiled Node HTTP process boundary
npm run test:conformance    # applicable official MCP server scenarios
npm run test:data           # fresh SQLite and deterministic D1 reconstruction
npm run d1:seed:verify-workerd # representative seed import through local D1
npm run test:all            # every deterministic local suite
npm run typecheck           # Node, Worker, coordinator, release scripts, and maintained tests
npm run typecheck:test-node # strict noEmit Node/Vitest tests, fixtures, and helpers
npm run typecheck:test-scripts # strict noEmit unit script tests
npm run typecheck:test-frozen-context-capacity # frozen context-capacity test; preserves evidence bytes
npm run validate:worker-config
```

The maintained Node test project is a static `tsc --noEmit` boundary. It uses
the generated Worker binding declarations where tests inspect Worker-shaped
types and maps `cloudflare:workers` to the inert Node-only shim in
`test/helpers/cloudflareWorkersShim.ts`; Durable Object behavior remains owned
by the Workerd runtime project. Workerd and coordinator test projects retain
their native environment owners and are checked separately.

Some of these aggregate scripts are established by the current hardening work;
CI continues to call the named suites explicitly so failures remain diagnosable.

## Data workflows

```bash
npm run build:db
npm run data:verify-db
npm run d1:seed:export -- --clean
npm run d1:seed:verify
```

See [docs/D1-DATA-WORKFLOW.md](docs/D1-DATA-WORKFLOW.md). Generated D1 seed
files live under ignored `scripts/d1-seed/`; remote D1 migration or seeding is a
separate, explicitly authorized operation.

## Cloudflare operations and security

The Worker uses:

- exact browser-origin validation and native no-Origin support;
- bounded streamed request bodies;
- anonymous per-location rate limiting at 120 requests/minute per SHA-256
  IP + user-agent fingerprint;
- separate production and preview rate-limit namespaces;
- structured telemetry that omits raw identities, authorization values,
  session identifiers, query strings, arguments, and exception messages;
- D1 bindings and generated Wrangler types.

The fingerprint limit is abuse friction, not authenticated user accounting: a
caller can rotate user agents, and users behind the same NAT may share a bucket.

See [docs/worker-operations.md](docs/worker-operations.md). Normal pull requests
perform verification only; preview and production deployment require explicit
approval. Deployment does not automatically migrate or seed remote D1.

## Architecture

```text
src/
├── index.ts                 Node stdio/HTTP entrypoint
├── worker.ts                Cloudflare Worker orchestration
├── mcp/                     shared registration, validation, and protocol errors
├── http/                    Node and Worker transport policies
├── tools/                   Node and Worker composition roots and handlers
├── services/                target-independent business logic
├── adapters/data/           better-sqlite3 repositories
├── adapters/d1/             Cloudflare D1 repositories
├── adapters/                remote Bible/commentary/donation providers
├── kernel/                  domain types, ports, errors, references, caching
└── formatters/              pure Markdown formatting
```

### Type authority

The type authority is split by contract family: `src/kernel/types.ts` owns
general shared request, result, and tool contracts; `src/kernel/repositories.ts`
owns persistence ports and records; `src/kernel/donation-types.ts` owns
donation contracts; and specialized or versioned kernel contract files own
their bounded contracts. `src/kernel/index.ts` is a convenience re-export
barrel only, not a second definition source. The retired `src/types/` directory
must remain absent. The maintained type-authority guard scans `src/`, `scripts/`,
and all `test/` partitions—including quarantined files—without executing those
files.

Service application boundaries are zero-allowlist: services depend on
application-owned provider ports under `src/services/`. Outward/external
provider implementations remain under `src/adapters/`, while service-local
providers such as `LocalPrimarySourceSearchProvider` may remain application-side
and implement service-owned ports. The application-boundary guard resolves
every static, type-only, dynamic, import-equals, and literal CommonJS import in
`src/services/` and rejects any adapter dependency.

Business services depend on shared repository ports. Node uses synchronous
SQLite repositories through async-compatible service boundaries; Workers uses
per-request D1 repositories. Both targets share one MCP registry.

## Known boundaries and roadmap

- The current tracked roadmap is [docs/ROADMAP.md](docs/ROADMAP.md), beginning
  after the PR #10 production baseline.
- Live CCEL discovery and search remain gated future work. PR #108 production
  is deployed v6/local-only, and preview is deployed v7/discovery-only with
  CCEL execution disabled before adapter, coordinator, or fetch. The
  Transform-9 preview corpus release does not change that policy.
  The legacy CCEL body reader is retired; the retained discovery adapter is
  bounded, does not fetch until separately authorized, and must never become
  CCEL body mirroring or republication.
- The local historical collection needs document-level edition, source, and
  license metadata before redistribution claims can be made.
- Hosted MCP Logging would require a deliberate stateful-session design.
- Authentication, saved workspaces, completions, and MCP tasks should be added
  only when a concrete workflow requires them. All eleven tools provide
  versioned structured output beside compatible Markdown. Further contract
  revisions require separate compatibility review.
- Remote D1 compatibility must be checked before any deployment; migration or
  corpus replacement requires separate review and approval.

The dated architecture assessment remains under ignored `test-output/` as
historical source context; it is not the current roadmap or product contract.
