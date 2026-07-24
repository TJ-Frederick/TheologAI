# Preview Release Reconciliation

The protected preview workflow records and uploads a predecessor anchor before it mutates the preview Worker, and records the active deployment again after the release gate. Each record hashes an authoritative Cloudflare `versions view` response for the exact active Worker version and verifies it contains exactly one `THEOLOGAI_DB` D1 binding equal to the checked-out, readiness-tested preview binding. They are evidence, not a deployment mechanism. Uploading the predecessor first preserves a manual recovery target even if a later job cancellation prevents a post-mutation observation.

This path does not automatically roll back, deploy, bind, delete, or mutate data. It is safe to run after an audit failure, job cancellation, or withdrawn `deploy-preview` authorization because it makes only read-only control-plane observations. It intentionally performs no cleanup.

If a post-mutation audit does not pass, treat the candidate as unverified. An operator must separately authorize any rollback after checking:

1. the retained predecessor anchor’s version and deployment IDs;
2. the post-mutation record’s active version and deployment IDs;
3. the captured preview D1 binding still matches the checked-out binding; and
4. a compatible, separately retained D1 readiness record for the version being restored.

Only after those checks may an authorized operator choose a manual Worker rollback to the exact predecessor version, followed by the normal preview audit. No D1 rollback, rebinding, migration, seeding, or deletion is implied by Worker rollback. If D1 compatibility is not proven, stop and obtain a separate data recovery plan and authorization.

The predecessor is a Worker/version anchor, not a claim that no concurrent actor changed Cloudflare after either snapshot. The post-mutation record explicitly reports whether it still matches the predecessor. Store both short-lived evidence artifacts with the release record; do not put raw Wrangler output, headers, sessions, request bodies, or secrets in them.
