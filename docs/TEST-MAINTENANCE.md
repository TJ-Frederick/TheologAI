# Test maintenance — active task

2026-11-03: local implementation, independent review and validation are
complete for all three slices. Publication is pending explicit approval.
Branch: `test/retained-language-sql-coverage`, audit checkout `12bf/TheologAI`.
No PR, push, merge or deployment performed. Production behavior, release gates,
workflows, dependencies and corpus are unchanged. Norton/Aquinas remains
preserved; its historical evidence and resume boundary are linked below.

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

Accepted by reviewer chat `01a1a30d-56d7-7260-9321-3b6b724ba515` with no blocking
findings; committed as `c8c1b118b027d2086b712ee4bcfe1fa93b9f19fb`.

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
authorized and completed as `8d383acfb02018816f9eb29716518cbcb53434de`; slice 3
remains separately reviewable.


## Slice 3 documentation assertion decisions

Independent reviewer accepted the README change, retained contract safeguards,
assertion dispositions, controlled faults, focused checks and full coverage
evidence with no blocking finding. The generated-dist prerequisite diagnosis
was accepted; local slice 3 commit authorized.

Scope is exactly README, `test/unit/docs/publicContract.test.ts`, and this
record. README now describes the existing domain-separated IP-only rate limit,
User-Agent independence, shared NAT buckets and fail-open limiter behavior.
The separate abusive-poller IP/User-Agent rejection tuple is unchanged.
No historical document or current release snapshot was edited.

| Assertion group | Retained protection | Removed obligation and reason |
| --- | --- | --- |
| Release authority | Exact closed marker role/target graph for all 18 existing documents, sole present-tense authority, separate rollback decision, gate versus release-artifact distinction | Snapshot headings, historical seven-row evidence-table count and thirteen literal stale-release phrases. Headings/table layout are presentation; dated artifact enumeration and old phrase blacklists are not current identity authority |
| Roadmap/history | README roadmap link and six historical artifact banners stating non-current product authority | Exact roadmap heading, prior commit and completed phase label; repeated historical banner/title checks elsewhere |
| Public registry and corpus | README tool/prompt registry against actual MCP; tool count/structured-output markers against both real runtime registries; corpus counts against manifest; bounded work inventory and skill evidence/attribution instructions | Duplicate eleven-tool prose, obsolete ten-tool wording blacklist, duplicate primary-source row description and hardcoded repeated corpus prose. Runtime/manifest checks own those relationships |
| Current transport/discovery/corpus | v6 local-only/v7 discovery-only status, CCEL execution disabled before adapter/coordinator/fetch, actual exposure/live/coordinator flags, year-bound limits, reconnect/reinitialize instructions, inactive Aquinas/local-only unpublished candidate | Exact historical PR #108 narrative wording and mixed Transform-11 cutover/rollback/predecessor assertions; the closed authority graph and current operational boundaries remain |
| Historical release identity and reconciliation | Historical records themselves preserved; authority markers direct readers to CURRENT-RELEASE | Literal deployment/Worker/D1/run/commit/tree/digest values, cancelled-PR enumeration, completed preview/production chronology and old exact rollback-unit descriptions. Historical fidelity stays in reviewed Git documents; tests no longer duplicate the ledgers |
| Operator admission and proof limits | Separate stage authorization, fresh unbound preparation/readiness, preview then production then credential/canary order, schema isolation, fresh control-plane identity, hard inert unrecorded gate before cloud access, staging/promotion mutation disclosures, preflight and evidence limitations | Historical stage-completion PR labels, prior endpoint-bearing Worker IDs, repository-only PR narratives and historical endpoint-deployment claims. Admission, readiness, secret release and canary executable rejection suites remain unchanged |
| Production control | Capture/verify commands, success condition and post-audit control hash; documented initial inventory and checks after final audit/identity | Workflow display labels and repeated artifact filenames already owned by workflow/reconciliation suites; no workflow selector or executable gate changed |
| Whitespace/presentation | Prose-only helper removes quote prefixes and collapses whitespace; markers, tables, SQL/config/workflow code remain raw | Exact prose line wrapping and cosmetic headings; no replacement regex list for retired identities |

Public-contract suite is 14 → 10 tests and 745 → 360 lines. This is a
maintenance reduction, not a CI wall-clock claim. Escaping and current product
contracts remain obligations; no accepted behavior was changed to pass tests.

Slice 3 focused verification: **119/119 pass** across public contract, topology,
workflow, Worker rate limits, production guards, preview reconciliation, canary
and operator-secret release; complete `npm run typecheck` **pass**. Exact
commands/results/logs and the single-file macOS checksum wrapper are local at
`/var/folders/rl/yfww2gx95ysd4z9qpxyxt2bm0000gn/T/theologai-test-slice3-z8vffbhd/`.
`/private/tmp/verify-test-slice3.py` is the focused runner.

Disposable-copy negative/neutral controls: baseline **10/10 pass**; rename
README/current-snapshot/roadmap headings **10/10 pass**; reflow README, snapshot
and canary prose **10/10 pass**; change one retired historical deployment ID
**10/10 pass**. Removing the README `bible_lookup` row, changing its public tool
count marker, and pointing its release-authority marker at ROADMAP each cause
**exactly the intended one test failure**. Restored control **10/10 pass**.
The exact mutation runner and per-case JSON/logs are at
`/var/folders/rl/yfww2gx95ysd4z9qpxyxt2bm0000gn/T/theologai-test-slice3-faults-5achhwxc/`.
No working implementation was mutated.

Full combined-candidate coverage validation: **210/210 files pass; 3,043 tests
pass, five conditionally skipped**. Statements **86.72%**, branches **81.25%**,
functions **91.95%**, lines **90.87%**; all existing thresholds pass. Corrected
run elapsed 56.757 seconds (Vitest-reported duration 56.28 seconds); this is a
local observation, not a baseline-relative or hosted CI saving. The five skips
are two generated-database readiness cases and three cases requiring the
separate authoritative Macula audit packet; those optional local inputs were
not created here, and their skip conditions/tests are unchanged.

The initial full run (54.390 seconds) had 3,042 passes, five skips and one
failure: the unchanged UBS acquisition packaging test rejects `dist/index.js`
in npm's diagnostic packlist. The successful slice 2 build had left exactly
that generated file. Preserved the build output at `slice2-node-build-dist/`
under the evidence directory, then the unchanged packaging suite passed 5/5.
Only after that independent prerequisite check, repeated coverage to obtain
its otherwise-suppressed threshold report. No assertion or package policy was
weakened. `coverage-summary.json`/`coverage-tests.json`/`coverage.log` retain
the failed first run; `coverage-retry-summary.json`/`coverage-retry-tests.json`/
`coverage-retry.log` retain the passing run, alongside both exact runners.
The temporary PATH checksum wrapper and isolated HOME/environment were used
in both runs. Temporary dependency symlink removed after validation.

Slice 2 Node build and 3/3 shared/Node/Worker MCP integration results are reused
because slice 3 changes only docs and their test; no production build input
changed. No manual corpus rebuild, live provider, remote operation or deployment
proof is requested or implied. Hosted required checks still apply. No production
source, workflow, dependency, corpus, other design packet or preserved candidate
file changed. All three slices are independently reviewed and accepted; local
implementation and validation are complete. Publication remains pending explicit
approval in the originating reviewer chat; no push, PR, merge or deployment is
authorized by this local completion.
