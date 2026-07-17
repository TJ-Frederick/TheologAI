# CCEL upstream coordinator (staged rollout)

## Status

This remains an exposure-only preview stage, not CCEL enablement. Production
keeps `THEOLOGAI_EXPOSE_CCEL_DISCOVERY`,
`THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH`, and
`THEOLOGAI_ENABLE_CCEL_COORDINATOR` all `false`, so its public contract remains
v4/local-only. Preview sets only `THEOLOGAI_EXPOSE_CCEL_DISCOVERY` to `true`;
its live-search and coordinator switches remain `false`. Preview therefore
advertises the v5 discovery contract and guided workflows, but every external
query returns a disabled provider result without adapter search, Durable Object
lookup/RPC, or network access. No CCEL request is authorized by this stage.

## One-origin architecture

CCEL is one upstream origin, so it must have one global admission budget.
`theologai-ccel-coordinator` is the dedicated, non-public Worker that owns the
single SQLite Durable Object namespace. It has `workers_dev = false`, no route,
and a defense-in-depth 404 handler. Stage A must be merged and its owner
bootstrapped before this Stage B binding commit is published. Both public
Workers then bind externally to the same owner:

| Public caller | Binding owner (`script_name`) | Namespace |
| --- | --- | --- |
| `theologai` | `theologai-ccel-coordinator` | shared |
| `theologai-preview` | `theologai-ccel-coordinator` | shared |

This is deliberate: preview must not create a second 10-second budget against
the same origin. The isolated coordinator-runtime test owns a separate local-only
namespace and cannot affect Cloudflare state.

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
types and operator logs remain content-free.

## Protected observation and reset

The public Workers include a non-MCP `POST /internal/ccel-coordinator` route.
It is inert and returns the same non-cacheable 404 for every failure unless an
environment-specific `THEOLOGAI_CCEL_OPERATOR_TOKEN` secret is explicitly
provisioned. Preview and production do not inherit one another's secret. The
route has no CORS support and accepts only bounded JSON plus HMAC-SHA256 headers.
The signature covers the exact method, path, timestamp, nonce, and request body;
requests also name the exact live Cloudflare Worker version ID.

Before reading the body or performing HMAC work, a dedicated fail-closed
Cloudflare limiter permits 12 authentication attempts per minute for the hash
of the connecting IP plus user agent. Production and preview use separate
namespaces, and neither shares counters or keyspace with anonymous MCP traffic.
This keeps hostile fingerprints from consuming the GitHub operator runner's
fingerprint while bounding unauthenticated crypto/body work. Limiter failure,
missing fingerprint inputs, and exhaustion retain the same constant 404.

Snapshot is read-only. Reset accepts only `latched_policy` or
`latched_interface` and requires the exact observed state and `operatorEpoch`.
The Durable Object checks both and advances the epoch in the same SQLite
transaction, so replay cannot reset a later state. Closed, transient-backoff,
and rate-limited states cannot be reset through this route. Successful auth is
outside the anonymous MCP limiter; unrelated hostile fingerprints cannot spend
the operator runner's dedicated pre-auth budget. Logs contain only action,
outcome, circuit state, epoch, and Worker
version—never the secret, signature, nonce, request body, query, content, or
identity.

The manual **Operate CCEL Coordinator** workflow is main-only, protected by the
`production` environment, and requires an exact confirmation, version UUID,
and reset preconditions. Both public Workers bind to the same Durable Object,
so a reset through either environment affects the one shared upstream circuit.
The Worker secret and the GitHub `production` environment secret must contain
the same key. Provisioning either is a separate, explicit owner operation;
checked-in configuration remains inert, and an absent Worker secret remains a
constant-shaped 404.

The exact staged provisioning, independent promotion, equality audit, and
non-destructive rollback gates are defined in
[CCEL-OPERATOR-SECRET-PROVISIONING.md](./CCEL-OPERATOR-SECRET-PROVISIONING.md).
Generic agreement does not authorize either secret write. Plain
`wrangler secret put` is deliberately excluded because it creates and deploys
a Worker version immediately.

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
  reviewed the condition and calls the signed internal reset pathway. No
  anonymous or MCP route exposes reset.

Admission calculates its effective time as the greater of wall time and the
persisted last-observed floor. An admitted request, or an admission transition
that actually changes circuit state, persists that effective observation along
with its absolute reservation. Busy, latched, and probe-in-flight reads do not
advance the returned floor and cause no SQLite write. Persisted absolute
`next_allowed_at_ms` and backoff deadlines therefore remain the safety boundary
across restart and wall-clock rollback without rejected-call write
amplification. If an absolute reservation, probe lease, or outcome backoff
would exceed JavaScript's maximum safe integer timestamp, the coordinator
latches `latched_interface` before admitting or exposing an already-expired
deadline. An expired half-open lease allows one replacement probe so a crashed
caller cannot wedge the origin forever.

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

The coordinator foundation used two independently reviewable stages:

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

Stage C then published the v4 contract and execution wiring with all public
flags false. Stage D is a separate preview-only hard cutover of the exposure
flag: review and deploy it through the protected preview environment, verify
the advertised tool and prompt schemas, and confirm external calls return
`disabled`. Do not change either execution flag, update the coordinator owner,
or approve live search in this stage. Production remains on v3 until a later,
separately reviewed cutover.

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

## Staged v5 contract wiring

The public Worker and Node composition roots share one contract configuration.
The v5 discovery application contract is exposed only by
`THEOLOGAI_EXPOSE_CCEL_DISCOVERY`; an origin attempt additionally requires both
live-search and coordinator switches. The sole live predicate is therefore all
three switches together. Any false switch leaves the external adapter,
Durable Object lookup, and network path untouched.

Each runtime retains one module-scoped executor/cache and supplies its
request-appropriate coordinator only at the external search call. The executor
orders work as validation, cache, local capacity, admission, one fetch, one
terminal outcome, then optional cache. In coordinated mode the coordinator is
the sole latch/backoff/circuit authority. Node coordination is process-local;
multi-process Node deployments must keep live discovery disabled unless they
provide one shared coordinator.

Checked-in production values select the local-only v4 contract. Checked-in
preview values select v5 exposure only; because the live-search and coordinator
values remain false, preview also makes no CCEL request or Durable Object RPC.

MCP clients can cache `tools/list` and `prompts/list` results for the life of a
connection. This is a hard contract cutover rather than a negotiated opt-in, so
reconnect and reinitialize a preview client after deployment before auditing
the v5 schemas and workflows. Do not interpret a stale client schema as the
Worker's current contract.

Once Stage B is bound and a later approved slice enables it, the global coordinator is intentionally a bottleneck: the maximum admitted
CCEL-origin load is 0.1 requests/second across production and preview combined.
Local corpus search remains independent if the circuit latches.

The adapter returns a bounded integer `retryAfterSeconds` on every v5
`rate_limited` provider result. Guided primary-source research issues at most
one CCEL-bearing call per prompt materialization and defers additional creator
scopes to later turns after that interval. CCEL cannot enforce reviewed
composition-year bounds. Guided research retains exact requested bounds on
hosted-local queries but deliberately omits `startYear` and `endYear` from that
single external call. Every executable unbounded CCEL provider result begins
with the invariant notice `CCEL discovery was not composition-date filtered;
its results cannot establish membership in a requested historical period.`
The generated workflow repeats the warning while searching and synthesizing
and names the requested local range. A direct CCEL-bearing query with either
year field still returns `unsupported_filter` before adapter invocation or
coordinator admission. This fallback does not infer, add, or validate dates.
