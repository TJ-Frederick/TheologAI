# TheologAI

<!-- theologai-release-authority v1 role=project-entrypoint current=docs/CURRENT-RELEASE.md -->

TheologAI is an MCP server for Bible study and theological research. It runs
locally over stdio or Streamable HTTP and on Cloudflare Workers with D1.

For the current source layout and maintenance responsibilities, see
[Architecture and ownership](docs/ARCHITECTURE.md). The earlier
`docs/bible-mcp-architecture.md` remains historical design evidence.

The checked-out local registry contains eleven tools, six guided prompts, eight
English Bible translations, six commentary sources, 36 locally indexed
historical works, Strong's dictionaries, and Greek/Hebrew morphology. The
checked-out corpus adds the Norton 1561 transcription to the prior
35-work baseline. The current release snapshot records the active 35-work
assignment; the separately protected PR #108 D1 cutover is historical evidence.

The integrated Transform 10 candidate is local-only and unpublished. Its
Aquinas packet, schema, and standalone materializer are retained for future
work, while normal release builds prove its hierarchy and shared lineage are
absent; it adds no document or catalog projection and is not wired into runtime or MCP surfaces.

<!-- theologai-public-contract tools=11 structured=bible_cross_references,bible_lookup,bible_verse_morphology,classic_text_lookup,commentary_lookup,donation_config,original_language_lookup,original_language_study,parallel_passages,primary_source_search,verify_donation -->

## Current release snapshot

The [current release snapshot](docs/CURRENT-RELEASE.md) is the designated
current snapshot for this entry document and the named reconciliation documents.
The linked historical release records preserve point-in-time evidence; they are
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

Use the preview URL only for explicitly authorized release testing. Dated
release identities, audit outcomes, and rollback evidence are preserved in the
[release history](docs/RELEASE-HISTORY.md); they are not current identity
authority. The [current release snapshot](docs/CURRENT-RELEASE.md) is the sole
source for present-tense production and preview assignments.

## MCP capabilities

| Transport | Tools | Resources | Prompts | MCP Logging |
|---|---:|---:|---:|---:|
| stdio | Yes | Yes | Yes | Legacy era only |
| Node Streamable HTTP | Yes | Yes | Yes | No |
| Cloudflare Streamable HTTP | Yes | Yes | Yes | No |

The same endpoints serve legacy `2025-11-25` and modern `2026-07-28` clients.
Modern requests use stateless discovery, explicit request metadata and modern
HTTP headers; list and resource results carry private, zero-TTL cache hints.
HTTP is intentionally anonymous and stateless. MCP Logging is retained only
for legacy stdio compatibility; modern clients and both HTTP transports use
stderr or privacy-safe telemetry instead.

### Tools

| Tool | Current behavior |
|---|---|
| `bible_lookup` | Retrieve a passage in ESV, NET, KJV, WEB, BSB, ASV, YLT, or DBY; arrays compare translations. |
| `bible_cross_references` | Query locally indexed OpenBible.info cross references with raw vote ranking, explicit discovery-only semantics, threshold-scoped result windows, and pinned snapshot provenance. |
| `parallel_passages` | Return complete UBS source-attested parallel groups by default; legacy curated edges and OpenBible.info cross references require explicit selectors and remain separate. |
| `commentary_lookup` | Retrieve Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch (OT), or Tyndale notes. |
| `classic_text_lookup` | The checked-out catalog searches and browses 36 historical works with canonical source-first section keys; 19 reviewed source-pack editions use bounded sectioned delivery. Preview and production serve the 35-work Transform-11 catalog. Exact sections are the only body route, and remote CCEL document bodies are not retrieved or republished. |
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

Each `bible_lookup` call and the remote text-enrichment portion of
`parallel_passages` share a 30-second deadline across provider fetches, body
reads, and retry delays. MCP cancellation propagates through those operations.
Bible comparisons run at most four translations concurrently, retain request
order within successes and failures, and forward `includeFootnotes` for both
single and multiple translations. When the budget expires, completed passages
remain available and queued provider work does not start. This deadline does
not preempt local database queries or synchronous formatting.

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
| `theologai://documents/{slug}` | One of 36 locally indexed historical works: 17 legacy creeds/confessions/catechisms and 19 reviewed source-pack editions. |
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

The checked-out catalog contains 36 historical works: 17 tracked
legacy creeds, confessions, and catechisms plus 19 reviewed, normalized
public-domain source-pack editions. In addition to the core eight, the candidate
adds Augustine's *On Christian Doctrine*, Basil, both Gregories, Justin Martyr,
Origen, Hooker Book I, Julian of Norwich, *The Imitation of Christ*, and
Pascal's *Pensées*, and Calvin's *Institutes* in the Norton 1561 translation.
The four packs are sectioned-only, contribute 2,307 canonical sections, and add no legacy aliases; exact resources disclose the
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
checked-out 36-work candidate described above. M4A's
local/preview materialization and inactive-adapter statements are historical;
PR #96 historically recorded a production D1 binding and bounded public
`original_language_study` v2 audit. U3-T7 provides the in-memory semantic compiler,
native-to-normalized coordinate bridge, and content-free compilation audit;
M4A provides capacity and seed verification. The PR #96 audit does not
independently establish the runtime status of later transforms.
PR95's Transform9 core-eight remains included in the checked-out and deployed
catalogs. Norton is now admitted through the ordinary source-pack projection,
with 1,250 unchanged source-segment citations and an edition-qualified title.
Its pinned EEBO-TCP transcription is CC0; images and facsimiles are excluded.
The generic Candidate-C `sectioned_only` publication experiment remains dormant
and separate from that active projection. Aquinas activation is next; its
hierarchy remains excluded from this build. Cyril remains blocked
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

The repository also contains a dormant Phase 3B.2 v8 research foundation.
It leaves the deployed v6/v7 profiles unchanged, starts guided research with a
standard local plan, and permits one external-bearing retry only when the host
supplies a prior `catalog_miss`, `no_results`, or explicit distinct-work
diversity shortfall that the server revalidates against a fresh local result.
All 17 legacy local works remain ordinary usable results; readiness metadata is
retained as provenance context, not an eligibility or ranking gate. See
[`docs/PRIMARY-SOURCE-RESEARCH-V8-FOUNDATION.md`](docs/PRIMARY-SOURCE-RESEARCH-V8-FOUNDATION.md).

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
approval. Merging to main does not deploy production. Promote main explicitly
using the **Deploy Production** workflow's **Run workflow** action, supplying a
reason; preview evidence, full validation, and production approval still apply.
Deployment does not automatically migrate or seed remote D1.

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

The kernel dependency boundary is inward-only: local imports resolved from
`src/kernel/` must remain within `src/kernel/`. Application services and
adapters may depend on kernel contracts, but the kernel does not depend on
application services, adapters, or composition roots.

The original-language study v2 context is an application concern: the
service-owned `OriginalLanguageStudyV2ContextPort` and its authoritative
context live under `src/services/languages/`. The kernel retains only the
target-independent v2 request, result, cursor, and proof primitives used by
that port; it does not own the application context provider.

The language-service presentation boundary is also zero-allowlist: language
services return application results, and the public v2 packet and Markdown are
assembled by `src/presenters/` after the service call. This guard is scoped to
the language-service edge and does not claim that every service is presentation
free. `LocalPrimarySourceSearchProvider` retains its historical formatter call
to preserve exact local-resource sizing and identity behavior.

Business services depend on shared repository ports. The shared MCP registry
uses the official v2 server and Node transport packages directly; the former
Agents transport wrapper and local AI module shim are retired. Node uses synchronous
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
