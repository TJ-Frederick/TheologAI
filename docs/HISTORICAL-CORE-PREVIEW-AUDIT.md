# Historical Core Preview Audit

`npm run audit:historical-core-preview` is the protected post-authorized-PR95-preview-deployment audit for the reviewed Transform-9 historical core. It is intentionally a fixed release gate rather than a general MCP test client.

It can contact only `https://preview-mcp.theologai.xyz/mcp`; it accepts no
endpoint, fixture, retry, or pagination override. Its immutable Transform 11
fixture asserts the exact 35-work preview identity: 17 legacy documents, the
eight deeply probed core works, and ten additional reviewed source-pack works.
The full D1 authority audit separately conserves all 1,057 reviewed sections.

The audit performs a fixed 54 logical operations (55 HTTP exchanges including
initialization notification): MCP negotiation; exact tool, prompt, resource
(38), and resource-template (2) registration; two candidate-v7 guided-prompt
probes; exact 35-work catalog and classic-work inventory identity; a direct
landing-resource check; five bounded probes per core work; and legacy,
malformed-cursor, invalid-resource, and disabled-CCEL regressions. Core probes
verify the pinned per-work section count, directory-first canonical locator,
all-terms/relevance-ranked primary-search locator, sectioned landings, 32-entry
directories, natural local discovery, and exact-section resource reads.

One five-minute deadline starts before fixed output and fixture preflight and remains in force through true no-clobber evidence publication. Each MCP response has a 256 KiB ceiling and the aggregate-response ceiling is 2 MiB. Evidence is written only after every assertion passes, through an audit-owned temporary directory and atomic create-only publication; an existing or racing destination is never replaced. If the final post-link deadline check expires, the auditor removes only the output link it can still prove belongs to its staged file, then removes its own staging directory. It is capped at 256 KiB and contains hashes, counts, identifiers, schema hashes, and statuses only. It must not contain document bodies, snippets, resource locators, cursors, headers, session data, URLs, database details, stack traces, or reflected error input.

In the protected preview workflow, a read-only D1 ID/name inventory first resolves the checked-in candidate; `d1:remote:check` then addresses that exact D1 name and includes the Transform-9 authority audit. A read-only predecessor record captures the sole active Worker and its authoritative `predecessorD1`, while retaining the separately readiness-tested `candidateD1` and explicit `d1Changed` value. The generic release gate permits a same-D1 code-only release, while the Transform-9 release requires its candidate to satisfy the Transform-9 readiness contract. After deployment—but before either fixed black-box audit—it proves the sole active Worker is bound to `candidateD1`; an old-D1 drift cannot reach the audit. A bounded pre-audit convergence gate must then match both the checked-out primary-source tool schemas and the exact resource-URI inventory hash. It records sanitized hashes and booleans only; the fixed audits still have zero retries. A sanitized non-throwing observation is retained and uploaded even if the strict binding or convergence gate fails. The historical audit then runs after the active original-language v3 depth audit. A read-only final reconciliation record is retained even when a post-deploy audit fails or authorization is later withdrawn; it never rolls back or cleans up automatically. Only a passing audit then confirms that the exact deployed Worker identity remained active, hashes both sanitized records, and retains the combined artifact for seven days. See [Preview Release Reconciliation](PREVIEW-RELEASE-RECONCILIATION.md) for the separately authorized manual recovery path.

Run this command only in the protected preview-release workflow or when intentionally auditing the canonical preview service. It does not create databases, change bindings, deploy, or contact CCEL.

The separately fixed production counterpart is documented in
[Historical Core Production Audit](HISTORICAL-CORE-PRODUCTION-AUDIT.md). It is
not an activation claim for the current 17-work production deployment.
