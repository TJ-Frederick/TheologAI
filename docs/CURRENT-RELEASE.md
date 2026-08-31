# Current release snapshot

<!-- theologai-release-authority v1 role=current-snapshot current=self -->

This dated, sanitized record is the repository's sole present-tense release
identity authority. Other release documents provide operational guidance,
plans, or historical evidence and point here for the active assignment. This
snapshot records PR #145 as established by successful protected release run
`33048777172`, completed `2026-08-27T12:59:01Z`. Its unchanged production and
preview controls were later independently reverified by successful protected
rehearsal run `33274529784`, completed `2026-08-29T21:06:51Z`; that is the latest
observation in this snapshot. It remains a point-in-time record, not a
guarantee against later authorized release activity.

## Active production assignment

PR #145 merged as source `e5c39c5e113454b264fa1eb1dceab6512899cb2e`
with parents `d869c0c4c621f4682194307c490f6837774dc391` and
`e36f6877bc5a5afea3cd51a5b422634f078f5ecb`, and tree
`e1e02c7280e7737b7a66d9ceed9a9cb6acfbb0de`. Protected run
`33048777172` recorded GitHub deployment `6118233768` and the sole active
Cloudflare production assignment: deployment
`8cefbaf9-1c0f-4565-b1a4-bd4be2ec86a7`, Worker
`387953b4-a0b1-42b3-998c-67afef01e936` (version #134), and
`THEOLOGAI_DB` `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`).

The immediate same-D1 predecessor is PR #138, retained only as predecessor
evidence: deployment `e8108f56-ae2e-4598-8324-f8b17a131f6a`, Worker
`a481b2f7-ce75-4d55-8804-48dc7fccb4a3` (version #132), on that same production
D1. It is not the active assignment.

## Preview control

The preview control observed before deployment, after deployment, and after
the production audits remained deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (version #144), and D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). It is a read-only control identity,
not production rollback authority.

## Deployment gate and release evidence

The unprivileged classifier in run `33048777172`, attempt `1`, emitted one
canonical deploy/non-documentation-path plan for base
`d869c0c4c621f4682194307c490f6837774dc391` and exact head
`e5c39c5e113454b264fa1eb1dceab6512899cb2e`, covering 15 records. The plan
recorded `classification_succeeded=true`, `deploy_required=true`,
`decision=deploy`, and `reason=non-documentation-path`. The canonical plan
bytes hash to `e4cb1506611f727c8b83b2108ba5378164da64989fb42b5343aeb14f2cc4456d`.
The one-day gate artifact was `9636701235`; its ZIP API digest was
`2abc3435b0314be54a943472049f711866df2581942e942ce522b2df0ffbcda0`.
That gate artifact expired on August 28 (`2026-08-28`). These values survive through verified
logs and GitHub API metadata; this record does not imply a fresh artifact
download.

The same run uploaded seven distinct post-deployment release-evidence
artifacts. Their GitHub artifact IDs and ZIP SHA-256 values are:

| Evidence | Artifact ID | ZIP SHA-256 |
|---|---:|---|
| D1 readiness | `9647166784` | `b9ed826bc126749298d2be4b329e1e7148daf7679f83f1e25fc1951f96299ba2` |
| release predecessor | `9647169526` | `644e34ba284db8ea1e7c82f94fd1d0acec8146a34f076006857e0622519bc3ea` |
| candidate cutover | `9647186636` | `85cbc86a7e0f5d3ce64a2f080c93f0f0d0a1526145af348203138e45ebafcea8` |
| edge stabilization | `9647193785` | `4b96f8f984d4979a3b149ecc02d8e0e1f7f60c0fed9401f7a908c75db0592ca6` |
| final routing | `9647224619` | `7e58d805cac8eb1342db7182ebdf5734141b4dc48b49805369ef049be9fb23be` |
| release reconciliation | `9647227387` | `dc23f1566abbc21c6bea279b0c6b1a3df438db2596d3c996f01d400c7da6a2a0` |
| release audit | `9647228043` | `f28e356eb5cddebd468442f29dcbbba41a24d101a5843b11dc3284b60916e5b0` |

All seven ZIP digests matched GitHub's artifact metadata and expire on
`2026-09-26`. Sanitized evidence
proved D1 readiness and authority, exact predecessor/candidate/final routing,
stable edge registration, the original-language 11/11, historical-core 8/8,
historical-spine 10/10 audits, and production/preview environment isolation.
The run used exactly one protected-environment approval, one same-value masked
`ESV_API_KEY` re-put, and one production Worker deployment. It made no preview
mutation or D1/schema/data write. The gate artifact is not one of the seven
release artifacts.

## Repository/runtime reconciliation

The PR #146 repository state used for the corrective rehearsal, which advanced
`main` before this C2 reconciliation, was a workflow/reconstruction merge, not
a documentation-only merge: source
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
#145 release artifacts or gate, the PR #146 gate, or the rehearsal artifact
recorded above. C2 records their configured expirations and retained metadata
and digests; it grants no new archive/download, deletion (including
temporary-copy deletion), cleanup, credential, deployment, or rollback
authority. Exact ZIP, content, file-roster, and privacy revalidation may become
unavailable if those artifacts expire, but no broader custody decision is
inferred here.

The fresh rehearsal is satisfied only for the dated run recorded above. The
30-day stability, no-active-binding, reconstruction, compatibility, and exact
owner gates remain in force; no cleanup is authorized. The fixed PR #108
source/tree and Worker/D1 target remain the rehearsal target regardless of the
current PR #145 runtime assignment.
