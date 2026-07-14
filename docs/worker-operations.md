# Worker operations

## Deployment baseline and rollback posture (2026-07-14)

PR #27 (`7b4e6c72182901ff77b5d175132a72d260e0418e`) is the last verified
production application baseline. Protected workflow run `29289643276` deployed
it after a read-only D1 readiness result of `ready`. Preview continues to run
PR #27 head `97644f0` against its separate schema-0002, transform-version-4
database described below.

The deployed logical D1 bindings and retained rollback posture are recorded
below as point-in-time evidence. Cloudflare deployment history and the approved
GitHub deployment run are authoritative after a later deployment. A reviewable
`wrangler.toml` change may point at a prepared candidate before any Worker
deployment; in that state the configuration is not evidence of the deployed
binding.

| Environment | Last verified deployed logical database | Current posture | Rollback posture |
|---|---|---|---|
| Production | `theologai-production-20260713-b` | PR #27 merge `7b4e6c72182901ff77b5d175132a72d260e0418e` deployed successfully by protected GitHub Actions run `29289643276`; GitHub deployment `5432211383` serves Worker version `49746830-16ce-40dc-b8a5-3cdc9ab79217` at 100%. | Retain Worker version `17869daf-f5e4-4d80-9240-6bc4fbb8d395` with `theologai-production-20260713-a` as the immediate matched rollback pair. Also retain Worker version `c291ca9f-bb1b-4e6e-abd5-d6a3ea4f0704` with `theologai-production-20260711-a` as secondary rollback history. Do not mix either database with incompatible code or delete it without separate owner approval. |
| Preview | `theologai-preview-20260713-c` | PR #27 head `97644f0` deployed successfully by protected GitHub Actions run `29277315492`; GitHub deployment `5429947573` serves Worker version `734aec3b-d6c3-456b-a203-c7f940a2d081`. The combined post-deployment audit verified all nine Strong's corrections, all 237 morphology corrections, and all 11 parallel-passage cases, with sampled checks across the remaining MCP surface. Positive donation verification remains manual. | Retain `theologai-preview-20260712-b` with predecessor Worker version `3c8ad7ef-50ed-42a7-9c71-2ac8c2dd6d7f` as the most recent matched rollback pair. `theologai-preview-20260710-c` is an older unverified candidate. Do not delete another database without separate owner approval. |

### Retained immediate production rollback database

On 2026-07-13, `theologai-production-20260713-a` was created in Eastern North
America (`ENAM`) with no jurisdiction restriction, migrated through
`0002_ubs_parallel_passages`, and populated from all 29 generated data files
after the empty-target guard. The 30-file manifest contains 859,596 rows and
scoped materialization identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`.
Its database ID is preserved in the deployed PR #26 revision's top-level
binding, Git history, and Cloudflare inventory. It is no longer the active
production binding and remains paired with Worker version
`17869daf-f5e4-4d80-9240-6bc4fbb8d395` for immediate rollback.

The strict remote readiness gate returned `ready` before the binding change was
committed and again in protected production workflow run `29257538930`. That
workflow deployed the matched PR #21 code and configuration. The independent
post-deployment audit passed all 84 checks. Retain the predecessor PR #10 Worker
and `theologai-production-20260711-a` together during the observation window.

### Deployed PR #27 production replacement

On 2026-07-13, `theologai-production-20260713-b` was created as a fresh,
unrestricted `ENAM` database for PR #27. The predecessor
`theologai-production-20260713-a` database was not modified.

The replacement was migrated through `0002_ubs_parallel_passages` and populated
from all 30 files in `seed-manifest.json` order, beginning with the empty-target
guard. Wrangler reports no pending migrations. The strict read-only remote gate
returned `ready` twice with 859,596 exact manifest rows, scoped D1
materialization identity
`652245709aaed181345b0cf17f0091471ac3a3e323f6ae84cfd73a5d8b409c51`,
all 255 reviewed D1 Unicode correction cells, no Unicode replacement characters,
the required UBS provenance and six indexes, `quick_check = ok`, and zero
foreign-key violations.

Protected GitHub Actions run `29289643276` reran the readiness gate and deployed
the PR #27 merge. GitHub deployment `5432211383` serves Worker version
`49746830-16ce-40dc-b8a5-3cdc9ab79217` at 100% with this database bound to
production. The bounded production audit passed the corrected Strong's,
morphology, and parallel-passage cases plus the broader MCP surface.

### Retained Phase 3 preview rollback database

On 2026-07-12, `theologai-preview-20260712-b` was created in Eastern North
America (`ENAM`) with no jurisdiction restriction, migrated through
`0002_ubs_parallel_passages`, and populated from all 29 generated data files,
after beginning with the empty-target guard. The manifest contains 30 files
total including that guard. Its database ID remains in Git history and the
matched predecessor configuration; it was not modified by the PR #27
preparation.

The strict remote readiness gate returned `ready`. Independent read-only checks
also confirmed 859,596 exact manifest rows, both required UBS indexes, scoped
materialization identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`,
Hebrew morphology transform version 3, the Genesis 1:1 Hebrew lemma sentinel,
`quick_check = ok`, and zero foreign-key violations.

GitHub Actions run `29256660848` rechecked live authorization and the remote
readiness contract, then deployed final PR #21 head `247b280` with this database
bound to preview. Retain it as the matched rollback database, but do not describe
older candidates as ready for this head without their own compatibility proof.
Do not delete another database without separate owner approval.

### Deployed PR #27 preview replacement

On 2026-07-13, `theologai-preview-20260713-c` was created as a fresh,
unrestricted `ENAM` database for PR #27. The previously deployed
`theologai-preview-20260712-b` database was not modified and remains the matched
rollback database through the observation window.

The replacement was migrated through `0002_ubs_parallel_passages` and populated
from all 30 files in `seed-manifest.json` order, beginning with the empty-target
guard. Wrangler reports no pending migrations. The strict read-only remote gate
returned `ready` with 859,596 exact manifest rows, scoped D1 materialization
identity
`652245709aaed181345b0cf17f0091471ac3a3e323f6ae84cfd73a5d8b409c51`,
all 255 reviewed D1 Unicode correction cells, no Unicode replacement characters,
the required UBS provenance and indexes, `quick_check = ok`, and zero foreign-key
violations.

Protected GitHub Actions run `29277315492` re-read the live PR state and label,
reran the remote readiness gate with result `ready`, and deployed exact head
`97644f0`. Wrangler recorded Worker version
`734aec3b-d6c3-456b-a203-c7f940a2d081` with the expected replacement binding.
The combined black-box release audit then verified all nine corrected Strong's
entries, all 237 corrected morphology cells, all 11 parallel-passage cases, and
sampled every remaining tool plus the resources, prompts, registry, and transport
surfaces without a 429 or unexpected session. Positive donation verification
remains an intentionally manual operator check requiring an already-mined
transaction; its validation path passed. The deployment authorization label was
removed after the audit.
At the time of this preview audit, production configuration, data, and Worker
were unchanged. The later protected production release is recorded above.

### Prepared transform-version-6 preview candidate

The reconciled integrated candidate's four core feature commits are `2c2a29a`,
`eccfad4`, `1b95201`, and `2506413`. On top of the PR #27 merge, the candidate
also requires the downstream Unicode-manifest preservation fix `a1c9da3` and
source-lock synchronization `e8282c3`; the separate `e6f7f7f` commit reconciles
release documentation. The candidate introduces migration
`0003_original_language_usage` and transform version 6. It is unmerged and
unreleased. Draft PR #30 now points its reviewable preview configuration at the
freshly prepared `theologai-preview-20260714-a` database
(`0dab804f-8df0-4727-93bd-299612b6e179`). That database was migrated through
`0003_original_language_usage`, populated from all 36 manifest seed files, and
passed the strict read-only remote readiness gate with zero writes.

The candidate whole-D1 identity
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` and scoped
usage identity
`c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd` match the
values verified by the prepared database's readiness contract. This is not
deployment evidence:
preview still serves Worker version `734aec3b-d6c3-456b-a203-c7f940a2d081`
against `theologai-preview-20260713-c` until PR #30 passes the protected preview
deployment workflow. Retain `theologai-preview-20260712-b` with Worker version
`3c8ad7ef-50ed-42a7-9c71-2ac8c2dd6d7f` as the matched preview rollback pair.
PRs #28 and #29 are closed as superseded by PR #30.

The owner separately authorized deletion of only the unused legacy database
`theologai-db-preview` (`f9f415e1-219b-4d17-bcf5-33a8abad02fa`), and that deletion
was completed on 2026-07-14. No other database deletion is authorized. Preview
promotion remains preview-only; production preparation and promotion require a
separate decision and protected release process.

### Hebrew-lemma materialization follow-up

The retained `theologai-preview-20260712-b` rollback database includes
deterministic Hebrew lemma population and passed the transform-version-3
readiness gate. The earlier `theologai-preview-20260712-a` candidate predated
those materialized row changes; after a read-only inventory confirmed it was
unbound, incompatible with the current readiness contract, and superseded, the
owner separately authorized its deletion on 2026-07-13. No other deletion was
authorized. The UBS parallel-passage source transform remains version 2; these
are separate version domains.

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

### Parked public-edge traffic investigation

A sustained anonymous client from AWS infrastructure in Frankfurt has generated
heavy production invocation volume. The current Worker-side limiter cannot
prevent those requests from counting as Worker invocations. A custom domain
would allow a future narrowly scoped WAF control while preserving public MCP
access. This item is non-gating and parked pending an owner domain decision; no
hostname rotation, Cloudflare Access policy, WAF rule, or limiter change is
currently approved.

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
