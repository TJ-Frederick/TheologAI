# Production rollback rehearsal

<!-- theologai-release-authority v1 role=rollback-rehearsal-runbook current=docs/CURRENT-RELEASE.md -->

This runbook defines the protected, read-only rehearsal for the matched PR
#108 Worker/D1 rollback pair. The rehearsal execution is **pending**; this
document records the capability and its acceptance criteria, not a claim that
the rehearsal has passed.

Before execution, the protected `production` environment must provision a
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
runtime, and remote D1 readiness checks. Raw Wrangler output stays in runner
temporary storage. Only the bounded, hash-only receipt is uploaded.

The sole recovery command is:

```text
wrangler versions deploy 291f3292-3fa9-44fc-bf6f-b68fd2f4cef6@100 --config wrangler.release.toml --name theologai --dry-run --yes
```

The workflow has no `rollback`, version upload, ordinary deploy, trigger,
secret, D1 write, binding, route, DNS, or deletion command. `--dry-run` is
required by both the workflow topology test and the receipt verifier. A
successful rehearsal proves target availability, compatibility, binding
integrity, and recovery-command validity; it does not test live failover.

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
expiry policy remains separate.

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
