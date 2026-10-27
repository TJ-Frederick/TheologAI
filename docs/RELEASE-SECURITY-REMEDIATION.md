# Backport security release scope

See [the backport review](SECURITY-BACKPORT-REVIEW.md) for the precise baseline,
SEC-01–05 changes, validation, remaining gate issue and SEC-06 pause.

The dependency audit permits only the existing development-only
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
exception for Zod 3.25.76 reached through pinned
`@cloudflare/vitest-pool-workers` 0.18.8. It expires at
`2026-11-22T00:00:00Z`. The auditor rejects production reachability, another
version or dependency path, a different high/critical advisory, expiration,
and audit errors. Root application Zod is patched to 4.6.7. This exception
does not authorize application or release jobs to run the development graph
with cloud credentials.
