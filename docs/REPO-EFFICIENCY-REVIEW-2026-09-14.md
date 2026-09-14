# Repository efficiency review — 2026-09-14

## Assessment and scope

The largest demonstrated opportunity is to run expensive verification when its
inputs change and reuse its implementation. The core application already has
reasonable service/repository separation and shared Node/Worker registration.
A broad rewrite would have less certain value than simplifying delivery and
separating maintained runtime, corpus preparation, and dormant experiments.

This review balances maintainability and CI/deployment speed. It inspected the
local checkout at `88a87df4d872a2c95b4063a12b3ad141757b8d4f`, architecture and
release documents, workflows, test configuration, representative runtime and
preparation modules, and GitHub job/step metadata. September 12 run timings are
newer operational observations, not proof that the local checkout equals main.
No runtime, workflow, credential, deployment, or infrastructure changes were
made. No full local test run or live endpoint/load/cost audit was performed.
Recommendations below are not claims of measured production latency savings.

## Measured baseline

Tracked text inventory (line counts include comments, fixtures and type declarations):

| Area | Files | Lines |
|---|---:|---:|
| `src` TypeScript | 176 | 32,667 |
| `scripts` TS/MJS/declarations | 119 | 42,307 |
| `test` TS and documentation | 294 | 65,672 |
| `docs` Markdown | 54 | 11,154 |
| GitHub workflow YAML | 12 | 3,381 |

Size is a maintenance signal, not proof of waste. In particular, corpus
provenance and two runtime implementations legitimately require extra tooling.

| Successful PR Checks run | Data job | Full local D1 import | Coverage step | Test & Build job |
|---|---:|---:|---:|---:|
| [September 7, PR #160](https://github.com/TJ-Frederick/TheologAI/actions/runs/34154509223) | 792s | 561s | 258s | 337s |
| [September 7, preview candidate](https://github.com/TJ-Frederick/TheologAI/actions/runs/34160141792) | 636s | 415s | 261s | 343s |
| [September 12](https://github.com/TJ-Frederick/TheologAI/actions/runs/34718171539) | 779s | 550s | 263s | 346s |

These are job/step elapsed times, not billed minutes or statistical percentiles.
Parallel job durations must not be summed to estimate user waiting time.
[PR #160](https://github.com/TJ-Frederick/TheologAI/pull/160) changed only
`docs/PHASE-3B-PLAN.md` and `docs/ROADMAP.md`. Its data job still took 13m12s.
The preview candidate additionally spent 260s checking remote D1 readiness in
a 419s preview deployment job. That is one observation, not a stable baseline.

## Prioritized findings

### 1. High: every PR runs full corpus reconstruction and import

Evidence: `.github/workflows/pr.yml:3` and `:71`. Five validation jobs run
without change classification. `labeled` also triggers the entire workflow,
and workflow-level cancellation can discard prior work when a label is added.

The full D1 import consumes 65–71% of the observed data-job time. This proves
real integration behavior, but repeating it for a planning-document edit does
not provide a corresponding increase in confidence.

Plan: add a small, tested change classifier with conservative categories:

* Documentation: documentation contracts, links/markers and affected metadata.
* Serving: types, behavior tests, transport/runtime contracts and relevant coverage.
* Corpus/storage: full fresh build, authority, seed reproduction and complete D1 import.
* Delivery/dependencies: workflow/script validation and the broader affected suites.

Unknown paths, classifier errors, package/lockfile changes, verifier changes,
and dependency-boundary changes should select the broader checks. Do not use
only `data/**`: shared kernel modules, repositories, migrations and import
tool versions can affect the corpus. Keep a periodic full run and require full
verification when preparing a changed corpus for release.

Keep an always-reported required aggregate check that explicitly distinguishes
intentional skips from failures/cancellations. Confirm actual repository rules
before changing check names. GitHub documents that workflow-level path skips
can leave required checks pending; use conditional jobs and a correctly
implemented aggregate instead. [GitHub required-check guidance](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

Split preview authorization from validation triggers. An unrelated label should
not rerun validation. A preview authorization event should consume successful
validation for the exact candidate and still recheck current authorization
immediately before mutation. Never equate a green run on an older head or a
different merge tree with validation of the candidate.

### 2. High: production repeats local validation serially after approval

Evidence: `.github/workflows/deploy.yml:349`, `:485–594`. The protected job
repeats types, database construction, seed reproduction/import, coverage,
integration, Workerd, build and conformance checks that PR jobs also perform.
There are meaningful differences: production invokes compiled HTTP directly,
whereas PR `test:e2e` also invokes stdio; audit policies also differ.

First extract a shared, unprivileged validation workflow used by PR and main.
Run it before the protected production job. This immediately reduces YAML drift
and approval-to-deployment delay, even if exact-main validation still reruns.
Keep credentials and mutation orchestration in explicit environment jobs.
[GitHub reusable-workflow guidance](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).

Only then consider reusing validation evidence across PR and merge. Bind reuse
to the exact tree, workflow/verifier version, lockfile/toolchain and corpus
identity; require trusted run provenance and an explicit freshness policy.
Revalidate when the merge changes the tree. A generic cache hit is not release
authorization. Compare implementation complexity with minutes saved before
adding another elaborate receipt system.

### 3. High: full local D1 verification launches Wrangler repeatedly

Evidence: `scripts/verify-d1-seed-workerd.ts:41–113`. It starts a new Wrangler
process for each seed file and again for each authority-query page. The
complete import itself is valuable; repeated CLI/runtime startup is a plausible
additional cost, not yet separately measured.

Instrument startup, statement execution and authority query time. Prototype a
single persistent isolated local runtime for authority reads, or bounded query
batching, while preserving complete statement import and equivalent authority
results. Do not parallelize ordered imports into the same database. Retain the
current path as a comparison until equivalence and actual speedup are proven.
Do not substitute a sampled import for full relational verification.

There is also confirmed duplicate construction: PR CI builds a database at
`:124`, then `audit:release-corpus-capacity` builds and semantically verifies a
second disposable database (`scripts/release-corpus-capacity.ts:407`). That
step cost 56–58 seconds in the sample. Let the capacity workflow own the one
fresh build and expose its verified pre-VACUUM artifact, or add a carefully
defined fresh-artifact input. Preserve the existing capacity-failure diagnostics
and run VACUUM diagnostics only on a copy. Savings will be less than the whole
step because measurement and semantic verification still have value.

### 4. High: release eligibility is discovered too late

Evidence: production requires a fresh protected preview receipt at
`.github/workflows/deploy.yml:270`, while PR preview is optional behind
`deploy-preview` at `.github/workflows/pr.yml:241`.
[September 12 production run](https://github.com/TJ-Frederick/TheologAI/actions/runs/34718850081)
passed classification and plan verification but failed the preview-evidence
resolution step; deployment was skipped.

This is a correct refusal to deploy, not evidence that the gate should be
deleted. Expose a concise pre-merge release-eligibility result using the same
decision logic: no deployment needed, preview evidence required, or candidate
ready. Decide explicitly whether main is intended to be continuously
deployable or may contain repository-only work. For the latter, make release
promotion an explicit operation so ordinary merges do not predictably generate
failed deployment runs. Keep post-approval identity and authorization checks.

### 5. Medium: workflow tests preserve implementation text too precisely

Evidence: `test/unit/config/workflowTopology.test.ts:8–160` manually slices YAML
by indentation and asserts exact job lists, step names, command strings and
embedded shell fragments. `customDomainConfig.test.ts` similarly searches raw
TOML. This makes harmless restructuring expensive and text presence cannot
prove that a shell branch actually enforces its policy.

Parse YAML/TOML for structure; move nontrivial decision logic into tested
scripts. Keep invariant tests for privilege isolation, required dependencies,
serialization and failure propagation. Exercise decisions with malformed,
stale, wrong-source and revoked-authorization cases. A harmless display-name
change should pass; a path to deployment without the gate must fail.
Do not remove the useful TypeScript AST architecture-boundary checks.

### 6. Medium: preparation and dormant features inflate the maintained surface

Evidence: `docs/ARCHITECTURE.md` already lists six dormant work areas;
`test/README.md` records 50 legacy-orphan files. The largest serving-tree file
is the 1,278-line CCEL adapter. The 1,093-line collection-package foundation is
referenced by the Aquinas dry compiler, while `tsconfig.json` broadly includes
`src/**/*`. These are candidates for clearer ownership, not automatic deletion.

One concrete coupling is `src/kernel/editionProvenanceFoundation.ts`: 907 lines
combine package/rights validation, compilation and Markdown escaping. Runtime
formatters import its escaping functions even though its header calls it an
inactive foundation. Extract shared text behavior into a small neutral module;
separate compiler implementation from runtime primitives. Verify output byte
identity and import/bundle boundaries. Tree shaking means source size alone
does not establish Worker bundle cost.

For dormant work, choose retain-with-budget, preparation-only, or retire based
on intended product value and actual callers. Keep frozen evidence reproducible.
Retire quarantined tests through a reviewed inventory change; do not migrate
all 50 merely to make them executable. Avoid introducing a monorepo or new
services simply to move these files.

### 7. Medium: historical release prose dominates entry documentation

Evidence: `README.md:82` onward carries extensive historical identities and
audit narratives despite directing current identity to `CURRENT-RELEASE.md`.
The development guide and runbooks repeat some of the same history.

Keep the README focused on installation, capabilities, endpoints and architecture.
Move dated narratives to an indexed release-history location, retaining links
and provenance. Maintain one compact current assignment record and one concise
operator runbook. Update documentation contract tests with the move. Historical
evidence should be preserved without repeatedly editing many entry documents.
Artifact expiry and rollback custody remain separate decisions; this is not a
recommendation to delete remote evidence or old databases.

### 8. Lower priority: runtime optimization needs measurements first

`src/mcp/tools.ts:26` looks up validators for every tool at registration;
`src/mcp/validation.ts:44` serializes schemas even on cache hits. The Worker
constructs the composition root and server per request. Stable immutable schema
objects could avoid repeated serialization while keeping per-request state
isolated. Benchmark registration CPU before changing this: validators already
cache compilation, and eleven-tool linear lookup is not a demonstrated problem.

`LocalPrimarySourceSearchProvider.ts:23–69` queries the catalog and formats each
returned section to compute its exact resource size. Consider request-local
catalog reuse and precomputed size metadata only after profiling realistic
multi-query research plans. Preserve exact byte sizing, result limits and
source identity. Do not weaken input/output validation to save hypothetical CPU.

For TechOps, use the existing privacy-conscious request/tool events to measure
latency, error rate and release health. Establish routine dashboards and a short
release summary before making manual tails part of ordinary release work.
The long tails described in old release records are historical observations;
this review did not find proof they are a current mandatory CI step. Account
logging cost, D1 inventory cost and actual alert coverage remain unmeasured.

## Implementation sequence and acceptance

| Slice | Work | Acceptance |
|---|---|---|
| 1: CI routing | Baseline job timings; classify changes; narrow label triggers; stable required aggregate | Docs-only changes avoid database build/import; changed corpus/verifier/toolchain still selects full checks; classifier errors and cancelled required jobs cannot pass |
| 2: remove duplicated work | One fresh DB for capacity/verification; remove repeated Worker-runtime typecheck and unused fresh-data Node build; shared validation workflow | Equivalent artifacts and failure diagnostics; same transport coverage; local validation happens outside the production environment |
| 3: improve release flow | Pre-merge eligibility summary; explicit release-intent policy; concise operator result | Missing/stale preview evidence is visible before release; changed heads invalidate evidence; authorization and environment isolation remain enforced |
| 4: speed full verification | Measure Wrangler startup/query costs; prototype persistent local authority reads or bounded batches | Complete import and authority results match existing runner on current corpus and negative fixtures; record elapsed-time comparison |
| 5: reduce maintenance friction | Semantic workflow tests; small text/compilation separation; focused dormant-work decisions; documentation relocation | Harmless formatting changes pass, unsafe workflow mutations fail, runtime output stays identical, historical evidence stays accessible |
| 6: selective runtime work | Benchmark schema registration and multi-query catalog/formatting work | Land only demonstrated CPU/query/allocation improvements with equivalent public contracts |

Initial targets, not promises: documentation feedback under two minutes;
ordinary serving-change feedback near the existing 5–6-minute Test & Build
path when full corpus verification is irrelevant. Full corpus changes retain
their strong checks until the optimized runner proves equivalence. Measure
runner-seconds and user wait separately over a larger run sample, including
queue time, cancellations, failures and approval delay.

Keep: source-rights/provenance checks, changed-corpus reproduction, complete
import validation, genuine Node/Workerd coverage, protected environments,
current authorization, matched Worker/D1 identity, and bounded live audits.
The goal is fewer redundant executions and fewer independently maintained
implementations of those protections.


## Implementation follow-through

The authorized implementation makes production promotion manual while preserving
existing protected release decisions. The five configured required check names
remain unchanged; repository rules were inspected, not edited.

Implemented locally:

* Dependency-free PR change classification: docs, positively identified serving
  paths, or full validation for corpus/delivery/dependencies/unknown paths.
  Renames consider both paths. Malformed evidence fails the classifier and the
  required jobs; no implicit skip can turn that failure into success.
* Shared validation commands in `.github/actions/validate/action.yml`, with a
  reusable unprivileged production validation workflow. Production checks its
  preview receipt before starting costly local validation, then independently
  revalidates protected evidence after approval as before.
* A weekly full validation run. Documentation-only changes keep the five
  required contexts but omit unrelated work inside successful wrapper jobs.
* Unrelated labels no longer cancel substantive validation or redeploy preview.
  All suites still run for label events; eliminating these executions
  safely would require separate preview routing or exact-run evidence reuse.
  That larger reuse mechanism remains deferred as agreed.
* A fresh capacity-verified pre-VACUUM database can be passed to downstream
  checks. The command refuses overwrite and does not accept unverified database
  inputs; capacity failures retain diagnostics and publish no artifact.
* Workflow tests now inspect parsed structure and execute failure/selection
  guards; TOML assertions inspect parsed configuration. Runtime text helpers
  were separated without changing compiler hashes or formatter behavior.
* Historical README evidence moved to `RELEASE-HISTORY.md`, with relative links
  corrected. The active release snapshot remains unchanged.
* A pre-merge release-eligibility summary distinguishes missing preview proof,
  failed validation, a different merge tree and a candidate ready for protected
  verification. It is informational, not new release authorization.

Retirement recommendations are in [DORMANT-WORK-MAINTENANCE.md](DORMANT-WORK-MAINTENANCE.md).
The owner requested a separate retirement decision; no features, source
packets, live databases or historical artifacts have been retired. The owner approved explicit production promotion: merges no longer trigger
Deploy Production. The existing main-only manual dispatch, preview evidence,
full validation, and protected approval remain required.

### Final local verification

* Full coverage: 207 test files passed; 2,672 tests passed and 5 skipped.
  Coverage thresholds passed: 90.94% lines, 91.98% functions, 81.12% branches.
* Complete TypeScript matrix passed, including release scripts, Node, Worker,
  coordinator, and tests. The separate E2E typecheck also passed.
* Shared integration (3 tests), Worker runtime (26 tests), coordinator runtime
  (17 tests), compiled Node HTTP/stdio, Worker bundle exclusion, production-like
  Worker contracts for both protocol versions, and applicable MCP conformance
  all passed.
* Fresh capacity artifact: 306,970,624 bytes before VACUUM, within the
  367,001,600-byte limit. Import parity reconstructed all 42 tables from 49
  ordered seed files and matched them against that fresh artifact.
* Serial and batched full local Workerd seed verification both passed.
  Four-query authority batches reduced Wrangler authority commands from 182
  to 46, authority time from 141.707s to 38.748s, and total time from 242.69s
  to 141.47s (41.7%). All seed statements and bounded authority pages remain
  checked. Negative tests cover missing/extra/failed batch results and changed
  continuation keys. See the [baseline](CI-EFFICIENCY-BASELINE-2026-09-14.md)
  for method and comparison evidence.
* Actionlint passed for all three changed/new workflows; `git diff --check`
  passed. Parsed topology tests check dependencies and execute failure guards.

These are local results; hosted Actions execution, approval timing, and net
runner savings still need measurement after publication. These results preceded publication. The owner subsequently authorized pushing,
opening a PR, and merging after successful checks and review; actual production
deployment remains a separate operation.
