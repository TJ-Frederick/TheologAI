# Historical Core Production Audit

`npm run audit:historical-core-production` is the fixed post-deployment
Transform-9 production release gate. It is not a general MCP client: it can
contact only `https://mcp.theologai.xyz/mcp`, accepts no endpoint, fixture,
retry, or pagination override, and requires server version `3.6.0`.

It uses the same immutable reviewed-core fixture as the preview gate: exactly
25 local historical works, 17 legacy works, eight reviewed source-pack works,
and 512 core sections. It verifies MCP negotiation; exact capability, tool,
prompt, resource, and template registration; bounded local discovery and
section reads; legacy delivery; malformed cursor and invalid-resource errors;
and the fail-closed CCEL request path. The audit's bounded response, aggregate,
operation, and deadline ceilings are the same as the preview release gate.

Run it only after the protected workflow has proved that the sole-active
production Worker is attached to the exact readiness-tested production D1
candidate. Before either fixed audit, the workflow's bounded convergence gate
must match both the checked-out primary-source tool schemas and the exact
resource-URI inventory hash; the audits themselves retain zero retries. It
writes create-only sanitized evidence and does not deploy, bind, seed, fetch
CCEL, or change production state. A passing local test or checked-in fixture is
not evidence of a remote cutover.
