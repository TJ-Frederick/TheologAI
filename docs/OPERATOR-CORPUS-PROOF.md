# Complete operator corpus proof

The reviewed successor admission implementation is authorized for branch publication,
a draft PR and ordinary hosted PR CI. This document and its fixtures authorize no real
operation, quota spend, preview label, manual workflow dispatch or deployment.
The [CI/release task](ci-reliability/ACTIVE-REMEDIATION.md) and
[reviewed design](ci-reliability/DESIGN.md) record the implementation scope.

## Successor operation sequence

Normal PR validation tests the exact synthetic merge; the independent Worker/corpus source
artifacts describe the exact source head. The operator source gate verifies every unique,
successful normal CI job and source artifact, then waits up to 60 minutes without cloud
credentials or a protected environment. It exposes the candidate identity and target run
in its summary. Missing authorization times out before protected approval or cloud inventory.
Prepare the clean exact-source checkout and isolated release toolchain before approval.

A real successor requires a separate explicit owner grant for ONE new operation. Its strict
`theologai-operator-authorization.v1` manifest binds role, repository, owner 40179660, PR number,
same-repository branch/head, base, tree, source-plan digest, target run/attempt, unique
`operation-...` authorization/ledger identity, not-before/expiry and fixed bounds. Preview
requires `refs/pull/<number>/merge`; production requires the actual main dispatch and first
parent. The normal complete proof reserves 3,510,997 reads, caps at 3.8M reads and four total
rank-1 FTS diagnostics/at most four writes. The normal 200K uncertainty margin and 4M account
operating ceiling apply. No historical PR170 date exception activates for successors.

After an actual separate owner decision, the existing pr.yml manual input
`operator_authorization_json` receives that grant at the exact source branch (production:
main). Owner and triggering-owner metadata, attempt1, live source/run, native ZIP SHA-256,
strict JSON, unique authorization artifact and matching ledger-marker artifact authenticate
it. Candidate JSON alone grants nothing. Metadata-only submissions use distinct skipped
validation names so they cannot supersede the five substantive PR check contexts. Hosted
routing/artifact behavior still needs separately authorized CI verification.

After source admission, the existing protected operator job asks for its normal approval,
revalidates native authority and issues one v2 challenge for that exact run. The full
90-minute window must fit the same UTC day and the owner's authorization window. No SQL
is retried. Local challenge admission and every diagnostic gate verify both native archives'
bytes/content, live source/run/approval and marker uniqueness before cloud work.

Initialize the persistent per-operation ledger deliberately from the authenticated challenge:

```bash
npx --no-install tsx scripts/operator-corpus-proof.ts init-ledger CHALLENGE LEDGER
```

Then use the existing `run CHALLENGE SOURCE_DIRECTORY PLAN_SHA256 OUTPUT LEDGER` command
with the exact `operatorApproval(challenge)`, existing local OAuth grant held only in memory,
and the SAME ledger. Never recreate it to recover allowance. A missing ledger is rejected.
The ledger is consumed and retains the WHOLE both-phase reservation before the first
command; replay, existing attempts, inherited counters and mismatched authorization fail.
Only the four exact FTS diagnostics use operator access. The existing protected read token
then performs every complete-cell/schema/FK/physical read, with no permission expansion.
The owner submits only the sanitized integrity envelope in `operator_proof_json` at the exact
branch. The two manual inputs are mutually exclusive.

Keep the local ledger, operator journal, protected read journal, metering and native artifacts.
An incomplete/cancelled protected phase or missing/ambiguous terminal evidence leaves the
FULL operation reservation outstanding, including both operator and reader costs and unmatched
intents. Zero inherited counters in a new operation do not erase older costs. This slice
supports NO automatic continuation, cross-run recovery, reconstructed lower counters or
remote-proof reuse. Another operation needs an explicit additional owner scope that accepts
all unresolved prior reservations. Production has its OWN authorization/ledger and fresh proof;
a successful matching preview receipt remains an independent prerequisite.

Deploy Preview receives the admitted package only from the exact same-run protected artifact,
checks its hash against original source admission and the full envelope hash against the
protected producer, and rechecks expiry/source/live PR/main/tree before cloud inventory.
It retains its existing contents:read / pull-requests:write permissions and separate approval.
The isolated protected-base release toolchain and unchanged deployment/live-audit gates remain.

This is not a globally append-only ledger: retained native artifacts provide finite replay
checks; expired/missing evidence stops recovery, and deliberate local ledger reconstruction
cannot be cryptographically distinguished from a fresh file. Preserve original evidence.
No account, token, secret, permission, binding, billing or corpus change is authorized here.

## Historical PR #170 authorization and completed evidence

Everything below is dated historical evidence. Its completed allowance, continuations and
waivers cannot authorize successor challenges or provide new budget.

### PR #170: existing operator access for complete corpus verification

**Completed release:** SEC-01–05 resolved in production in PR #170 / run 41256928054. SEC-06 stays open/paused; corpus activation and broader process work remain deferred. See [findings](SECURITY-REVIEW-2026-10-22.md), [completion](security/SEC01-05-PRODUCTION-COMPLETE-2026-11-01.md) and [current assignment](CURRENT-RELEASE.md). Dated failure/approval text below is historical and authorizes no new run.

The deployment credential has D1 Read; direct HTTP FTS integrity INSERTs require
D1 Edit. Keep its permissions unchanged. Use the existing operator OAuth grant
locally for exactly four rank-1 integrity commands. The protected job uses its
existing D1 Read token for the complete read proof and account-quota observations. No seed, migration, rebuild, binding, account or billing change occurs.

The protected preview stage reuses the former diagnostic stage's environment,
GitHub permissions and shared preview mutation lock. It admits only PR #170's
current source after every normal CI job and source artifact passes. After
approval it issues a random challenge bound to the source, tree, plan, base,
run/attempt, target, cumulative authorization and 90-minute same-UTC-day window.
Prepare the local isolated release toolchain and source artifacts before approval.

Run `scripts/operator-corpus-proof.ts run` from a clean checkout of that exact
source, using the separately locked release toolchain. Obtain the existing
Wrangler OAuth credential only after installation; keep it in process memory.
Supply the exact `operatorApproval(challenge)` and the **same persistent local
ledger** for every attempt. Never create a replacement ledger to reset limits.
The protected challenge includes a fresh unsampled quota observation and unchanged
controls. The operator accepts it only within 50 seconds and completes the four
allowlisted integrity commands within that admission interval, with live authority
checked before each command. The operator never calls GraphQL or scans data.
The protected job then executes every complete-cell, raw schema/ledger, local FK
witness and physical-integrity read. Its proof producer consumes the four exact
operator-attested results without sending any INSERT to the read token. The
reservation excludes other data writes across both phases; unchanged controls
are checked throughout. SQL is never retried. Preserve both journals, cumulative
metering and unknown-cost reserves. The full receipt includes both phases' reads,
writes and requests and binds the operator envelope hash.

Submit only the sanitized integrity envelope using the existing `pr.yml` manual
dispatch's `operator_proof_json` input at the exact PR source branch. The upload
job has no cloud credential or environment, and accepts only owner actor ID
40179660 on attempt 1. No OAuth credential is sent to GitHub. The protected stage
checks the server-authored dispatch actor/source/attempt, immutable artifact
digest, nonce, expiry and integrity receipt before its complete read verification. It
retains a separate full receipt at the flat downstream artifact path, together
with the nested operator evidence and failure-cost journal. Partial proofs,
ambiguous results, altered sources and multiple submissions fail closed.

The normal Deploy Preview job consumes the protected stage's same-run envelope
and independently checks its hash, full receipt and current controls. It then
uses the unchanged custom-domain deployment command and all existing live tests.
The operator stage and Deploy Preview retain the existing separate approvals.
No new token, secret, account, permission, environment or approval policy is added.

Live GitHub authorization observations use only allowlisted metadata GET routes.
For HTTP 502/503/504, retry that GET once after 250 ms; each CLI call has a
15-second timeout. Require the recovered fresh response to pass every existing
run/job/source/label/main check and recheck challenge expiry after observation.
Persistent outages, other HTTP errors, malformed metadata, timeout ambiguity or
revoked/changed authorization stop the proof. This does not retry SQL, owner
dispatches, diagnostic writes, deployments or any other mutation. A stopped
proof retains its measured/unknown costs in the same ledger and needs enough
remaining authorized reads and diagnostics before any new complete proof.

The owner-approved preview authorization `pr170-preview-checkout-review-20261030-01` reserves
3,510,997 reads, hard cap 3,800,000 across retries, and four total diagnostics and
at most four writes. Admission also requires unsampled account usage plus the
whole proof and 200,000 uncertainty reads to fit the existing 4,000,000 operating
ceiling; account writes plus four must fit 80,000. Start only when the entire
90-minute window fits the UTC quota day. Other preview data writes are reserved
for that window; application reads may continue. This is an owner reservation,
not a provider-enforced lease.

The owner approved an additive continuation after **October 31 00:05 UTC**:
the same preview authorization/ledger has a **4,583,687 cumulative read cap and
eight total diagnostic commands/at most eight writes**. Its existing measured
1,072,690 reads and four commands/writes remain spent. This leaves exactly the
3,510,997 full reservation and four new diagnostics/writes for one fresh proof;
the prior failed attempt and native evidence must remain in the ledger.
The producer and both receipt consumers reject counters below those known
spent totals; a missing/recreated zero ledger cannot activate this extension.
These expanded cumulative bounds apply only to preview challenges created at
or after that approved time. Each proof still has the original 3.8M hard cap,
exactly four diagnostics/at most four writes and the complete source-bound
verification. Production retains its original cumulative 3.8M/four allowance.
The continuation renews the prospective ≤90-minute preview data-write
reservation. Normal 200K uncertainty and the 4M operating ceiling apply after
the reset; no October 30 margin waiver carries into October 31.

For **October 30, 2026 UTC preview only**, the owner explicitly waived the
200,000-read analytics uncertainty margin to complete this security release.
Admission requires usage + the full 3,510,997 reservation ≤4,000,000. The source
derives this exception from the actual preview role and UTC day; production
and every other day retain the 200,000-read margin. The protected admission
journal records the waived margin and date, and the operator's four-command
phase applies the same policy. Periodic unsampled usage, local/in-flight cost
accounting, unknown-cost reserves, the 4M operating ceiling, 3.8M cumulative
proof cap, four-command/write limit, single-UTC-day window and all complete
verification/source/approval checks remain. The owner accepts the reduced
allowance for analytics ingestion delay; no account, token, binding or billing
change is involved. The earlier quota-refused run issued no SQL and remains
recorded at zero cost in the same persistent ledger; this source correction
does not reset the allowance.

For **October 29, 2026 UTC only**, the owner waived the usual production read
buffer for this preview. The existing operator authorization may therefore use
the 5,000,000-read Free allowance, retaining the 200,000-read analytics margin
and reserving 500,000 reads for the unchanged fixed live audits. Full-proof
admission requires usage + 3,510,997 + 200,000 + 500,000 ≤ 5,000,000; periodic
checks preserve that live-audit reserve. The complete proof's 3.8M cumulative
cap, four-command/write limit and all other checks are unchanged. The exception
is rejected for production and outside that UTC date. Production queries may
exhaust the shared allowance before the 00:00 UTC reset, a risk accepted by the
owner. That historical follow-up has ended.
The operator OAuth analytics endpoint returned a provider rate-budget error even
with the documented account-based header. That header did not resolve admission
and is not retained. Routing quota/read verification through the existing protected
read token avoids granting additional access or transferring that token locally.
An integrity-only receipt cannot pass the deployment receipt consumer.

Production uses the same full receipt consumer behind its existing separate
environment and release gates. A preview receipt cannot authorize production.
Production needs its own source-matched fresh proof, budget, timing and rollback
approval. No merge or production dispatch is authorized in this preview task.
SEC-06 remains open and paused; corpus activation and broader process work wait.

The PR #170 source-admission gate additionally requires the unprivileged shared production-validation rehearsal. Historical PR #167 preview budgets/receipts remain frozen and cannot authorize this changed source/tree. No PR #170 proof or production continuation is approved by publishing this correction.
