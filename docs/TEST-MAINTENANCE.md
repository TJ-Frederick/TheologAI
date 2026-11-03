# Test maintenance — active task

2026-11-03: slice 1 independently reviewed and accepted. Baseline
`0a9df1d31407a2918f521c4482efd821dfaeb6e4`; local branch
`test/retained-language-sql-coverage` in audit checkout `12bf/TheologAI`.
Reviewer chat `01a1a30d-56d7-7260-9321-3b6b724ba515` accepted the five test
diffs, mapping and fault evidence with no blocking findings; local commit authorized.
No PR, merge, preview or production operation performed.

Scope: strengthen retained tests before retiring the frozen language-v2 draft
packet. Production behavior, draft files, workflows, dependencies, corpus,
release code and documentation contracts remain unchanged. Slices 2 (packet
retirement) and 3 (cosmetic documentation locks/IP-only prose) await review.

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
| Draft JSON calls/fixtures, prompt nonregistration and packet inertness/build/pack locks | Historical packet obligations only; unchanged in slice 1. Retire together with the packet in reviewed slice 2, preserving Git reproduction rather than a duplicate harness |
| Inclusive cross-reference `minVotes` boundary | `adapters/repositoryParity.test.ts`: new SQLite and D1 cases execute real SQLite SQL against votes 29/30/31 at threshold 30; assert explicit rows, totals and limited-page `hasMore` independently for both backends |

No synthetic implementation, framework or test dependency added. The five
changed test files and shared production fixture are identical at this baseline
and preserved candidate `36f18ab38085d4522d7c5b9f8c3b269530cc2bae` before this patch.
Candidate compatibility here is a file comparison, not release admission.
Do not alter or activate that candidate. Resume its separate workstream in
[the original chat](codex://threads/01a179a9-6b6e-7973-92de-f7b13d617aad).

## Validation and controlled faults

Node 22.23.4, existing matched dependencies from checkout `19d3`; no install.
All five affected files: **61/61 pass** (Vitest 4.1.12, 1.14 s reported duration).
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
suite was run for this test-only slice. Broader final-patch verification remains
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
