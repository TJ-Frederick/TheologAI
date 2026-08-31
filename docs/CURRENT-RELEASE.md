# Current release snapshot

<!-- theologai-release-authority v1 role=current-snapshot current=self -->

This dated, sanitized record is the repository's sole present-tense release
identity authority. Other release documents provide operational guidance,
plans, or historical evidence and point here for the active assignment. This
snapshot records the completed Phase 3B.1 dual-era release established by PR
#151 and successful protected production run `33443530427`, completed
`2026-08-31T22:18:10Z`. The same run proved the exact production assignment,
the unchanged protected-preview control, and their distinct D1 bindings after
all release audits. It remains a point-in-time record, not a guarantee against
later authorized release activity.

## Active production assignment

PR #151 merged as source `50fcc5ea1d460a7869d5c0b5bf29aa26a37cbfc5`
with parents `e7516c9e89f7735adcecac291e81b38ba93720a8` and
`2284a40a4a504f880576477975e5583bd5f63357`, and tree
`e73599eb50cd4a6beb6d756a587118407fc548e2`. Protected run
`33443530427` recorded GitHub deployment `6190302838` and the sole active
Cloudflare production assignment: deployment
`e44c5732-7203-4ac8-87db-f50cbd6761f0`, Worker
`a04644c3-c49b-46e0-a42a-b8489e1f7a99` (version #136), and
`THEOLOGAI_DB` `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`).

The immediate same-D1 predecessor is PR #145, retained only as predecessor
evidence: deployment `8cefbaf9-1c0f-4565-b1a4-bd4be2ec86a7`, Worker
`387953b4-a0b1-42b3-998c-67afef01e936` (version #134), on that same production
D1. It is not the active assignment.

## Preview control

The preview control observed before deployment, after deployment, and after
the production audits remained PR #151 deployment
`a430e3f5-d634-4c8a-a639-ea04794b7796`, Worker
`38ecbb40-ded3-462e-b264-0a8786c8a4d5` (version #150), and D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). It is a read-only control identity,
not production rollback authority. Protected preview run `33441596793`
recorded GitHub deployment `6190180665` against exact reviewed source
`2284a40a4a504f880576477975e5583bd5f63357` and the same tree
`e73599eb50cd4a6beb6d756a587118407fc548e2` used by the production merge.

## Deployment gate and release evidence

The unprivileged classifier in run `33443530427`, attempt `1`, emitted one
canonical deploy/non-documentation-path plan for base
`e7516c9e89f7735adcecac291e81b38ba93720a8` and exact head
`50fcc5ea1d460a7869d5c0b5bf29aa26a37cbfc5`, covering three records. The plan
recorded `classification_succeeded=true`, `deploy_required=true`,
`decision=deploy`, and `reason=non-documentation-path`. The canonical plan
bytes hash to `bcb18ae5fccebf60244afbbd930bd477eba95033d1cf772360c21ebeac61f7ad`.
The one-day gate artifact was `9777149938`; its ZIP API digest was
`78e66cba5010265aae8d188a481133ac82f9b16b1195cff2ac940895ac4e4f3d`.

The same run uploaded seven distinct post-deployment release-evidence
artifacts. Their GitHub artifact IDs and ZIP SHA-256 values are:

| Evidence | Artifact ID | ZIP SHA-256 |
|---|---:|---|
| D1 readiness | `9777830856` | `748333ef10d10ef775676ee87d6a03c6b02a697a648eed7a8c915dc260910242` |
| release predecessor | `9777833021` | `6c3bbd2aa677b3459ceea9c2ded69440afc90d4a992125ddfd3fdf181f4f8e23` |
| candidate cutover | `9777846323` | `c0ecd643c46213720adfc43cd8534650514b9b2bd4f0425da04329d72bfef5b7` |
| edge stabilization | `9777851001` | `251b5ae91753c09783d472878929c16774297e31506b94291c35a915318f557d` |
| final routing | `9777870204` | `bb264dfbd5028c95f47cc2b40a28b5ce702194879229313bf7940680c7fb1d87` |
| release reconciliation | `9777872282` | `10b727da1af6a041c66c259563bb2b3c1a7582e92902d8f976d0a3bd9ac39ce8` |
| release audit | `9777872720` | `e26b9ae55b9801cb4159a9f8c65874ebbc2c9625ad6c9016cc456ff62d30a9b6` |

All seven ZIP digests matched GitHub's artifact metadata and expire on
`2026-09-30`. Sanitized evidence
proved D1 readiness and authority, exact predecessor/candidate/final routing,
stable edge registration, the original-language 11/11, historical-core 8/8,
historical-spine 10/10 audits, and production/preview environment isolation.
The final routing JSON hashes to
`736025402d589bd9c2fa49d0fb3a5360966caa1626d3278cbebc9d2f26399ced`;
the final isolation receipt hashes to
`8f5f1fab7912a1af540674c42da4f43ad13455deb92f2488ae5e3fa9c66a8d83`.
The original-language, historical-core, and historical-spine audit JSON files
hash respectively to
`2e2e49d7cb12e7effb30a03a90f5702cdd77f20841c8efec186ddda422ea1603`,
`25a1aea31a924ae4dfd4d127cc66ed1a62023bb7b332352163bdc09c46687473`,
and `4b2f68474627b931ecc10063389af438b5edfcfaee18606e3d21f6cee799302e`.
The run made one production Worker deployment and no preview mutation or
D1/schema/data write. The gate artifact is not one of the seven release
artifacts.

## Repository/runtime reconciliation

PR #148 first merged the dual-era implementation as
`c59ecbf278cd8ea473a9f524002ccc7968f51905`. Its merge-triggered run
`33432068547` correctly failed closed before the production environment
because no exact protected-preview receipt existed. PR #149 then opened the
release candidate; its first preview audit exposed stale release-auditor
expectations. PR #150 repaired those auditors. The refreshed PR #149 preview
passed, but its documentation-only merge `e7516c9e89f7735adcecac291e81b38ba93720a8`
correctly classified as no-deploy in run `33441001023`.

The subsequent manual run `33441199613` failed closed before production when
it exposed a preview-versus-production server-version mismatch in the receipt
verifier. PR #151 repaired both verifier sites and added the missing regression
coverage. Its exact head `2284a40a4a504f880576477975e5583bd5f63357`
passed protected preview run `33441596793`; the preview audit and reconciliation
artifact ZIP digests are
`8b626c3509206449edaebca6dc42b1a60a772ffb70bfb470fd07b3973f359fbc`
and `1cdff4e23c58e97a2c7080e0abbb616ea19f7b2dd68dbea108832f6c11ca4bec`.
The source-bound receipt JSON hashes to
`1180fd9b524a6322929a10109aff33ed478c0794fd27eab3569d67eb1e863fc9`.
The merge tree remained identical to the audited preview tree, so production
run `33443530427` retrieved and verified that exact receipt before entering
the protected production environment.

Earlier C2 evidence records that the PR #146 repository state used for the
corrective rehearsal advanced `main` before the C2 reconciliation. It was a
workflow/reconstruction merge, not a documentation-only merge: source
`833c0b1902adb65a91929e1b2acc7ac7c0901a60`, parents
`e5c39c5e113454b264fa1eb1dceab6512899cb2e` and
`fe7ecfb75cc1aa9b032f59159d8b4d559cd970ae`, and tree
`0ba3949ad3acee6100890f07d4f9bcf0cc968f65`. Classifier run `33274343385`
correctly recorded `deploy_required=true`, `decision=deploy`, and
`reason=non-documentation-path` for three records; classifier and verifier
passed. The protected Test, Build & Deploy job was cancelled before any steps.
GitHub deployment `6159929842` moved from waiting to error, with no Cloudflare
deployment, release artifact, or mutation. Its gate plan hash is
`6ed1dc21f7ff94a00b8d73be6cca860abe211e36d166ab4ed8b6a85198611497`, and the
expired gate artifact was `9721037652` with ZIP API digest
`43f8bb323b9408c5ccdef78c979490a57be49c2c11d0ed34f29ea40d4a1025ec`.

The successful protected rehearsal was run `33274529784`, attempt `1`, against
`main` at `833c0b1`; it completed `2026-08-29T21:06:51Z` with Wrangler
`4.114.0`. It was explicitly `deployment:false` with no GitHub deployment.
Receipt artifact `9721279150` (`production-rollback-rehearsal-33274529784-attempt-1`)
has ZIP SHA-256
`d679b73e57c210d92b9033585cf77a13dd433ffd84d12f974665168609d75acc`, receipt
JSON SHA-256 `4c1def9b6e5450212b521c3c5d09512ed1d97aa60cbba51d86bf5205e35cbca6`,
and expires `2026-09-28T21:06:45Z`. All exit statuses were zero;
`trafficMutation=false`, `d1Mutation=false`, and `previewMutation=false`, and
the fixed target was inactive before and after. This proves dry-run
compatibility only, not failover or rollback authority.

The receipt's before/after hashes were unchanged for production deployment
`aff4d2aca359cdf75bdd37c450d3606f3addb70dd0556fb2e070e52f56f04675`, production
version `37b5babca5d505ca3281b29848509e3a4d37dda961ca2dc1344bf8be967f5d1c`,
preview deployment `9f9a9e3c4fa975036653cb3748a738ca949b33d46039507c62be6fbdde24e8f0`,
preview version `1b1b711f8d83e98c191fb84b7a3feda015249b34ac501d1f5022ebfe8f7beac1`,
and D1 inventory `69f0bf4be8f30b4a06759a309a074a04db500a3b72afce170b5deb21170fcbb5`.
Target version proof is `d709dd5189677c399277591f7ebdd2cde0faa32610a739277a763f795786db70`
and target deployment proof is
`d93caa62799e52d77ad0b7be9e1a9b64233f1bf830fababd20aab7149d42418f`.

## Rollback and custody boundary

No historical Worker or D1 is authorized for rollback merely because it is
documented. Never mix a Worker with a D1 from a different captured assignment.
Rollback requires a separate owner decision plus fresh compatibility,
readiness, and complete matched-pair evidence.

Release artifacts are time-limited GitHub evidence. On `2026-08-24`, the owner
selected H1 Option A only for the finite PR #124–#138 cohort and accepted its
natural expiry without a durable archive. That decision does not cover the PR
#145 or PR #151 release artifacts or gates, the PR #146 gate, or the rehearsal
artifact recorded above. This snapshot records their configured expirations
and retained metadata
and digests; it grants no new archive/download, deletion (including
temporary-copy deletion), cleanup, credential, deployment, or rollback
authority. Exact ZIP, content, file-roster, and privacy revalidation may become
unavailable if those artifacts expire, but no broader custody decision is
inferred here.

The fresh rehearsal is satisfied only for the dated run recorded above. The
30-day stability, no-active-binding, reconstruction, compatibility, and exact
owner gates remain in force; no cleanup is authorized. The fixed PR #108
source/tree and Worker/D1 target remain the rehearsal target regardless of the
current PR #151 runtime assignment.
