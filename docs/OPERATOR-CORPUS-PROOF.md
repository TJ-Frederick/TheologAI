# PR #170: existing operator access for complete corpus verification

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

The owner-approved preview authorization `pr170-preview-checkout-review-20261030-01` reserves
3,510,997 reads, hard cap 3,800,000 across retries, and four total diagnostics and
at most four writes. Admission also requires unsampled account usage plus the
whole proof and 200,000 uncertainty reads to fit the existing 4,000,000 operating
ceiling; account writes plus four must fit 80,000. Start only when the entire
90-minute window fits the UTC quota day. Other preview data writes are reserved
for that window; application reads may continue. This is an owner reservation,
not a provider-enforced lease.

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
