# Production Release Reconciliation

This document describes a future protected production cutover. It records
release safeguards only; it does not claim that PR95's 25-work Transform-9
materialization is deployed to production. At this revision, the checked-out
local catalog and deployed preview corpus have 25 works (the legacy 17 plus the
reviewed core eight). The Transform-10 Aquinas packet is local-only and
unpublished; normal D1 corpora prove that its hierarchy rows and shared lineage
are absent. It has no document/catalog, runtime, or MCP projection.

The fresh normal production candidate
`theologai-production-20260728-normal-a`
(`a3d26bba-7adc-44b0-86d0-562b2ced6bd3`) was prepared exactly once in ENAM.
Its reviewed 49-file deterministic seed imported 1,627,474 rows, and readiness
plus Transform-8/9 authority audits passed. The checked-in root binding names
that future candidate so the protected workflow can re-resolve and verify it;
that configuration is not evidence of live traffic. Live production remains
the PR #96 17-work Transform-8 Worker/D1 assignment
`7a3f5078-37bc-453e-bac7-a0743afd508a` /
`theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`) until a separately authorized merge,
deployment, and audit complete.

The production workflow is intentionally derived from checked-in identity:

1. It resolves `wrangler.toml`'s one root `THEOLOGAI_DB` binding by both D1
   name and UUID from a fresh read-only inventory.
2. It runs the deterministic readiness query plus Transform-8 and Transform-9
   authority audits and the Transform-10 normal-exclusion checks against that
   exact name.
3. Before mutation, it records the sole 100%-active Worker version, its
   authoritative D1 binding, the checked-in candidate mapping, and hashes of
   the read-only evidence.
4. After deployment, it accepts only the Wrangler-reported newest
   `version_upload` version as the sole 100%-active deployment. One annotated
   secret-update intermediate is the only allowed additional version.
5. Before either black-box audit, it proves that the active Worker has exactly
   the readiness-tested candidate D1 UUID. The non-throwing observation is
   retained even if the strict binding gate then fails.
6. It runs the fixed production original-language-v2 and Transform-9 historical
   audits, then checks the exact Worker deployment/version remains active and
   records a final read-only reconciliation observation.

The production commands accept no URL, environment, Worker, D1, retry,
rollback, seed, or binding override. They never create or delete a database,
fetch CCEL material, deploy, or roll back. A failed audit is a manual recovery
decision using the retained predecessor and post-mutation evidence; no automatic
rollback or cleanup is attempted.

The canonical fixed production MCP endpoint is
`https://mcp.theologai.xyz/mcp`. The legacy Workers URL remains a compatibility
alias, not an audit target.
