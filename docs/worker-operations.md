# Worker operations

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

The identity markers were introduced with the reproducible corpus pipeline. An
older remote database without `theologai_metadata` will intentionally fail the
gate; do not weaken the query. Prepare and verify a new seeded database, then
perform a separately approved binding cutover before the next code deployment.

These gates deploy Worker code only. D1 migrations and corpus seeding remain
separately authorized operations governed by `docs/D1-DATA-WORKFLOW.md`.
