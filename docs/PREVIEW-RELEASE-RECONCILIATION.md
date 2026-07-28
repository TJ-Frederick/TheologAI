# Preview Release Reconciliation

The protected preview workflow records and uploads a predecessor anchor before it mutates the preview Worker, proves the newly deployed Worker binds the candidate before either black-box audit, and records the active deployment again after the release gate. These are evidence, not a deployment mechanism. Uploading the predecessor first preserves a manual recovery target even if a later job cancellation prevents a post-mutation observation.

The record intentionally distinguishes two D1 identities:

- `predecessorD1` is read only from the sole 100%-active pre-cutover Worker’s authoritative `wrangler versions view` response.
- `candidateD1` is the checked-in preview configuration, matched against a read-only `wrangler d1 list --json` ID/name inventory and then tested by the readiness gate using its exact D1 database name.

The generic release workflow permits both code-only releases (`d1Changed: false`) and data cutovers (`d1Changed: true`); it never infers freshness from a different ID alone. Wrangler 4.107.0’s D1 binding response is accepted only when the sole `THEOLOGAI_DB` binding has canonical UUID `id` and `database_id` fields that agree exactly. After deployment, the sole active Worker version must bind the candidate ID before either fixed audit begins; a retained-old-D1 deployment is refused even if its Worker version otherwise looks new.

The historical read-only observation from approximately 2026-07-25T19:13Z
recorded preview deployment `4148bfb5-dd03-447f-b656-9daa0aee4380`, serving
Worker version `ca1376bb-05cc-403b-a396-d2e89403abec` and bound to
`theologai-preview-20260724-a`
(`414dbda0-ba5b-4ac0-826b-0402d2ed825b`). Its immediate retained predecessor
at that time was deployment
`7f00a94b-4ff4-47d6-9bee-2efb99673718`, Worker version
`f78d66f1-cefe-46ba-88ba-9ddec259cda4`, bound to
`theologai-preview-20260722-b` (`94c4938b-7800-4d68-9097-0df33c31fdc1`).
That point-in-time record does not describe the current live identity or prove
that no later concurrent Cloudflare change occurred.

The currently live preview Worker still uses the older Transform-10-era D1
`theologai-preview-20260725-t10-a`
(`fbd1a492-fbc2-4061-a431-181a9632d4de`). The checked-in preview binding now
names the separately prepared but not-yet-deployed normal-build candidate
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). It was prepared once from the
reviewed 49-file, 1,627,474-row deterministic seed with corpus identity
`e9362cf0ba6cc0efbc7ea663f418dcf2775d4abe1989f1e2774e16b14d5010db`;
readiness and Transform-8/9 authority checks passed, and the inactive Aquinas
hierarchy tables remain empty. This candidate is unbound from the active Worker.
Its preparation does not deploy, rebind, or alter preview traffic, and it makes
no production claim. A separate protected deployment must prove the new active
Worker binds this exact `candidateD1` before either black-box audit.

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
