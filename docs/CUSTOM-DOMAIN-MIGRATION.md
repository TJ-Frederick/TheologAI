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

## Current operational release state (2026-07-23)

Production remains the PR #72 release: Cloudflare deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). The exact deployed and audited
preview source commit is `bb8ed4c8f025f697502a274986205f92bdf520b7` in
draft, unmerged PR #92; it is separately deployed to preview only: Cloudflare
deployment `44a0858f-75ba-497d-b84b-66c14253234a`,
Worker `2b540a47-0937-4c00-9d44-de1199e09e6c`, and D1
`theologai-preview-20260722-b`
(`94c4938b-7800-4d68-9097-0df33c31fdc1`). CI run `30011028739` and both
preview audits passed (22/22 cases, 59/59 checks, 48/48 rate-counted requests,
and 11 aggregate groups). The `deploy-preview` authorization was removed and
PR #92 returned to draft; any later docs-only PR #92 head is not deployed. It
is not a production release.

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
not a suitable rollback target. The production D1 remains
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`), rate namespace `361201` at 120/60,
and CCEL flags `000` unless a separately reviewed release changes one of them.

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
5. Confirm production reaches only Worker `theologai`, production D1
   `theologai-production-20260715-a`, rate namespace `361201`, and CCEL state
   `000`; confirm preview retains its distinct bindings and state.
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
