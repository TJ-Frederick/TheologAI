# CCEL operator-secret provisioning

## Scope and authorization

This infrastructure-only gate provisions authentication for the signed,
non-MCP coordinator operator route. It does not enable CCEL search, scrape
CCEL, or authorize republication. Production stays `000`
(`expose=false`, `live-search=false`, `coordinator=false`); preview stays `100`.
No workflow here sends a CCEL-bearing tool call or a request to CCEL.

Generic agreement is not authorization. Staging requires this exact phrase:

> `I AUTHORIZE PROVISIONING THE PROTECTED CCEL OPERATOR SECRET`

Promotion is a separate protected decision requiring:

> `PROMOTE THEOLOGAI CCEL OPERATOR SECRET`

Emergency rollback is also separate and requires:

> `ROLL BACK THEOLOGAI TO THE EXACT SECRETLESS BASELINE`

Each executing dispatch also requires the exact live `main` SHA, Cloudflare
account ID, and relevant Worker UUIDs. A dry-run dispatch uses `execute=false`
and has no Cloudflare credentials. `execute=true` enters the protected GitHub
`production` environment.

## Token format and custody

`THEOLOGAI_CCEL_OPERATOR_TOKEN` must be the canonical, unpadded base64url
encoding of exactly 32 cryptographically random bytes: one 43-character base64url
line using only `A-Z`, `a-z`, `0-9`, `_`, and `-`. Whitespace,
padding, control characters, other lengths, and non-canonical encodings are
rejected before any Worker mutation.

Prefer a password manager that can generate 32 random bytes and encode them as
unpadded base64url. If it cannot, generate 32 bytes in a private local terminal,
convert standard base64 characters (`+`/`/`) to (`-`/`_`), remove only trailing
`=` padding and the output newline, then immediately save the 43-character
result in the password manager. Never pass the value as a command argument,
paste it into chat, save it in a repository file, or leave it in shell history.
The workflow reads it only from a protected environment secret and pipes it to
Wrangler over standard input with command tracing disabled.

The identical value belongs in exactly two places:

1. GitHub environment `production`, secret
   `THEOLOGAI_CCEL_OPERATOR_TOKEN`; and
2. Cloudflare Worker `theologai`, secret binding with the same name.

Do not provision it on `theologai-preview` or
`theologai-ccel-coordinator`. The production route observes the shared
coordinator Durable Object without modifying its owner Worker.

## Cloudflare credential boundary

Use a dedicated API token scoped to this Cloudflare account, not a Global API
Key. The minimum permissions used by these workflows are:

- Account — `Workers Scripts:Edit` (the API calls this `Workers Scripts Write`)
  for version reads, secret-version creation, deployment, and rollback; and
- Account — `D1:Read` for the read-only production readiness query.

No Zone, DNS, Workers Routes, Pages, Durable Objects, or D1 write permission is
needed. Cloudflare API tokens are account-resource scoped rather than
single-Worker scoped for these operations, so `wrangler.release.toml`, the
literal `--name theologai`, exact account-ID equality, and postcondition checks
provide the additional script boundary. Keep `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, and the operator token only in the protected GitHub
environment. Rotate the Cloudflare token independently if exposure is
suspected.

## Why staging and promotion are separate

Plain `wrangler secret put` creates and immediately deploys a version. Staging
therefore uses `wrangler versions secret put`, which copies the newest uploaded
version and creates an undeployed version. Promotion later deploys one reviewed
UUID at 100%. Both workflows share `deploy-production` concurrency.

Every Wrangler release command uses checked-in `wrangler.release.toml`. It
contains only the production script name, entry point, compatibility date, and
compatibility flags. It deliberately contains no routes, `workers_dev`,
observability, D1, Durable Object, rate-limit, variable, asset, or environment
settings that a version command could accidentally patch.

The validator parses `wrangler.toml` structurally. It requires unique, exact
production and preview identities for D1, the coordinator binding, both
rate-limit namespaces and policies, version metadata, origins, request size,
request logging, version string, and all three CCEL flags. It separately parses
Wrangler's summary and full-version JSON shapes. “Newest” is selected by the
monotonic Worker version number, not a timestamp or array position.

## Staging procedure

1. Record the live `main` SHA, the exact Cloudflare account ID, and the sole
   active 100% production Worker UUID. Confirm production uses its production
   D1 and `000` flags; preview uses only its preview D1 and `100` flags.
2. After the exact staging authorization, generate and store the token as
   described above. Add the same value to the protected GitHub environment.
3. Dispatch **Stage CCEL Operator Secret** with exact inputs. Run
   `execute=false` first; then request the protected `execute=true` job.
4. The executing job completes the slower read-only D1 check first. Immediately
   before mutation, in the same step, it re-reads live `main`, account identity,
   version summaries, deployments, the full baseline view, and both configs.
   It refuses unless the named baseline is both the newest upload and sole 100%
   deployment with all critical bindings intact.
5. Wrangler creates an undeployed version from standard input. Under
   `if: always()`, the workflow records Wrangler's outcome, re-reads
   authoritative versions and deployments, proves traffic did not change,
   identifies exactly one new sequential version, fetches its full view, and
   proves the sole delta is the protected secret binding. Any command,
   observation, or postcondition failure fails the workflow after reporting
   actual non-secret state.

Production remains on the secretless baseline after a successful stage.

## Promotion and equality audit

Independently inspect the staged UUID and staging summary. Then dispatch
**Promote CCEL Operator Secret** with the exact baseline UUID, staged UUID,
account, live SHA, and promotion phrase.

The D1 check again finishes before the mutation window. In the deployment step,
the workflow re-reads every identity and full version, proves that the baseline
is still the sole active version, the staged version is still newest, and all
code, compatibility settings, non-secret bindings, and pre-existing secret
names agree. It deploys only `staged-uuid@100%`.

An `if: always()` step then records the command outcome and authoritatively
re-reads deployments, the staged full view, and name/type-only secret metadata.
It fails after reporting actual state unless the exact staged UUID is the sole
100% deployment and its reviewed secret-name set equals the deployed set.

Finally dispatch **Operate CCEL Coordinator** with action `snapshot`, its own
exact confirmation, and the active production UUID. A validated
read-only `snapshot` proves the GitHub and Worker token copies agree and that the HMAC
route and shared binding work. Do not dispatch `reset` for provisioning
verification. Snapshot consumes one attempt from the dedicated operator-auth
limiter but does not reserve CCEL admission, contact CCEL, mutate the circuit,
or change D1.

Repeat unsigned-route 404/no-store/no-CORS checks and local-only production
`000` / preview `100` MCP inventory checks. “No CCEL admission” remains an
inference from disabled flags and the local-only call plan unless origin
telemetry is separately available.

## External-writer residual

GitHub concurrency serializes repository workflows, but it cannot lock out an
authorized dashboard user, direct Cloudflare API client, or another deployment
system. A sufficiently timed external writer can change the newest upload or
active deployment after the last read. Immediate same-step preconditions and
always-on postconditions narrow and detect this window; they cannot make the
Cloudflare APIs transactional. Any observed drift is a stop condition: record
actual state, abandon the authorization, and start again from a new reviewed
baseline. Do not weaken equality checks.

## Rollback and revocation

Before promotion, rollback means abandoning the undeployed staged UUID; no
traffic changed. Removing the GitHub environment secret is a separate deletion
and still needs explicit approval.

After promotion, dispatch **Roll Back CCEL Operator Secret** only with the exact
currently active UUID and the exact previously reviewed secretless baseline
UUID. Its preflight requires identical code, compatibility settings,
non-secret bindings, and all other secret names; the operator token must be the
only secret delta. It then uses Wrangler's exact-version rollback. Wrangler may
require the changed-secret force path when moving to the older secretless
version; `--yes` is safe here only because the tested preflight proved the sole
changed secret is `THEOLOGAI_CCEL_OPERATOR_TOKEN`. The `if: always()` verifier
requires the exact baseline at 100% and the exact baseline secret-name set with
the operator token absent. The GitHub copy remains until separately approved
for deletion.

A planned forward revocation is distinct from rollback: stage
`wrangler versions secret delete THEOLOGAI_CCEL_OPERATOR_TOKEN`, independently
review the resulting secretless version, and promote that exact version. This
repository intentionally provides no deletion workflow. Running the command or
removing either stored copy requires separate deletion authorization; none is
granted by staging, promotion, rollback, or generic approval. Never use plain
`wrangler secret delete`, which deploys immediately.

No procedure here deletes or replaces D1, the shared Durable Object, the
coordinator owner Worker, a route, a domain, a historical Worker version, or a
compatibility endpoint.
