# Parallel-passages preview audit

Run the executable MCP audit after a preview deployment and before production promotion:

```bash
npm run audit:parallel-preview -- \
  --url https://theologai-preview.example.workers.dev/mcp \
  --output test-output/parallel-preview-audit.json
```

The command initializes a real Streamable HTTP MCP client and invokes `parallel_passages` for every case in `test/fixtures/parallel-passages-preview-audit.json`. It exits nonzero on any failed case and writes complete JSON evidence: endpoint and timestamps, arguments, latency, assertion results, and the raw MCP response. It covers a valid no-result query, UBS and legacy corpora separately and together, UBS alignment, member text and translation attribution, separately attributed OpenBible results, invalid argument conflicts, and the fully populated arguments commonly emitted by schema-defaulting clients.

Use `--timeout-ms`, `--fixture`, or `--output` to override their defaults. The evidence file deliberately records no request headers or credentials; the preview endpoint must be reachable using its normal anonymous MCP access policy.
