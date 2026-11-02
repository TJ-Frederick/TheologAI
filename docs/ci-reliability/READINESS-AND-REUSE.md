# Offline preparation and evidence invalidation

This maps remaining work from the original audit. It changes no release gate or operational
authority. The narrow current reuse is the capacity verifier's fresh output within one Data
job; it does not admit a previous run's database or receipt.

## Preparation gap

Hosted core/Data preflight now rejects shallow or missing reachable history and verifies
exact merge parents before installation. Protected source admission checks live source,
ordinary CI and source artifacts before approval. The local operator still has only prose
instructions to prepare its independent checkout and separately locked release toolchain.
Discovering missing history or native SQLite/runtime incompatibility inside the short
challenge window wastes an approved operation opportunity.

The local verification command is
[`operator-readiness.cjs`](../../.github/scripts/operator-readiness.cjs). It checks an already
prepared independent clone and isolated toolchain before dispatch/approval, without fetching,
installing, auditing online, repairing Git, authenticating or invoking cloud operations.
Installation is a separate preparation step using the existing approved-base release action's
exact trust set and audit/native-build recipe. The helper establishes:

- An independent clean checkout of the exact candidate commit/tree, with no shared object
  dependency, shallow/partial history or missing required baseline/reachable objects. A
  checkout-only repair must preserve the original workspace and evidence.
- The exact approved base and source artifact/plan identity; synthetic merge validation and
  source-head artifacts retain their distinct existing roles. Live GitHub identity must still
  be rechecked at the existing admission boundaries.
- A separate clean release-toolchain installation from the approved protected base's exact
  package/lock/runtime files, without the application's root dependency graph or credentials.
  The existing separate audit and single allowed native SQLite build remain required. The
  installed graph/runtime check does not cryptographically verify installed package files.
- Actual runtime/tool resolution, usable SQLite and local source-plan commands from that
  prepared checkout. Record source/tree/base, runtime and lock/artifact hashes in the existing
  task evidence. A preparation result is not an authorization, freshness waiver or remote proof.

The command is run under the exact approved-base Node executable, from the independent
source clone. The supplied toolchain path must be the installation prefix; canonical file
identity is checked separately. This distinction matters for npm's macOS `/var` alias handling.

```bash
"$PINNED_NODE" .github/scripts/operator-readiness.cjs \
  --source "$SOURCE_COMMIT" --tree "$SOURCE_TREE" --base "$BASE_COMMIT" \
  --toolchain "$RELEASE_TOOLCHAIN_DIRECTORY"
```

Use the actual complete runtime installation with its bundled npm. Install the release
toolchain into a separate new directory from `BASE_COMMIT`'s exact
`.github/release-toolchain/package.json` and `package-lock.json`; preserve those bytes. Use
that runtime's Node executable to invoke its npm CLI, with `ci --ignore-scripts --no-audit
--fund=false`, the existing lockfile-only high audit, then only the allowed `better-sqlite3`
native rebuild. Keep user/global npm configuration empty and separate and place caches in
the preparation directory where needed. The helper itself performs none of those steps.
Link the source root's `node_modules` only to this toolchain's `node_modules`, as the existing
release action does. The verifier permits only this exactly bound dependency link alongside
otherwise clean source; arbitrary untracked files or an application dependency graph fail.

Use `git clone --no-local --no-hardlinks` to create the independent operator clone, then check
out the reviewed source commit. Do not use a shared clone, worktree, sparse/partial checkout,
alternates or original object storage for this operator preparation. This is a requirement of
the operator preparation workflow, not a general policy for development worktrees. The helper
disables lazy fetch/replacements and optional Git writes; incomplete history fails without repair.

If source artifacts are available, provide **both** `--artifact-directory DIRECTORY` and
`--plan-sha256 SHA256`. The helper checks the plan's digest/classification/bounds, source DB
digest and corpus metadata. Missing both reports `not_performed`; supplying invalid or only
one input fails. These local bindings never establish native hosted provenance, which remains
the job of the existing hosted admission. The helper never creates a ledger, challenge, grant,
reservation or protected gate. Its small factual stdout summary belongs with existing task
evidence and is not an admission token or reusable authorization.

Local verification passed 26 focused tests plus seven topology tests, strict script types,
documentation (14 tests), syntax and whitespace checks. The actual CLI rehearsal used an
independent full clone of `ef26d39`, a complete Node 22.23.4 runtime and the exact base's
separately installed release toolchain (101 packages, zero audit vulnerabilities, native
SQLite 3.51.2). It passed 18 cases: three positives and 15 refusals, including wrong runtime,
lock/source/artifact mismatch, an application graph, missing dependencies/native addon and
invalid corpus metadata. The Git index stayed unchanged and original artifacts were preserved.
The CLI ran with synthetic caller auth/Git overrides that were excluded from child probes;
no cloud operation was invoked. Retained
[rehearsal evidence](../../test-output/ci-reliability-remediation/readiness/cli-rehearsal.json)
and per-case logs distinguish absent artifacts from invalid supplied inputs. Independent
pre-publication review approved the slice, passed all 26 focused tests and verified eight
changed-file and 26 evidence hashes. Ordinary CI and readiness on the final committed
source are recorded separately in the same retained evidence directory.

This is a local preparation check; live GitHub/source/artifact freshness, owner authorization, cloud quota,
target controls, complete proofs and protected approvals remain separate unchanged boundaries.

## Invalidation matrix

| Change | Evidence that can remain useful | Evidence that must be renewed |
|---|---|---|
| Checkout-only repair, exact same commit/tree and locked toolchain | Immutable source artifacts and prior local results remain diagnostic evidence after their identities/hashes are authenticated. Original ledgers/journals stay authoritative for consumed or outstanding costs. | Independent usable-history/readiness checks in the repaired location; any checks affected by the original incomplete checkout. Live source, artifact availability, authority, freshness and protected approval remain checked at their existing boundaries. |
| Workflow or source correction | Old reports/logs are retained for comparison and diagnosis. Unchanged local artifact content may be compared by hash. | Exact-source ordinary CI and affected practical checks; hosted source artifacts and source-plan identity. No old operational authorization/challenge/receipt is rebound to the new source. |
| Root dependency, release dependency, runtime or lock change | Source-only evidence unrelated to the dependency may explain history. | Installation/audit, native/runtime readiness and all affected checks under the correct trust set. Root and isolated release dependencies are verified separately. |
| Budget-only authorization | Unchanged exact-source ordinary CI/source artifacts may remain eligible only under their existing live identity/freshness/retention rules. Existing journals retain all spent and unresolved reservations. | Explicit owner decision with cumulative costs and outstanding reservations; new operation identity, native admission, ledger and fresh complete target proof. No counter reset or inferred additional allowance. |
| Remote target or write custody changed/unknown | Prior remote evidence remains historical. | A separately authorized fresh complete proof for that exact target. Preview proof remains a separate prerequisite and never replaces production proof. |

This matrix permits evidence to remain explanatory; it does not implement automatic
acceptance/recovery. The existing gates still decide acceptance. Cross-run local reuse beyond
the reviewed same-job output handoff is not implemented. Remote proof reuse is deferred
without credible unchanged-write custody, and any proposed reduction in assurance requires
Tyler's decision.
