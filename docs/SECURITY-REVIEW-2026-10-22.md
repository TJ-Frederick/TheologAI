# Security review — October 22, 2026

Reviewed source: `f6026ab14128d4719b0ca8b120e8d5573837d8ec`, identical to freshly fetched `origin/main`. The worktree was clean before review. The original review made no application, dependency, workflow, credential, or deployment changes.

This is a source and dependency review, with local reproductions. It is not an incident-response investigation or a penetration test of the hosted service. The production record in `docs/CURRENT-RELEASE.md` names a different deployed source; findings below concern this checkout unless explicitly stated otherwise. The original review did not inspect live Cloudflare controls, token policies, GitHub environment approvals, branch protections, or historical workstation/runner exposure. The October 23 follow-up below adds read-only token-policy and GitHub environment observations; it is still not an incident-response investigation.

## Local remediation follow-up

SEC-01, SEC-02, and SEC-03 are implemented in the current worktree:

- SEC-01: both HTTP transports enforce a 64 KiB ceiling and check input complexity before SDK validation. Shared server/tool handlers also preflight input, and diagnostic formatting is bounded. Regression tests prove the original 90,000-key input never invokes schema validation; legacy/modern HTTP metadata attacks return 413 before dispatch.
- SEC-02: `.nvmrc` pins Node 22.23.4, and both package manifests require `>=22.23.4 <23`. Verification used the official Node 22.23.4 binary, with the archive checksum checked against the published release checksum.
- SEC-03: public and operator budgets use separate, versioned IP hashes. Rotating User-Agent no longer resets either allowance. Missing public IPs share a bucket; the operator route fails closed without an IP. The original rotating-agent probe now admits 120 and rejects 120 of 240 requests, using one counter.

Verification on Node 22.23.4: **2,742 unit tests, 3 integration tests, and 28 local Workerd tests passed**, with 5 existing unit tests skipped. All configured type checks passed, as did compiled Node HTTP/stdio checks for both protocol eras, generated binding-type verification, and production/preview Worker bundle dry runs. Logs are retained under `test-output/security-review-2026-10-22/` with `fix-` filenames.

October 23 follow-up for SEC-04–06:

- SEC-04: the refreshed root lock and separate release-toolchain lock both audit clean. The full development-inclusive and production-only root scopes report zero known vulnerabilities. MCP upgrades preserve the input guards from SEC-01; redirect tests now cover the client's safer cross-origin default.
- SEC-05: application builds and historical rehearsal installs now run in separate jobs without cloud credentials. Credential-bearing jobs use an independent, explicitly reviewed release dependency set, with lifecycle scripts disabled except the required SQLite rebuild. Source-bound bundles are verified and uploaded with bundling disabled. Existing release identity/readiness/audit gates are retained. Repository helpers and the explicit release toolchain remain trusted code.
- SEC-06: **open, preventive hardening; read-only assessment complete**. The approved diagnostic verified GitHub's exact active token as `dac2ed85288c21310268159147e942dc`, matching the inspected account-wide Worker write policy. Both Workers' settings and production D1 metadata were readable. Live D1 targets are distinct; the coordinator is intentionally shared, and an offline selector check accepts production as a preview candidate. Narrow preview Worker writes, retain required reads, and validate approved preview bindings while documenting residual same-account access. The prepared fixes remove the unconditional block and preserve normal preview testing and production approval gates. There is no evidence of compromise; no policy or production configuration changed, and no migration is proposed.

The release trust set, preserved approval gates, read-only results, and remaining hardening proposal are in [`RELEASE-SECURITY-REMEDIATION.md`](RELEASE-SECURITY-REMEDIATION.md). The diagnostic and Node/dependency validation prerequisites are published in [PR #167](https://github.com/TJ-Frederick/TheologAI/pull/167); the other prepared fixes remain uncommitted in the workspace. No Worker deployment occurred and the PR is unmerged. Findings below retain the reviewed baseline versions and reproduction evidence.

## Prioritized findings

P1 means address promptly, preferably before the next release. P2 means schedule remediation or explicitly accept the stated residual risk. No P0 was established.

| ID | Priority | Finding | Evidence status | Approximate scope |
| --- | --- | --- | --- | --- |
| SEC-01 | P1 | Invalid tool arguments amplify memory before rejection | Locally reproduced | Small/medium: input preflight, validation, transport limits |
| SEC-02 | P1 | CI and documented Node runtime are behind current security patches | Version and upstream advisory confirmed | Small: Node patch and supported-version floor |
| SEC-03 | P1 | Rotating User-Agent bypasses anonymous rate limits | Locally reproduced with a deterministic limiter | Small/medium: limiter identity and abuse budgets |
| SEC-04 | P2 | Dependency pins and overrides retain published vulnerabilities | Registry audit confirmed; reachability varies | Medium: dependency update and compatibility checks |
| SEC-05 | P2 | Deployment runners execute dependency installation and application tooling before using cloud credentials | Workflow trust boundary confirmed; no malicious dependency identified | Medium: separate build and deployment trust |
| SEC-06 | P2 | Narrow preview credential scope and assess production-resource access | Exact GitHub token verified; account-wide write and production metadata reads confirmed; binding risk assessed | Scope Worker write to preview, retain required reads, validate approved bindings, and document residual risk within existing account |

## SEC-01 — Bound input complexity before schema validation

**Priority: P1. Confidence: high for amplification; hosted exhaustion was not attempted.**

The HTTP body limit is 1 MiB, but the shared validation adapter processes all errors and joins them into an unbounded diagnostic string. Closed tool schemas prevent invalid arguments from reaching providers, but that rejection comes after substantial allocation. `shortCircuit: true` does not stop the installed validator's additional-properties loop from accumulating an error for every unexpected key.

Evidence: [shared validator, lines 25–38](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/src/mcp/validation.ts#L25), [tool dispatch before rejection](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/src/mcp/tools.ts#L82), and [Worker body limit](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/src/http/worker/requestPolicy.ts#L5).

A local Node 22.23.1 probe used the real MCP HTTP handler, real `registerToolHandlers`, and real `bible_lookup` input schema, with a provider stub that was never called. A request containing one valid reference and 90,000 unexpected numeric properties was **979,007 bytes**, below the body limit. One retained run increased sampled process heap from **41,809,696 to 117,617,496 bytes**, about 72 MiB additional heap, while returning only 170 response bytes. The validator alone generated **8,977,778 diagnostic characters**. Samples vary with garbage collection; these are observations, not a peak-memory measurement or a demonstrated production crash.

An anonymous caller can repeat this work and create memory/CPU pressure. SEC-03 weakens the intended request-rate defense.

**Remediation:** reject excessive object keys, array elements, and nesting before general schema validation; use a bounded traversal and a much smaller body ceiling appropriate to these tools. Cap diagnostic collection inside validation and diagnostic formatting. Upgrade the MCP SDK as part of SEC-04, but preserve the application-level defense: this repo uses low-level `Server` handlers and its own validator, so the upstream `McpServer.maxToolInputElements` option cannot simply be assumed to protect this path.

**Acceptance:** malformed inputs near the body limit are rejected with bounded allocation and small errors before providers or D1 run. Cover extra keys, nested values, oversized arrays, legacy HTTP, and modern HTTP.

The October 15 [MCP memory-exhaustion advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453) supports prioritizing this boundary; the local reproduction establishes this repo's custom validation issue independently.

## SEC-02 — Patch the Node runtime

**Priority: P1. Confidence: high for affected version; exploitation was not attempted.**

[`.nvmrc`](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/.nvmrc#L1) pins **22.23.1**, and workflows install that version through `node-version-file`. The [engine range](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/package.json#L112) also permits older Node 22 patches.

Node's [October 21 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) provides **22.23.4** and fixes issues affecting Node 22, including a high-severity Brotli decoder out-of-bounds write and TLS/DNS validation issues. Node adapters use native `fetch` to read upstream responses, so an upstream/dependency compromise makes runtime parser patches relevant. This is affected-runtime exposure; no exploit against these adapters was established.

**Remediation:** pin Node 22.23.4 or a later security-patched Node 22 release, raise the documented supported minimum, and rerun the appropriate Node/build/release checks. Updating the npm `undici` override alone does not replace Node's bundled networking implementation. Cloudflare's hosted runtime is separately managed; `.nvmrc` does not establish its vulnerability status.

**Acceptance:** CI and supported local/server installations use a patched runtime, with passing Node HTTP/stdio and release-script verification.

## SEC-03 — Use a stable rate-limit identity

**Priority: P1. Confidence: high.**

The [public rate-limit key](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/src/http/worker/rateLimit.ts#L17) hashes `CF-Connecting-IP` **and** caller-controlled `User-Agent`. Changing the header produces a fresh counter, even for the same IP and location. Hashing does not make the identity stable.

The local reproduction exercised the real key-building and admission function against a deterministic 120-request-per-key limiter: **240/240 requests from one IP passed with rotating User-Agent values**, while a fixed identity admitted 120 of 121 requests. This proves key rotation, not a load test of Cloudflare's distributed counters.

The same construction appears in the [operator pre-auth limiter](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/src/http/worker/ccelOperator.ts#L88). Its HMAC checks still protect authorization; this finding does not bypass the signature. Public limiter failures also deliberately fail open. The local-counter scope and fail-open choice amplify the risk but are separate policy decisions.

Anonymous callers can consume D1/provider capacity beyond the advertised allowance. For example, each uncached donation check schedules six RPC calls across three networks, and absent hashes are not cached.

**Remediation:** impose an independent stable-IP budget, with any IP-plus-agent budget only as a secondary signal. Keep explicit handling for missing trusted client identity. Consider an aggregate budget for costly remote work and an explicit degraded policy when the limiter fails. Cloudflare documents the [binding's per-key and location-local behavior](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

**Acceptance:** changing User-Agent cannot reset the same IP's primary allowance; retain environment separation and test missing-IP and limiter-failure behavior.

## SEC-04 — Refresh vulnerable dependencies without treating every advisory as reachable

**Priority: P2, with the MCP input boundary handled urgently under SEC-01. Confidence: high for audit results.**

On October 22, `npm audit --package-lock-only --include=dev --json` reported **33 affected package groups: 5 critical, 21 high, 7 moderate**. The production-only audit reported **6 affected groups: 4 high, 2 moderate, no critical**. These are dependency-group counts with transitive propagation, not 33 independent exploitable flaws.

The [manifest](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/package.json#L115) pins MCP server/node/client 2.0.0 and forces older versions through overrides. Examples:

| Package/path | Locked version | Triage |
| --- | --- | --- |
| MCP server | 2.0.0 | Upgrade to 2.3.0 or later, keeping the custom input guard from SEC-01. |
| Hono | 4.12.34 | Audit includes issues fixed through 4.13.11. Static-generation, JSX, and static-file advisories are not demonstrated reachable in this MCP service. |
| fast-uri, through Ajv | 3.1.6 | URI-confusion advisories; the observed Ajv compilation uses a checked-in output schema, not arbitrary caller schemas. |
| undici override | 7.29.0 | Multiple advisories fixed in 7.29.1; this installed dependency is dev-only in the lockfile. |
| Vite / Vitest | 8.1.5 / 4.1.10 | Developer/test-server file access and editor/mock-registration risks depend on the relevant server/features being reachable. |
| Conformance dependencies | Includes SDK 1.29.0 and proxy-addr 2.0.7 | The audit's critical dependency groups are in development/conformance paths, not evidence of public production RCE. |

The [MCP cross-client response advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp) explicitly excludes `createMcpHandler` factories that create a new server per call. Both transports use that pattern here. The SDK bearer-auth advisory concerns middleware this anonymous service does not configure. Those warnings should not be presented as confirmed data leakage or auth bypass in this repo.

**Remediation:** refresh the related MCP packages together, update/remove stale overrides after checking compatibility, then update the remaining runtime and developer tooling in coherent groups. Preserve the existing high-severity audit gate rather than suppressing it globally. Its current audit command exits nonzero against this lockfile.

**Acceptance:** rerun both audit scopes, document any remaining advisory with a concrete reachability justification, and run dual-era transport, output-schema, conformance, and Worker compatibility checks for the selected updates.

## SEC-05 — Separate dependency execution from deployment credentials

**Priority: P2. Confidence: high for the trust boundary; conditional on a compromised dependency or authorized candidate.**

The [production deployment job](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/.github/workflows/deploy.yml#L314) executes `npm ci --no-audit` at line 389, then executes repository/npm tooling in steps that receive the Cloudflare API token. [Preview](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/.github/workflows/pr.yml#L376) and operator workflows have the same install-then-use-credentials pattern. `--no-audit` does not disable lifecycle scripts.

The lockfile marks five packages as having install scripts, including better-sqlite3, esbuild, and workerd. They were not identified as malicious. The concern is that install-time code can persist within the same job and affect later credential-bearing processes or deployment artifacts. Limiting credentials to later step environments reduces accidental exposure but does not isolate those steps from earlier runner compromise. Disabling lifecycle scripts alone also does not make subsequently executed package code trusted.

This is the class of boundary highlighted by the [Axios maintainer-account compromise](https://github.com/axios/axios/issues/10636?timeline_page=1) and the [Trivy credential-stealing release/Actions compromise](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23). It is not evidence that TheologAI was affected by either incident.

**Remediation:** build and validate without deployment credentials; pass a source-bound artifact to a narrowly scoped deploy job using a separately controlled toolchain. Disable unnecessary install scripts, explicitly allow required native builds, use `persist-credentials: false` where authenticated Git operations are unnecessary, and consider deployment-runner egress restrictions. Audit the deployment toolchain itself: artifact separation does not remove trust in Wrangler or its dependencies.

**Acceptance:** an ordinary application/development dependency cannot execute in the process/job that receives production credentials; the deploy job verifies the exact artifact and source identity.

## SEC-06 — Narrow preview authority within the existing account

**Priority: P2. Preventive hardening. Status: open and paused for this release by the user on October 23. Entire-account Workers Scripts Write is confirmed on the exact GitHub preview token, and the same-account binding risk remains. No evidence of key compromise.**

**Chosen setup:** preview and production stay in the existing Cloudflare account.
Preserve the normal preview → test → production process and existing approval
gates. Account migration is outside this remediation plan. Remaining risks are documented below; further permission-hardening work is
deferred beyond this release; no new unconditional preview block
is required.

The [preview job](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/.github/workflows/pr.yml#L303) checks out the authorized same-repository PR head and executes its scripts with preview environment credentials. Same-repository, label, live-head, environment, and concurrency checks meaningfully restrict access. They do not sandbox an authorized candidate or a compromised dependency after access is granted.

The repo already [documents](https://github.com/TJ-Frederick/TheologAI/blob/f6026ab14128d4719b0ca8b120e8d5573837d8ec/docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md#L135) account-wide legacy deployment-token authority. **October 23 correction:** Cloudflare [introduced granular per-Worker roles on September 15](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/), so the initial review's universal account-wide-write claim was too broad. Account-owned tokens can restrict edits to an existing preview Worker. However, [current binding authorization](https://developers.cloudflare.com/workers/authorization/workers/#bindings) permits Worker deployment with resource bindings without separate permissions on those resources. A per-Worker Editor token alone therefore does not establish production-data isolation if candidate-controlled configuration can select production D1. This is an inference from the documented permission boundary; no live cross-resource exploit was attempted. Custom-domain support also has documented limitations. Separate secret names or `--env preview` do not prove the credential's actual scope. The original review did not inspect live token policies; the dated follow-up below records the subsequent read-only inspection.

**Read-only assessment and smallest fix:** the existing Cloudflare token named `TheologAI Preview GitHub` has an Entire Account policy granting `Workers Scripts Write`, `Workers Scripts Read`, `D1 Read`, and `Account Settings Read`. The approved diagnostic directly verified that GitHub's current secret is this token, ID `dac2ed85288c21310268159147e942dc`, at October 23, 2026, 18:50:33 UTC. All four fixed GET requests returned HTTP 200. The smallest immediate reduction is to replace account-wide Worker write with Editor scoped to `theologai-preview`, retaining required reads and resolving custom-domain compatibility before applying the change. Add protected validation of approved preview bindings; this does not make a stolen deployment token incapable of same-account rebinding. No policy was modified. Existing preview/production approval and branch policies remain in place. No account migration is proposed and no accounts, credentials, or production settings have been changed. See [`RELEASE-SECURITY-REMEDIATION.md`](RELEASE-SECURITY-REMEDIATION.md) for the receipt, validation evidence, and remaining proposal.

**Acceptance:** compromise of an authorized preview runner cannot obtain credentials capable of modifying production Workers or production data.

**Further read-only assessment, October 23:** the live preview and production
D1 bindings are distinct, but both Workers bind the same CCEL coordinator.
Current coordinator execution flags are disabled. An offline, in-memory test
confirmed that `candidatePreviewD1DatabaseName` accepts production's name/UUID
as a preview target when the inventory matches. Cloudflare permits Worker
Editors to attach resource bindings without separate resource permission, so
Worker-scoped write alone does not satisfy the acceptance criterion. The
shared coordinator's public RPC methods also remain accessible to replacement
code through its existing binding. No RPC, SQL, deployment, or binding mutation
was performed.

Direct identity could not be obtained from GitHub secret metadata, so the user
authorized publishing and running the diagnostic in PR #167. Run
[40005138733](https://github.com/TJ-Frederick/TheologAI/actions/runs/40005138733)
passed existing validation and the normal preview required-reviewer gate.
Its [sanitized receipt](security/sec06-readonly-receipt-2026-10-23.json) verifies
the exact active token and reads both Workers' settings plus production D1
metadata. It confirms the distinct D1 and shared coordinator bindings above.
No application checkout, SQL, Worker deployment, or permission change ran in
the diagnostic; `Deploy Preview` was skipped. The proposed minimum now remaining
is preview-only Worker Editor with required reads retained and protected
validation of approved preview bindings.
Custom-domain compatibility must be resolved before changing policy; no wider
write grant is proposed. Document the residual same-account binding and shared
coordinator risk rather than claiming this closes SEC-06. Full evidence and
limitations are in the remediation report.

**Production-token and custom-domain follow-up:** the successful September 1
production upload is tied by an exact audit/CI time match to token
`7f1887062072c3e5d619c54cf810c949` (`TheologAI Production GitHub`), distinct from
preview's verified token. Both token records remain active, and GitHub's
production secret metadata is unchanged since July 10. This is historical
deployment proof and current corroboration; a fresh production-secret
verification GET has not run. A main-only, production-approved diagnostic remains an inactive assessment
draft; the user deferred this check and all further SEC-06 work for this release.

The pinned Wrangler 4.114.0 `deploy` path sends a custom-domain-record PUT even
for the configured existing hostname; this was verified by an offline trace of
the actual domain publisher with all network calls stubbed. Narrowed Editor
permission is therefore not confirmed as a drop-in change. A version-upload/deployment path is only a deferred option for later review.
This release keeps the existing custom-domain deployment command and token
permissions. The production check, trace details, evidence, and proposed
next steps are recorded in the remediation report. No permission change,
Worker deployment, or production configuration change was made.

**Release decision, October 23:** ship the reviewed SEC-01–05 fixes through
normal preview → hosted tests → production approvals. SEC-06 remains open and
paused. The preview token retains account-wide Worker write and D1 Read;
preview and production retain distinct D1 bindings but share the coordinator.
Existing approval gates reduce credential exposure without constraining its
post-approval authority. Production-secret identity is historically corroborated,
not freshly verified, and narrowed custom-domain permissions remain untested.
No account migration, token/policy change, new credential diagnostic, binding
hardening, or deployment-flow change is included in this release. Retain the
sanitized assessment receipts; remove the completed temporary diagnostic job
from the runnable PR workflow.

## Original review verification and boundaries

- Fetched `origin/main`; HEAD and origin/main both resolved to the reviewed commit.
- Installed the exact lockfile with lifecycle scripts disabled for local review. Package files were not changed.
- On Node **22.23.1**, ran the HTTP, Worker entry-point, MCP validation, and shared HTTP-client suites: **9 files, 146 tests passed**. No full test suite, native database rebuild, deployed test, or exploit of the Node CVEs was run.
- Retained both npm audits, local reproduction source/results, and the targeted-test log under the ignored `test-output/security-review-2026-10-22/` directory. The probe uses workspace-specific absolute imports and mocked provider/limiter dependencies; it makes no hosted requests.
- All **93 external Action references** found in workflows/composite actions use full commit SHAs. All resolved npm packages use the npm registry and carry integrity hashes. Those controls are useful and should remain.
- Sampled SQL repositories bind caller values; local primary-source search quotes FTS literals. No SQL injection, public shell execution, or arbitrary-URL fetch route was established in the inspected runtime paths.
- Exact browser-origin checks, loopback/host guards for Node, bounded upstream reads, sanitized errors, and signed operator requests provide useful existing defenses. Anonymous read-only MCP access is an intentional contract and is not itself a finding.
- The current lockfile contains neither Axios nor plain-crypto-js, and workflows do not reference Trivy Actions. This source observation does not establish historical exposure or absence of compromise.

Suggested sequence: SEC-02 is a quick patch, while SEC-01 and SEC-03 address the directly reproducible anonymous-request weaknesses. SEC-04 should accompany the relevant compatibility work. SEC-05 and SEC-06 are separate CI/infrastructure projects.
