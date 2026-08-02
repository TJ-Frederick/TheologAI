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

The protected preview release deployed the normal 25-work build as Cloudflare
deployment `3467d062-9097-4ffe-9ff1-db900838f538`, serving Worker
`8d516c26-6cfe-451c-889a-7dd580b1f4ca` at 100% with
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). That database was prepared once from
the reviewed 49-file, 1,627,474-row deterministic seed with corpus identity
`e9362cf0ba6cc0efbc7ea663f418dcf2775d4abe1989f1e2774e16b14d5010db`; its
readiness and Transform-8/9 authority checks passed, and the inactive Aquinas
hierarchy tables are empty. The protected release and independent bounded
black-box audit passed with no P0-P3 findings. The deployed preview profile is
v7/discovery-only with CCEL execution disabled before adapter, coordinator, or
fetch. This is preview evidence only; it makes no production claim.

PR #101's checked-in preview candidate was unbound when prepared:
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). Its one-time preparation applied the
reviewed 49-file, 1,627,474-row deterministic seed through schema `0008`:
remote readiness and Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. The protected PR #101 release subsequently proved
the exact `candidateD1` binding as deployment
`070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). This is the retained compatible
preview predecessor; the checked-in target alone did not establish it or
activate the dormant hierarchy/publication runtime. Its protected release
evidence remains authoritative for that predecessor.

PR #107's Transform-11 candidate
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`). Its one-use schema-`0008` import
applied all 49 reviewed seed files and 1,630,259 rows with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness and Transform-8 authority passed during preparation. A
transient Cloudflare authentication failure interrupted the first
Transform-11 authority read; an explicitly authorized read-only rerun then
passed primary readiness, Transform-8 (`1/12/12` pages), and the complete
Transform-11 audit (`1/1/1/1/1/1/133/17` pages). No seed, migration, repair, or
resume was repeated. The candidate was unbound during that preparation.
Protected preview deployment `5e812152-355b-4a5f-a123-2485e89f1550` now
serves PR #107 head `1105b75cd8537632bdb20e598092f6ba94a6adc0` as Worker
`06b9a603-8339-42b6-a246-ef9238563043` (#140), the sole active preview
assignment bound to that exact candidate D1. It remains v7/discovery-only with
CCEL execution disabled before adapter, coordinator, or fetch. Production
remains unchanged.

That active PR #107 Worker predates PR #115's repository-only, unpublished
change pinning the candidate CCEL endpoint to
`https://www.ccel.org/home3/search`. It is not a code/resource-equivalent `100`
predecessor for a `111` canary built from current `main`. Before any canary is
authorized, a separate protected preview release must safely refresh exact
current-`main` code and resources with the `100` flags and pass its preview
audit. That refresh does not authorize credential provisioning or the canary.

At the reconciliation cutoff immediately after PR #113, `main` was
`2f12262c9a37d3588bee9b5071954823c15cbd12` (tree
`9922aedb74c690e7a3fcb926b3d621f28fa44535`), and that revision was not
deployed. PRs #109–#113 are completed repository-only milestones: PR #109
records the PR #108 production cutover, PR #110 aligns provider-neutral CCEL
audit readiness, PR #111 adds inert canary transaction infrastructure, PR #112
records synthetic original-language context-capacity evidence, and PR #113 records
provisional Norton capacity evidence that remains subject to local and release
gates. Production runs for PRs #109–#113 were cancelled and preview jobs
skipped, so they make no runtime, Worker, deployment, binding, remote-D1, or
corpus claim.
Preview therefore remains the PR #107 assignment above. Production remains PR
#108 merge `8da99fd0a161b90a4bd90ab29bde1abf796b3bf6`, deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`53211f50-a893-4b4c-be1e-bc625a595dc7`, with v6/local-only behavior and CCEL
execution disabled before adapter, coordinator, or fetch.

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
