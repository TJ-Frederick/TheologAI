# Production Release Reconciliation

This document describes a future protected production cutover. It records
release safeguards only; it does not claim that PR95's 25-work Transform-9
materialization is deployed to production. At this revision, the checked-out
local catalog and deployed preview corpus have 25 works (the legacy 17 plus the
reviewed core eight). The Transform-10 Aquinas packet is local-only and
unpublished; normal D1 corpora prove that its hierarchy rows and shared lineage
are absent. It has no document/catalog, runtime, or MCP projection.

The fresh schema-`0008` production candidate
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`) was unbound when it was prepared
exactly once in ENAM. Its reviewed 49-file, 1,627,474-row deterministic seed
has corpus identity `c43bfa2f5e7ff04c3641a228092bdc91d597edc60dc7d596507e8ca6c0ac90fe`;
remote readiness and Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. The checked-in root target lets the protected
workflow re-resolve and verify that candidate, but it alone is not evidence of
a current live Worker binding or hierarchy/publication activation. Before a
separately authorized merge, deployment, and audit complete, live production
is PR #104 deployment `07bbd8aa-5c69-4b0c-a9df-c756f537bb97`, serving Worker
`09fa6471-eb50-480e-85b2-bc04b742dcb3` (#94), bound to D1
`theologai-production-20260728-normal-a`
(`a3d26bba-7adc-44b0-86d0-562b2ced6bd3`). The current preview baseline is PR
#101 deployment `070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`).

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
