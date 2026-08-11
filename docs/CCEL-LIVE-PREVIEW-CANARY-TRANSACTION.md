# CCEL live-preview canary transaction

This is the transaction procedure for the one deliberately temporary state in
which preview may execute CCEL discovery. The canary transaction itself does
not change a corpus, D1 schema, rate-limit policy, production deployment, or
secret value. Its preview and production prerequisites are separate, real
Worker mutations with separate authorization; this procedure does not perform
or authorize them.

## Fixed baseline and authorization gates

Tracked `wrangler.toml` is always the safe baseline:

| Surface | Discovery | Live search | Coordinator | Role |
| --- | ---: | ---: | ---: | --- |
| Production | 0 | 0 | 0 | v6 local-only control and protected snapshot owner |
| Preview | 1 | 0 | 0 | v7 discovery-contract baseline |
| Ephemeral canary | 1 | 1 | 1 | preview-only audit candidate; never committed |

The active PR #107 preview Worker
`06b9a603-8339-42b6-a246-ef9238563043` predates PR #115's repository-only,
unpublished pin to `https://www.ccel.org/home3/search`. It remains valid
point-in-time evidence, but it is not a code/resource-equivalent `100`
predecessor for a `111` candidate built from current `main`. The exact-delta
validator would correctly reject that pairing.

Current `main` also includes PR #117's Transform-12 schema `0009` contract.
The retained PR #107 preview and PR #108 production D1 records were prepared
against schema `0008`; neither is a current-main-compatible D1 baseline. The
historical `0008` readiness records remain evidence for those releases only.

Operational readiness therefore has five separately authorized stages, in this
order:

1. Prepare **fresh, separate preview and production D1 candidates** compatible
   with schema `0009`. Each preparation needs its own authorization and must
   complete the remote readiness and authority audit for the checked-out
   schema/seed **while both candidates remain unbound**. Failure or missing
   evidence is a stop condition; do not reuse, repair, or bind a failed
   candidate.
2. Through a separately approved preview release, bind and deploy the exact
   prepared preview candidate with current-`main` `100` flags, then complete
   its protected preview audit. This one release creates the exact-current-main,
   code/resource-equivalent preview predecessor for the later `111` candidate;
   it is the safe preview refresh, not a prerequisite for a second refresh.
3. Only after the preview audit passes, through a separately approved production
   release, bind and deploy the exact prepared production candidate and complete
   its protected production audit. Then perform a read-only environment-isolation
   verification proving distinct preview and production D1 name/UUID pairs, each
   active Worker is bound only to its matching environment candidate, and neither
   retained schema-`0008` D1 was silently reused or crossed.
4. Stage the operator credential as an undeployed production Worker version,
   then separately promote the reviewed version. Promotion is a real
   production Worker deployment and traffic mutation.
5. Run this temporary `111` two-request preview canary transaction and restore
   the exact refreshed `100` predecessor.

Completion or authorization of any stage does not authorize the next stage.
In particular, the two unbound stage-1 preparations do not authorize either
environment binding; the preview audit does not authorize the production release;
and the completed releases/isolation evidence do not authorize credential staging
or the canary.

The schema-`0009` candidates now have retained unbound preparation evidence:
the checked-in preview release target is
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`), and the production candidate
`9bc79346-338b-439e-a2a5-424f4418eb21` remains unbound. This does not make the
canary ready. Until a separate reviewed release replaces the hard inert
schema-`0009` canary gate, the canary workflow rejects both retained schema-`0008`
D1 identities during its first local validation, before any Wrangler command or
Cloudflare read. Changing only a D1 ID is insufficient: the future change must
replace the `unrecorded` gate with a reviewed `ready` record for each
environment: exact D1 name/UUID plus separately pinned readiness and authority
evidence identities and SHA-256 values, plus one separately pinned
environment-isolation evidence identity and SHA-256. The local validator rejects
unknown or incomplete `ready` records, malformed evidence, any recorded
schema-`0008` D1 name or UUID regardless of pairing, any shared
preview/production identity, and any mismatch between those reviewed D1 pairs
and committed configuration.

The only way to create the third row is the main-only, manually dispatched
`CCEL Live Preview Canary` workflow. It requires all of the following:

1. The workflow is dispatched from `refs/heads/main`, its checked-out SHA,
   supplied SHA, and freshly fetched `origin/main` SHA are the same exact full
   commit ID.
2. The operator supplies the exact refreshed, current-`main` preview predecessor
   UUID and exact production control UUID. Both must be the sole 100%
   deployments. Full Worker
   version views re-prove their D1 identities, Durable Object identity,
   rate-limit namespaces, compatibility settings, flags, and exact binding
   sets. Canary code/resource equivalence also requires a non-empty exact
   `resources.script.etag` from both Worker version views; a missing or
   mismatched authoritative script identity is refused. The canonical
   custom-domain routes are validated from committed `wrangler.toml`; the audit
   then exercises both canonical MCP endpoints. Existing `workers.dev`
   compatibility endpoints retain their separately documented behavior and are
   not D1, route-ownership, or canary authorization evidence. That endpoint
   exercise proves reachability for this transaction, not an independent
   inventory of Cloudflare zone-route ownership.
3. The exact confirmation text is entered:
   `I AUTHORIZE THE TEMPORARY CCEL LIVE PREVIEW CANARY`.
4. A repository administrator has first provisioned the dedicated GitHub
   `ccel-canary` environment. It must contain only these dedicated names:
   `CCEL_CANARY_CREDENTIALS_CONFIGURED` (with the exact sentinel value
   `CCEL_CANARY_CREDENTIALS_CONFIGURED`),
   `CCEL_CANARY_ACCOUNT_WIDE_WORKERS_WRITE_ACK` (with the exact value
   `I ACCEPT ACCOUNT-WIDE WORKERS SCRIPT WRITE FOR THIS CCEL CANARY TRANSACTION`),
   `CCEL_CANARY_CLOUDFLARE_API_TOKEN`, and `CCEL_CANARY_OPERATOR_TOKEN`.
   The workflow fails before any Wrangler command if any is absent or malformed.
   It never falls back to the `production` or ordinary `preview` environment
   credentials.

The dedicated Cloudflare token is an external configuration prerequisite, not
a Worker-level security boundary. Cloudflare documents Workers Scripts
Read/Write as [account permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
and API-token resource policies support
[User, Account, and Zone resources](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/),
not an individual Worker script. Consequently, a token that can upload and
deploy a preview Worker version in the same Cloudflare account also has
Cloudflare-authorized Workers Script Write scope across that selected account.
It cannot be Cloudflare-enforced as preview-write/production-read-only.

The exact acknowledgment above is deliberately separate from the generic
credentials sentinel. It records the owner's acceptance of that account-wide
scope for this bounded transaction; this source change does not set it. The
repository workflow then supplies narrower procedural controls: every mutation
command includes `--env preview`, production is read only, exact version and
binding guards run before the first preview mutation, and no command mutates a
secret, route, D1 database, or production deployment. Those are repository
constraints, not Cloudflare credential isolation. A preview Worker in a
separate Cloudflare account, using a token selected only for that account, is
the only route to hard credential isolation between preview and production.

The workflow renders a temporary file in the runner, not a repository change.
It changes precisely the two preview values
`THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH` and
`THEOLOGAI_ENABLE_CCEL_COORDINATOR` from `false` to `true`. Version validation
requires the complete authorized binding set: the D1/DO/rate/version metadata
bindings, exactly the declared plain-text variables, and an exact secret-name
allowlist. The sanitized read-only inventory captured on 2026-07-29 observed:

| Surface | Worker version | Exact `secret_text` binding names |
| --- | --- | --- |
| Production 000 | `291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` | `AUTH_TOKEN`, `ESV_API_KEY`, `SBC_FACILITATOR_API_KEY` |
| Preview 100 | `06b9a603-8339-42b6-a246-ef9238563043` | `ESV_API_KEY` |

`AUTH_TOKEN` and `SBC_FACILITATOR_API_KEY` are absent from current tracked
source and Worker configuration. This transaction therefore preserves them as
exact production-only legacy compatibility binding names and types; it makes
no claim about their values, consumers, or purpose. Preview and the canary
reject both names, the operator token, and every other extra binding.

The observed production inventory is valid as a 000 control inventory but is
not canary-ready because it lacks
`THEOLOGAI_CCEL_OPERATOR_TOKEN`. Before any preview upload, production must
separately have been staged and promoted to the exact same allowlist plus
exactly one correctly typed operator binding. The validator reports this as an
explicit missing-operator prerequisite on the current state. This PR does not
authorize or perform that staging, promotion, secret creation, or any other
remote change. The dedicated job-only operator credential is never passed to
Wrangler, stored in preview, written to a command line, or retained as
evidence.

## Transaction sequence

1. Confirm the separately retained schema-`0009` evidence in order: both
   candidates prepared and audited while unbound; the one safe current-`main`
   preview `100` bind/deploy/audit; then the production bind/deploy/audit and
   environment-isolation verification. Capture that already-refreshed,
   code/resource-equivalent preview `100` predecessor and retain a short-lived
   private recovery anchor. Do not perform a second preview refresh here.
2. Generate the 111 runner-local config and run `wrangler versions upload`.
   The version must be exactly one new, immediately-next version and must leave
   preview traffic unchanged.
3. Compare the uploaded version with the predecessor. Both full version views
   must contain the same non-empty authoritative `resources.script.etag`; only
   the two authorized plain-text flags may differ. Code, compatibility settings,
   bindings, D1, Durable Object, rate namespaces, routes, and all other
   variables must be identical. The candidate must bear the fixed message and
   tag.
4. Deploy that exact candidate to **preview only** at 100%, then re-prove its
   full 111 state.
5. Invoke the existing `audit:ccel-preview` command once. That command itself
   mechanically caps the operation to exactly two expanded/live attempts; it
   also makes one separate local-only standard call. No workflow step makes a
   direct CCEL HTTP request.
6. The same already-approved transaction job runs its `restore` step with
   `always()`, before any final job failure. It re-reads the live preview
   deployment, restores only the dynamically captured predecessor, and proves
   preview is back to exact 100. A repeated restoration detects that state and
   performs no deployment. Even a failed audit produces a sanitized
   identifier/hash-only transaction record after successful recovery; only then
   does the workflow report the audit failure.

The resulting public audit artifact is already sanitized by the audit program:
it contains no query, title, snippet, text, URL, header, token, nonce, or
client identity. The transaction script's optional summary admits only commit
and Worker IDs, a SHA-256 of that audit file, booleans, and a fixed privacy
label. The private predecessor anchor is retained for seven days and contains
only preview version metadata required for exact recovery.

## Failure, cancellation, and emergency recovery

An ordinary command, validation, deployment, or audit failure still reaches
the in-job `always()` recovery step before the job exits. The ordinary PR
preview deployment, canary, and emergency recovery all hold the same
non-cancelling repository-wide `theologai-shared-preview-mutation` concurrency
group, so no one can observe or overwrite another's preview mutation
mid-transaction. If a failure happens after preview deployment but before the
staged version ID is published as a step output, recovery uses the currently
active version only after re-proving its tagged 111 shape and equivalence
outside the two flags. It otherwise refuses to overwrite an unexpected preview
release.

GitHub can terminate a manually cancelled workflow or unavailable runner
without executing the remaining steps. This is an external orchestration
limit, so the separately callable `Restore CCEL Live Preview Canary` workflow
is reserved for an interrupted/ambiguous run. It requires explicit current and
target UUIDs, validates their syntax before its first Wrangler command, and
requires:

```
RESTORE THE EXACT CCEL PREVIEW PREDECESSOR
```

It verifies the currently active UUID before doing anything, validates both
full version views, restores only the specified predecessor if the current
version is a tagged/equivalent 111 candidate, and re-proves a sole preview 100
deployment. If it is already restored, it is deliberately idempotent. Neither
workflow deletes a version, route, database, deployment, secret, or artifact
outside its normal short retention period.

Because emergency restoration also performs a preview Worker deployment with
the same same-account token, it requires the same exact account-wide Workers
write acknowledgment before its first Wrangler command.

## Explicitly out of scope

- There is no automatic trigger, no `deploy-preview` label use, and no
  ordinary PR-preview reuse.
- There is no actual workflow dispatch, Cloudflare mutation, direct CCEL call,
  secret creation/promotion, production deployment, or production config
  change in this source change.
- A successful canary is an authorization-gated operational observation; it
  does not authorize a broader CCEL release or change the default 000/100
  state.
