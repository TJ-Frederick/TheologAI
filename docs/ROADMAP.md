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

These entries describe merged repository state. Deployment state is established
only by the relevant protected workflow and post-deployment smoke evidence; a
merge or this roadmap is not evidence that preview or production was deployed.

## Shipped Phase 3 release train

The following component slices were integrated, reviewed, and shipped through
PR #21. Their stacked PRs #14–#20 are closed as superseded review vehicles:

1. **PR #14 — bounded CCEL search adapter.** Defensive live-search transport,
   rights notices, budgets, caching, circuit behavior, and feature gates. The
   adapter is retained as inactive future-provider architecture and is not
   advertised or reachable through the current public MCP schemas.
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

The released server advertises eleven tools, six guided prompts, and structured
output for `bible_lookup`, `parallel_passages`, `primary_source_search`,
`original_language_lookup`, and `original_language_study`. Markdown remains
available for compatibility.

Protected production workflow run `29418476587` deployed the PR #39 merge after
the exact-corpus readiness gate passed. GitHub deployment `5457655742` deployed
Worker version `a74f0848-5b68-4d7a-834e-aa3221ebda3b` at 100% with production D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). The post-deployment strict readiness
check returned `ready` with zero writes. The independent production audit
scored 87/90 with no P0 or P1 findings and one P2 commentary-coverage finding.

PR #40 corrected that finding without changing either D1 binding. Protected
preview run `29425323205` deployed reviewed head
`32441d99de673eccce0a57fd74801fb94db04944` as GitHub deployment `5459322775`
and Worker version `34a0a557-9ddb-4940-9862-6b25e1dd98e6` at 100%, bound to
preview D1 `theologai-preview-20260714-a`
(`0dab804f-8df0-4727-93bd-299612b6e179`). The coordinator audit passed 15/15
and the independent audit passed 27/27 with no P0-P3 findings. Protected
production run `29427137668` then deployed merge
`9f6aa128eeab663ef04a315ab0c14b8ae9a3376d` as GitHub deployment `5459432945`
and Worker version `656e9e3a-7044-45ca-9144-4ec7eae94d8d` at 100%. That PR #40
Worker is the current production version and remains bound to production D1
`theologai-production-20260715-a`. Readiness returned `ready` with zero writes;
the coordinator audit passed 15/15 and the independent audit passed 27/27 with
no P0-P3 findings. Live CCEL discovery remains intentionally disabled and is
not part of the public MCP contract.

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
does not predict the Worker UUID produced by any later deployment. The current
immediate preview rollback pair is PR #34 Worker version
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

### Structured cross-reference follow-up (unreleased)

The next modern-output slice adds a v1 object-root contract for
`bible_cross_references` without changing its Markdown. It distinguishes the
caller's requested reference from the canonical verse actually queried,
materializes effective query defaults, preserves raw OpenBible.info vote order
and source-reference tie-breaking, and marks every result as a discovery lead
with relationship classification and directionality unspecified. Positions
and result windows are bounded, totals are scoped to the requested vote
threshold, and every response—including an empty result—carries the exact
checksum-pinned OpenBible.info snapshot provenance. It changes no corpus rows,
SQL semantics, migration, configuration, or deployment behavior.

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
5. Preview smoke and a functional audit must cover all eleven tools, the seven
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

- Broaden advanced original-language study only after those foundations, using
  carefully sourced semantic-domain and discourse evidence useful to both
  beginners and readers of Greek or Hebrew.
- Expand primary-source discovery beyond the initial local collection through
  rights-reviewed, freely redistributable editions and provider adapters. Do
  not mirror or republish CCEL transcriptions without edition-specific rights.
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
- CCEL adapters remain inactive and outside the public MCP contract. A future
  discovery-only rollout requires separate review and must not become crawling,
  catalog mirroring, body republication, or permanent storage.
- Public Ethereum RPC endpoints are light-use defaults, not an uptime SLO.
  Donation verification remains fail-closed.
