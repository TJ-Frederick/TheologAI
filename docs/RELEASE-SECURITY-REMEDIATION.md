# Release security remediation — SEC-01–05; SEC-06 deferred

The SEC-01–05 candidate is prepared for the normal preview → hosted tests →
protected production process. It limits MCP input complexity before validation,
updates Node to 22.23.4, makes rate limits independent of User-Agent, refreshes
vulnerable dependencies, and separates application builds from deployment
credentials. Existing environment approvals, custom-domain deployment commands,
D1 targets, and release checks remain in place. This document is not active
release-identity authority; see `CURRENT-RELEASE.md` and the deployment receipts.

**October 23 release scope decision:** the user paused SEC-06. Keep the existing
Cloudflare account, credential values and permissions, and deployment process.
No further credential diagnostics, permission/binding hardening, account
migration, or custom-domain command changes are part of this release. SEC-06
remains open and deferred, with the remaining risks recorded below. Remove the
completed temporary diagnostic from the runnable PR workflow; retain its
sanitized evidence as historical assessment material.

## Dependency updates (SEC-04)

The root lock updates MCP server/client to 2.3.1, the Node transport to 2.1.1,
Hono to 4.13.13, Vitest to 4.1.12, Vite to 8.1.6, and the modern conformance
runner to alpha.12. Overrides update the affected legacy SDK, URI/address,
HTTP-client, image, and source-map dependencies. Unused `nodemon` was removed.
Application Zod is updated to 4.6.7 for
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
which entered the audit results during final review on October 23. Production
and independent release-toolchain audits remain strict. The full development
audit retains two propagated high-severity package findings for one exception:
Zod 3.25.76 nested under `@cloudflare/vitest-pool-workers` 0.18.8. It parses
checked-in local test configuration in jobs without cloud credentials; it is
not imported by the deployed application or the release toolchain. The pinned
pool uses Zod 3's `ostring` API, so overriding it with Zod 4 is incompatible.
The next Zod-4 pool line also migrates Miniflare to a version-5 alpha, outside
this security patch. This is a documented reachability exception, not a claim
that Zod 3 is patched.

`scripts/audit-dependencies.mjs` preserves the high/critical gate with an
exception only for that exact advisory, nested path, development flags, pool
and Zod versions, and its single pool propagation. It fails closed on registry
errors, additional affected paths/advisories, production reachability, version
drift, and expiry on **November 22, 2026**. Tests cover these refusal cases.
Every other high/critical advisory still blocks; no global severity downgrade
or npm audit suppression was added. Upgrade the test runtime or review this
single exception before it expires.

Current MCP TypeScript clients reject cross-origin redirects by default. Use
the canonical MCP URL directly. The redirect regression suite covers both the
default refusal and explicit caller opt-in; hosted redirect behavior is unchanged.

## Build and credential separation (SEC-05)

Production, ordinary preview, coordinator bootstrap, and the temporary CCEL
canary build their Worker in a job without cloud credentials. Worker artifacts
carry a manifest with the exact source commit, source tree, lockfile hash,
Wrangler configuration hash, and hashes of the JavaScript and source map.
Deployment jobs require the build job, download only this run/attempt's artifact
with digest validation, and compare the manifest digest against the build job's
output. They recheck source/configuration/lock identities on a fresh checkout.
Existing release-plan, D1 readiness, active-version, routing, predecessor,
production-control, and post-deploy audit gates remain in place.

Uploads use an explicit rendered configuration, `--no-bundle`, and disabled
module discovery. Custom builds, asset builds, containers, unsafe settings, and
extra module rules are rejected until their handoff is separately reviewed.
The Worker is read as upload data and never imported by the release runner.
The renderer flattens the selected environment while preserving its bindings,
routes, version metadata, variables, rate limits, and observability settings.

Credential-bearing jobs install `.github/release-toolchain/package-lock.json`
instead of the root graph. The direct trust set is Wrangler, tsx, smol-toml,
the MCP client, Ajv, parse5, and better-sqlite3. SQLite is needed because remote
D1 readiness reconstructs authority query plans locally; Ajv/parse5 support the
existing audit helpers. These are deliberate release dependencies, including
packages shared with the application, and remain a supply-chain trust boundary.
Adding an application or test dependency does not add it to this set.

The release action refuses an existing root `node_modules`, uses no dependency
cache, disables lifecycle scripts, audits its own lock, then explicitly rebuilds
only better-sqlite3's required native module. No root npm scripts or Wrangler
Action package installation runs in protected jobs. Repository release helpers
are still trusted release code. Once the toolchain exists on main, ordinary
preview takes its action and lock from the exact protected base commit. The
first PR introducing the entire trust set can use that PR's reviewed copy under
the existing validation, label, live-head, and environment-approval gates. A
partially missing or symlinked base copy is rejected; it never causes a fallback
to candidate tooling. This lets the security fixes follow the normal preview,
test, and production process without merging untested tooling to main first.

The historical PR108 rehearsal's installs, database build, and Workerd tests now
run in a separate unprivileged job. Only bounded stdout/stderr evidence is
handed to the protected read-only verifier; its remote check uses the separately
locked release toolchain. The final public receipt remains sanitized. Checkout
credentials are not persisted in these workflows.

Release-toolchain changes require the same review as credential-handling code.
Audit both locks independently. A malicious compiler can still produce malicious
Worker code, and compromise of the explicitly trusted release toolchain can
still expose credentials. This change removes the ordinary root dependency
graph from that runner; it does not eliminate supply-chain risk.

## Preview credential scope assessment (SEC-06)

**Status: open, paused for this release by the user on October 23, 2026.**
This is preventive hardening; there is no evidence of a compromised key.
The exact GitHub preview token's broad Worker write grant is confirmed, and
live metadata establishes distinct D1 bindings plus a shared coordinator.
Fresh production-secret verification and live custom-domain compatibility with
narrowed permissions remain unconfirmed. The user explicitly deferred those
checks and all permission/deployment-flow changes. Preserve the existing
account, token permissions, normal preview → test → production flow, and
approval gates. The unconditional preview-deployment block remains removed.

The detailed observations and options below are an assessment record, not
release tasks or authorization to apply hardening. The normal release gates
still constrain when credentials are made available; they do not eliminate
the confirmed excess access after approval.

### Read-only observations on October 23, 2026

The authenticated GitHub REST API returned these live settings:

| Check | Result | What it establishes |
| --- | --- | --- |
| `preview` environment | Required reviewer `TJ-Frederick`; branch policy `refs/pull/*/merge` | Preview credentials are behind the existing manual approval and PR-ref restriction. |
| `production` environment | Required reviewer `TJ-Frederick`; branch policy `main` | Production retains a distinct approval and branch gate. |
| Reviewer self-approval | `prevent_self_review: false` in both environments | These are owner approval gates, not a requirement for an independent second person. Preserved as configured. |
| Preview secret metadata | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; token secret last updated July 10, 2026 | Confirms which environment secret is used, not its value, identity, account scope, or permissions. |
| Available local credentials | No Cloudflare API token in the environment or the checked project environment files; Wrangler has an expired local OAuth login | The local login is not evidence about the GitHub preview token and was not refreshed or used for cloud operations. |
| Cloudflare dashboard in the existing Chrome profile | Authenticated access; token `TheologAI Preview GitHub` is active, with an Entire Account policy | The named preview token grants `Workers Scripts Write`, `Workers Scripts Read`, `D1 Read`, and `Account Settings Read` across the account. No policy was changed. |
| Approved GitHub diagnostic, 18:50:33 UTC | Own-token verification returned active token `dac2ed85288c21310268159147e942dc` | Directly identifies the current preview secret as the exact token inspected in the dashboard. Four fixed GET requests all returned HTTP 200. |

GitHub [does not return an environment secret's value](https://docs.github.com/en/rest/actions/secrets#get-an-environment-secret).
Its name and update date cannot establish whether it matches a production or
local credential. The expired local OAuth scopes were not attributed to preview.
No secret values were printed, copied into this document, or transmitted to a
third-party service. Evidence is retained as sanitized JSON under
`test-output/security-review-2026-10-23/`.

### Confirmed policy and CI association

The authenticated [preview token policy](https://dash.cloudflare.com/0594ed1e4c9fe35ab7d9f47991e99f3e/api-tokens/tokens/dac2ed85288c21310268159147e942dc)
has **Workers Scripts Write for the entire account**, which includes the
production `theologai` Worker. This is a confirmed excess grant on that token,
not a demonstrated production mutation or evidence of key compromise. The
account-wide `D1 Read` permission also grants configuration/query visibility;
no production SQL query was made in this assessment. The read permissions must
be evaluated against the existing readiness and production-control checks.

To check the token's association with CI, the Cloudflare audit view was filtered
by its token ID. Audit event `01a07da6-d3dd-7c10-8d4d-a3e7a9c8ee43` records a
successful `Upload Version` on `theologai-preview` at **September 7, 2026,
20:54:40 UTC (16:54:40 EDT)**. That falls inside the **20:54:34–20:54:43 UTC**
Cloudflare deployment step of [GitHub preview job 101862115061](https://github.com/TJ-Frederick/TheologAI/actions/runs/34160141792/job/101862115061).
Its environment secret metadata has not changed since July 10. These independent
records corroborate use by the preview pipeline. They did not establish direct
current identity by themselves; the approved diagnostic below resolves that gap.
Sanitized policy and correlation records are retained with the GitHub metadata
under `test-output/security-review-2026-10-23/`; raw request bodies, IP addresses,
secret values, and session credentials are not retained there.

### Deferred hardening options — outside this release

Edit the existing token's policies: remove **Entire Account → Workers Scripts
Write** and add **Specified Workers → `theologai-preview` → Editor**. Keep the
read permissions that the D1 readiness and read-only cross-environment controls
actually require. The dashboard exposes this narrower Worker scope today.
This reduces the confirmed direct production-Worker edit authority without
creating an account or rotating the secret. **No permission change has been
applied.** Compatibility with the existing custom domain is a prerequisite:
Cloudflare documents deployment of new versions without changing an existing
domain connection, but also lists Custom Domains as a limitation of per-Worker
roles. Inspection and an offline trace now confirm that this repo's pinned
Wrangler 4.114.0 `deploy` path calls `publishCustomDomains` and submits
`PUT /workers/scripts/theologai-preview/domains/records` in noninteractive CI,
even with the existing configured hostname. **The narrower permission has not
been validated as a drop-in change for that command.** Do not add zone/account-
wide write permission to work around this. Review a version-upload/deploy path
that leaves the existing domain connection untouched before changing policy.

The smallest practical proposal has three ordered parts. Part 1 is complete;
the permission and binding changes in parts 2–3 remain **unapplied**:

1. **Completed:** run the diagnostic under the existing preview approval to
   establish the exact secret's token ID and direct metadata access. The active
   token matches the inspected policy; all four fixed metadata requests passed.
2. Replace only the confirmed account-wide Worker write grant with Editor for
   `theologai-preview`, after resolving custom-domain compatibility. Retain the
   current required reads, account, credential value, and approval gates.
3. Add a protected release check that accepts only explicitly approved preview
   D1 IDs, rejects production D1 IDs before readiness or upload, and validates
   other bindings against the intended preview configuration. The observed
   ordinary preview D1 is `74f456e2-6951-4003-bb6f-91951342bf8f`. Use protected
   release code and an approved target list; checking a candidate-supplied
   config against itself does not constrain its authority. This helps prevent
   configuration mistakes; it cannot stop someone holding the token from
   calling Cloudflare directly. Preserve the intentionally shared coordinator
   and record its trust implication rather than silently splitting it.

SEC-06 remains open and paused. These options require a later, separately
authorized assessment and review; none will be applied in this release. The
normal release process remains available with the current permissions. The
temporary diagnostic is removed from the release candidate; its earlier run
and dependency prerequisites are recorded below.

### Exact GitHub credential verified in an approved read-only job

On the user's explicit instruction to publish and run the diagnostic,
[PR #167](https://github.com/TJ-Frederick/TheologAI/pull/167) published it at head
`ac82094cfd7a55fcbadb42e9cad9d994768088ab`. Existing validation initially rejected
main's dependency graph with 20 vulnerabilities, including one critical. The
already prepared Node 22.23.4 and SEC-04 dependency refresh, with its redirect
compatibility test, were included as prerequisites. No audit or validation gate
was relaxed. The refreshed audit reports zero vulnerabilities.

Run [40005138733](https://github.com/TJ-Frederick/TheologAI/actions/runs/40005138733)
passed core tests/build, fresh-checkout data/seed validation, Worker runtime,
Node HTTP, MCP conformance, and `Validation Complete`. Core validation passed
2,723 unit tests and 3 integration tests, with 6 skips. It then waited at the
existing `preview` environment gate. The normal review endpoint accepted
`TJ-Frederick`'s approval for this specific user-authorized read-only run.
Required reviewer, PR-ref restriction, self-review setting, and the disabled
administrator bypass were unchanged.

The [diagnostic job](https://github.com/TJ-Frederick/TheologAI/actions/runs/40005138733/job/120595667535)
passed at 18:50:36 UTC. Its receipt at **18:50:33.274 UTC** reports:

| Fixed GET request | Result |
| --- | --- |
| Own account token verification | HTTP 200; `active`; ID `dac2ed85288c21310268159147e942dc`, matching the inspected token policy. |
| `theologai-preview` Worker settings | HTTP 200; D1 `74f456e2-6951-4003-bb6f-91951342bf8f`. |
| `theologai` Worker settings | HTTP 200; D1 `9bc79346-338b-439e-a2a5-424f4418eb21`. |
| Production D1 metadata | HTTP 200; UUID matches `9bc79346-338b-439e-a2a5-424f4418eb21`. |

Both Worker settings returned coordinator namespace
`e653769555fe44deaf1dd18de403dab6`. The
[sanitized receipt](security/sec06-readonly-receipt-2026-10-23.json) contains only
token ID/status and selected resource metadata, never the token value. This
directly ties the current GitHub secret to the previously inspected policy.
Cloudflare's [account-token verification GET](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/)
does not reveal the credential value.

The [review copy of the job](security/sec06-readonly-job.proposed.yml) remains
outside `.github/workflows`; the earlier runnable copy existed on the diagnostic PR head only. It is
removed from the SEC-01–05 release candidate. It requires
the explicit `assess-preview-permissions` label, absence of `deploy-preview`,
successful validation, live same-repository/main/head checks, the existing
preview approval/ref rules, and shared serialization. No application checkout,
package installation, SQL, binding mutation, upload, Worker deployment, or
permission change ran in the diagnostic. Its ordinary `Deploy Preview` job was
skipped. GitHub created environment record `7286218459` for the approval-gated
job; this is a diagnostic record, **not a Cloudflare Worker release**. That diagnostic did not deploy a Worker or update the active release snapshot.

### Production token separation and custom-domain compatibility follow-up

The latest successful GitHub production deployment is
[run 33528936804 / job 99927403574](https://github.com/TJ-Frederick/TheologAI/actions/runs/33528936804/job/99927403574).
Its Cloudflare deployment step ran on September 1, 2026, 16:23:35–16:23:47 UTC.
Cloudflare audit event `01a05dc8-9266-78f2-94c4-78fb343260b8` records a successful
`Upload Version` on production Worker `theologai` at **16:23:40.902 UTC**, with
actor token **`TheologAI Production GitHub` /
`7f1887062072c3e5d619c54cf810c949`**. This differs from the directly verified
preview token `dac2ed85288c21310268159147e942dc`. The separate production token
record was also inspected read-only in the current Cloudflare dashboard. Both
the production and preview token records are currently marked `Active`.

This confirms distinct tokens for that production deployment. GitHub's
production environment token secret is unchanged since July 10, 2026,
16:10:34 UTC, corroborating continued separation. **A fresh verification GET
executed with the current production environment secret has not run.** Separate
secret names/timestamps alone were not treated as identity proof. The
[sanitized correlation](security/sec06-production-token-correlation-2026-10-23.json)
records this boundary explicitly.

Fresh verification of the current production secret remains deferred. No
production-token diagnostic is added or activated in this release. The historical
audit/CI correlation above is the limit of the production-token identity claim.

For custom domains, an offline execution of the actual pinned Wrangler domain
publisher, with every API call stubbed and no credentials, confirmed its
unconditional noninteractive domain-record PUT. The current preview config
includes `preview-mcp.theologai.xyz`, so normal `wrangler deploy` reaches this
publisher. This trace establishes the client behavior, **not server-side
authorization under a narrower policy**. A dry run cannot prove that permission.

Wrangler's inspected `versions upload` path uploads a version without calling
the domain publisher; `versions deploy` creates a version traffic deployment
and synchronizes Worker settings, while domain/route triggers remain a separate
operation. Cloudflare [documents these separate commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#triggers-deploy)
and [Editor access for version upload/deployment with an existing domain connection](https://developers.cloudflare.com/workers/authorization/workers/#routes-and-custom-domains).
A deferred flow option for a future review would be to upload the source-bound
bundle to **`theologai-preview`**, deploy its exact new version at 100%, and keep
the existing custom-domain connection untouched. Preserve current approval,
readiness, production-control, source identity, and post-deploy receipt checks;
their command-output parsing must also be adapted and tested. Do not target the
production Worker or use a production version URL for this preview test.

**Live compatibility remains unconfirmed.** Acceptance requires an explicitly
approved preview deployment with preview-scoped Editor, pre/post proof of the
unchanged hostname/Worker connection, successful canonical preview MCP tests,
and unchanged production control. No token scope was changed and no live
deployment, upload, domain write, or production configuration change was made
in this follow-up. Normal preview → test → production and its approval gates
remain intact.

### Binding assessment completed without cloud mutation

The authenticated live dashboard showed:

| Resource | Preview | Production | Assessment |
| --- | --- | --- | --- |
| `THEOLOGAI_DB` | `theologai-preview-20260811-schema0009-a` / `74f456e2-6951-4003-bb6f-91951342bf8f` | `theologai-production-20260811-schema0009-a` / `9bc79346-338b-439e-a2a5-424f4418eb21` | Distinct bindings now; no current production D1 binding was observed on preview. |
| `THEOLOGAI_CCEL_COORDINATOR` | `theologai-ccel-coordinator_CcelGlobalCoordinator`, namespace `e653769555fe44deaf1dd18de403dab6` | Same namespace | Intentional shared state, not an isolated preview resource. |
| CCEL coordinator/live-search flags | Both `false` | Both `false` | Current application code leaves execution disabled; these flags are not a sandbox for arbitrary replacement Worker code. |
| Preview custom domain | `preview-mcp.theologai.xyz` remains attached | — | Preserve its existing connection when reviewing token narrowing. |

An offline check changed only an in-memory copy of the preview D1 config to the
production name/ID and passed that copy plus a synthetic inventory to
`candidatePreviewD1DatabaseName`. **The selector accepted production as a
preview candidate.** It verifies the configured ID/name mapping but contains no
approved-preview target constraint. No config file was changed and no cloud
query or deployment occurred. Production-control snapshots compare Worker and
binding identities, not the contents of production D1; unchanged production
Worker identity cannot prove that another Worker never touched its database.

The coordinator exposes public RPC methods such as `admit`, `recordOutcome`,
and `resetAfterOperatorReview`. The HTTP operator's authentication does not wrap
direct calls through an existing Durable Object binding. Under Cloudflare's
[RPC model](https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/),
replacement preview code can invoke those public methods through its binding.
This is a code-and-configuration assessment, not an invoked RPC or observed
attack. The shared coordinator deliberately controls one upstream budget, so
splitting it is not part of this minimum proposal.

### Remaining risk within the existing account

Until the proposed policy reduction is reviewed and applied, the inspected token
retains account-wide Worker write access. Existing approval and branch gates
limit access to the credential, but do not reduce its permissions once a job
receives it. The current GitHub secret's identity is directly verified above.

Cloudflare's [September 15 announcement](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/)
introduced per-Worker roles, correcting the initial review's blanket
account-wide-write claim. Current [binding authorization](https://developers.cloudflare.com/workers/authorization/workers/#bindings)
also says deploying bindings does not require separate permission on the bound
resources. Whether the narrower preview policy and deployment controls prevent a
production binding is answered by the documented permission model and the local
selector check: **Worker scoping alone does not enforce that restriction.** A
holder with preview Editor can attach a same-account D1 binding without a D1
write grant. Runtime binding access is separate from direct REST permissions.
The inspected token's account-wide D1 Read also permits production SQL reads;
no production data was queried. D1's [HTTP permission fix](https://developers.cloudflare.com/d1/platform/release-notes/#2025-05-02)
requires D1 Edit for direct REST writes, so direct SQL write authority was not
established from its D1 Read grant.

Even after narrowing Worker writes and adding release validation, a stolen
preview deployment token or malicious authorized credential-bearing runner
remains a same-account binding risk. The current shared coordinator is another
explicit trust relationship. These are residual risks to document under the
chosen account setup; they do not justify claiming complete isolation or
introducing an unconditional preview block. The read-only assessment is now
complete. SEC-06 stays open and paused. The user chose to proceed with SEC-01–05 while
retaining the current setup and documenting these risks. No additional
SEC-06 work or permission change is authorized for this release.

## Local verification before the preventive-hardening follow-up

On the pinned Node 22.23.4 runtime, 2,753 unit tests, 3 integration tests,
28 Worker runtime tests, and 17 coordinator runtime tests passed; 5 existing
unit tests remain skipped. All configured type checks, generated binding-type
checks, compiled Node HTTP/stdio checks, and legacy/modern MCP conformance
checks passed. Workflow boundary and artifact-integrity tests are included.
Root development-inclusive, root production-only, and independent release
toolchain audits each report zero known vulnerabilities.

A separate fixture outside the repository installed only the release lock,
loaded 26 release entrypoints without the root dependency graph, and rebuilt
the complete 455-page Aquinas authority query plan. The composite action's
runtime-pin step also resolved the trusted Node 22.23.4 pin locally.

Production, preview, and coordinator Worker builds each passed a source-bound
handoff and upload-only dry run. The uploaded JavaScript is byte-identical to
the prebuilt bundle. No hosted deployment or credentialed cloud test was run.
Logs and sanitized audit JSON are under the ignored directory
`test-output/security-review-2026-10-22/` with `remaining-`, `dependency-audit-final-`,
and `release-toolchain-audit-final` filenames.

## Verification of the preventive-hardening follow-up

After removing the unconditional block and testing release-toolchain
introduction, **2,754 unit tests and 3 integration tests passed**, with the same
5 existing unit skips. All test typecheck projects passed. Focused release,
canary, artifact, and provisioning checks passed as part of the suite. Existing
approval, validation, live-head, serialization, D1 readiness, source-bound
preview receipt, and protected production gates remain intact. Follow-up logs
are under `test-output/security-review-2026-10-23/`.

## SEC-01–05 final release review, October 23

Final review found no additional blocking code issue. The development-audit
exception above is the remaining SEC-04 limitation; SEC-06 is paused and is
not a release prerequisite. The temporary preview diagnostic is removed from
runnable workflows, and no production-token diagnostic is included.

With application Zod 4.6.7 installed from the final lock, 2,758 tests passed
across 211 unit test files, with 5 existing skips. Coverage was 91.55% of lines
and 82.28% of branches. All configured type checks passed. The 3 integration,
28 Worker-runtime, and 17 coordinator-runtime tests passed. Compiled Node HTTP
and stdio checks and legacy/modern MCP conformance passed. The fresh production
and separately locked release-toolchain audits report zero vulnerabilities.
The full development audit has the one bounded exception described above;
all other high/critical findings remain blocking. Test logs are retained under
`test-output/security-review-2026-10-23/release-final-*`.

Publication and hosted validation must use the exact reviewed candidate.
Preview deployment still requires its existing reviewer gate and source-bound
hosted audit receipt. Production follows only after preview tests, merge, the
main-only manual release workflow, and the existing production approval.
Neither local tests nor this document claim that a deployment has occurred.

### Publication recheck, October 24

Before publication, a fresh registry audit added two development findings:
[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828) in the modern
conformance runner, and [Happy DOM](https://github.com/advisories/GHSA-834v-8h66-3h79)
in parser tests. The gate rejected both. The final lock now selects body-parser
2.4.0 and Happy DOM 21.0.4; neither receives an exception. Their conformance and
parser tests are rechecked, and hosted CI validates the complete published
candidate. Production and release-toolchain audits remain clean. SEC-06 scope
and the existing Cloudflare permissions/deployment process remain unchanged.

### Approved-preview release corrections, October 24

The user approved PR #167's preview deployment and requested live tests followed
by a stop at the production approval gate. The first approved job was canceled
before any Cloudflare check or upload when review found that the SEC-05 CLI
step did not pass deploy stdout to the unchanged strict identity verifier.
Both preview and production now preserve only the final deploy command's stdout
in the file consumed by that verifier. Shell `pipefail` preserves upload
failures. An offline regression executes both workflow steps with a stub CLI,
proving the final output handoff and failure propagation; it excludes the
intermediate secret-update output from the identity evidence.

Existing main's live auditors also retained the older 11-tool/35-work contract.
They now require the reviewed 12-tool contract, all 36 flat works, and the
separate Summa hierarchy landing. Norton remains a separate, exact edition
with its public work locator and checked provenance/readiness; Summa remains
outside the flat catalog. The eight core and ten spine probes remain bounded
and mandatory. Bunyan's global discovery probe uses the source-attested
`Slough Despond` terms because generic `Christian` no longer reliably ranks
that work in the larger catalog. Dual-era receipts reject older eleven-tool
evidence for this release; source/tree/Worker/D1 proof and freshness checks
remain strict. No live-audit retry loop or relaxed identity check was added.

All 74 focused workflow, identity, contract, and receipt regression tests pass.
The actual HTTP MCP handlers backed by a freshly rebuilt local corpus pass
edge stabilization, the 11 original-language cases, eight historical-core
works, ten spine works, and both preview protocol eras. The production-profile
rehearsal also passes these fixed audits locally; it makes no hosted production
request or deployment. Full CI must pass again for the exact amended candidate.
SEC-06 remains open and paused, with account and token policies unchanged.
