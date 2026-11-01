# Release security remediation — SEC-01–05; SEC-06 deferred

**SEC-01–05 are resolved in production** through PR #170 merge `a1b684bd45cc116d92c1ec7a4d5300c0017d82f2` and [protected run 41256928054](https://github.com/TJ-Frederick/TheologAI/actions/runs/41256928054). The normal preview → hosted tests → protected production process completed. It limits MCP input complexity before validation,
updates Node to 22.23.4, makes rate limits independent of User-Agent, refreshes
vulnerable dependencies, and separates application builds from deployment
credentials. Existing environment approvals, custom-domain deployment commands,
D1 targets, and release checks remain in place. [Completed release/evidence](security/SEC01-05-PRODUCTION-COMPLETE-2026-11-01.md) records all verification and native artifacts. This document is not release-identity authority; see [CURRENT-RELEASE.md](CURRENT-RELEASE.md).

**October 23 release scope decision:** the user paused SEC-06. Keep the existing
Cloudflare account, credential values and permissions, and deployment process.
No further credential diagnostics, permission/binding hardening, account
migration, or custom-domain command changes are part of this release. SEC-06
remains open and paused, with the remaining risks recorded below. The completed
temporary diagnostic was removed from the runnable PR workflow; its sanitized
evidence remains historical assessment material.

## Remaining risks and explicit limits

| Risk | Current disposition |
| --- | --- |
| SEC-06 preview authority (P2) | **Open and paused.** The October 23 exact-token assessment confirmed account-wide Worker write and production metadata visibility. Distinct D1 bindings and owner gates do not constrain a compromised approved runner/token after approval. Same-account rebinding and the shared, execution-disabled coordinator remain risks. No compromise was established. |
| Deferred credential evidence | Production-token separation is historically corroborated, not freshly verified for the current secret. Narrowed permissions have not been proven compatible with the existing custom-domain command. Neither check was reopened for release/docs work. Keep the existing account, policies, bindings and deployment flow. |
| Dev-only dependency exception | Zod 3.25.76 under `@cloudflare/vitest-pool-workers` 0.18.8 retains one advisory with two propagated high findings. It is local test configuration only, outside deployed/runtime and release trust sets. The exact-path/version/advisory exception fails closed on drift or expiry at **2026-11-22T00:00:00Z**. Upgrade/review separately before expiry; no global audit suppression. |
| Anonymous service / quota exposure | Stable-IP limits remain per-key/per-location, public limiter outages still fail open, NAT users share allowances and distributed clients can consume capacity. These are abuse friction, not a global or authenticated quota guarantee. Request/input bounds remain enforced; additional edge/aggregate controls need their own scope. |
| Residual release trust | Reviewed repository helpers, the pinned release dependency set and its required SQLite native build still execute as trusted code. Owner approval is not an independent second-person review or a sandbox for the authorized toolchain. Maintain exact-source gates and audit/runtime maintenance. |
| Evidence and recovery | Audits are point-in-time evidence, not proof of no historical compromise. GitHub artifact expirations and analytics ingestion limits remain; live-audit D1 rows are not separately metered. Rollback requires a separate owner decision plus fresh matched Worker/same-D1 compatibility/readiness evidence. |

SEC-01–05 closure applies to the reviewed application/security backport. Norton/Aquinas activation and broader release/data-process changes remain deferred. No additional credential diagnostic, account migration, policy/binding change, quota spend or production operation is authorized by this summary.

## Preserved backport audit boundary

See [the backport review](SECURITY-BACKPORT-REVIEW.md) for the precise baseline,
SEC-01–05 changes, validation history and SEC-06 pause. The production gates subsequently passed; see the completion linked above.

The dependency audit permits only the existing development-only
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
exception for Zod 3.25.76 reached through pinned
`@cloudflare/vitest-pool-workers` 0.18.8. It expires at
`2026-11-22T00:00:00Z`. The auditor rejects production reachability, another
version or dependency path, a different high/critical advisory, expiration,
and audit errors. Root application Zod is patched to 4.6.7. This exception
does not authorize application or release jobs to run the development graph
with cloud credentials.
