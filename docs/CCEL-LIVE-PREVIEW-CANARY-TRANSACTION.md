# CCEL live-preview canary transaction

This is the release procedure for the one deliberately temporary state in
which preview may execute CCEL discovery. It is infrastructure only: it does
not change a corpus, D1 schema, MCP behavior, rate-limit policy, production
deployment, secret value, or the ordinary PR preview workflow.

## Fixed baseline and authorization gates

Tracked `wrangler.toml` is always the safe baseline:

| Surface | Discovery | Live search | Coordinator | Role |
| --- | ---: | ---: | ---: | --- |
| Production | 0 | 0 | 0 | v6 local-only control and protected snapshot owner |
| Preview | 1 | 0 | 0 | v7 discovery-contract baseline |
| Ephemeral canary | 1 | 1 | 1 | preview-only audit candidate; never committed |

The only way to create the third row is the main-only, manually dispatched
`CCEL Live Preview Canary` workflow. It requires all of the following:

1. The workflow is dispatched from `refs/heads/main`, its checked-out SHA,
   supplied SHA, and freshly fetched `origin/main` SHA are the same exact full
   commit ID.
2. The operator supplies the exact active preview predecessor UUID and exact
   production control UUID. Both must be the sole 100% deployments. Full Worker
   version views re-prove their D1 identities, Durable Object identity,
   rate-limit namespaces, compatibility settings, flags, and exact binding
   sets. The canonical custom-domain routes are validated from committed
   `wrangler.toml`; the audit then exercises both canonical MCP endpoints. That
   endpoint exercise proves reachability for this transaction, not an
   independent inventory of Cloudflare zone-route ownership.
3. The exact confirmation text is entered:
   `I AUTHORIZE THE TEMPORARY CCEL LIVE PREVIEW CANARY`.
4. A repository administrator has first provisioned the dedicated GitHub
   `ccel-canary` environment. It must contain only these dedicated names:
   `CCEL_CANARY_CREDENTIALS_CONFIGURED` (with the exact sentinel value
   `CCEL_CANARY_CREDENTIALS_CONFIGURED`),
   `CCEL_CANARY_CLOUDFLARE_API_TOKEN`, and `CCEL_CANARY_OPERATOR_TOKEN`.
   The workflow fails before any Wrangler command if any is absent or malformed.
   It never falls back to the `production` or ordinary `preview` environment
   credentials.

The dedicated Cloudflare token is an external configuration prerequisite, not
a security boundary this repository can prove. Before enabling the environment,
an administrator must verify in Cloudflare that this distinct token permits the
read operations needed on the production Worker (deployment/version views and
the protected audit snapshot) and the read/write version operations needed on
the preview Worker, with no D1 deletion, secret mutation, route mutation, or
production deployment permission. Cloudflare's available resource-scoping
granularity is authoritative; GitHub environment selection merely controls
secret availability and cannot attest the token's effective permissions. If
that least-privilege scope cannot be configured, do not set the sentinel and
do not run the canary workflow.

The workflow renders a temporary file in the runner, not a repository change.
It changes precisely the two preview values
`THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH` and
`THEOLOGAI_ENABLE_CCEL_COORDINATOR` from `false` to `true`. Version validation
requires the complete authorized binding set: the shared `ESV_API_KEY` secret,
the D1/DO/rate/version metadata bindings, and exactly the declared plain-text
variables. Production must additionally contain exactly one
`THEOLOGAI_CCEL_OPERATOR_TOKEN` `secret_text` binding; preview must not contain
it. No extra binding of any type is accepted. The dedicated job-only operator
credential is never passed to Wrangler, stored in preview, written to a command
line, or retained as evidence.

## Transaction sequence

1. Capture the current preview 100 predecessor and retain a short-lived,
   private recovery anchor.
2. Generate the 111 runner-local config and run `wrangler versions upload`.
   The version must be exactly one new, immediately-next version and must leave
   preview traffic unchanged.
3. Compare the uploaded version with the predecessor. Only the two authorized
   plain-text flags may differ; code, compatibility settings, bindings, D1,
   Durable Object, rate namespaces, routes, and all other variables must be
   identical. The candidate must bear the fixed message and tag.
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

## Explicitly out of scope

- There is no automatic trigger, no `deploy-preview` label use, and no
  ordinary PR-preview reuse.
- There is no actual workflow dispatch, Cloudflare mutation, direct CCEL call,
  secret creation/promotion, production deployment, or production config
  change in this source change.
- A successful canary is an authorization-gated operational observation; it
  does not authorize a broader CCEL release or change the default 000/100
  state.
