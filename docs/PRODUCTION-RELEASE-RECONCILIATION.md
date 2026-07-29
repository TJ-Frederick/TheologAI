# Production Release Reconciliation

This document records the completed PR #101 protected production cutover, the
prepared PR #107 successor, and the safeguards required for later releases.
The checked-out local catalog and preview have 35 works (the legacy 17 plus 18
reviewed editions); production remains on 25 works (the legacy 17 plus the
reviewed core eight) until the successor release proves cutover. The Transform-10 Aquinas packet remains local-only and
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
workflow re-resolve and verify that candidate. PR #101 merged as
`e2d351a11fce9c2cb1f72add0bcf365332737f3c` with exact tree
`b9807ea1980326b5faf0a8a595c9606c67abfce5`. Protected production workflow
`30401732957` then deployed Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96) through deployment
`71b76d24-bf5f-490e-adc4-31cf63fb046e` as the sole 100% production assignment,
bound to the candidate D1 above. Candidate readiness, Transform-8/9 authority
audits, Transform-10 normal-corpus exclusion predicates, primary-source edge
stabilization, 11/11 original-language cases, and the reviewed historical core
audit all passed. The retained PR #101 preview predecessor was
deployment `070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). The current preview baseline is
deployment `5e812152-355b-4a5f-a123-2485e89f1550`, Worker
`06b9a603-8339-42b6-a246-ef9238563043` (#140), and D1
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`).

The checked-in root production target is the separately prepared, unbound
Transform-11 candidate `theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). It was created once in ENAM from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f` with exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`. Its one-use schema-`0008`
preparation imported the exact reviewed 49-file, 1,630,259-row deterministic
seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and the complete
Transform-11 source-pack authority audit (`1/1/1/1/1/1/133/17` pages) passed.
The declaration is not live traffic evidence: production remains Worker
`bae58cd3-cad7-4663-879d-408accf061b0`, deployment
`71b76d24-bf5f-490e-adc4-31cf63fb046e`, and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`). Preserve that matched pair as the
rollback record until the protected release proves the candidate binding and
completes all post-deployment audits.

The retained sanitized production evidence has these exact SHA-256 identities:

- deployment identity:
  `54394f19fd5e1e933d6a5e3324abe36ba75f5a1c0d346d56335cc15e47798492`;
- final routing/binding observation:
  `c68c3dd65c40968250426bdb2c5e38917c10a32c11380ad3f00ec8b9be24e2f4`;
- primary-source edge stabilization:
  `59926f62bc375d47e1d12efca4ce5f229a7c14a7fd02268a4df2cc52f7a73893`;
- original-language v2 audit:
  `cf4aae7baccaed3334308d8056008da165f00706c080885f0ffb4290ceef5037`;
- Transform-9 historical-core audit:
  `c60f98020b555b748e2d5c80e8b18e004841e9ccf5813f4562e658c8783ea2b`.

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
