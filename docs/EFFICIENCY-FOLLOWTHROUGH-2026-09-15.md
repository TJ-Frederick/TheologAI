# Efficiency follow-through — 2026-09-15

This pass follows PR #163. It targets remaining database verification cost,
manual-release workflow duplication, and incidental test brittleness. It does
not deploy, activate dormant work, change corpus identity, or introduce
cross-run validation caching.

## Baseline and scope

Current main at the start of the pass: `757a51c2de69b55e3805d6173c04bdf1690d0ef6`.
The first optimized [hosted run](https://github.com/TJ-Frederick/TheologAI/actions/runs/34881342907)
completed in 8m34s; Fresh Checkout & Data took 7m49s. The latest pre-change
baseline was 14m09s overall and 12m59s for that job. This is one successful
post-change run, not yet a stable multi-run estimate. No subsequent ordinary
PR runs were available when this follow-through began.

Work is split by file ownership: D1 profiling and release simplification use
Terra; the bounded test-maintenance review uses Luna. Integration review and
publication remain centralized.

## Decisions

* Keep Node and Worker composition roots explicit. Node database lifetime,
  Worker per-request D1 repositories, isolate caches, and environment-dependent
  adapters differ. A shared factory would introduce an abstraction without a
  demonstrated drift or performance benefit.
* Keep historical release-plan compatibility even though production promotion
  is manual. Remove obsolete automatic-deployment branching from the active
  workflow, not acceptance of historical evidence formats.
* Preserve full ordered seed import, bounded authority pages, readiness checks,
  and semantic/hash comparisons. Profile costs before changing execution.
* Preserve intentionally frozen provenance fixtures and Git object identities.
  Make incidental workflow-layout assertions structural instead.
* Assess activation for Aquinas and Norton, following the maintainer's updated
  direction. Inactive status and internal review markers are not substantive
  blockers. Separate source rights, concrete technical defects, and editorial
  scope choices. No retirement is planned.

## Implemented maintenance changes

The production workflow uses the manual-only context/classification CLI output
modes in `resolve-production-release-context.mjs`. This removes obsolete push
branches and repeated inline field parsing. The generic resolver and plan
verifier still understand historical push records. Each active gate checks the
checkout against the expected commit, validates its first parent, and retains
protected evidence revalidation and custom-domain prerequisites.

Preview-revocation tests now inspect parsed YAML, preserve the exact routing
and cancellation predicates, tolerate display-name/formatting changes, and
reject unsafe predicate/group changes. The domain-context test similarly
checks parsed environment wiring instead of large inline shell templates.
The public-domain preparation guard now permits Markdown documentation to
discuss inactive packets; executable/catalog/manifest/config registration
remains prohibited. A documentation mention is not activation.

## D1 profiling and bounded batch change

The PR #163 hosted verifier took approximately 317.2s, including 175.2s seed
import, 11.8s readiness, 17.3s Transform-8 authority, and 103.9s Transform-11
authority. The 452.4s enclosing action block also included export and other
verification; it is not the verifier's duration.

The only runner change doubles authority batch size from four to eight. It
retains all 49 ordered seed files and all 182 bounded authority queries. Eight
response envelopes at the existing 1,250,000-byte cap fit inside the unchanged
16 MiB process-output limit; page, row, ordering, and hash checks remain intact.

A single same-machine comparison imported one complete isolated database and
ran complete audits in order four then eight:

| Mode | Transform 8 | Transform 11 | Total authority | Wrangler commands |
|---|---:|---:|---:|---:|
| Four-query batches | 6.142s | 37.616s | 43.758s | 46 |
| Eight-query batches | 3.514s | 20.944s | 24.458s | 24 |

Both complete audits accepted the same expected corpus. The final eight-query
result emitted hashes matching PR #163. Seed import took 96.758s in this local
run. Because eight ran second, cache warming may contribute; this is a paired
indication, not a stable speedup estimate or a hosted result. Temporary profiling
hooks were removed. No extra cache, runner configuration, seed sampling, or
validation bypass was introduced.

## Verification

Focused release/configuration tests passed (47), as did D1 authority/readiness
checks (14 passed, 2 skipped), Actionlint, and diff checks. Full coverage passed: 207 files, 2,713 tests passed and 5 skipped; thresholds
passed at 90.97% lines, 91.99% functions, and 81.21% branches. The full
TypeScript matrix passed. An independent review of the production workflow
and context changes found no remaining gate-preservation findings. No remote
corpus mutation or deployment was performed.


## Activation assessment outcomes

[Norton](NORTON-ACTIVATION-ASSESSMENT-2026-09-15.md): the pinned CC0
transcription and its mechanical normalization have no identified remaining
text-rights restriction. The old pending marker describes a disposable proof.
The next implementation is admission to the existing active source-pack path,
with edition-specific labels, the existing 1,250 source-segment identifiers,
current CC0 provenance, and a fresh capacity/parity build.

[Aquinas](AQUINAS-ACTIVATION-ASSESSMENT-2026-09-15.md): the existing packet
contains 3,184 bodies across the four authored parts, not merely the earlier
95-section excerpt. The absent traditional Supplement is an explicit coverage
boundary, not evidence of missing Tertia questions after q90. This pass corrects
that misleading wording in preparation/publication metadata and documentation,
without changing source shards or activating any rows. Existing hierarchy
readers and services can support useful bounded retrieval; the remaining work
is an active publication/build transform and public adapter integration.

No retirement, source reacquisition, new rights-approval ceremony for Norton,
or automatic requirement for complete-traditional-Summa coverage is proposed.
Source hashes, transcription gaps, edition attribution, bounded retrieval, and
actual schema/identity checks remain meaningful. Activation will be a separate
implementation change; this pass does not alter the served catalog or deploy.
