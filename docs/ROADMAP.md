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
- **Phase 3 follow-up integration / PR #26:** pinned, reproducible
  biblical-language source revisions plus the primary-source evidence handoff,
  merged as `65db03e8cd02098064a748f96cca8da22c974381`.

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

PR #26 made the two formerly staged follow-up slices part of the shipped
baseline:

1. **Pinned biblical-language source revisions.** Immutable upstream source
   identities, source and generated-artifact verification, and a reproducible,
   atomic regeneration workflow with semantic-drift reporting.
2. **Primary-source evidence handoff.** A stable, bounded structured-output
   contract for `primary_source_search`, the local-only
   `primary-source-research` prompt, and exact native resource links for
   selected canonical sections. It does not enable or advertise live CCEL
   discovery.

Protected production workflow run `29267651916` deployed the PR #26 merge after
the release gates passed. The post-deployment production audit passed 54/54
checks, and the focused parallel-passage audit passed 11/11 checks. Live CCEL
discovery remains intentionally disabled and is not part of the public MCP
contract.

## Current release candidate

**PR #27 — biblical-language Unicode correction** is the current release
candidate. It repairs the bounded historical UTF-8 corruption against the
pinned OpenScriptures and STEPBible evidence, records the exact correction
ledger, and advances the D1 materialization identity without changing corpus
row counts or the public MCP tool inventory.

PR #27 remains open and unmerged, but its preview release gate is complete. A
fresh replacement database, `theologai-preview-20260713-c`, was migrated and
fully seeded without mutating its predecessor. Protected workflow run
`29277315492` created GitHub deployment `5429947573` and deployed Worker version
`734aec3b-d6c3-456b-a203-c7f940a2d081`. The combined preview audit passed all
nine Strong's corrections, all 237 morphology corrections, all 11
parallel-passage cases, and sampled the remaining MCP surface; positive donation
verification remains manual. The preview authorization label was then removed
and the revocation workflow completed successfully.

This is preview evidence only. Production remains on the PR #26 release and was
not changed, queried, or deployed as part of PR #27's preview preparation. PR
#27 still requires its merge and separately authorized production-data and
deployment gates before it can be called shipped.

## Dependent work in flight

- **Draft PR #29 — original-language usage foundation.** This migration and
  repository foundation is stacked on PR #27 and is published as a draft PR,
  but remains unmerged, undeployed, and unreleased. It does not yet change the
  public MCP behavior. It must be rebased or retargeted after PR #27 lands, then
  receive fresh CI and review. It should remain a reviewed foundation rather
  than merge independently: every `main` push starts the production workflow,
  and the current production D1 intentionally cannot satisfy its transform-5
  readiness contract.
- **Original-language usage output.** The public occurrence-count, attested-form,
  book-distribution, and keyset-pagination slice exists only as a local commit.
  It has not been pushed, opened as a PR, deployed, or released.
- **Primary-source catalog and scope.** Catalog-aware discovery work is local
  and uncommitted while its authoritative metadata provenance is being
  completed and reviewed. It has not been pushed, deployed, or released, and it
  does not enable CCEL or publish external document bodies.

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

- Merge PR #27 only after its completed preview evidence and release review are
  accepted; prepare and promote production data only with explicit owner
  authorization.
- After PR #27 lands, rebase or retarget draft PR #29 to `main`, rerun CI and
  review, but keep the invisible foundation unmerged while its public slices
  remain in flight.
- Rebase the local original-language usage output onto the reviewed foundation,
  then use a fresh transform-5 preview D1 replacement to verify occurrence
  counts, book distribution, attested forms, keyset pagination, legacy
  behavior, and stale cursor rejection.
- Integrate the provenance-complete primary-source catalog and scope slice after
  that usage rehearsal, preserving the reviewed metadata claims and advancing
  the materialization identity deliberately. Rehearse the combined transform-6
  candidate against another fresh preview database, then merge and promote the
  integrated release only through its separately authorized production-data
  and deployment gates.
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
