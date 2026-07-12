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

These entries describe merged repository state. Deployment state is established
only by the relevant protected workflow and post-deployment smoke evidence; a
merge or this roadmap is not evidence that preview or production was deployed.

## Current Phase 3 release train

The following slices are implemented in the integration candidate and remain
subject to their stacked PR reviews, CI, operational gates, and merge order:

1. **PR #14 — bounded CCEL search adapter.** Defensive live-search transport,
   rights notices, budgets, caching, circuit behavior, and feature gates. Live
   CCEL search stays disabled unless its independent runtime flag is enabled.
2. **PR #15 — D1 materialization identity.** Distinguishes schema compatibility
   from the exact materialized corpus. A production marker transition is a
   separately authorized data operation, not a side effect of merge or deploy.
3. **PR #16 — exact Strong's identities.** Preserves canonical and extended
   OpenScriptures/STEPBible identifiers without lossy four-digit coercion.
4. **PR #17 — local-first primary-source research.** Adds the bounded
   `primary_source_search` query-plan workflow, resolvable result locators, and
   optional separately gated CCEL discovery.
5. **PR #18 — UBS runtime foundation.** Adds strict repositories, provenance,
   source integrity, and source-attested parallel-group domain contracts.
6. **PR #19 — UBS D1 materialization.** Adds deterministic relational export,
   import verification, readiness identity, and Worker repository support.
7. **PR #20 — public UBS cutover.** Makes complete source-attested UBS groups the
   unconditional default, with bounded structured output. Legacy curated edges
   and OpenBible.info evidence remain available only through explicit separate
   selectors; raw UBS alignment is opt-in.
8. **Integrated language-study slice.** Adds `original_language_study`, a
   context-first workflow for one token in one verse, with morphology,
   source-separated lexical evidence, provenance, and interpretive limits. It
   must receive its own reviewable publication path before release.

The integration candidate advertises eleven tools and structured output for
`bible_lookup`, `parallel_passages`, `original_language_lookup`, and
`original_language_study`. Markdown remains available for compatibility.

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
5. Preview smoke and a functional audit must cover all eleven tools, the four
   structured-output contracts, UBS default and explicit-source behavior,
   Strong's extended identities, local primary-source search, language study,
   resources, prompts, and failure/privacy boundaries.
6. Production D1 marker changes require explicit owner authorization, a
   conditional one-row update, immediate read-only readiness verification, and
   a prepared conditional rollback.
7. Production merge/deployment occurs only after the integrated Sol review,
   green required checks, successful preview audit, and protected production
   approval. Production then receives the same bounded smoke audit.

No current roadmap statement claims that the pending D1 transition, preview
deployment, production deployment, or live CCEL enablement has happened.

## Next work after this train

- Expand primary-source discovery beyond the initial local collection through
  rights-reviewed, freely redistributable editions and provider adapters. Do
  not mirror or republish CCEL transcriptions without edition-specific rights.
- Improve primary-source research bundles for topic surveys, within-work
  location, and author comparison while leaving synthesis to the host model.
- Extend original-language study with carefully sourced semantic-domain,
  occurrence-distribution, and discourse evidence useful to both beginners and
  readers of Greek or Hebrew.
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
- CCEL access remains bounded and user-initiated. Live discovery is disabled by
  default and must not become crawling, catalog mirroring, or permanent storage.
- Public Ethereum RPC endpoints are light-use defaults, not an uptime SLO.
  Donation verification remains fail-closed.
