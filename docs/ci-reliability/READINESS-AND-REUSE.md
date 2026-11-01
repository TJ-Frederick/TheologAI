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

The next small local preparation command should fail before dispatch/approval unless it
can establish all of these without cloud credentials:

- An independent clean checkout of the exact candidate commit/tree, with no shared object
  dependency, shallow/partial history or missing required baseline/reachable objects. A
  checkout-only repair must preserve the original workspace and evidence.
- The exact approved base and source artifact/plan identity; synthetic merge validation and
  source-head artifacts retain their distinct existing roles. Live GitHub identity must still
  be rechecked at the existing admission boundaries.
- A separate clean release-toolchain installation from the approved protected base's exact
  package/lock/runtime files, without the application's root dependency graph or credentials.
  The existing audit and single allowed native SQLite build remain required.
- Actual runtime/tool resolution, usable SQLite and local source-plan commands from that
  prepared checkout. Record source/tree/base, runtime and lock/artifact hashes in the existing
  task evidence. A preparation result is not an authorization, freshness waiver or remote proof.

Do not turn this into a generalized cache or release framework. A concrete command and
failure-mode tests still need implementation/review; this checklist alone does not close the
offline readiness gap.

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
