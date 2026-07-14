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

Protected production workflow run `29289643276` deployed the PR #27 merge after
the exact-corpus readiness gate passed. GitHub deployment `5432211383` serves
Worker version `49746830-16ce-40dc-b8a5-3cdc9ab79217` at 100% with production D1
`theologai-production-20260713-b` and scoped materialization identity
`652245709aaed181345b0cf17f0091471ac3a3e323f6ae84cfd73a5d8b409c51`.
Live CCEL discovery remains intentionally disabled and is not part of the
public MCP contract.

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

## Unreleased integrated Phase 3 candidate

The next integrated candidate replays the reviewed original-language usage and
catalog-aware primary-source work onto the PR #27 production baseline. Its four
core feature commits are `2c2a29a`, `eccfad4`, `1b95201`, and `2506413`; the
candidate also requires the downstream Unicode-manifest preservation fix
`a1c9da3` and source-lock synchronization `e8282c3`. It adds schema
`0003_original_language_usage`, occurrence and distribution evidence with
keyset pagination, progressive original-language output levels, and curated
catalog scope for primary-source research. The separate `e6f7f7f` commit
reconciles release documentation for this candidate.

This transform-version-6 candidate is unmerged and not released to production.
PR #30 uses the fresh preview database
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
presenter/search/browse, and derivation-output issues. Corrective code is now in
the PR candidate, but it must pass CI, protected preview redeployment, and a new
black-box audit before production can be considered. This status does not bind
the corrective release to an as-yet unknown final Worker version. Retain the
verified PR #27 Worker version `734aec3b-d6c3-456b-a203-c7f940a2d081` with
`theologai-preview-20260713-c` as the immediate matched rollback pair;
`theologai-preview-20260712-b` remains older matched rollback history. PRs #28
and #29 are closed as superseded by PR #30.

The one-off owner-authorized deletion of unused legacy database
`theologai-db-preview` (`f9f415e1-219b-4d17-bcf5-33a8abad02fa`) was completed.
No other database deletion is authorized. The next release action is to finish
CI, redeploy the corrective candidate through the protected preview workflow,
and repeat the black-box audit. Production remains untouched and separately
gated.

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
5. Preview smoke and a functional audit must cover all eleven tools, the five
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

- Finish CI for the corrective transform-version-6 candidate, redeploy it
  through the protected preview workflow, and repeat the full black-box audit
  before considering production promotion.
- Broaden advanced original-language study only after those foundations, using
  carefully sourced semantic-domain and discourse evidence useful to both
  beginners and readers of Greek or Hebrew.
- Expand primary-source discovery beyond the initial local collection through
  rights-reviewed, freely redistributable editions and provider adapters. Do
  not mirror or republish CCEL transcriptions without edition-specific rights.
- Improve primary-source research bundles for topic surveys, within-work
  location, and author comparison while leaving synthesis to the host model.
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
