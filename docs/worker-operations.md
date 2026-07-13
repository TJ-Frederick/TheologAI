# Worker operations

## Deployment baseline and rollback posture (2026-07-12)

PR #10 (`71a3f0d`) is the current production application baseline. Production
deployed successfully after a read-only D1 readiness result of `ready`.
Preview runs the Phase 3 PR #21 application from `446a9eb` against the prepared
schema-0002, transform-version-3 database described below.

The deployed logical D1 bindings and retained rollback posture are recorded
below as point-in-time evidence. Cloudflare deployment history and the approved
GitHub deployment run are authoritative after a later deployment. A reviewable
`wrangler.toml` change may point at a prepared candidate before any Worker
deployment; in that state the configuration is not evidence of the deployed
binding.

| Environment | Active logical database | Current posture | Rollback posture |
|---|---|---|---|
| Production | `theologai-production-20260711-a` | PR #10 merge remains deployed while the Phase 3 production candidate below is reviewed. | The deployed Worker and this database are the retained matched rollback pair. Do not mix this database with Phase 3 code or delete it during the release window. |
| Preview | `theologai-preview-20260712-b` | Phase 3 PR #21 head `173a6a4` deployed successfully by GitHub Actions run `29221227777` after the read-only readiness gate passed. | `theologai-preview-20260712-a` and `theologai-preview-20260710-c` are retained candidates only. Candidate `-a` predates transform version 3; candidate `-c` belongs to the earlier PR #10 deployment. Verify the retained Worker/config pair and run its exact readiness contract before either is used. |

### Prepared Phase 3 production candidate (not deployed)

On 2026-07-13, `theologai-production-20260713-a` was created in Eastern North
America (`ENAM`) with no jurisdiction restriction, migrated through
`0002_ubs_parallel_passages`, and populated from all 29 generated data files
after the empty-target guard. The 30-file manifest contains 859,596 rows and
scoped materialization identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`.
Its database ID is recorded only in the reviewable top-level binding in
`wrangler.toml`.

The strict remote readiness gate returned `ready` against the candidate before
this binding change was committed. Updating `wrangler.toml` prepares the matched
Phase 3 code/config release; it does not change the deployed production Worker. The
existing PR #10 Worker and `theologai-production-20260711-a` remain active and
must be retained together until the protected main-branch deployment succeeds.

### Active Phase 3 preview database

On 2026-07-12, `theologai-preview-20260712-b` was created in Eastern North
America (`ENAM`) with no jurisdiction restriction, migrated through
`0002_ubs_parallel_passages`, and populated from all 29 generated data files,
after beginning with the empty-target guard. The manifest contains 30 files
total including that guard. Its database ID is kept in the
reviewable preview binding in `wrangler.toml`; prior candidates remain available
for rollback investigation and are not modified by this preparation.

The strict remote readiness gate returned `ready`. Independent read-only checks
also confirmed 859,596 exact manifest rows, both required UBS indexes, scoped
materialization identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`,
Hebrew morphology transform version 3, the Genesis 1:1 Hebrew lemma sentinel,
`quick_check = ok`, and zero foreign-key violations.

GitHub Actions run `29220658995` subsequently rechecked live authorization and
the remote readiness contract, then deployed PR #21 head `446a9eb` with this
database bound to preview. Retain both earlier candidates during the verification
window, but do not describe either as ready for this head without its own matched
compatibility proof. Do not delete any retained database as part of deployment.

### Hebrew-lemma materialization follow-up

The prepared `theologai-preview-20260712-b` candidate includes deterministic
Hebrew lemma population and passed the transform-version-3 readiness gate. The
earlier `theologai-preview-20260712-a` candidate predates those materialized row
changes and must not be marker-updated or rebound to an application revision
expecting transform version 3. The UBS parallel-passage source transform remains
version 2; these are separate version domains.

No rollback asset is claimed as known-good without a read-only inventory and
compatibility check. Do not copy database IDs, credentials, API tokens, or
provider-bearing secret RPC URLs into this runbook; `wrangler.toml` and the
approved workflow are the configuration sources of truth.

Choose rollback as a matched operational decision:

1. **Code-only rollback:** restore a known-good Worker revision while retaining
   the active compatible D1 binding, then run the approval gate and the
   readiness check for that revision.
2. **Data-binding rollback:** bind a retained, independently verified
   compatible D1 database while keeping application code constant. Readiness
   must pass before deployment.
3. **Combined rollback:** if the predecessor D1 lacks current metadata/schema,
   restore the matched earlier Worker/config/workflow revision and database, or
   prepare a compatible replacement. Never weaken the current readiness query.
4. **Retention check:** before approving a rollback, use a read-only Cloudflare
   inventory to confirm which predecessor databases and Worker revisions still
   exist. If that cannot be verified, describe them as candidate/unverified.
5. **No destructive cleanup:** do not delete predecessor databases until a
   separately authorized retention window and rollback review are complete.

The production Wrangler workflow targets the top-level configuration explicitly
with `npx --no-install wrangler secret put ESV_API_KEY --env=` for secret upload
and `command: deploy --env=` for deploy. The secret value is supplied through
stdin from the masked job environment and is not part of the command text.
This is intentional: the top-level configuration is production, while
`preview` is the only named environment. The action's named
`environment: production` input is not used because no `env.production` block
exists and creating one would change the Worker/configuration model.

## Anonymous MCP request limit

The public Worker remains anonymous. It uses Cloudflare's Rate Limiting binding
as an abuse-control boundary, not as authentication or exact usage accounting.

- Limit: 120 accepted MCP requests per 60 seconds.
- Key: SHA-256 of a versioned combination of `CF-Connecting-IP` and
  `User-Agent`.
- Scope: per fingerprint, per Cloudflare location. Cloudflare's counters are
  permissive and eventually consistent, so brief bursts can exceed the nominal
  limit.
- Exemptions: rejected origins, unknown paths, unsupported methods, and CORS
  preflight requests do not consume tokens.
- Rejection: HTTP 429 with `Retry-After: 60`, `Cache-Control: no-store`, and the
  same exact-origin CORS policy as successful requests.

Production and preview deliberately use different namespace IDs in
`wrangler.toml`. Reusing a namespace ID would make equal keys share counters
across Workers in the same Cloudflare account.

### Failure policy and telemetry

Rate-limit binding errors **fail open**. This keeps the anonymous, read-only
research service available during a binding outage. Every such failure emits a
structured `theologai.worker.rate_limit.failure` error event with
`policy: "fail_open"`. Rejections emit
`theologai.worker.rate_limit.rejected` warning events.

Neither event contains the raw IP address, raw user-agent, nor hashed
fingerprint. General request telemetry likewise records only whether an IP and
user-agent were present. Operators can correlate incidents with Cloudflare's
ray ID and location metadata without persisting the client identity used by the
limiter.

Cloudflare currently does not expose Rate Limiting binding metrics in its
dashboard. Monitor the structured 429 events through Workers Logs and Traces.
Workers Logs sampling means every event is emitted by the application but not
necessarily persisted by Cloudflare.

## Runtime configuration ownership

`wrangler.toml` is the source of truth for non-secret runtime configuration.
Production and preview explicitly declare the exact browser origin allowlist,
maximum request size, and request-lifecycle logging state. Do not add these as
dashboard-only plaintext variables: Wrangler removes undeclared variables on a
later deploy unless `keep_vars` is enabled, and this project deliberately does
not enable it.

API keys and provider-bearing RPC URLs remain optional Worker secrets. No raw
client denylist is stored in source or generated binding types.

## Donation verification preview smoke test

Preview verification should use a read-only, already-mined public transaction
selected at test time. Do not send funds from a test wallet and do not commit a
transaction hash as a golden fixture.

1. Select a finalized transaction visible in the relevant chain explorer that
   already transfers a supported asset to the configured donation recipient.
2. Cross-check the hash, successful receipt, positive transfer value, exact
   token contract (or native asset), and recipient against the chain RPC before
   calling the preview tool. A second explorer or RPC view is useful when the
   transaction is used as release evidence.
3. Call `verify_donation` on the preview endpoint with that hash and expect
   `verified`, then record the returned chain and explorer link. For a negative
   smoke check, use a separately selected public transaction and assert the
   expected non-verifying status; never infer a fixture's status from its hash
   alone.

The hash may be supplied as an operator-only environment value or manual test
input after the preflight above, but it must not be embedded in source or
tests. This keeps the check deterministic at execution time without making an
unverified historical transaction part of the release contract.

## Donation RPC defaults and failure semantics

The zero-configuration defaults are public, unauthenticated endpoints:
Ethereum uses LlamaRPC, Base uses Base's documented standard mainnet endpoint,
and Radius uses its documented mainnet endpoint. They are suitable for light
preview smoke checks, not an availability commitment. Public endpoints can be
rate-limited or unavailable, so operators can provide chain-specific RPC URL
secrets when a higher operational budget is approved; no paid provider or
secret is required by the code.

The verifier treats an explicit transaction/receipt-not-found JSON-RPC error as
the same evidence as a JSON-RPC `result: null`, while timeouts, HTTP failures,
rate limits, malformed responses, and other RPC errors remain `unavailable`.
An arbitrary syntactically valid fake Ethereum transaction hash is therefore
only an error-taxonomy exercise, not a deterministic health probe. An
Ethereum `unavailable` result during such a check is a non-blocking
provider-availability observation, not evidence of absence or verification.
Release smoke tests must use an operator-selected, already-mined public
transaction checked at execution time, never a committed golden hash or a
newly sent transaction. Keep `unavailable` fail-closed and distinct from
`absent`.
Verification results include per-chain states so a healthy chain's evidence is
not hidden when another provider is down.

Production request-lifecycle logs are disabled. Preview keeps them enabled for
diagnostics. Rate-limit failures/rejections and sanitized unexpected runtime
errors remain structured security events independent of that lifecycle switch.

## Deployment gates

Opening or updating a pull request runs validation but does not deploy a
preview. Preview deployment requires all checks to pass, a same-repository PR
that is open and non-draft with the `deploy-preview` label, and the GitHub
`preview` environment. Configure that environment with required reviewers
before using the label, disable administrator bypass, and restrict deployment
branches to the `refs/pull/*/merge` pattern.

Closing the pull request, converting it to a draft, removing the
`deploy-preview` label, or retargeting it away from `main` starts the separate,
non-secret Preview Revocation workflow. Its repository-wide PR concurrency
group cancels any matching in-flight PR Checks run without emitting replacement
skipped instances of the five required checks. Unrelated label removals and PR
edits use a run-unique group and cannot cancel or displace an authorized preview
run.

The deploy job also reads the live pull request immediately before it uses
environment secrets and again immediately before deployment. It stops if the
PR is closed, draft, no longer targets `main`, no longer comes from the same
repository, no longer carries `deploy-preview`, or has moved to a different
head commit.

Production deployment is assigned to the GitHub `production` environment.
Configure required reviewers there as a release gate. Both workflows pin the
same Wrangler version used for local configuration validation.

After environment approval and before deployment, each job runs a read-only D1
readiness query that checks integrity, exact manifest row counts, and required
indexes, column signatures, foreign keys, and schema/corpus identity markers. A
missing, stale, partial, or incompatible corpus stops deployment.

The corpus marker is the scoped D1 materialization identity derived from
`data/data-manifest.json` `materializations.d1`, not the hash of the complete
source inventory. Worker-bundled corpora may change without requiring a D1
replacement; any D1 input, transform version, schema version, or expected-count
drift still changes the marker and stops deployment. Legacy-marker transitions
are conditional, separately authorized metadata writes documented in
`docs/D1-DATA-WORKFLOW.md`; deploy workflows remain read-only with respect to D1.

The identity markers were introduced with the reproducible corpus pipeline. An
older remote database without `theologai_metadata` will intentionally fail the
gate; do not weaken the query. Prepare and verify a new seeded database, then
perform a separately approved binding cutover before the next code deployment.

These gates deploy Worker code only. D1 migrations and corpus seeding remain
separately authorized operations governed by `docs/D1-DATA-WORKFLOW.md`.
