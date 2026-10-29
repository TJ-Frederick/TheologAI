# PR #167: existing operator access for complete corpus verification

The deployment credential has D1 Read; direct HTTP FTS integrity INSERTs require
D1 Edit. Keep its permissions unchanged. Use the existing operator OAuth grant
locally for the existing complete proof, including exactly four rank-1 integrity
commands. No seed, migration, rebuild, binding, account or billing change occurs.

The protected preview stage reuses the former diagnostic stage's environment,
GitHub permissions and shared preview mutation lock. It admits only PR #167's
current source after every normal CI job and source artifact passes. After
approval it issues a random challenge bound to the source, tree, plan, base,
run/attempt, target, cumulative authorization and 90-minute same-UTC-day window.
Prepare the local isolated release toolchain and source artifacts before approval.

Run `scripts/operator-corpus-proof.ts run` from a clean checkout of that exact
source, using the separately locked release toolchain. Obtain the existing
Wrangler OAuth credential only after installation; keep it in process memory.
Supply the exact `operatorApproval(challenge)` and the **same persistent local
ledger** for every attempt. Never create a replacement ledger to reset limits.
The producer uses all existing complete-cell, raw schema/ledger, local FK witness,
physical integrity, rank-1 FTS, primary/single-attempt, quota and response limits.
It rechecks live protected-job/PR authority periodically and before each FTS write.
Only a transient read-only analytics error at the final metadata observation may
be retried once; SQL is never retried. Preserve journals and unknown-cost reserves.

Submit only the sanitized complete envelope using the existing `pr.yml` manual
dispatch's `operator_proof_json` input at the exact PR source branch. The upload
job has no cloud credential or environment, and accepts only owner actor ID
40179660 on attempt 1. No OAuth credential is sent to GitHub. The protected stage
checks the server-authored dispatch actor/source/attempt, immutable artifact
digest, nonce, expiry and complete receipt. It rechecks both actual Worker/D1
controls using the existing deployment token, without SQL. Partial proofs,
ambiguous results, altered sources and multiple submissions fail closed.

The normal Deploy Preview job consumes the protected stage's same-run envelope
and independently checks its hash, full receipt and current controls. It then
uses the unchanged custom-domain deployment command and all existing live tests.
The operator stage and Deploy Preview retain the existing separate approvals.
No new token, secret, account, permission, environment or approval policy is added.

New preview authorization `pr167-preview-operator-full-20261029-01` reserves
3,510,997 reads, hard cap 3,800,000 across retries, and four total diagnostics and
at most four writes. Admission also requires unsampled account usage plus the
whole proof and 200,000 uncertainty reads to fit the existing 4,000,000 operating
ceiling; account writes plus four must fit 80,000. Start only when the entire
90-minute window fits the UTC quota day. Other preview data writes are reserved
for that window; application reads may continue. This is an owner reservation,
not a provider-enforced lease.

For **October 29, 2026 UTC only**, the owner waived the usual production read
buffer for this preview. The existing operator authorization may therefore use
the 5,000,000-read Free allowance, retaining the 200,000-read analytics margin
and reserving 500,000 reads for the unchanged fixed live audits. Full-proof
admission requires usage + 3,510,997 + 200,000 + 500,000 ≤ 5,000,000; periodic
checks preserve that live-audit reserve. The complete proof's 3.8M cumulative
cap, four-command/write limit and all other checks are unchanged. The exception
is rejected for production and outside that UTC date. Production queries may
exhaust the shared allowance before the 00:00 UTC reset, a risk accepted by the
owner. The duplicate evening follow-up is paused.
The scoped quota observations use Cloudflare's documented
[`X-Rate-Limit-Type: account-based`](https://developers.cloudflare.com/analytics/graphql-api/account-based-rate-limiting/)
request header after preflight observed the default credential bucket returning
`extensions.code: budget`. This changes only the analytics rate-limit bucket;
the complete unsampled counter query, credentials, account and data allowances
stay unchanged. It does not change account settings or retry SQL.

Production uses the same full receipt consumer behind its existing separate
environment and release gates. A preview receipt cannot authorize production.
Production needs its own source-matched fresh proof, budget, timing and rollback
approval. No merge or production dispatch is authorized in this preview task.
SEC-06 remains open and paused; corpus activation and broader process work wait.
