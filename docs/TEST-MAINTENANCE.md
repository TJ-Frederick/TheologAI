# Test maintenance — active task

2026-11-03: slice 1 accepted and committed locally as `c8c1b118b027d2086b712ee4bcfe1fa93b9f19fb`.
Slice 2 independently reviewed and accepted. Investigation baseline
`0a9df1d31407a2918f521c4482efd821dfaeb6e4`; local branch
`test/retained-language-sql-coverage` in audit checkout `12bf/TheologAI`.
Reviewer chat `01a1a30d-56d7-7260-9321-3b6b724ba515` accepted the five test
diffs, mapping and fault evidence with no blocking findings; local commit authorized.
No PR, merge, preview or production operation performed.

Scope: slice 1 strengthened retained tests; slice 2 retires the frozen language-v2
draft packet. Production behavior, workflows, dependencies, corpus, release code
and documentation contracts remain unchanged. Slice 3 (cosmetic documentation
locks/IP-only prose) remains gated by review.

## Coverage mapping

Paths below are relative to `test/unit/` and refer to retained production tests.

| Draft/audit requirement | Retained owner and disposition |
| --- | --- |
| Independent v1 request/context reference mismatch; nested domain source role | `presenters/originalLanguageStudyV2Structured.test.ts`: three new rejection cases, with independently recalculated byte accounting |
| Complete current alignment proof | `services/languages/OriginalLanguageStudyV2Coordinator.test.ts`: transfer ten draft mismatches (aggregate artifact, version, dictionary source hash, normalized reference, token identity, selected token, source, entry, sense, evidence); retain existing normalized-coordinate mismatch and valid aligned control |
| Continuation target, position, selected token, stale artifact | Same coordinator suite: four new cases; each requires rejection before repository access |
| Alias/detail binding; malformed, forged, nonboundary and false-terminal continuation | Same coordinator suite: existing rejection cases and genuine two-page continuation retained |
| Excluded definition, clean gloss, zero domains and unavailable-definition disclosure | `formatters/originalLanguageStudyV2Formatter.test.ts`: one new end-to-end presentation case, checking structured evidence plus Markdown |
| Schema status/reason/detail incompatibility | `mcp/originalLanguageStudyV2Schema.test.ts`: existing status/reason rejection plus new independent detail rejection; valid summary/detailed controls retained |
| Complete v1 composition, Greek preservation/no Hebrew query, oversized candidate omission, truthful bytes | Existing coordinator, presenter representative-output hashes and formatter complete-v1-prefix tests retained |
| Cross-reference composition failure before evidence query | Existing coordinator semantically different/noncanonical result rejection; presenter now independently rejects both nested v1 reference fields; formatter rejects a different v1 result |
| Caller-owned source/proof injection, closed schemas | Existing coordinator no-provider/no-repository rejection and schema boundary checks retained |
| False-terminal arithmetic, top-level provenance swap, invented alignment, byte overflow | Existing production presenter rejections retained |
| Escaping, v1 preservation and additive Markdown limit | Existing production formatter tests retained; escaping remains a current obligation. Only draft-specific presentation wording is historical |
| Draft JSON calls/fixtures, prompt nonregistration and packet inertness/build/pack locks | Historical packet obligations only; retired together in slice 2 after coverage transfer and slice 1 acceptance. Git history preserves reproduction without a duplicate harness |
| Inclusive cross-reference `minVotes` boundary | `adapters/repositoryParity.test.ts`: new SQLite and D1 cases execute real SQLite SQL against votes 29/30/31 at threshold 30; assert explicit rows, totals and limited-page `hasMore` independently for both backends |

No synthetic implementation, framework or test dependency added. The five
changed test files and shared production fixture are identical at this baseline
and preserved candidate `36f18ab38085d4522d7c5b9f8c3b269530cc2bae` before this patch.
Candidate compatibility here is a file comparison, not release admission.
Do not alter or activate that candidate. Resume its separate workstream in
[the original chat](codex://threads/01a179a9-6b6e-7973-92de-f7b13d617aad).

## Slice 1 validation and controlled faults

Node 22.23.4, existing matched dependencies from checkout `19d3`; no install.
All five slice 1 affected files: **61/61 pass** (Vitest 4.1.12, 1.14 s reported duration).
`npm run typecheck`: **pass**, including Node, Worker, coordinator, release
scripts and all maintained test projects. `git diff --check`: **pass**.

Faults ran one at a time in a fresh disposable Git archive with the five edited
tests copied in, isolated HOME and explicit credential-free environment. Each
source was restored in `finally`; restored control: **61/61 pass**.

| Fault source/change | Intended detected failure |
| --- | --- |
| `src/presenters/originalLanguageStudyV2Structured.ts`: independently remove request-reference or context-reference consistency check | Corresponding new reference test only (one failure per fault) |
| Same source: disable nested domain provenance check | New nested domain test only |
| `src/adapters/data/CrossReferenceRepository.ts` and `src/adapters/d1/D1CrossReferenceRepository.ts`: change `>=` to `>` independently in row and count queries | Corresponding backend threshold test only, all four faults detected |
| `src/services/languages/OriginalLanguageStudyV2Coordinator.ts`: bypass aggregate alignment relationship predicate | Expanded proof mismatch matrix fails |
| `src/kernel/originalLanguageStudyV2Contract.ts`: bypass cursor context digest and canonical reconstruction checks | Existing alias/detail test plus all four new continuation tests fail |
| Coordinator: substitute an incorrect nonempty gloss | New excluded-definition/zero-domain case and existing output hash test fail |
| `src/mcp/schemas/originalLanguageStudyV2.ts`: allow detailed status in summary candidate schema | Extended schema test fails |

All **11 faults detected**. This is selective diagnostic evidence, not a suite
mutation score. The D1 cases execute D1 repository SQL through the existing
SQLite-backed D1 adapter; they do not claim a live Cloudflare runtime result.
No full corpus, coverage, build, integration, Workerd, deployment or live-provider
suite was run for slice 1. Broader final-patch verification remains
for the reviewed retirement/cleanup sequence; no release proof is implied.

Disposable evidence (local, not required project inputs):
- Exact fault runner: `/private/tmp/verify-test-slice1.py`.
- Final summary, per-fault JSON/logs, restored source copy:
  `/var/folders/rl/yfww2gx95ysd4z9qpxyxt2bm0000gn/T/theologai-test-slice1-qlcmfqmh/`.
- `/private/tmp/theologai-test-slice1-location` points to that final evidence.
- Original investigation/plan remains under
  `/var/folders/rl/yfww2gx95ysd4z9qpxyxt2bm0000gn/T/theologai-test-audit-67hbu9g5/`.

Engineering self-review: expectations use production modules and existing
fixtures, explicit SQL expected results protect against shared repository faults,
and reference/provenance rejection cannot pass through incidental byte errors.
Accepted behavior and frozen hashes remain unchanged. The matrix retains
case-specific labels; no corpus/release machinery was added. Independent review accepted slice 1; slice 2 is authorized locally.
Publishing remains gated by review.


## Slice 2 retirement and reproduction

Removed exactly the reviewed 17 paths: all 12 files under
`test/fixtures/original-language-study-v2/`, plus these five suites:

- `test/unit/formatters/originalLanguageStudyV2DraftFormatter.test.ts`
- `test/unit/mcp/originalLanguageStudyV2DraftSchema.test.ts`
- `test/unit/presenters/originalLanguageStudyV2DraftStructured.test.ts`
- `test/unit/scripts/originalLanguageStudyV2DraftInertness.test.ts`
- `test/unit/services/languages/OriginalLanguageStudyV2DraftCoordinator.test.ts`

Exact historical reproduction baseline:
`0a9df1d31407a2918f521c4482efd821dfaeb6e4`. Archive extraction recovers the
packet source and its original surrounding code/lockfile. Rerunning the complete
historical packet requires a disposable detached Git checkout/worktree at that
commit, with its Git index and matching lockfile/toolchain: the former inertness
suite invokes `git ls-files --stage` and other Git commands. Current project
history is the archive; historical reproduction
is not an active test obligation. No excluded archive or replacement harness
was added. Removed five suites/28 draft tests; no CI wall-clock saving claimed.

`test/test-topology.json` follows the existing explicit partition inventory:
current TypeScript files 297 → 286, active Vitest files 218 → 213, support files
24 → 18. Its dated `sourceBaseline` is unchanged. The retained production
runtime suite still checks all seven active modules reachable from both Node
and Worker, closed schema/caller authority, pinned artifact and provider/storage
boundaries; only obsolete draft references were removed. The production fixture
intro now points to this historical record.

Validation (Node 22.23.4, matched existing dependencies, explicit credential-free
environment, no installation/provider calls): nine affected/topology/boundary
files **81/81 pass**; complete `npm run typecheck` **pass**; `npm run build`
**pass**; current MCP integration suite **3/3 pass** (shared factory, Node adapter,
Worker adapter). `git diff --check` passes; deleted paths match the reviewed
17-file inventory exactly. Repository reference search leaves only this
historical record; runtime, scripts, test inventory and configuration have no
remaining draft references. Temporary dependency symlink removed after checks.

Exact commands, logs and JSON results remain disposable local evidence under
`/var/folders/rl/yfww2gx95ysd4z9qpxyxt2bm0000gn/T/theologai-test-slice2-0om_fd7q/`;
`/private/tmp/verify-test-slice2.py` is the runner. No full corpus rebuild, coverage,
Workerd or live/deployment suite was run. Final coverage validation is reserved
for the reviewed slice 3 patch. Aquinas/Norton and other design packets remain
untouched. Independent reviewer accepted the exact deletions, topology, retained
boundaries and validation evidence; no code blocker. The Git-index reproduction
clarification above completes the requested correction. Local slice 2 commit
authorized; slice 3 remains separately reviewable.
