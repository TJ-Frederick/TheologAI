# Historical Core Preview Audit

`npm run audit:historical-core-preview` is the protected post-deployment audit for the reviewed Transform-9 historical core. It is intentionally a fixed release gate rather than a general MCP test client.

It can contact only `https://preview-mcp.theologai.xyz/mcp`; it accepts no endpoint, fixture, retry, or pagination override. Its immutable fixture asserts the exact 25-work local identity: 17 legacy documents plus the eight reviewed source-pack works, with 512 reviewed-core sections.

The audit performs a fixed 54 logical operations (55 HTTP exchanges including initialization notification): MCP negotiation; exact tool, prompt, resource (28), and resource-template (2) registration; two current v7 guided-prompt probes; catalog and classic-work inventory identity; a direct landing-resource check; five bounded probes per reviewed work; and legacy, malformed-cursor, invalid-resource, and disabled-CCEL regressions. Core probes verify the pinned per-work section count, first canonical source locator, sectioned landings, 32-entry directories, natural local discovery, and exact-section resource reads.

The full audit has a five-minute deadline, a 256 KiB ceiling per MCP response, and a 2 MiB aggregate-response ceiling. Evidence is written only after every assertion passes. It is capped at 256 KiB and contains hashes, counts, identifiers, schema hashes, and statuses only. It must not contain document bodies, snippets, resource locators, cursors, headers, session data, URLs, database details, or reflected error input.

In the protected preview workflow, the existing read-only `d1:remote:check` runs first and includes the Transform-9 authority audit. Before deployment, a read-only predecessor record captures the sole active Worker deployment and checked-out preview D1 binding. The historical audit runs after the original-language v2 audit. A read-only post-mutation reconciliation record is retained even when a post-deploy audit fails or authorization is later withdrawn; it never rolls back or cleans up automatically. Only a passing audit then confirms that the exact deployed Worker identity remained active, hashes both sanitized records, and retains the combined artifact for seven days. See [Preview Release Reconciliation](PREVIEW-RELEASE-RECONCILIATION.md) for the separately authorized manual recovery path.

Run this command only in the protected preview-release workflow or when intentionally auditing the canonical preview service. It does not create databases, change bindings, deploy, or contact CCEL.
