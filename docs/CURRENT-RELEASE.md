# Current release snapshot

<!-- theologai-release-authority v1 role=current-snapshot current=self -->

This dated, sanitized record is the repository's sole present-tense release
identity authority. Other release documents provide operational guidance,
plans, or historical evidence and point here for the active assignment. This
snapshot was observed through protected run `32639881439`, completed
`2026-08-23T13:02:45Z`; it remains a point-in-time record, not a guarantee
against later authorized release activity.

## Active production assignment

PR #136 merged as source `48a4ecd12c7b0c89e4b1075d75d2d2ff1b65e86f`
with parents `5ada86d229da5e8a8b2135cc1cccc60af2b3ab4b` and
`f4f55d465f6a3205e0262d7e62dafac372c6c08e`, and tree
`5b659bc5ff70b82e3b5ccee388c19affb0fd983b`. Protected run
`32639881439` recorded GitHub production deployment `6048025282` and the sole
active Cloudflare production assignment: deployment
`e0ac6d88-6592-444a-b065-8740713239d9`, Worker
`9188f834-a8ae-4076-9c18-236806721316` (version #128), and
`THEOLOGAI_DB` `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`).

The immediate same-D1 predecessor is retained only as predecessor evidence:
deployment `29cefacb-09d4-4ff2-a0b6-3adbb08a2121`, Worker
`0b35d6de-fb59-40c5-aaf3-d0a41801863c`, on that same production D1. It is not
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

The unprivileged classifier in run `32639881439`, attempt `1`, emitted one
canonical schema-v1 deployment plan for exact head
`48a4ecd12c7b0c89e4b1075d75d2d2ff1b65e86f`. The plan recorded
`classification_succeeded=true`, `deploy_required=true`, `decision=deploy`,
`reason=non-documentation-path`, and six exact changed paths. Artifact
`9493309553`, named
`production-deployment-plan-32639881439-attempt-1`, contained only the plan and
its SHA-256 sidecar. The canonical plan bytes hash to
`575f40c63b1b2f8a27c556623f9e546dab08186ebe2f94b579e8a77d97341a82`;
the artifact ZIP hashes to
`290ae0b3cd1528a76d942416716c9cd9dffb977bff41f0cd15b99638b152604e`.
The unprivileged verifier authenticated that exact gate before the production
environment was queued, and the protected job revalidated it before mutation.

The same run uploaded seven distinct post-deployment release-evidence
artifacts. Their GitHub artifact IDs and ZIP SHA-256 values are:

| Evidence | Artifact ID | ZIP SHA-256 |
|---|---:|---|
| D1 readiness | `9493601405` | `dd2449e64c805036c667149329663c12ba5292fba46e19aeaaff62fea39bfca4` |
| release predecessor | `9493602607` | `f059d328fd081932f5912282494ad4d4f54688893253c385ef25e613dbf42625` |
| candidate cutover | `9493609334` | `1555ead9787ebb0b1efc90bd82ca6dc196c6ce57260c542a3bf0fd66f3f75ae7` |
| edge stabilization | `9493612031` | `e5c78c5ace5df85db662970e6dc8bcaa360525800e9d757a6ff4a165c96b5937` |
| final routing | `9493623849` | `598ad0592a30307554e3ad17a9ea848c06625a2a6e56a8f0741ae8de004f28df` |
| release reconciliation | `9493625120` | `631c084cf18dbae9bc18b165f7a0365073adeffb1a9a837dce287404bb4149b5` |
| release audit | `9493625427` | `b458359adf3a602489e9a6ecafc76bab1d8a441a485ad018a3a169a3d89b402e` |

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

Release artifacts are time-limited GitHub evidence. The private H1 ledgers
record custody status and deadlines but grant no retention, deletion, cleanup,
credential, or rollback authority. Natural expiry or durable private archival
remains an owner decision.
