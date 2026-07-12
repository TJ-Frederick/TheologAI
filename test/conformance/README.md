# MCP server conformance checks

`npm run test:conformance` runs the stable official MCP conformance runner
against TheologAI's local Node Streamable HTTP transport. The harness uses the
complete ten-tool registry with deterministic fakes, so it opens no database
and makes no provider or network calls.

The allowlist is intentionally limited to protocol-generic scenarios that
apply to this server:

- `server-initialize`
- `ping`
- `tools-list`
- `resources-list`
- `prompts-list`
- `dns-rebinding-protection`

Do not replace this allowlist with the runner's default `active` suite. That
suite includes fixed fixtures for the MCP "everything" server, such as tools,
resources, and prompts named `test_simple_text`, `test://static-text`, and
`test_simple_prompt`. TheologAI does not advertise those fixtures, and their
absence is not a product-server failure.

These checks are one compatibility gate, not a claim that every optional MCP
feature is implemented or certified. Product-specific behavior remains covered
by the integration, Node HTTP end-to-end, and Worker runtime suites.

The hosted HTTP transports are intentionally stateless and therefore do not
advertise MCP Logging: a `logging/setLevel` preference cannot persist across
requests when each POST receives a fresh server/transport. Logging remains
available over the stateful stdio transport and is tested in-process.
