# Custom-domain migration and rollback

This runbook governs the infrastructure-only migration to `theologai.xyz` and
the separately reviewed, post-migration legacy-host redirect window. The
initial domain migration must not be combined with application behavior,
database, corpus, rate-limit, CCEL, dependency, or feature changes. No existing
route, domain, deployment, database, or compatibility endpoint may be deleted
without separate owner approval.

## Address and ownership map

| Address | Owner | Purpose |
|---|---|---|
| `https://theologai.xyz` | Cloudflare Pages project `theologai` | Canonical website. |
| `https://www.theologai.xyz` | Cloudflare redirect rule, if enabled | Optional permanent redirect to the apex. |
| `https://mcp.theologai.xyz/mcp` | Production Worker `theologai` | Canonical production MCP endpoint. |
| `https://preview-mcp.theologai.xyz/mcp` | Preview Worker `theologai-preview` | Canonical preview MCP endpoint. |
| `https://theologai.pages.dev/` | Existing Pages project | Website compatibility and rollback alias. |
| `https://theologai.tjfrederick.workers.dev/mcp` | Production Worker | Temporary 308 migration alias; the confirmed abusive poller is rejected before redirect. |
| `https://theologai-preview.tjfrederick.workers.dev/mcp` | Preview Worker | Preview compatibility and rollback alias. |

The apex Pages custom domain and Worker custom-domain subdomains do not compete:
Pages owns only the apex, while each Worker owns one distinct hostname. Before
activation, inspect live DNS and Custom Domains for conflicting A, AAAA, CNAME,
Worker route, Pages domain, redirect, or Bulk Redirect ownership. Do not replace
or delete a conflict automatically; stop for an owner routing decision.

Cloudflare provisions and renews certificates for Pages and Worker custom
domains after ownership validation. Treat a route as unavailable until its
certificate is active and a fresh TLS request succeeds. DNS records, Pages
custom-domain attachment, and the optional `www` redirect may require manual
Cloudflare dashboard action even though Worker routes are declared in
`wrangler.toml`.

## Current operational release state (PR #96; 2026-07-24)

The current production endpoint is `https://mcp.theologai.xyz/mcp`. PR #96
audit evidence fixed source commit
`ac4b5ed774302fbfc86bf846b6ee77a07beed456` and tree
`adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`; the endpoint reported server
`3.6.0`. Cloudflare checks before and after the audit recorded the same sole
100% production assignment: deployment
`2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
`7a3f5078-37bc-453e-bac7-a0743afd508a`, and D1
`theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`). The stateless
`original_language_study` v2 production audit passed 11/11 cases in 14
exchanges under 180-second end-to-end, 30-second per-request, 256 KiB
per-response, and 1 MiB aggregate limits. Its fixture SHA-256 is
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`; retained
evidence is sanitized metadata and hashes, not tool output or source text.
Protected production workflow run `30064214043` and GitHub deployment
`5583281706` link the recorded source/tree to the active Worker, and the
read-only D1 compatibility check passed. Audit-evidence SHA-256:
`321053d510217c20a79bc4d42505d67623378c2360f30c2f078a150f5a8f39bf`;
identity-evidence SHA-256:
`a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

PR #72 is retained as the rollback pair, not current production: merge
`72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`).

> **PR96 broad MCP smoke — PASS:** Completed in 8.834 seconds. Sanitized
> `production-mcp-smoke-audit.json` evidence SHA-256:
> `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
> It verified 26 MCP operations across 27 HTTP exchanges and 293,466 aggregate
> MCP response bytes, stateless with no retries or redirects. Pre/post identity
> was unchanged: deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

> **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
> post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
> Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
> SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
> 1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
> SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
> 848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
> Two automatic reconnect warnings and a maximum uninterrupted segment of about
> 19m12s mean this is neither a continuous 30-minute observation nor an
> exhaustive/global request count. Wrangler tail authoritatively cannot provide
> a request total: 2,172 observed events = 2,167 ok + 5 separately classified
> client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
> truncated events, and 0 unexpected release errors. Raw captures are private
> and unpublished because they contain request metadata. Final authoritative
> identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
> `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
> `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
> sole 100%; identity SHA-256
> `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

## Release-time known-good baseline

The rollback anchor is deliberately a release-time record, not a stale version
in this document. Immediately before the temporary redirect is deployed, the
release coordinator must capture in the protected production approval and
deployment comment:

- the exact approved production source SHA and the immediately preceding
  known-good production release (the post-PR #70 release if that is the chosen
  predecessor);
- the GitHub Actions run, GitHub deployment, Cloudflare deployment, Worker
  version, and 100% traffic assignment for that predecessor;
- production D1 name and ID, rate-limit namespace and policy, CCEL flags, and
  custom-domain state; and
- the fresh initialization, CORS, representative-tool, and black-box audit
  evidence for that predecessor.

Do not substitute an historical deployment identifier for this record. If the
planned predecessor is not yet released or has not passed its audit, capture
the actual approved predecessor immediately before release and stop if it is
not a suitable rollback target. For the documented PR #96 release, the current
D1 is `theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`) and PR #72's
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`) is the retained rollback D1. This
release record does not infer a current rate namespace or CCEL flag value.

A preview deployment necessarily creates a new Worker version. Record that
version and the reviewed binding current at execution; as of this record the
preview binding is D1 `theologai-preview-20260722-b`
(`94c4938b-7800-4d68-9097-0df33c31fdc1`), rate namespace `361202`, and CCEL
flags `100`. This routing-only migration must preserve whichever reviewed
binding and environment ownership is current at execution; it must not replace
that binding merely to satisfy a historical record.

## Reviewable phase split

Keep the full diff visible for final review, but publish it in two ordered
commits so public metadata never points to an unavailable website:

**Phase A — routing and release controls:**

- `.github/workflows/deploy.yml`
- `.github/workflows/pr.yml`
- `wrangler.toml`
- `worker-configuration.d.ts`
- `scripts/detect-production-custom-domain-change.ts`
- `docs/CUSTOM-DOMAIN-MIGRATION.md`
- `docs/ROADMAP.md`
- `docs/worker-operations.md`
- `test/unit/config/customDomainConfig.test.ts`
- `test/unit/scripts/detectProductionCustomDomainChange.test.ts`
- `test/unit/worker/workerEntryPoint.test.ts`

Deploy and audit Phase A on preview, then attach and verify the Pages apex.
Do not merge the pull request after Phase A.

**Phase B — endpoint-metadata cutover after the apex is live:**

- `README.md`
- `CHANGELOG.md`
- `docs/PARALLEL-PREVIEW-AUDIT.md`
- `src/kernel/publicUrls.ts`
- `src/formatters/donationFormatter.ts`
- `src/mcp/prompts.ts`
- `test/unit/config/customDomainEndpointMetadata.test.ts`
- `test/unit/formatters/donationFormatter.test.ts`
- `test/unit/mcp/server.test.ts`
- `test/unit/tools/v2/handlers.test.ts`
- `test/worker-runtime/workerMcp.test.ts`

The public donation URL, its Markdown label, guided donation prompt, README
client examples, changelog endpoint declaration, and canonical preview-audit
example are a deliberate endpoint-metadata exception within this otherwise
infrastructure-only release. Add Phase B only after `https://theologai.xyz`
serves correctly. Redeploy and re-audit preview after Phase B before merge.
The Node and Worker fallback origin constants remain on the legacy Pages origin;
the explicit dual-origin Wrangler variables provide hosted migration support.

## Preview-first migration

1. Reconfirm the baseline Worker versions, traffic percentages, D1 bindings,
   rate namespaces, CCEL flags, and successful legacy endpoints using read-only
   inventory.
2. Confirm `preview-mcp.theologai.xyz` has no conflicting DNS, Pages, Worker,
   redirect, or certificate ownership.
3. Push the reviewed commit to its pull request and explicitly authorize only
   that pull request's preview deployment. Do not merge it yet. Wrangler must
   retain `workers_dev = true` while attaching the preview custom domain.
4. Wait for active custom-domain status and a valid TLS certificate.
5. From a fresh MCP session, verify initialization and protocol negotiation;
   tools, resources, and prompts inventory; representative calls; exact-origin
   CORS for both website origins; rejected arbitrary origins; OPTIONS; expected
   under-budget rate behavior; and `/mcp` routing.
6. Repeat a compatibility smoke test through the preview `workers.dev` alias.
   Confirm both hostnames reach only `theologai-preview`, D1
   `theologai-preview-20260722-b`, rate namespace `361202`, and CCEL state
   `100`. Record the new preview Worker version. Remove preview authorization
   after the audit and verify revocation.

Do not proceed if preview changes application results, crosses into production
bindings, fails TLS, or causes the compatibility alias to stop working.

## Website apex and optional `www`

1. Attach `theologai.xyz` to the existing Pages project; do not create a second
   content deployment or move the apex to a Worker.
2. Wait for Cloudflare DNS validation and an active certificate, then verify the
   apex document, navigation, assets, donation path, status codes, and TLS.
3. Verify `https://theologai.pages.dev/` still serves the same site as a
   compatibility alias.
4. If desired, configure `www.theologai.xyz` as a redirect-only hostname to
   `https://theologai.xyz`, preserving path and query. Verify HTTP-to-HTTPS and
   `www` redirects do not loop or send traffic to an MCP Worker.

The optional `www` redirect is an owner-visible routing choice. If an existing
record or application owns `www`, pause rather than overwriting it.

## Production custom domain

Only after preview and the website pass:

1. Confirm `mcp.theologai.xyz` has no conflicting ownership.
2. Merge the same reviewed pull request only after preview and the website have
   passed. Approve its protected production deployment and keep
   `workers_dev = true`.
3. Wait for active custom-domain and certificate status.
4. Run the same fresh-session MCP, CORS, OPTIONS, representative-tool,
   under-budget rate, and isolation checks used for preview.
5. Confirm production reaches only Worker `theologai` and the production D1
   recorded in the release-time known-good baseline (currently
   `theologai-production-20260723-a` / `3f7faa0e-689f-47aa-a601-dc662db9a6cf`).
   Obtain the current rate namespace and CCEL state from a read-only inventory
   at execution time; do not infer either value from a historical release
   record. Confirm preview retains its distinct bindings and state.
6. Smoke-test the production `workers.dev` compatibility alias and record exact
   post-migration Worker/Pages versions, DNS/custom-domain state, audit counts,
   and remaining risks.

The production workflow runs the website, preview MCP, and preview CORS
prerequisite only when the complete push range from GitHub's previous `main`
SHA adds, removes, or changes the production `mcp.theologai.xyz` declaration.
The workflow fetches that exact predecessor if its shallow checkout does not
contain it. This covers merge, squash, and multi-commit rebase strategies and
makes the migration fail closed without permanently coupling unrelated future
production hotfixes to preview or website availability. An unchanged
declaration skips the gate.

## Client cutover

After both custom MCP domains pass independent black-box audit, make the custom
URLs canonical in clients and documentation. Preserve the old URL alongside
each client entry as a commented or separately named rollback target where the
client format allows it until the temporary redirect window begins. Once the
redirect is active, restoring direct legacy service requires reverting the
migration gate or restoring the preceding Worker version. Reconnect and
reinitialize MCP sessions after changing a URL; cached capability inventories
are not migration evidence.

## Temporary legacy-host redirect window

During the client cutover window, the production Worker handles the legacy
`workers.dev` hostname before origin validation, rate limiting, request-body
reads, or MCP construction:

- The exact IP and user-agent tuple of the AWS Frankfurt poller observed on
  2026-07-17 receives `410 Gone` on the legacy production hostname and `403
  Forbidden` on the production custom hostname. The tuple is never blocked on
  preview or arbitrary hostnames.
- Every other method and path on the legacy hostname receives `308 Permanent
  Redirect` to the same path and query on `https://mcp.theologai.xyz`.
- A browser preflight from an exact configured website origin to `/` or `/mcp`
  receives the existing `204` CORS response instead of a cross-origin redirect.
  An actual legacy request still receives the redirect with the same exact
  `Access-Control-Allow-Origin` and `Vary: Origin` behavior. Untrusted origins
  are never reflected.
- Preview hostnames are not redirected. This does not make the temporary
  redirect an authentication migration: browsers and client libraries can strip
  or decline to forward origin-scoped `Authorization` credentials across a
  hostname redirect. The current endpoint is anonymous; a future authenticated
  client must move directly to the canonical URL rather than rely on this
  redirect.
- The redirect uses `Cache-Control: no-store` throughout burn-in. Its effective
  shared/browser cache horizon is zero even though the status is `308`. Do not
  raise that horizon in this release. A separately reviewed change may use a
  short cache only after at least seven full days of clean redirect telemetry,
  no unresolved CORS/client reports, and explicit owner approval.

### Burn-in telemetry

The sampled guard diagnostic is the existing Cloudflare Workers Observability
Query Builder for Worker `theologai`, using its configured 25% head-sampled
invocation logs. Save and run this bounded query over 15-minute and 24-hour
windows:

```text
$workers.event.response.status = 308 OR $workers.event.response.status = 410
```

Group by `$workers.event.response.status` and
`$workers.event.request.path`; use the Worker Metrics request-count chart for
the unsampled aggregate invocation trend. The routing invariant makes the
sampled diagnostic host and guard-specific without collecting client identity:
only the production legacy hostname emits `308`, and only its exact poller
tuple emits `410`. Production-custom-host poller blocks are `403` and must not
be counted from the generic `403` population. Never treat this sampled view as
an exact billing, invocation, or guard-block count, and do not raise log
sampling merely to observe this migration. Keep `THEOLOGAI_REQUEST_LOGS`
disabled in production.

Monitor status codes and host traffic throughout the window. Once legitimate
legacy traffic has fallen to an acceptable level, obtain owner approval to set
`workers_dev = false`, remove the temporary poller rule, and update this runbook.
The redirect and block reduce application work but still count as legacy Worker
invocations until the `workers.dev` route is disabled.

## Rollback

Domain rollback does not require deleting anything:

1. Before the temporary redirect window, point affected MCP clients back to the
   matching `workers.dev` compatibility alias. During the redirect window,
   revert the migration gate or restore the preceding Worker version before
   using that alias. The website can independently return to
   `theologai.pages.dev`.
2. If the new Worker version itself is unhealthy, restore the exact
   release-time production baseline recorded above with its unchanged production
   D1, or the recorded preview baseline with its unchanged preview D1. Re-run
   readiness before any Worker rollback.
3. Disable or detach a custom hostname only after explicit owner approval; do
   not delete its DNS record, route, certificate, deployment, or legacy alias as
   an automatic rollback step.
4. Re-run the legacy-endpoint smoke tests and environment-isolation checks.

If certificate issuance, DNS ownership, Pages attachment, or redirect setup
cannot be completed through the available API/CLI, record the exact pending
dashboard action for the owner. Do not work around it with a conflicting DNS
record or a new proxy Worker.
