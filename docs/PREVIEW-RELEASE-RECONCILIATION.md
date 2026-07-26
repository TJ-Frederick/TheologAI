# Preview Release Reconciliation

The protected preview workflow records and uploads a predecessor anchor before it mutates the preview Worker, proves the newly deployed Worker binds the candidate before either black-box audit, and records the active deployment again after the release gate. These are evidence, not a deployment mechanism. Uploading the predecessor first preserves a manual recovery target even if a later job cancellation prevents a post-mutation observation.

The record intentionally distinguishes two D1 identities:

- `predecessorD1` is read only from the sole 100%-active pre-cutover Worker’s authoritative `wrangler versions view` response.
- `candidateD1` is the checked-in preview configuration, matched against a read-only `wrangler d1 list --json` ID/name inventory and then tested by the readiness gate using its exact D1 database name.

The generic release workflow permits both code-only releases (`d1Changed: false`) and data cutovers (`d1Changed: true`); it never infers freshness from a different ID alone. Wrangler 4.107.0’s D1 binding response is accepted only when the sole `THEOLOGAI_DB` binding has canonical UUID `id` and `database_id` fields that agree exactly. After deployment, the sole active Worker version must bind the candidate ID before either fixed audit begins; a retained-old-D1 deployment is refused even if its Worker version otherwise looks new.

As of the fresh read-only observation at approximately 2026-07-25T19:13Z, the
sole 100%-active preview deployment is `4148bfb5-dd03-447f-b656-9daa0aee4380`,
serving Worker version `ca1376bb-05cc-403b-a396-d2e89403abec` and bound to
`theologai-preview-20260724-a`
(`414dbda0-ba5b-4ac0-826b-0402d2ed825b`). This is the live Transform-9
25-work preview collection. Its immediate retained predecessor is deployment
`7f00a94b-4ff4-47d6-9bee-2efb99673718`, Worker version
`f78d66f1-cefe-46ba-88ba-9ddec259cda4`, bound to
`theologai-preview-20260722-b` (`94c4938b-7800-4d68-9097-0df33c31fdc1`).
The observation is read-only evidence of the active identity at that time; it
does not alter the Transform-10 unpublished, non-runtime boundary, authorize a
rollback, or prove that no later concurrent Cloudflare change occurred.

The checked-in preview binding now names the separately prepared but
not-yet-deployed candidate `theologai-preview-20260725-t10-a`
(`fbd1a492-fbc2-4061-a431-181a9632d4de`). Preparation completed exactly once
from `6cf8c00bece98865b8891fba1fc5805a9322e031`, applying seed manifest
SHA-256 `86bd2bad5ee455dea46dd845efe6239039c2a7ef14e06b3b37754f7c70c59b67`
(53 files, 1,637,035 rows); readiness and Transform-8, Transform-9, and
inactive Transform-10 predicates passed. This candidate remains unbound from
the active Worker: the live preview identity above continues to serve the
Transform-9 25-work catalog. A separate protected deployment must prove the
new active Worker binds this exact `candidateD1` before either black-box audit.

The candidate-binding observation is written before the strict gate and is uploaded through `always()` handling. It contains only version/deployment IDs, predecessor/active/candidate D1 IDs, the `d1Changed` value, and boolean configuration/binding verdicts; it excludes raw Wrangler JSON, headers, requests, sessions, and secrets. The final post-mutation observation is likewise retained and hashed even if the strict candidate-binding gate blocks both audits.

This path does not automatically roll back, deploy, bind, delete, or mutate data. It is safe to run after an audit failure, job cancellation, or withdrawn `deploy-preview` authorization because it makes only read-only control-plane observations. It intentionally performs no cleanup.

If a post-mutation audit does not pass, treat the candidate as unverified. An operator must separately authorize any rollback after checking:

1. the retained predecessor anchor’s version and deployment IDs;
2. the post-mutation record’s active version and deployment IDs;
3. the predecessor and candidate D1 IDs in both reconciliation records, including the exact candidate ID/name inventory mapping;
4. the candidate’s readiness record and the deployed Worker’s candidate-binding proof; and
5. a compatible, separately retained D1 readiness record for the version being restored.

Only after those checks may an authorized operator choose a manual Worker rollback to the exact predecessor version, followed by the normal preview audit. No D1 rollback, rebinding, migration, seeding, or deletion is implied by Worker rollback. If D1 compatibility is not proven, stop and obtain a separate data recovery plan and authorization.

The predecessor is a Worker/version anchor, not a claim that no concurrent actor changed Cloudflare after either snapshot. The post-mutation record explicitly reports whether it still matches the predecessor. Store both short-lived evidence artifacts with the release record; do not put raw Wrangler output, headers, sessions, request bodies, or secrets in them.
