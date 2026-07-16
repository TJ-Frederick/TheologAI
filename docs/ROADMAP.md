# TheologAI roadmap

This is the tracked source of truth for delivery status and sequencing. The
ignored [dated architecture and roadmap assessment](../test-output/ARCHITECTURE_AND_ROADMAP_ASSESSMENT.md)
is local source context only and does not define the current product contract.

## Shipped baseline

- **Phases 1–2 / PR #10:** MCP architecture and release-pipeline hardening,
  merged as `71a3f0d120ffd31c09424ba2a7caef88961d21e3`.
- **Phase 3 cleanup / PR #11:** current roadmap, honest public documentation,
  explicit deployment configuration, and source-granularity guardrails, merged
  as `3122843298b2dca5684c4544f21b9146f98a28bc`.
- **Structured-output foundation / PR #12:** provenance primitives plus
  structured results for Bible and Strong's lookup, merged as
  `0cbe9ec044fcf3189e14f508f276017a810934ef`.
- **UBS compiler / PR #13:** pinned UBS/Paratext source, license and provenance,
  deterministic compiler, generated-artifact verifier, and regression tests,
  merged as `4e02564531351f4a2de61d95dcebfd0dfd06d404`.
- **Phase 3 research foundations / PR #21:** bounded inactive CCEL provider
  architecture, D1 materialization identity, exact Strong's identities, local
  primary-source research, normalized UBS runtime and public cutover, and
  contextual original-language study, merged as
  `639d0a02c1c666340f0e2ee3bcb4b4d5a336d9fb`.
- **Phase 3 evidence follow-up / PR #26:** pinned biblical-language source
  reproduction plus structured primary-source evidence handoff, merged as
  `65db03e8cd02098064a748f96cca8da22c974381`.
- **Biblical-language Unicode correction / PR #27:** pinned-source Unicode
  corrections and exact generated-artifact reproduction, merged as
  `7b4e6c72182901ff77b5d175132a72d260e0418e`.
- **Integrated Phase 3 research output / PR #34:** original-language usage,
  catalog-aware local primary-source research, structured morphology, compound
  gloss resolution, and release-contract repairs, merged as
  `ce335266d989b40afebe398aeb39dbd2082d926a` after protected preview audit.
- **Phase 3 production binding / PR #39:** reviewed transform-version-6
  production binding and release records, merged as
  `2412ee4031b8bbef16f359879d4a8a4884a6e053` and deployed through the protected
  production workflow.
- **Commentary coverage correction / PR #40:** source-specific scalar identity,
  fail-closed section coverage, official content-shape parsing, and aligned
  public guidance, reviewed at `32441d99de673eccce0a57fd74801fb94db04944`
  and merged as `9f6aa128eeab663ef04a315ab0c14b8ae9a3376d`.
- **Release-record reconciliation / PRs #41–#42:** recorded the reviewed Phase
  3 production correction and reconciled the shipped structured-output train,
  merged as `7dc6ef9d6e0f3b76ff10384a2b3f6fed94270ef4` and
  `e9eb7a71088518040a2467d654b73e6470d064dd`.
- **Dormant CCEL parser hardening / PR #43:** standards-based, fail-closed
  parsing with strict request, result, snippet, URL, and resource budgets;
  public schemas and all rollout flags remained unchanged, merged as
  `2009b3ae41433af4a207f2c917c41238112c570c`.
- **CCEL coordinator stages A–B / PRs #44–#45:** created the dedicated
  non-public global-budget owner, then wired dormant public clients behind a
  separate coordinator flag; the dedicated owner gained no public route or
  `workers.dev` target, and no live CCEL request was enabled, merged as
  `6752480895421d290c4c3f95a1cb4130b8115f24` and
  `1377648c01593b848f625c056187530de2086832`.
- **Modern CCEL discovery contract / PRs #46–#47:** added the bounded v4
  primary-source contract behind three gates, then exposed only that contract
  in preview while leaving live search and coordinator execution disabled;
  production remains v3/local-only, merged as
  `1b13d5958d32835c3821498dfad52236cd5f3069` and
  `a763eac9df51727dae97a03d53a6b853128c0ca4`.
- **Honest UBS result window / PR #48:** `parallel_passages` structured schema
  v2 reports whether one private lookahead group was directly observed without
  returning, reconstructing, or enriching it, merged as
  `ccb2db182f61a6dd15df29aa270666425c1b70b4`.
- **Structured cross references / PR #35:** bounded, provenance-bearing v1
  output for `bible_cross_references`, merged as
  `d9b24eb2b7045b8d156b90be185c399a661c6f40`.
- **Structured donation configuration / PR #36:** conservative v1 public
  configuration output, merged as
  `551b599a12f4844915504ba5529066a1bbff7797`.
- **Structured donation verification / PR #38:** fail-closed v1 transaction
  evidence and coverage output, merged as
  `1d7369b1c232e9469abe5475d8e5f77cd22c9f13`.
- **Structured commentary / PR #37:** provider-evidenced coverage identity,
  rights and delivery provenance, and bounded v1 output, merged as
  `d395b3641eb00f6826eaba670c287f9a39dfa3da`.

These entries describe merged repository state. Deployment state is established
only by the relevant protected workflow and post-deployment smoke evidence; a
merge or this roadmap is not evidence that preview or production was deployed.

## Shipped Phase 3 release train

The following component slices were integrated, reviewed, and shipped through
PR #21. Their stacked PRs #14–#20 are closed as superseded review vehicles:

1. **PR #14 — bounded CCEL search adapter.** Defensive live-search transport,
   rights notices, budgets, caching, circuit behavior, and feature gates. The
   adapter was retained as inactive future-provider architecture and was not
   advertised or reachable through the production public MCP schema shipped by
   PR #21. Preview later exposed a non-executing v4 contract through PR #47.
2. **PR #15 — D1 materialization identity.** Distinguishes schema compatibility
   from the exact materialized corpus. Production was cut over to a freshly
   materialized replacement rather than mutating the predecessor database.
3. **PR #16 — exact Strong's identities.** Preserves canonical and extended
   OpenScriptures/STEPBible identifiers without lossy four-digit coercion.
4. **PR #17 — local primary-source research.** Adds the bounded
   `primary_source_search` query-plan workflow and resolvable local result
   locators. External discovery remains future work.
5. **PR #18 — UBS runtime foundation.** Adds strict repositories, provenance,
   source integrity, and source-attested parallel-group domain contracts.
6. **PR #19 — UBS D1 materialization.** Adds deterministic relational export,
   import verification, readiness identity, and Worker repository support.
7. **PR #20 — public UBS cutover.** Makes complete source-attested UBS groups the
   unconditional default, with bounded structured output. Legacy curated edges
   and OpenBible.info evidence remain available only through explicit separate
   selectors; raw UBS alignment is opt-in.
8. **Integrated language-study slice.** Added `original_language_study`, a
   context-first workflow for one token in one verse, with morphology,
   source-separated lexical evidence, provenance, and interpretive limits.

The released server advertises eleven tools and six guided prompts. Ten tools
have versioned structured contracts while retaining Markdown compatibility;
`classic_text_lookup` is the sole Markdown-only tool.

The structured-output release ledger is:

- PR #35: production run `29436689148`, deployment `5461346778`, Worker
  `24da1fd6-7a99-447e-86d4-17571d901b09`; coordinator 9/9 and independent
  10/10 audits, with no findings.
- PR #36: production run `29441298979`, deployment `5462262765`, Worker
  `b10427f0-9692-45ec-9089-e3027be58805`; coordinator 7/7 and independent
  23/23 audits, with no findings.
- PR #38: production run `29448002771`, deployment `5463551874`, Worker
  `e0371eb4-05c6-4415-b479-b01ac2630be0`; coordinator 11/11 and independent
  94/94 audits, with no findings.
- PR #37: production run `29451333738`, deployment `5464194228`, Worker
  `9d2b757b-8b9b-4318-b09d-14f62815bf82`; coordinator 73/73 and independent
  91/91 audits, with no P0-P3 findings.

Each release retained production D1 `theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`), passed strict readiness as `ready`,
and performed zero readiness writes. Live CCEL discovery remains intentionally
disabled; only preview exposes its non-executing v4 contract.

The current production Worker is PR #48 version
`e4d0cc54-f3c4-4a27-98ad-fc259edd9a72`, bound to
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). Its CCEL rollout state is `000`:
contract exposure, live search, and coordinator execution are all disabled.
The current preview Worker is PR #48 version
`5f381dc2-1116-435d-8292-8557891000ad`, bound to
`theologai-preview-20260714-a`
(`0dab804f-8df0-4727-93bd-299612b6e179`). Its state is `100`: the v4 discovery
contract is exposed, but live search and coordinator execution are disabled.

PR #47's exposure-only preview audit recorded 91 fresh requests and 126
assertions with no P0–P3 findings; its production control recorded 38 requests
and 70 assertions with no P0–P3 findings. PR #48's preview audit recorded 30
fresh requests and 73/73 assertions, and its production audit recorded 16
fresh-session requests and 65/65 assertions, all with no P0–P3 findings. The
production audit confirmed the parallel-passage v2 sentinels and exact preview
parity except for the intended preview-v4/production-v3 primary-source delta;
it made no CCEL request, chain RPC, limiter probe, or mutation.

## Shipped Unicode correction release

PR #27 corrects pinned-source Unicode artifacts in the biblical-language corpus
without broadening the interpretation contract. Its exact-source and generated-
artifact reproduction checks passed. A fresh transform-version-4 D1 database
passed the complete readiness contract before protected production deployment.

The release preserves eleven advertised tools, six guided prompts, local-only
primary-source evidence, disabled CCEL discovery, and the existing public MCP
contracts. Preview has passed the targeted Unicode audit across all nine
corrected Strong's entries, 237 corrected morphology cells, and 11 affected
parallel-passage cases, plus sampled checks of the remaining MCP surface.
Production then passed the corresponding bounded post-deployment audit.

## Shipped integrated Phase 3 release

The integrated release replays the reviewed original-language usage and
catalog-aware primary-source work onto the PR #27 production baseline. Its four
core feature commits are `2c2a29a`, `eccfad4`, `1b95201`, and `2506413`; the
release also requires the downstream Unicode-manifest preservation fix
`a1c9da3` and source-lock synchronization `e8282c3`. It adds schema
`0003_original_language_usage`, occurrence and distribution evidence with
keyset pagination, progressive original-language output levels, and curated
catalog scope for primary-source research. The separate `e6f7f7f` commit
reconciles release documentation for this candidate.

This transform-version-6 release merged through PR #34 and was released to
production through the reviewed PR #39 binding cutover. Its protected preview
uses the fresh preview database
`theologai-preview-20260714-a`, migrated through schema 0003, populated from all
36 manifest seed files, and verified by the strict read-only remote readiness
gate. Its whole-D1 identity
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` and scoped
usage identity
`c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd` are
verified for the prepared corpus. An initial protected preview deployment
occurred on 2026-07-14 from commit `a660c97`, producing Worker version
`e86fb87e-8ace-4972-a8a2-dba9682a6a55` with
`theologai-preview-20260714-a` bound. Black-box audits found guided-workflow,
Hebrew morphology interpretation, historical
presenter/search/browse, and derivation-output issues. Corrective application
commit `4760dbd` passed all required
CI checks and Verify Pins, then protected run `29354086467` / job `87160929896`
deployed it on
2026-07-14 as Worker version `5dd1fa0c-343c-4af4-83e6-b65003fb51c4` with the
same D1 database. Targeted and independent full-surface black-box re-audits
found no P0-P2 issues and confirmed all previously identified P0-P2 release
findings were fixed. This is the audited corrective application evidence and
does not predict the Worker UUID produced by any later deployment. At that
point, the immediate preview rollback pair was PR #34 Worker version
`ab270f0b-2627-4057-a182-a66cd750b118` with unchanged D1
`theologai-preview-20260714-a`. Retain the verified PR #27 Worker version
`734aec3b-d6c3-456b-a203-c7f940a2d081` with
`theologai-preview-20260713-c` as older matched rollback history, and retain
`theologai-preview-20260712-b` with Worker version
`3c8ad7ef-50ed-42a7-9c71-2ac8c2dd6d7f` as still older matched rollback history.
PRs #28 and #29 are closed as superseded by PR #30.

The owner-authorized deletion of unused legacy database `theologai-db-preview`
(`f9f415e1-219b-4d17-bcf5-33a8abad02fa`) was completed on 2026-07-14. The owner
later authorized deletion of only `theologai-preview-20260710-a`
(`3d010946-b530-4c7e-9e21-a900ff3c21a2`), completed on 2026-07-15. No other
database deletion is authorized. The corrective preview gate is complete.
Protected production workflow run `29418476587` deployed exact PR #39 merge
`2412ee4031b8bbef16f359879d4a8a4884a6e053` as Worker version
`a74f0848-5b68-4d7a-834e-aa3221ebda3b` at 100%, bound to
`theologai-production-20260715-a`. The post-deployment readiness result was
`ready` with zero writes, and the bounded audit recorded only the commentary
P2 subsequently corrected and released through PR #40. The corrective preview
and production releases both passed 15/15 coordinator and 27/27 independent
audits with no P0-P3 findings while retaining their existing D1 bindings.

### Integrated research-output follow-up (shipped)

PR #34 merged as `ce335266d989b40afebe398aeb39dbd2082d926a`; its reviewed head
was `6467a93da84c095f4fe32a253d8ba816be8cb8c2`. Every production deployment
and audit artifact must match the binding-cutover head derived from that merge.
Component PRs #31-#33 are superseded review vehicles rather than independent
release units. Combined local verification and required GitHub checks passed,
Sol approved the combined integration, and protected preview run `29379359308`
plus independent black-box audits found no P0-P2 release findings. PR #39 then
completed the separately reviewed D1 binding cutover and protected production
gate recorded above.

The integrated local-only application release upgrades
`primary_source_search` to v3 without adding a tool, migration, corpus body,
live CCEL path, configuration, or deployment change. It adds relevance and
deterministic round-robin work-diverse selection, limit-plus-one result-window
evidence, and the listed metadata-only `theologai://primary-sources/catalog`
JSON resource. Guided topic and creator surveys use work diversity; exact-work
location uses relevance; creator scopes remain separate and exact-resource
reads remain mandatory.

The public v3 input, output schema, structured result, and Markdown are strictly
local-only. Dormant external-provider adapters, service types, feature flags,
and composition wiring remain internal and unchanged for a separately reviewed
future rollout.

This slice preserves creator roles, routing-only alias policy, incomplete
edition provenance, unestablished catalog rights status, canonical fail-closed
section locators, and backward-compatible local research behavior while
intentionally removing inert external-provider boilerplate from the public
Markdown. Local protocol, parity, integrated-review, CI, preview-audit,
production-binding, and production-audit gates are complete. The production
audit's sole P2 commentary-coverage finding was corrected and released through
PR #40, with clean protected preview and production audits.

The same release adds v1 structured output for
`bible_verse_morphology`. Its bounded `words[]` retain exact source order, raw
morphology codes, nullable conservative expansions, and distinct provenance
links for the pinned STEPBible morphology and lemma sources. Guided word study,
passage exegesis, and translation comparison prefer that structure while
preserving Markdown fallback and the single-verse input boundary.

Direct `original_language_study` English targets now also resolve aligned
prefix/suffix gloss segments such as `heavens` within `the/ heavens`, while
remaining fail-closed for ambiguous candidates. No corpus rows or source data
were changed by that application-layer correction.

### Structured cross-reference follow-up (shipped)

This modern-output slice adds a v1 object-root contract for
`bible_cross_references` without changing its Markdown. It distinguishes the
caller's requested reference from the canonical verse actually queried,
materializes effective query defaults, preserves raw OpenBible.info vote order
and source-reference tie-breaking, and marks every result as a discovery lead
with relationship classification and directionality unspecified. Positions
and result windows are bounded, totals are scoped to the requested vote
threshold, and every response—including an empty result—carries the exact
checksum-pinned OpenBible.info snapshot provenance. It changes no corpus rows,
SQL semantics, migration, configuration, or deployment behavior.

### Structured donation-configuration follow-up (shipped)

This bounded modern-output slice adds a v1 object-root contract for
`donation_config` while retaining the legacy Markdown. It exposes the existing
public donation page, recipient, and configured asset values in their existing
display order, includes a machine-readable marker that this order is not a
ranking, and distinguishes native assets from tokens with a structurally
enforced null-or-exact contract address. It states that donations are voluntary
and do not affect feature access. The contract does not rank assets or claim price, liquidity, bridging,
or wallet support. It changes no verification behavior, chain configuration,
secret, migration, D1 state, or deployment setting.

### Structured donation-verification follow-up (shipped)

`verify_donation` now pairs its legacy Markdown with a conservative v1 object
contract. It reports exactly Ethereum, Base, and Radius checks; distinguishes
complete, partial, and unavailable provider coverage; and correlates each of
the seven classifications with a transaction outcome and a single verification
boolean. Only status-relevant transfers are returned, capped at 100 after all
eligible transfers are classified so the exact pre-cap total and truncation are
known. Supported amounts are asset-decimal values; unsupported amounts remain
raw base units. Explorer links are generated only from chain-specific
allowlists. Unknown, duplicate, missing, or mismatched chain evidence fails
closed. A successful receipt means only
`receipt_observed_no_confirmation_depth`, not confirmation depth or finality.

### Structured commentary follow-up (shipped)

`commentary_lookup` now pairs its byte-compatible legacy Markdown with a v1
object-root result. Coverage is carried from provider parsing into the service
as explicit identity evidence rather than inferred from the requested
reference. The shared commentator catalog drives provider IDs, aliases, public
coverage guidance, tool enums, and work rights. Its schema makes Matthew Henry
and Keil-Delitzsch exact-verse results impossible, permits John Gill exact
results only with a genuine provider `verseNumber`, and permits JFB, Clarke,
and Tyndale exact results from `verseNumber` or a `number` on an entry explicitly
typed as `verse`. Commentary text is labeled `text/markdown`; exact work
provenance remains separate from unpinned HelloAO delivery provenance. The
retrieval contract says `remote_cached_or_live` because the adapter uses a
process-local one-hour cache and does not expose per-result cache status. The
adapter fails closed unless HelloAO's response container matches the requested
work, book, and chapter, and structured retrieval reports the validated
provider corpus SHA-256 without treating it as edition provenance. Scalar
absence remains an actionable chapter-oriented tool error with no structured
content, while malformed or contradictory provider evidence fails closed.

## Active release candidate: bounded parallel text enrichment

The next `parallel_passages` application-contract slice advances its structured
schema from v2 to v3 for every call. With `includeText: true`, it schedules at
most 12 unique canonical passage lookups at concurrency four, in deterministic
UBS group/member/segment order followed by legacy order. Cross-corpus duplicate
targets share one lookup; cache hits never refund a slot and failures never
backfill later targets. All group and legacy metadata remains present.
The remote Bible-adapter ceiling of two HTTP retries mechanically caps this path at 36
upstream attempts and preserves headroom below the 50-subrequest Worker limit.

The required aggregate `textEnrichment` object reports the fixed budget,
targets, scheduled/succeeded/failed/omitted counts, translation, and completion
status. Every UBS member and legacy item reports a required status, and only
successful UBS segment lookups produce excerpts. Bounded deterministic warnings
and the Markdown footer disclose incomplete enrichment. This candidate changes
no corpus, migration, D1 materialization, binding, feature flag, rate limit, or
deployment configuration and is not shipped until review and release gates
complete.

## Release gates

Code readiness and operational readiness are deliberately separate:

1. Each slice receives implementation review, targeted tests, Node and Worker
   typechecks, build verification, and all required GitHub checks.
2. Stacked changes are merged or rebased in dependency order; passing a child
   PR against an unmerged parent is not proof that `main` is releasable.
3. Preview D1 must have the expected schema and materialization marker before a
   preview Worker is deployed. Migrations and imports are explicit operations;
   deployment does not mutate D1.
4. Preview deployment requires the repository's authorization label and
   protected environment approval. The live PR must still be open, non-draft,
   and authorized immediately before deployment.
5. Preview smoke and a functional audit must cover all eleven tools, the ten
   structured-output contracts, UBS default and explicit-source behavior,
   Strong's extended identities, local primary-source search, language study,
   resources, all six prompts, and failure/privacy boundaries.
6. Production D1 corpus changes require explicit owner authorization and a
   compatible replacement or reviewed incremental migration. A metadata-only
   transition is valid only when materialized rows are unchanged; it must use a
   conditional one-row update, immediate read-only readiness verification, and
   a prepared conditional rollback.
7. Production merge/deployment occurs only after the integrated Sol review,
   green required checks, successful preview audit, and protected production
   approval. Production then receives the same bounded smoke audit.

## Next work

- Decide and review a bounded, discovery-only public rollout of the retained
  CCEL search adapter. Live preview testing requires explicit owner acceptance
  of the residual policy ambiguity: free, donation-independent discovery with
  at most five attributed 240-character provider snippets and clean links, no
  body retrieval or republication, and no durable content storage. Applicable
  operational and terms boundaries have not yet been reviewed or approved.
  Immediately before any live preview canary, recheck the current CCEL search
  interface, robots guidance, copyright policy, and operational/terms boundary;
  record that evidence and repeat the owner decision. Until then preview stays
  `100`, production stays `000`, and neither environment may make a CCEL
  request.
- Expand the local primary-source corpus with rights-reviewed, freely
  redistributable editions and explicit edition provenance. Do not mirror or
  republish CCEL transcriptions without edition-specific rights.
- Broaden original-language study with a separately sourced semantic-domain
  layer useful to both beginners and readers of Greek or Hebrew; evaluate
  MACULA discourse/context evidence only after that foundation is reviewed.
  The currently exposed TBESH `Meaning` definitions derive from Online Bible
  material whose source notice says permission should be obtained before use in
  a project. The owner must decide whether to stop exposing those definitions
  until a clearly redistributable replacement is selected (recommended) or
  explicitly accept the residual risk. Do not expand their use meanwhile; the
  separately CC BY 4.0 STEPBible morphology evidence remains usable on its own.
- Evaluate section-span commentary only where provider coverage can be stated
  honestly; never relabel a section anchor as an exact verse range.
- Continue modern MCP output improvements tool by tool when a stable structured
  contract materially helps agents, retaining backward-compatible Markdown.
- Rehearse matched Worker/D1 rollback and define retention policy before any
  predecessor database cleanup.
- Revisit the parked public-edge traffic issue: a Frankfurt/AWS client has
  generated sustained anonymous production invocations. A future custom domain
  can enable a narrowly scoped WAF control while keeping the MCP endpoint
  public. This is non-gating; no hostname, Access, WAF, or limiter change is
  currently approved.

## Durable guardrails

- Production and preview D1 bindings are distinct and managed through protected
  workflows. Deployment never migrates or seeds remote D1.
- Readiness requires schema and exact corpus/materialization identity. Do not
  weaken it merely to make an older database pass.
- Code rollback and D1 rollback are independent. Use a compatible matched pair
  of Worker code and database state.
- Historical public-domain text may be published when transcription provenance
  is uncertain, but that uncertainty must be disclosed; a third party's
  particular transcription is not assumed redistributable.
- CCEL execution remains inactive. Preview exposes the v4 discovery contract
  only; production remains v3/local-only. A future live discovery rollout
  requires the explicit owner policy decision above and separate review, and
  must not become crawling, catalog mirroring, body republication, or permanent
  storage.
- Public Ethereum RPC endpoints are light-use defaults, not an uptime SLO.
  Donation verification remains fail-closed.
