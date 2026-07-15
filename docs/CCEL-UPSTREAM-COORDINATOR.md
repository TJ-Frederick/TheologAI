# CCEL upstream coordinator (dormant rollout slice)

## Status

This is disabled infrastructure, not CCEL enablement. Both
`THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH` and
`THEOLOGAI_ENABLE_CCEL_COORDINATOR` remain `false` in root and preview. No MCP
tool constructs the coordinator client, and `primary_source_search` remains
local-only. This slice creates no remote namespace and makes no CCEL request.

## Contract

An admitted cache miss must reserve the origin synchronously **before** its
single upstream GET begins. The minimum interval is 10,000 ms between admitted
attempts. A busy response exposes only a bounded integer
`retryAfterSeconds`—never queue position, request metadata, or another caller's
identity.

The coordinator API accepts only:

- a content-free admission call;
- the numeric admission token it returned; and
- one outcome enum: success, transient failure, upstream 429 with a bounded
  Retry-After, policy failure, or interface failure.

It has no parameter or persistence column for a search query, URL, HTML,
snippet, result, client identity, IP address, or user agent. Structured event
types are defined for future telemetry, but this slice does not emit them.

## Worker behavior

`CcelGlobalCoordinator` is a SQLite-backed Durable Object. The named singleton
is the coordination atom for the one CCEL origin; the deliberate throughput is
only one admitted attempt per ten seconds. Its RPC admission transaction reads
state, reserves `next_allowed_at_ms`, and writes that reservation synchronously
before returning.

The root `theologai` Worker and the `theologai-preview` environment each repeat
the non-inherited Durable Object binding. Cloudflare therefore owns separate
production and preview namespaces. They do not share state or an upstream
budget. The local Worker-runtime test has its own third namespace.

There are no alarms. State is read from SQLite on every RPC, so eviction or
restart cannot erase a reservation or circuit transition. Persisted state is
limited to timestamps, attempt/epoch counters, transient backoff metadata, a
bounded half-open probe lease, and one circuit enum.

## Circuit policy

- `closed`: ordinary 10-second admission spacing.
- `transient_backoff`: exponential 30-second to 10-minute backoff, then one
  bounded half-open probe.
- `rate_limited`: honor a validated 1–86,400 second Retry-After, then one
  bounded half-open probe.
- `latched_policy` / `latched_interface`: admit nothing until an operator has
  reviewed the condition and calls the internal reset pathway. A reviewed
  deployment may invoke that pathway, but a deploy alone does not erase durable
  state. No public route exposes reset.

The clock is monotonic-safe: the persisted last-observed timestamp is a floor.
If the wall clock rolls backward, admission remains closed until wall time
catches up; rollback can never accelerate a fetch. An expired half-open lease
allows one replacement probe so a crashed caller cannot wedge the origin
forever.

## Node behavior and second-order implications

`ProcessLocalCcelUpstreamCoordinator` is also disabled by default. An embedding
application must explicitly construct and inject an enabled instance. It
serializes admission and outcomes inside one OS process, but **separate Node
processes are not coordinated**. A multi-process local deployment must use one
process, route CCEL discovery through a single coordinator service, or leave
live discovery disabled. This limitation is preferable to pretending an
in-memory lock is global.

The global Worker coordinator is intentionally a bottleneck. That is the
policy: the maximum admitted origin load is 0.1 requests/second per environment.
If CCEL changes policy or interface, the latched state can make discovery
unavailable until reviewed; local corpus search remains independent.
