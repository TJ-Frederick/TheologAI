# Original-language v2 preview audit

`original_language_study` v2 has a fixed, release-gating preview audit. It is
not a general-purpose MCP client and it cannot be pointed at another endpoint.
The executable always connects to the canonical preview MCP endpoint:

```bash
npm run audit:original-language-v2-preview -- \
  --output test-output/original-language-v2-preview-audit.json
```

Run it only after the protected preview workflow has deployed the exact commit
under review. The preview-deploy job runs it immediately after the Worker
deployment and before it posts its success comment. A failed audit therefore
prevents that success comment. It is not wired into normal pull-request checks
or any production workflow.

The runner performs exactly 13 logical operations (initialization, tool
registration, and 11 fixed `original_language_study` calls) and exactly 14
HTTP exchanges (including the initialized notification). It uses no retries,
has a 180-second total deadline, and bounds each request to the lesser of its
remaining total time and 30 seconds. Redirects are errors. It has no endpoint
override and makes no provider or CCEL request.

Every MCP response is streamed through a 256 KiB ceiling. An oversized or
malformed `Content-Length`, or a chunked body that grows beyond the ceiling,
aborts the request and cancels the response stream. The ceiling is deliberately
large enough for the current `tools/list` packet (about 198 KiB) and a valid
Markdown result plus its separately 32 KiB-bounded structured v2 packet.

The immutable fixture is
`test/fixtures/original-language-v2-preview-audit.json`. It fixes the 11
calls, expected v1 compatibility hashes built from clean-main commit
`7974b15` after `npm run build:db`, and authority anchors for the pinned UBS
Hebrew 0.9.2 / Transform 7 materialization. The live black-box audit does not
query SQL or claim that it did; those anchors are fixture provenance for the
offline baseline only.

Successful structured results are revalidated through the production v2
serializer/schema. Before any call, the advertised input and output schemas
must canonically equal the checked-out production schema objects; the sanitized
record stores their SHA-256 hashes. The audit checks the exact tool registration
and annotations, both pagination pages, invalid cursor replays (including the
actually submitted corrupt cursor), input-schema rejection, response-byte
accounting, the complete pinned provenance fields, v1 Markdown-prefix and
nested-study hashes, and the absence of fabricated alignment claims.

The resulting JSON is a sanitized release record, capped at 256 KiB. It may
contain case IDs, timings, status/count/identity/hash metadata, and byte
metadata only. It deliberately excludes Markdown, lexical glosses, opaque
cursors, response bodies, headers, sessions, stack traces, SQL/D1 details,
and credentials. Do not relax the fixture or regenerate its v1 hashes from a
candidate branch: a compatibility change requires an explicit review decision.

## Protected deployment identity and retention

The `preview-deploy` job has a second, repository-wide concurrency group:
`theologai-shared-preview-deploy-and-audit`. It queues, rather than cancels,
different PRs that would share the one preview Worker. The existing per-PR
workflow group remains in place for normal PR supersession.

The pinned Wrangler action exposes deploy command stdout but does not expose a
Worker version ID. The workflow therefore captures that stdout locally, hashes
it, then uses read-only `wrangler versions list` and `wrangler deployments
list` calls before the audit. The release gate requires exactly one newly
uploaded version and requires the newest deployment to assign that exact
version 100% of preview traffic. Immediately after the complete 14-call audit,
it takes a second read-only `wrangler deployments list` snapshot and requires
the exact same deployment ID and version to remain the newest sole 100%
assignment. The retained sanitized identity record contains only version and
deployment IDs plus hashes of the pre- and post-audit raw observations.

On a successful audit, the workflow hashes the sanitized audit and identity
records, posts those hashes with the exact checked-out commit/tree and Worker
version in the PR comment, and uploads only those two sanitized JSON files as a
protected preview artifact retained for seven days. It never uploads raw
Wrangler stdout or raw control-plane JSON.

The two snapshots bind the audit to the observed deployment immediately before
and after it. They do not prove that an out-of-band Cloudflare writer could not
race between those snapshots or alter preview afterward. The shared GitHub
concurrency group eliminates overlapping authorized workflow deployments; the
remaining direct-control-plane writer risk is explicitly recorded rather than
treated as an unprovable guarantee.
