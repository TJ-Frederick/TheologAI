# Production Release Reconciliation

This document records the completed PR #122 schema-`0009` production cutover,
its immediate PR #108 rollback pair, older PR #101 history, and the safeguards
required for later releases.

## Current PR #122 production release

PR #122 merged as `86475ecf8288cb0ebcb6467c77c0fd0998a8f1c2` with exact tree
`8150aa29e7e4a22141edbfc9ab568df933f9c9b3`. Protected production workflow
`31631924636` deployed `e62698f3-f6b0-4145-97bf-28abdeae0e3a`, Worker
`02174f95-abe2-480b-84bf-3e8c1a3a0320` (#100), as the sole active production
assignment bound to schema-`0009` D1
`theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`).

Remote readiness and Transform authority passed. Edge stabilization matched
twice, original-language v2 passed all 13 logical operations, historical core
passed all 54 logical operations across eight works, and Transform-11
historical spine passed all 82 logical operations across ten works, with zero
audit retries. Final production identity remained the exact audited deployment
and Worker. Preview remained deployment
`13393917-fa91-4afc-aeaf-2809db6701a2`, Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe`, and D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`) before deployment, after deployment,
and after the audits. The final environment-isolation receipt proved the two
exact distinct Worker/D1 pairs.

Sanitized authoritative workflow evidence includes these SHA-256 identities:

- production D1 readiness receipt:
  `f112b33785a6c1953625c395954bd952db6f0224ad389c52996881b76973d112`;
- edge stabilization:
  `552f455683eb67ef1cd20a4355c338e448f6a6df3f2eff972987fc6f26b07b82`;
- original-language v2 audit:
  `30781505a0b1e26417e7d018fdea1060e490a53aab71ad295886c3291333bcc9`;
- historical-core audit:
  `7c397cd7ce73f11a151aff25fba3026764fc4981f51dd4d19fd40a3d2a38106c`;
- Transform-11 historical-spine audit:
  `a25a01b87e65ce3f391e4a131edc277411ba52a59a366313c622628351fd74a4`;
- final environment-isolation receipt:
  `a2daa145b6e4cbf6545fdcacb38f7e9939ba9c7b33db2141c86e7a8a54b834a5`.

The immediate rollback unit is PR #108 deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). No rollback, database cleanup,
credential operation, or CCEL request was part of PR #122.

## Historical PR #108 and PR #101 records
At the reconciliation cutoff immediately after PR #113, `main` was
`2f12262c9a37d3588bee9b5071954823c15cbd12` (tree
`9922aedb74c690e7a3fcb926b3d621f28fa44535`), and that revision was not
deployed. PRs #109–#113 are completed repository-only milestones: PR #109
records this cutover, PR #110 aligns provider-neutral CCEL audit readiness,
PR #111 supplies inert canary
transaction infrastructure, PR #112 records synthetic original-language
context-capacity evidence, and PR #113 records provisional Norton capacity
evidence that remains subject to local and release gates. Production runs for
PRs #109–#113 were cancelled and preview jobs skipped; they make no runtime, Worker,
deployment, binding, remote-D1, or corpus claim. Production therefore remains
the PR #108 v6/local-only release below, with CCEL execution disabled before
adapter, coordinator, or fetch.
The checked-out local catalog and preview have 35 works (the legacy 17 plus 18
reviewed editions); production now serves the same 35-work Transform-11
catalog after the successor cutover. The Transform-10 Aquinas packet remains local-only and
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
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). The PR #107 preview assignment is
the immediate retained predecessor. The current preview baseline is PR #122
deployment `13393917-fa91-4afc-aeaf-2809db6701a2`, Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe` (#142), and schema-`0009` D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`).

The checked-in root production target was separately prepared unbound as
Transform-11 candidate `theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). It was created once in ENAM from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f` with exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`. Its one-use schema-`0008`
preparation imported the exact reviewed 49-file, 1,630,259-row deterministic
seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and the complete
Transform-11 source-pack authority audit (`1/1/1/1/1/1/133/17` pages) passed.
PR #108 merged as `8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` with exact tree
`a59d9a062b2e6c7884de97fd97309878e1cbdc23`. Protected workflow
`30496350408` then deployed `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), as the sole 100% production
assignment bound to the candidate D1. Historical core passed 8/8,
Transform-11 spine passed 10/10, original-language passed 11/11,
primary-source edge stabilization matched on attempt 4 and remained stable,
and the independent post-release review returned `SHIP`.

The previous PR #101 assignment is retained as the matched rollback record:
deployment `71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`). Preview remained unchanged at
deployment `5e812152-355b-4a5f-a123-2485e89f1550`, Worker
`06b9a603-8339-42b6-a246-ef9238563043` (#140), and D1
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`).

GitHub deployment record `5665940735` and protected audit artifact
`8742223883` link that release to the following sanitized PR #108 evidence:

- deployment identity:
  `f7bb0275e53a9fe8801ecb3af68f9b74f5df44cab6f20c19cba9b1357d72afd5`;
- final routing/binding observation:
  `b1ceb8f02ef210b5fb2212a9b212108411630efcc28ad3248a51c19c7bb0e1c0`;
- primary-source edge stabilization:
  `604ce2dee6e14559a1a26c7d0d42e572469ce0e7cf4595be22f1085b9bc9ea05`;
- original-language v2 audit:
  `e74999ea97a78a4fe4a6233be18b6a71cb03a9e2207f5b0fe34f71db09fafb0f`;
- historical-core audit:
  `636b09fcd9bb41add56e99b001c41d7ad878594f2d77df8f7b41b51621c32c97`;
- Transform-11 historical-spine audit:
  `77da8832ab4139a769aae7d87716a3d581407cc2d036b6f7939e306d9b865de5`.

The retained historical PR #101 evidence has these exact SHA-256 identities:

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
6. It runs primary-source edge stabilization, the fixed production
   original-language-v2 audit, the Transform-9 historical-core audit, and the
   Transform-11 historical-spine audit. It then checks that the exact Worker
   deployment/version remains active and records a final read-only
   reconciliation observation.

The production commands accept no URL, environment, Worker, D1, retry,
rollback, seed, or binding override. They never create or delete a database,
fetch CCEL material, deploy, or roll back. A failed audit is a manual recovery
decision using the retained predecessor and post-mutation evidence; no automatic
rollback or cleanup is attempted.

The canonical fixed production MCP endpoint is
`https://mcp.theologai.xyz/mcp`. The legacy Workers URL remains a compatibility
alias, not an audit target.
