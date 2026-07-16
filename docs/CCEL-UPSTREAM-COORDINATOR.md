# CCEL upstream coordinator (dormant rollout slice)

## Status

This is disabled infrastructure, not CCEL enablement.
`THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH` remains `false` in production and preview.
Stage A adds no public coordinator binding, no public coordinator client, and
no `THEOLOGAI_ENABLE_CCEL_COORDINATOR` flag. Those are strictly future Stage B
changes. `primary_source_search` remains local-only, and Stage A makes no CCEL
request.

## One-origin architecture

CCEL is one upstream origin, so it must have one global admission budget.
`theologai-ccel-coordinator` is the dedicated, non-public Worker prepared to own
the single SQLite Durable Object namespace. It has `workers_dev = false`, no
route, and a defense-in-depth 404 handler. Stage A must be merged and its owner
bootstrapped before Stage B adds either public binding. The Stage B target is:

| Public caller | Binding owner (`script_name`) | Namespace |
| --- | --- | --- |
| `theologai` | `theologai-ccel-coordinator` | shared |
| `theologai-preview` | `theologai-ccel-coordinator` | shared |

That future target is deliberate: preview must not create a second 10-second
budget against the same origin. The isolated coordinator-runtime test owns a
separate local-only namespace and cannot affect Cloudflare state.

The owner uses Wrangler's declarative export syntax:

```toml
[exports.CcelGlobalCoordinator]
type = "durable-object"
storage = "sqlite"
```

There is no legacy `[[migrations]]` block. Declarative export state is
authoritative for this brand-new owner and for the local test namespace.

## Admission and outcome contract

An admitted cache miss reserves the origin synchronously **before** its single
upstream GET begins. The minimum interval is 10,000 ms between admitted
attempts globally. A busy response exposes only a bounded integer
`retryAfterSeconds`—never queue position, request metadata, or another caller's
identity.

The coordinator accepts only:

- a content-free admission call;
- the numeric `(operatorEpoch, attemptId)` token it returned; and
- one outcome enum: success, transient failure, upstream 429 with a bounded
  Retry-After, policy failure, or interface failure.

Outcome reporting is first-write-wins per token. An exact replay is a duplicate;
a contradictory replay is a conflict. Neither can mutate circuit state or its
clock. Distinct tokens may report out of order, and distinct 429 responses merge
by retaining the longest absolute backoff. Reset advances the operator epoch,
so reports from the prior epoch are stale and non-mutating.

The SQLite terminal-attempt table stores only numeric token metadata, outcome
kind, and bounded Retry-After. It retains at most 64 recent rows. A persisted
contiguous watermark keeps older retired tokens non-mutating after their exact
outcome row is discarded. If more than 64 unresolved out-of-order terminal
records cannot be represented safely, the coordinator fails closed with an
interface latch instead of forgetting a token and risking a replay.

There is no parameter or persistence column for a search query, URL, HTML,
snippet, result, client identity, IP address, or user agent. Structured event
types exist for future telemetry, but this slice does not emit them.

## Durable behavior and circuit policy

RPC admission reads state, reserves `next_allowed_at_ms`, and writes that
reservation synchronously before returning. There are no alarms. State is read
from SQLite on every RPC, so eviction or restart cannot erase a reservation,
terminal token, or circuit transition.

- `closed`: ordinary 10-second admission spacing.
- `transient_backoff`: exponential 30-second to 10-minute backoff, then one
  bounded half-open probe.
- `rate_limited`: honor a validated 1–86,400 second Retry-After, then one
  bounded half-open probe.
- `latched_policy` / `latched_interface`: admit nothing until an operator has
  reviewed the condition and calls the internal reset pathway. No public route
  exposes reset.

Admission calculates its effective time as the greater of wall time and the
persisted last-observed floor. An admitted request, or an admission transition
that actually changes circuit state, persists that effective observation along
with its absolute reservation. Busy, latched, and probe-in-flight reads do not
advance the returned floor and cause no SQLite write. Persisted absolute
`next_allowed_at_ms` and backoff deadlines therefore remain the safety boundary
across restart and wall-clock rollback without rejected-call write
amplification. An expired half-open lease allows one replacement probe so a
crashed caller cannot wedge the origin forever.

## First reconciliation and release order

Do not merge or deploy Stage B's public bindings until the dedicated owner
exists. The only repository-owned creation path is the manual **Bootstrap CCEL
Coordinator** workflow. It has no push or pull-request trigger and is
initial-bootstrap-only.

Its unprotected validation job first requires the exact
`refs/heads/main` dispatch ref and confirmation
`BOOTSTRAP THEOLOGAI CCEL COORDINATOR`, then checks generated types,
typechecks, tests, and a Wrangler dry-run. Only successful validation makes the
dependent deploy job request approval for the protected `production`
environment. After approval grants the environment-scoped Cloudflare token and
account ID, an automated read-only API preflight requires the owner script to
be absent (`404`). An existing owner (`200`) or any unexpected response fails
the job automatically; the workflow never overwrites or reconciles an existing
owner.

For the first release, use two independently reviewable stages:

1. Merge Stage A only: the dedicated owner, declarative export, tests, generated
   types, documentation, and protected bootstrap workflow. Public production
   and preview configs remain unbound and deploy normally.
2. Dispatch **Bootstrap CCEL Coordinator** from `main` and enter the exact
   confirmation. Wait for the unprotected validation job to pass, then approve
   the dependent `production` environment job.
3. The approved job checks that `theologai-ccel-coordinator` is absent and, only
   after a `404`, creates the owner and its new `CcelGlobalCoordinator` SQLite
   export. Any existing or ambiguous state fails automatically.
4. Only after owner creation succeeds, open Stage B. It adds the dormant
   production and preview external bindings, the coordinator client, and a
   second false rollout flag. Both callers must retain the exact same
   `script_name`.
5. Run Stage B checks, authorize its protected preview deployment, and smoke
   test preview. Both flags remain false, so preview does not instantiate the
   Durable Object or contact CCEL.
6. After review and preview validation, merge Stage B and let the protected
   production workflow deploy the same external binding. Do not update the
   dedicated owner as part of a preview release.

Dry-runs validate configuration but do not prove that an external owner exists;
that is why release order is an explicit operator invariant.

## Persistence, rollback, and repair

The Durable Object namespace and its SQLite data outlive public Worker versions.
Rolling back `theologai` or `theologai-preview` does not roll back or delete the
coordinator. Removing a binding or owner config also does not authorize
deletion. A declarative deletion/tombstone is a destructive operation and must
never be added or executed without separate, explicit owner approval.

Prefer forward repair for owner code or SQLite schema faults. The bootstrap
workflow cannot perform that repair because its absent-owner preflight will
fail. Keep the owner deployed and all public enablement flags false, then use a
separately reviewed forward-repair workflow/change that validates compatibility
with the persisted schema. A public Worker rollback is safe only if its
configuration remains compatible with the persistent owner. Never create a
replacement namespace as an ad-hoc rollback: that would silently reset the
global origin budget.

## Node behavior

`ProcessLocalCcelUpstreamCoordinator` applies the same transition and terminal
idempotency rules and is disabled by default. An embedding application must
explicitly construct and inject an enabled instance. It coordinates only
callers sharing that instance in one OS process; separate Node processes are
not coordinated. A multi-process local deployment must use one process, route
CCEL discovery through a single coordinator service, or keep live discovery
disabled.

Once Stage B is bound and a later approved slice enables it, the global coordinator is intentionally a bottleneck: the maximum admitted
CCEL-origin load is 0.1 requests/second across production and preview combined.
Local corpus search remains independent if the circuit latches.
