# Historical Core Preview Audit

`npm run audit:historical-core-preview` is the protected post-deployment audit for the reviewed Transform-9 historical core. It is intentionally a fixed release gate rather than a general MCP test client.

It can contact only `https://preview-mcp.theologai.xyz/mcp`; it accepts no endpoint, fixture, retry, or pagination override. Its immutable fixture asserts the exact 25-work local identity: 17 legacy documents plus the eight reviewed source-pack works, with 512 reviewed-core sections.

The audit performs a fixed 49 logical operations (50 HTTP exchanges including initialization notification): MCP negotiation, tool/prompt/resource registration, catalog identity, five bounded probes per reviewed work, and legacy, malformed-cursor, invalid-resource, and disabled-CCEL regressions. Core probes verify sectioned landings, 32-entry directories, natural local discovery, source-first locators, and exact-section resource reads.

Evidence is written only after every assertion passes. It is capped at 256 KiB and contains hashes, counts, identifiers, schema hashes, and statuses only. It must not contain document bodies, snippets, resource locators, cursors, headers, session data, URLs, or database details.

In the protected preview workflow, the existing read-only `d1:remote:check` runs first and includes the Transform-9 authority audit. The historical audit runs after the original-language v2 audit. Only then does the workflow confirm that the exact deployed Worker identity remained active, hash both sanitized records, and retain the combined artifact for seven days.

Run this command only in the protected preview-release workflow or when intentionally auditing the canonical preview service. It does not create databases, change bindings, deploy, or contact CCEL.
