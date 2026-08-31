# Production rollback rehearsal

<!-- theologai-release-authority v1 role=rollback-rehearsal-runbook current=docs/CURRENT-RELEASE.md -->

This runbook defines the protected, read-only rehearsal for the matched PR
#108 Worker/D1 rollback pair. The dated rehearsal execution is complete for
run `33274529784`, attempt `1`; this records dry-run compatibility evidence,
not a live failover or rollback.

Before any future execution/rerun, the protected `production` environment must
provision a
dedicated `CLOUDFLARE_READ_ONLY_API_TOKEN` with exactly these account-scoped
permissions: `Workers Scripts Read` and `D1 Read`; no additional permissions
or account grants are allowed. The protected job is marked `deployment: false`
because it must not create a deployment record. Wrangler receives this secret only through its
`CLOUDFLARE_API_TOKEN` environment variable in authenticated read-only steps.
The workflow never uses the normal deployment token, and credential-free
historical checkout and local gates receive no Cloudflare credential.

## Fixed recovery target

The target is code-owned and cannot be selected by a workflow input:

| Identity | Exact value |
| --- | --- |
| Source commit | `8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` |
| Source tree | `a59d9a062b2e6c7884de97fd97309878e1cbdc23` |
| Cloudflare deployment | `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8` |
| Worker version | `291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` |
| D1 name | `theologai-production-20260729-transform11-a` |
| D1 UUID | `53211f50-a893-4b4c-be1e-bc625a595dc7` |

The historical source and target version are validated independently. A
Worker version contains code, configuration, and bindings; it does not
snapshot D1 contents. The rehearsal therefore validates the target D1 name
and UUID in a fresh read-only inventory and validates the Worker’s
`THEOLOGAI_DB` binding separately.

## Protected workflow

Run `Production Rollback Rehearsal` only from `main`, while the normal
`deploy-production` concurrency lock is respected, and only after the
`production` environment approves the job. The operator supplies the exact
current production and preview deployment/version UUIDs observed immediately
before dispatch, then types:

```text
REHEARSE THE EXACT PR108 ROLLBACK WITHOUT TRAFFIC
```

The workflow captures production and preview deployments and authoritative
version views before and after the rehearsal, plus a D1 inventory before and
after. It retrieves the fixed historical deployment through the exact
read-only Cloudflare deployment-ID endpoint rather than relying on a truncated
deployment list. It checks out the fixed source in a separate directory and runs its
historical `npm ci`, local Workerd seed/readiness, production-like Worker
runtime, and remote D1 readiness checks. Because the historical checkout omits
ignored/generated artifacts, its SQLite database is rebuilt into runner
temporary storage and its D1 seed is regenerated in the source checkout before
the Workerd and runtime gates; those temporary/generated artifacts are
discarded with the runner. Raw Wrangler output stays in runner
temporary storage. The committed dependency-free `scripts/capture-bounded-command.mjs`
runner is used before and after dependency installation, so output capture does
not depend on `node_modules`. The runner uses a detached, dependency-free
supervisor with a parent acknowledgement handshake: it closes both capture
streams and reports the child status before the supervisor exits, while an
overflow or capture failure leaves the supervisor pinned in its process group
for bounded TERM-to-KILL cleanup. Only the bounded, hash-only receipt is
uploaded.

The sole recovery command is:

```text
wrangler versions deploy 291f3292-3fa9-44fc-bf6f-b68fd2f4cef6@100 --config wrangler.release.toml --name theologai --dry-run --yes
```

The workflow has no `rollback`, version upload, ordinary deploy, trigger,
secret, D1 write, binding, route, DNS, or deletion command. `--dry-run` is
required by both the workflow topology test and the receipt verifier. A
successful rehearsal proves target availability, compatibility, binding
integrity, and recovery-command validity; it does not test live failover.

## Last successful execution

Run `33274529784`, attempt `1`, ran from `main` at head `833c0b1` and
completed `2026-08-29T21:06:51Z` with Wrangler `4.114.0`. It was explicitly
`deployment:false` and created no GitHub deployment. All exit statuses were
zero; the receipt reported `trafficMutation=false`, `d1Mutation=false`, and
`previewMutation=false`, with the fixed target inactive before and after.

The retained receipt artifact is `9721279150`, named
`production-rollback-rehearsal-33274529784-attempt-1`. Its ZIP SHA-256 is
`d679b73e57c210d92b9033585cf77a13dd433ffd84d12f974665168609d75acc` and its
receipt JSON SHA-256 is
`4c1def9b6e5450212b521c3c5d09512ed1d97aa60cbba51d86bf5205e35cbca6`; it
expires `2026-09-28T21:06:45Z`. Before/after hashes were unchanged for the
production deployment
`aff4d2aca359cdf75bdd37c450d3606f3addb70dd0556fb2e070e52f56f04675`, production
version `37b5babca5d505ca3281b29848509e3a4d37dda961ca2dc1344bf8be967f5d1c`,
preview deployment `9f9a9e3c4fa975036653cb3748a738ca949b33d46039507c62be6fbdde24e8f0`,
preview version `1b1b711f8d83e98c191fb84b7a3feda015249b34ac501d1f5022ebfe8f7beac1`,
and D1 inventory `69f0bf4be8f30b4a06759a309a074a04db500a3b72afce170b5deb21170fcbb5`.
Target version proof is
`d709dd5189677c399277591f7ebdd2cde0faa32610a739277a763f795786db70`; target
deployment proof is
`d93caa62799e52d77ad0b7be9e1a9b64233f1bf830fababd20aab7149d42418f`.

## Fail-closed acceptance criteria

The receipt is accepted only when all of the following remain true:

- the fixed source commit/tree and Worker/D1 target identities match exactly;
- the target Worker version is inactive in both production and preview before
  and after the run;
- the target version has exactly one `THEOLOGAI_DB` D1 binding to the fixed
  UUID, and the inventory maps the fixed name to that UUID;
- production and preview deployment/version identities match the expected
  inputs before and after;
- active production and preview D1 bindings are unchanged before and after;
- the D1 inventory mapping is unchanged before and after;
- all historical local and remote readiness commands succeed; and
- the receipt reports `trafficMutation=false`, `d1Mutation=false`, and
  `previewMutation=false`.

Any missing target, identity drift, malformed control-plane response, failed
readiness check, or unavailable dry-run command fails the run. No automatic
fallback to PR #101 is permitted.

## Evidence and retention

The uploaded receipt contains exact target/current identities, boolean safety
claims, and SHA-256 hashes of private captures and command output. It does not
contain source text, SQL, Wrangler JSON, request metadata, or credentials.
The receipt artifact is retained for 30 days; the H1 deployment-plan artifact
expiry policy remains separate. The successful rehearsal satisfies freshness
only for this dated execution. The 30-day stability, no-active-binding,
reconstruction, compatibility, and exact-owner gates remain required before
any cleanup review; no cleanup is authorized by this runbook or receipt.

The remote retention policy is conservative and review-only:

1. Retain the active production D1.
2. Retain the immediate same-D1 Worker predecessor.
3. Retain the two newest older cross-schema matched generations. schema-`0009` is active;
   the two retained older cross-schema matched generations are PR #108 Transform-11
   and PR #101 hierarchy.
4. Never delete automatically. A D1 is only review-eligible after two newer
   matched generations exist, the newest fallback has passed a fresh
   rehearsal, the current release has been stable for at least 30 days, fresh
   inventories show no active binding, reconstruction and compatibility are
   proven, and the owner authorizes the exact name and UUID.
5. Review quarterly, initially aligned to the `2026-11-15` H1 reassessment.
   Delete at most one explicitly authorized database at a time; never use a
   glob or batch cleanup.
