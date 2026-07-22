# Worker operations

## Current known-good PR #72 remote baseline (2026-07-17)

PR #72 merge `72a8ee5eef9b909a373b085d1a4f193484ddfe8a` is the current
known-good remote baseline. Protected preview run `29621708718` deployed
preview Worker `8ed4ad1a-f45f-4cdc-a6de-5358f59b6d44`; protected production
run `29622634088` and Cloudflare deployment
`a4697fd1-deda-4dae-a16c-635454218bc8` deployed production Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`. The release retained production D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`), preview D1
`theologai-preview-20260714-a`
(`0dab804f-8df0-4727-93bd-299612b6e179`), rate namespaces `361201` and
`361202` at 120/60, and CCEL flags `000` (production) / `100` (preview).

The independent preview audit returned GO with no P0-P3 findings across 22
read-only requests, and its source-attested regression passed 22/22. The
independent production audit likewise returned GO with no P0-P3 findings in no
more than 22 read-only requests; its source-attested regression passed 22/22.

Ordinary requests to the production `theologai.tjfrederick.workers.dev` host
now return a no-store 308 to `mcp.theologai.xyz`. The exact abusive-poller
tuple (`CF-Connecting-IP: 18.192.206.183` plus `User-Agent:
Go-http-client/2.0`) is rejected rather than redirected; supported browser CORS
preflight remains local. The preview
`theologai-preview.tjfrederick.workers.dev` host remains a direct compatibility
endpoint. The primary-source MCP schema is production v6/local-only and preview
v7/discovery-only; CCEL execution remains disabled in both environments.

The later repository changes through merged PR #83
(`93d5837b05249c15127ab20107f86443cccf4e1e`) are repository-only and have not
been deployed. U3-T7 adds an inactive in-memory semantic compiler,
native-to-normalized coordinate bridge, and content-free audit. The later M4A
local-only slice adds migration `0004`, transform 7, local SQLite
materialization, deterministic D1 seed/import verification, and inactive
Node/D1 adapters. Neither slice changes the deployed Workers, remote D1
databases or bindings, historical catalog, MCP output, UBS semantic runtime, or
CCEL execution state. No deletion, route replacement, or other destructive
cleanup is authorized by this record.

Draft-PR publication of M4A is owner-authorized but had not yet occurred when
this record was authored; no remote migration or deployment is authorized.

Any eventual UBS semantic D1 release must separately authorize remote migration
`0004` / transform 7 and a reviewed binding/deployment sequence before the
dependent historical migration `0005` / transform 8. The completed local
capacity and seed checks are not remote-release evidence and neither is part of
this deployed baseline.

## Historical PR #50 pre-custom-domain rollback anchor (2026-07-16)

Before the PR #51 custom-domain release and the later PR #72 legacy-host
behavior release, PR #50 merge
`16e633bc70dbbea668caacf87f994a2536441092` was the pre-custom-domain rollback
anchor. Protected run `29527760541`, GitHub deployment `5479150556`, and
Cloudflare deployment `5822242e-d0bf-43a9-bbbc-0ec7d6edd180` deployed Worker
`32520410-d363-4b2b-83d1-cb7613eab2f1` at 100%. Read-only readiness preserved
production D1 `theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`), rate namespace `361201` at 120/60,
and CCEL flags `000`.

Its post-deployment black-box audit passed 72/72 assertions with no P0-P3
findings: parallel-text 44/44, protocol/inventory/CCEL 9/9, and
HTTP/CORS/negotiation/under-budget rate behavior 19/19. The PR #72 baseline
supersedes it operationally; retain this record only as historical rollback
evidence, not as a claim about the currently deployed Worker.

## Earlier deployment baseline and rollback posture (2026-07-15)

PR #37 merge `d395b3641eb00f6826eaba670c287f9a39dfa3da` is the verified
production application baseline. Protected production run `29451333738`
returned a read-only D1 readiness result of `ready` with zero writes, then
GitHub deployment `5464194228` deployed Worker version
`9d2b757b-8b9b-4318-b09d-14f62815bf82` at 100%. The coordinator audit passed
73/73 and the independent audit passed 91/91 with no P0-P3 findings.

The deployed logical D1 bindings and retained rollback posture are recorded
below as point-in-time evidence. Cloudflare deployment history and the approved
GitHub deployment run are authoritative after a later deployment. A reviewable
`wrangler.toml` change may point at a prepared candidate before any Worker
deployment; in that state the configuration is not evidence of the deployed
binding.

### Deployed Stage D preview v5 profile (historical release record)

The checked-in Stage D configuration is intentionally asymmetric. Production
remains `false/false/false` for CCEL exposure, live search, and coordinator
execution, preserving the v4/local-only public contract. Preview is
`true/false/false`: it exposes the v5 tool schema and guided workflows while the
single live predicate remains false. In that state an external query returns a
disabled provider result before adapter invocation, Durable Object lookup/RPC,
or fetch. Protected preview deployment and black-box audit have established
this as the deployed preview v5 profile. It still does not authorize live CCEL
access or any production behavior beyond the documented v4/local-only profile.

Because MCP clients may cache tool and prompt schemas within an initialized
connection, reconnect and reinitialize the audit client after the preview
deployment. Audit the fresh `tools/list` and `prompts/list` responses before
calling `primary_source_search`; otherwise a client can continue presenting a
stale v4 schema even though the Worker has cut over to v5.

| Environment | Deployed logical database | Recorded point-in-time posture | Rollback posture |
|---|---|---|---|
| Production | `theologai-production-20260715-a` (`c6535a4a-1953-4279-b277-7368445fc61a`) | PR #37 merge `d395b3641eb00f6826eaba670c287f9a39dfa3da` deployed by protected run `29451333738`; deployment `5464194228` serves Worker `9d2b757b-8b9b-4318-b09d-14f62815bf82` at 100%. Readiness was `ready` with zero writes; coordinator and independent audits passed 73/73 and 91/91 with no P0-P3 findings. | Retain PR #38 Worker `e0371eb4-05c6-4415-b479-b01ac2630be0` with the same production D1 as the immediate compatible predecessor. Older matched pairs remain historical options below. No rollback is recorded as executed; do not mix incompatible code and data or delete another database without separate owner approval. |
| Preview | `theologai-preview-20260714-a` (`0dab804f-8df0-4727-93bd-299612b6e179`) | Protected run `29450048707` deployed reviewed PR #37 head `5c6df7f1a340a9a0b43c3260d104cbd6d8d1ebfb` as deployment `5464127644` and Worker `fb2b8e41-4310-43f3-a8f0-571a64a733ac` at 100%. Coordinator and independent audits completed with no P0-P3 findings. | Retain PR #38 Worker `404b7eb3-7244-436d-bfa5-8359ac3a4aab` with the same preview D1 as the immediate compatible predecessor. Older matched pairs remain historical options below. No rollback is recorded as executed; do not delete another database without separate owner approval. |

### Deployed PR #39 transform-version-6 production replacement

On 2026-07-15, `theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`) was created as a fresh, unrestricted
`ENAM` database. The predecessor `theologai-production-20260713-b` database was
not modified. The replacement was migrated through `0003_original_language_usage`
and populated from all 36 manifest files in recorded order, beginning with the
empty-target guard. The verified manifest contains 1,069,506 rows, whole-D1
identity `c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707`,
and usage identity
`c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd`.

Wrangler reported no pending migrations. The strict remote readiness gate
returned `ready` with zero writes, served from the ENAM primary, after checking
exact counts, schema and corpus identities, required columns and indexes,
Unicode and language sentinels, UBS provenance, usage aggregates,
`quick_check`, and foreign keys. The superseded protected run `29388731059`,
which targeted the old committed binding, was canceled without starting any
steps. PR #39 merged the reviewed binding as
`2412ee4031b8bbef16f359879d4a8a4884a6e053`. Protected workflow run
`29418476587` repeated the gate and deployed GitHub deployment `5457655742` as
Worker version `a74f0848-5b68-4d7a-834e-aa3221ebda3b` at 100% with this database
bound. The post-deployment strict readiness recheck again returned `ready` with
zero writes.

The independent bounded production audit scored 87/90 with no P0 or P1
findings. Its only P2 concerned exact-verse commentary coverage. PR #40 later
corrected and released that finding as recorded below. This PR #39 Worker with
`theologai-production-20260715-a` was the immediate matched rollback pair for
the corrective release. Preserve the older matched rollback records
below as well; no additional database deletion is authorized without separate
owner approval.

### Deployed PR #40 commentary coverage correction

PR #40 reviewed head `32441d99de673eccce0a57fd74801fb94db04944`
implements source-specific scalar identity, fails closed for section-only
coverage, supports the official provider content shapes, and aligns public and
guided-workflow guidance. It makes no migration, seed, D1-binding, or corpus
change.

Protected preview run `29425323205` deployed the reviewed head as GitHub
deployment `5459322775` and Worker version
`34a0a557-9ddb-4940-9862-6b25e1dd98e6` at 100%, still bound to
`theologai-preview-20260714-a`
(`0dab804f-8df0-4727-93bd-299612b6e179`). The coordinator commentary matrix
passed 15/15 and the independent audit passed 27/27 with no P0-P3 findings.

PR #40 merged as `9f6aa128eeab663ef04a315ab0c14b8ae9a3376d`. Protected
production run `29427137668` returned `ready` with zero writes and deployed
GitHub deployment `5459432945` as Worker version
`656e9e3a-7044-45ca-9144-4ec7eae94d8d` at 100%, still bound to
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). The production coordinator matrix
passed 15/15 and the independent audit passed 27/27 with no P0-P3 findings.
No database deletion or corpus mutation occurred.

### Retained older production rollback database

On 2026-07-13, `theologai-production-20260713-a` was created in Eastern North
America (`ENAM`) with no jurisdiction restriction, migrated through
`0002_ubs_parallel_passages`, and populated from all 29 generated data files
after the empty-target guard. The 30-file manifest contains 859,596 rows and
scoped materialization identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`.
Its database ID is preserved in the deployed PR #26 revision's top-level
binding, Git history, and Cloudflare inventory. It is no longer the active
production binding and remains paired with Worker version
`17869daf-f5e4-4d80-9240-6bc4fbb8d395` as older matched rollback history.

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
the PR #27 merge. GitHub deployment `5432211383` deployed Worker version
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

### Verified corrective transform-version-6 preview candidate

The reconciled integrated candidate's four core feature commits are `2c2a29a`,
`eccfad4`, `1b95201`, and `2506413`. On top of the PR #27 merge, the candidate
also requires the downstream Unicode-manifest preservation fix `a1c9da3` and
source-lock synchronization `e8282c3`; the separate `e6f7f7f` commit reconciles
release documentation. The candidate introduces migration
`0003_original_language_usage` and transform version 6. At preparation time it
was unmerged, and PR #30 pointed its reviewable preview configuration at the
freshly prepared `theologai-preview-20260714-a` database
(`0dab804f-8df0-4727-93bd-299612b6e179`). That database was migrated through
`0003_original_language_usage`, populated from all 36 manifest seed files, and
passed the strict read-only remote readiness gate with zero writes.

The candidate whole-D1 identity
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` and scoped
usage identity
`c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd` match the
values verified by the prepared database's readiness contract. An initial
protected preview deployment occurred on 2026-07-14 from commit `a660c97`,
producing Worker version `e86fb87e-8ace-4972-a8a2-dba9682a6a55` with
`theologai-preview-20260714-a` bound.
Black-box audits found guided-workflow, Hebrew morphology interpretation,
historical presenter/search/browse, and derivation-output issues. Corrective
application commit `4760dbd` passed all required CI checks and Verify
Pins, then protected run `29354086467` / job `87160929896` deployed it on
2026-07-14 as
Worker version `5dd1fa0c-343c-4af4-83e6-b65003fb51c4` with the same prepared D1
database. Targeted and independent full-surface black-box re-audits found no
P0-P2 issues and confirmed all previously identified P0-P2 release findings
were fixed. PR #34 subsequently merged as `ce335266d989b40afebe398aeb39dbd2082d926a`.
Its final protected preview run `29379359308` deployed Worker version
`ab270f0b-2627-4057-a182-a66cd750b118` at 100% with the same prepared preview
database, and the final audits remained clear of P0-P2 findings. At that point,
the immediate preview rollback pair was PR #34 Worker version
`ab270f0b-2627-4057-a182-a66cd750b118` with unchanged D1
`theologai-preview-20260714-a`. The verified PR #27 Worker version
`734aec3b-d6c3-456b-a203-c7f940a2d081` with `theologai-preview-20260713-c` is
older matched rollback history, and `theologai-preview-20260712-b` with Worker
version `3c8ad7ef-50ed-42a7-9c71-2ac8c2dd6d7f` is still older matched rollback
history. PRs #28 and #29 are closed as superseded by PR #30.

The owner separately authorized deletion of the unused legacy database
`theologai-db-preview` (`f9f415e1-219b-4d17-bcf5-33a8abad02fa`), completed on
2026-07-14, and later authorized deletion of only the unused legacy preview
database `theologai-preview-20260710-a`
(`3d010946-b530-4c7e-9e21-a900ff3c21a2`), completed on 2026-07-15. No other
database deletion is authorized.
Production subsequently moved through the PR #39 binding cutover and PR #40
commentary correction; the exact deployed state and audits are recorded at the
top of this document. This historical preview record does not authorize
deletion of any additional database.

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
prevent those requests from counting as Worker invocations. The custom domain
and ordinary-request production legacy-host redirect are already deployed.
`workers_dev` remains enabled and the one exact abusive-poller tuple remains a
temporary mitigation. Disabling `workers_dev`, changing or removing that tuple
rule, or adding a narrowly scoped WAF control while preserving public MCP
access each remain separately owner-gated. No Cloudflare Access, hostname, WAF,
or limiter change is currently approved.

## Runtime configuration ownership

`wrangler.toml` is the source of truth for non-secret runtime configuration.
Production and preview explicitly declare the exact browser origin allowlist,
maximum request size, and request-lifecycle logging state. Do not add these as
dashboard-only plaintext variables: Wrangler removes undeclared variables on a
later deploy unless `keep_vars` is enabled, and this project deliberately does
not enable it.

API keys and provider-bearing RPC URLs remain optional Worker secrets. The
temporary exact `CF-Connecting-IP` plus `User-Agent` abusive-poller exception
is source-controlled request policy in `src/http/worker/legacyEndpoint.ts`; it
is evaluated for the incoming request and does not create a persisted telemetry
field or dashboard-configured denylist.

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
