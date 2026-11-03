# CI/release reliability — production complete, November 3, 2026 UTC

PR #172 completed implementation and the separately approved preview and production operations. The [current release snapshot](../CURRENT-RELEASE.md) is the sole current release-identity authority; identifiers here are dated completion evidence.

- Exact deployed merge `701ab6295f033105ec306f7878a85e294cba0f6d`, tree `6251804e5463ef279a29e9134971bac5166de57a`, first parent `8a0ad10c53d81b1e575dfd6b4b3df876d77ed5dc`; normal merge retained preview source `e705f8d9d123fa6503745abd9ad7fb5cb4c108ca` as second parent.
- [Production run 41645812927](https://github.com/TJ-Frederick/TheologAI/actions/runs/41645812927), attempt 1: all five required suites, canonical deployment plan, protected preview receipt, source artifacts, independent production owner grant, fresh proof, deployment, bounded live audits, final identity and environment isolation passed. Normal production approval covered both proof and deployment.
- [Preview run 41453663253](https://github.com/TJ-Frederick/TheologAI/actions/runs/41453663253) independently passed; native v2 receipt artifact `13150852775` ZIP `03559ead6d3bc8fc1d5e0f9ba398b79e649b027ae2ee04ee2ccb120858697dfe` bound the exact preview source/tree. It was a prerequisite, never production proof.
- Production native corpus artifact `13236325134` and plan `dd42daacdc18740a6fcf77d045f0aa80395fd331e29ba22b4d08d12b587375f9` bound actual merge `701ab6295f033105ec306f7878a85e294cba0f6d`. A new full independent clone passed complete Git/baseline/history checks and offline artifact readiness under Node 22.23.4, exact base release locks, audit and native SQLite 3.51.2 before protected approval.
- One new production authorization `operation-production-pr172-701ab629-20261103-41645812927`, owner dispatch `41647679394`, native authorization `13236635166` and ledger marker `13235741865`. Native bytes/content, owner/triggering owner, exact run/source/base/tree/plan and uniqueness were authenticated. Existing OAuth was used locally only for four diagnostics; scopes stayed unchanged and no token values were retained or transferred.

## Verification and bounded accounting

Fresh unsampled admission observed 22,718 account reads / zero writes: 22,718 + 3,510,997 reservation + 200,000 uncertainty = 3,733,715, within the normal 4,000,000 ceiling. No historical waiver applied. The owner reserved other production-target data writes across the full 90-minute same-UTC-day window; this was an operational commitment, not a provider-enforced lease.

The challenge was created `2026-11-03T13:51:03.414Z`, expired `2026-11-03T15:21:03.414Z`. Four rank-1 diagnostics completed `13:51:38.762Z`, within the 50-second interval. Integrity handoff dispatch `41648203958`, native artifact `13236087853` ZIP `05597d80a2c5cfee49de11b05cddb56d94c18bbc3b259fb5942bdfd0979b2a8a`, exactly matched the local envelope. Complete proof ran `13:51:14.390Z`–`14:11:25.954Z`: all 39 table digests / 1,625,092 canonical rows, source schema/ledger, local FK witness, quick_check and four FTS checks passed.

| Phase | Reads | Writes | Requests |
| --- | ---: | ---: | ---: |
| Operator | 0 | 4 | 4 |
| Protected reader | 3,299,468 | 0 | 3,289 |
| Combined | 3,299,468 | 4 | 3,293 |

Both journals matched their authenticated hashes and paired intents/results; zero SQL retries or unknown attempts. The original consumed ledger retains the whole both-phase reservation unchanged. Accepted terminal accounting is separate and grants no allowance reuse. Older scope-specific records remain frozen: failed/FTS series 3,299,783 known reads + 8,192 unknown reserve, zero known + two unknown writes/two commands; PR167 preview 3,299,468 reads/four writes; PR170 preview 4,372,158/eight; November 1 production 3,299,468/four; PR172 preview 3,299,468/four. These are separate historical scopes, not a global account balance or new authority.

All live cases passed without audit retries: original-language 11/11, historical core 8/8, historical spine 10/10. Edge probes 1 and 2 matched production contract v6. Existing live-audit D1 rows are outside the proof meter. Final preview controls were deeply identical and production/preview D1 remained distinct and unchanged. No seed/import/migration, permission/account/binding/corpus change, retry, continuation or rollback occurred.

## Retained native evidence and trust limits

Audit artifact `13236913963` ZIP `sha256:a10b9e6c4bf4864387ccd5c6f913a45ed944a3694c51092b677076e3c0e02491` expires `2026-12-03T14:14:06Z`. Full-proof artifact `13238310194` ZIP `sha256:a030b2fe2baa6cb3cb4e0b38fb546755e73e6f671faf562b937839f6e26423a5` expires `2026-12-03T14:11:29Z`. Reconciliation artifact `13238281352` ZIP `sha256:4f4b81fc3aba986e1131cd364a1ab21f39c9ba49bb9da972eced5f3a57efa1b9` contains final routing/cutover/isolation controls. Full envelope SHA-256 `40931274c77f2eeef62b4c2e2ac95c7afec1728701b306dbca6cb2bc7df84415`; readiness receipt `8589280e1484898672e84de35fab00161729d33ba016d0b23956c1ad126ddffd`. Native provenance, archive rosters/digests and final evidence were independently reviewed; all 56 retained completion hashes matched.

Detailed local evidence remains under `test-output/ci-reliability-remediation/production-pr172-2026-11-03/`, including `production-completion-summary.json`, `production-completion-review-hashes.json`, both journals and the original ledger. Finite native retention does not create permanent custody or a globally append-only ledger. Every future operation needs separate owner scope, fresh native admission/quota/controls and target proof; preview proof and completed allowances cannot substitute.

The scheduled wake did not execute and no production attempt was consumed by it. After Tyler explicitly resumed, the obsolete one-time automation was deleted before the single manual production dispatch. No retry is scheduled. The initial normal merge was blocked by automatic approval review; Tyler's subsequent explicit merge authorization resolved it, and the normal merge tool preserved exact parents/tree without bypass.

SEC-06 remains open/paused; corpus activation, remote-proof reuse without credible write custody, batching with weaker envelope accounting and broader process work remain deferred. [Remaining audit scope](REMAINING-AUDIT-SCOPE.md) records boundaries. This docs-only reconciliation does not alter deployed code or authorize another production dispatch.
