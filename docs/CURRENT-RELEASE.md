# Current release snapshot

<!-- theologai-release-authority v1 role=current-snapshot current=self -->

This dated, sanitized record is the repository's sole present-tense release
identity authority. Other release documents provide operational guidance,
plans, or historical evidence and point here for the active assignment. This
snapshot was observed through protected run `32686081134`, completed
`2026-08-24T03:44:34Z`; it remains a point-in-time record, not a guarantee
against later authorized release activity.

## Active production assignment

PR #138 merged as source `7fb1440d468920d90331d7d9ade22e155b2f0b95`
with parents `8f9a4ea9c26353c03a3331245e875c3aa000d720` and
`cfeb617bddc5173d5c6f15785d3075bd46b64ef2`, and tree
`1f9582c48344a69675f5bd9e77e69511a95e0132`. Protected run
`32686081134` recorded GitHub production deployment `6055941266` and the sole
active Cloudflare production assignment: deployment
`e8108f56-ae2e-4598-8324-f8b17a131f6a`, Worker
`a481b2f7-ce75-4d55-8804-48dc7fccb4a3` (version #132), and
`THEOLOGAI_DB` `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`).

The immediate same-D1 predecessor is retained only as predecessor evidence:
deployment `64e90697-90a9-4e5b-b49c-c9858ab6ba39`, Worker
`e0b45c08-e222-48a1-a3b3-44a513343935` (version #130), on that same production D1. It is not
the active assignment.

## Preview control

The preview control observed before deployment, after deployment, and after
the production audits remained deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (version #144), and D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). It is a read-only control identity,
not production rollback authority.

## Deployment gate and release evidence

The unprivileged classifier in run `32686081134`, attempt `1`, emitted one
canonical schema-v1 deployment plan for exact head
`7fb1440d468920d90331d7d9ade22e155b2f0b95`. The plan recorded
`classification_succeeded=true`, `deploy_required=true`, `decision=deploy`,
`reason=non-documentation-path`, and three exact changed paths. Artifact
`9505689392`, named
`production-deployment-plan-32686081134-attempt-1`, contained only the plan and
its SHA-256 sidecar. The canonical plan bytes hash to
`d39321451fa8c49a495fbffbf8fa02419a370d539fb1a40d509123ec24bc387b`;
the artifact ZIP hashes to
`101a86827d3eadad075e8f98cfa34a896d9fbbd5213fbb00eeaecf5042fa9fd4`.
The unprivileged verifier authenticated that exact gate before the production
environment was queued, and the protected job revalidated it before mutation.

The same run uploaded seven distinct post-deployment release-evidence
artifacts. Their GitHub artifact IDs and ZIP SHA-256 values are:

| Evidence | Artifact ID | ZIP SHA-256 |
|---|---:|---|
| D1 readiness | `9506107390` | `f36815f0757cb2e726f9eecb578ab8f9b99da7bca240526ec5d8018355644390` |
| release predecessor | `9506108839` | `79ba59a3a0c9866df4c84c03668dfba85884b00403893c35fb09ef9854a0e47b` |
| candidate cutover | `9506117560` | `8d68272f6b0c9e01ce274fbad118df9c3a30eadfd7adb1ad54ff8230886a1d12` |
| edge stabilization | `9506121733` | `240e5a7350c6147a8e95e6bf5be6b6c548b62a329e311d5739ea8f79297da38a` |
| final routing | `9506138188` | `16589abdc8d6298ef4500854e2ecb4c7ae8ffec11723208c346b115f587ffcfa` |
| release reconciliation | `9506139684` | `cd42b3c9c4cef64f21fa06836b0321853d0a321fce39fe470a61587c5c759c14` |
| release audit | `9506140112` | `fcb0c0ee8460fa9871b01b5641918e0b2913d3ae0b49a2d3fe5f65d00c3a47a0` |

All seven ZIP digests matched GitHub's artifact metadata. Sanitized evidence
proved D1 readiness and authority, exact predecessor/candidate/final routing,
stable edge registration, the original-language 11/11, historical-core 8/8,
historical-spine 10/10 audits, and production/preview environment isolation.
The run used exactly one protected-environment approval, one same-value masked
`ESV_API_KEY` re-put, and one production Worker deployment. It made no preview
mutation or D1/schema/data write. The gate artifact is not one of the seven
release artifacts.

## Rollback and custody boundary

No historical Worker or D1 is authorized for rollback merely because it is
documented. Never mix a Worker with a D1 from a different captured assignment.
Rollback requires a separate owner decision plus fresh compatibility,
readiness, and complete matched-pair evidence.

Release artifacts are time-limited GitHub evidence. On `2026-08-24`, the owner
selected H1 Option A and accepted natural expiry without a durable archive.
Exact ZIP, content, file-roster, and privacy revalidation may therefore become
unavailable after expiry; the retained boundary is the private metadata,
cryptographic digests, and independently reviewed release verdicts. This choice
grants no download, deletion (including temporary-copy deletion), cleanup,
credential, deployment, or rollback authority.
