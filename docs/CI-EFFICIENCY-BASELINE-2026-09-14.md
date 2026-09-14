# CI efficiency baseline — 2026-09-14

This is a read-only baseline from GitHub Actions metadata and the checked-in
workflow definitions. It uses twelve recent runs from 2026-09-06 through
2026-09-12, with emphasis on PR Checks and the immediately associated
production runs. No Cloudflare credentials, live endpoints, or secrets were
used.

## Observed timing

Successful PR Checks runs consistently take about 12m45s–14m10s from run
creation to completion. The first runner starts about 3s–68s after creation in
the sampled runs; this is queue/setup latency, not test execution. The latest
successful run was [34718171539](https://github.com/TJ-Frederick/TheologAI/actions/runs/34718171539):
created 20:48:39Z, first jobs started 20:49:47Z, and the run completed 21:02:48Z.
Its wall time was 14m09s, queue-to-first-runner time was 1m08s, and the sum of
parallel job runner time was approximately 22m24s.

| PR Checks run | Result | Wall time | Longest job | Other job durations |
|---|---:|---:|---:|---|
| [34718171539](https://github.com/TJ-Frederick/TheologAI/actions/runs/34718171539) | success | 14m09s | Fresh Checkout & Data 12m59s | Test & Build 5m46s; Node E2E 2m15s; Worker/D1 49s; conformance 35s |
| [34154509223](https://github.com/TJ-Frederick/TheologAI/actions/runs/34154509223) | success | 13m16s | Fresh Checkout & Data 13m12s | Test & Build 5m37s; Node E2E 2m11s; Worker/D1 56s |
| [34057961446](https://github.com/TJ-Frederick/TheologAI/actions/runs/34057961446) | success | 12m48s | Fresh Checkout & Data 12m46s | Test & Build 5m41s; Node E2E 2m03s; Worker/D1 50s; conformance 38s |
| [34057152982](https://github.com/TJ-Frederick/TheologAI/actions/runs/34057152982) | success | 12m48s | Fresh Checkout & Data 12m44s | Test & Build 4m14s; Node E2E 2m18s; Worker/D1 43s; conformance 33s |
| [34056380685](https://github.com/TJ-Frederick/TheologAI/actions/runs/34056380685) | success | 12m47s | Fresh Checkout & Data 12m44s | Test & Build 5m42s; Node E2E 2m12s; Worker/D1 51s; conformance 38s |

The runner-time sum exceeds wall time because the five substantive jobs run
in parallel. Fresh Checkout & Data is the critical path in every successful
sample. It spends roughly 26s building SQLite, about 56–58s in the release
corpus-capacity audit (which builds/verifies its own disposable database), and
about 9m importing the generated seed through local D1 in the latest run.
The exact substep split varies, but the import is the dominant measured
operation.

The PR concurrency group cancels superseded revisions. Recent examples include
[34717714551](https://github.com/TJ-Frederick/TheologAI/actions/runs/34717714551),
[34717857700](https://github.com/TJ-Frederick/TheologAI/actions/runs/34717857700),
[34159403638](https://github.com/TJ-Frederick/TheologAI/actions/runs/34159403638),
and [34159533612](https://github.com/TJ-Frederick/TheologAI/actions/runs/34159533612).
Those runs still consumed approximately 2m–7m of runner time before a newer
revision displaced them. This is useful protection against stale results, but
it increases the value of early change classification and fast failure.

Production runs are short when they skip deployment: the successful
[34155432072](https://github.com/TJ-Frederick/TheologAI/actions/runs/34155432072)
took about 40s wall time. The failed protected runs
[34058661602](https://github.com/TJ-Frederick/TheologAI/actions/runs/34058661602)
and [34718850081](https://github.com/TJ-Frederick/TheologAI/actions/runs/34718850081)
spent about 49–60s before refusing deployment because fresh protected preview
evidence was unavailable. This is an eligibility-discovery issue rather than
a slow deployment step.

## Check-to-input map

`PR Checks` has no `paths` or `paths-ignore` filter. Any opened, synchronized,
reopened, labeled, or ready-for-review event on a PR targeting `main` schedules
all five substantive jobs:

| Check/job | Current inputs and work | Conservative routing recommendation |
|---|---|---|
| Test & Build | TypeScript sources, tests, package manifests/lockfile, Worker configs, release scripts, and build output; unit coverage and integration tests | Run for source, test, config, workflow, package, and build-affecting changes. Documentation-only changes can skip it if an aggregate required check remains reportable. |
| Fresh Checkout & Data | All tracked data manifests and source packs, database compiler/verifiers, D1 seed/export/import scripts, historical compatibility evidence, primary-source benchmark | Run for `data/**`, database/compiler/seed/identity scripts, relevant configs/workflows, and changes to shared runtime code that consumes the corpus. Keep a periodic full-corpus run. |
| Worker Runtime & D1 | Worker runtime tests, coordinator runtime tests, production-like Worker bundle checks | Run for `src/**`, Worker/coordinator configs, runtime tests, package files, and relevant workflows. |
| Node HTTP E2E | `npm run test:e2e`, which builds and exercises compiled HTTP and stdio paths | Run for Node server, MCP registration, transport, build, package, and test changes. |
| Applicable MCP Conformance | Official MCP scenarios and result artifact upload | Run for MCP protocol/server/transport changes, package/tool schema changes, and workflows. |
| Deploy Preview | Optional `deploy-preview` label; needs all five substantive jobs and a non-draft same-repository PR | Keep authorization separate from validation. A label event should consume exact-head green validation and recheck authorization immediately before mutation. |

The separate Biblical Language Source Reproduction workflow already demonstrates
path-aware routing for its specialized corpus and script inputs, plus a monthly
scheduled run. Its path list includes the workflow, biblical-language sources,
manifest, reproduction/compiler scripts, relevant tests, and package files.
That pattern is a good starting point for a shared classifier, but unknown
paths and classifier failures should conservatively select the full suite.

## Efficiency opportunities supported by this baseline

1. Make PR routing change-aware while keeping a required aggregate check that
   reports intentional skips distinctly from failures. Do not use workflow-level
   path skips for required checks, because GitHub can leave those checks pending.
2. Remove duplicate database construction. The ordinary `build:db` step and
   `audit:release-corpus-capacity` both create disposable databases. Let one
   verified build produce the artifact consumed by capacity and downstream
   checks, retaining the current full semantic checks.
3. Treat local D1 import as the first optimization target. Instrument startup,
   import statements, and authority queries before changing behavior. Preserve
   ordered import and complete seed verification; compare a persistent runtime
   or bounded batching prototype against the current path.
4. Share unprivileged validation between PR and main workflows before attempting
   cross-run evidence reuse. Any later reuse must bind to exact source tree,
   lockfile/toolchain, workflow/verifier version, corpus identity, trusted run
   provenance, and freshness policy.
5. Surface production release eligibility before merge. The two recent protected
   refusals show that a required preview receipt can be absent even when PR
   checks are green. Preserve the protected refusal and identity checks.
6. Keep cancellation, but improve fast-fail ordering and avoid rerunning
   expensive corpus checks for documentation-only or unrelated label changes.

## Limits

GitHub's run metadata exposes job start/completion times, but not complete
host-level CPU, billing-minute, cache-hit, or queue-depth data. The timings are
therefore useful for critical-path prioritization and runner-cost estimates,
not a precise invoice. The substep observations are from successful runs and
should be remeasured after each CI change.

## Local Workerd authority-read batching experiment

On 2026-09-14, a freshly built local database was exported to 49 deterministic
seed files (1,630,260 rows), then imported sequentially through Wrangler 4.114.0
under Node 22.23.1. Both runs used a new local `--persist-to` directory,
`--env-file /dev/null`, the same seed, the same complete ordered import, the
same readiness query, and the same Transform-8/Transform-11 authority audits.
Neither run contacted Cloudflare.

| Authority mode | Total | Seed import | Authority reads | Wrangler authority commands | Result |
|---|---:|---:|---:|---:|---|
| Serial baseline | 242.69s | 91.060s | 141.707s | 182 | passed |
| Four-query batches | 141.47s | 92.670s | 38.748s | 46 | passed |

The bounded batching prototype reduced authority-read time by 102.959s (72.7%)
and end-to-end time by 101.22s (41.7%) in this local measurement. It does not
parallelize imports or queries against the same database. Each original
keyset page remains independently decoded, response-bounded, and replayed
through the existing audit; an actual changed continuation key fails the
planned-query replay.

Both accepted audit outputs had the same required page counts: Transform-8
`1/12/12`, and Transform-11 `1/1/1/1/1/1/133/17`. Their successful canonical
comparison hashes, derived from the checked-out authority inputs that both
audits require before returning success, were:

```json
{
  "transform8": {
    "attestation": "6bcf59c252a2fa90661a7307f52ca36e19e0bced42a6a850140e5e63b75689b2",
    "profiles": "9268a184a690bc93028be19e1951fd92754a10240bedf4b663505877ef399fe3",
    "identities": "920c50f41b4eb2d4b68b01ea4dd6b0179e616e3a49fcd892c22a92b8b76c1322",
    "aliases": "bc348e79ab31d72df26e0d49e2c03d7473e55ec7cfb448cbf7f6524fbb19f93c",
    "bodyFtsSample": "d579c6c765caea8e29c18053c2aa479522e3716ab84cf1153b8d7a36727242cb"
  },
  "transform11": {
    "packs": "a64a51251fd416efe79e3832abd2d847e1758c66425b7eedcbf9d3fe57cba2de",
    "works": "5e8655b3f5d78915c2626f0bae6d3e05481afb53d90e514518af691eea0652be",
    "editions": "6a58733b1daebed55504ad66a55e0c563c3fe83d72dd828f0240b0d4e9e5e85a",
    "artifacts": "377544afc6e134aeeab7304bafdda72e23b1b677ff961570f7e8f7e2fd4d3543",
    "documents": "d43f79328dab57a04c5de762647d3326a432962ef1efd42608915f3484dbcaa3",
    "profiles": "cd6423d3921e28148b8b4c590ae855f446d9883a9c9030b9ee2c890ea741ef3b",
    "sections": "b903edee19b58fd86f64ad349d6c02a0f142d2d243634760e17cd6ea3b5328bc",
    "projections": "1ed343e3c0a86d531abc00d6d64330588fdd2f8c0039bf51b1088d8eb94f9930"
  }
}
```
