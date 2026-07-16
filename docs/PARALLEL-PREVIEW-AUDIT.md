# Parallel-passages preview audit

Run the executable MCP audit after a preview deployment and before production promotion:

```bash
npm run audit:parallel-preview -- \
  --url https://theologai-preview.example.workers.dev/mcp \
  --output test-output/parallel-preview-audit.json
```

The command initializes a real Streamable HTTP MCP client and invokes `parallel_passages` for every case in `test/fixtures/parallel-passages-preview-audit.json`. It exits nonzero on any failed case and writes JSON evidence: endpoint and timestamps, arguments, latency, assertion results, and the MCP response with every text-bearing field evidence-bounded to 200 Unicode code points. It covers a valid no-result query, UBS and legacy corpora separately and together, UBS alignment, member text and translation attribution, separately attributed OpenBible results, invalid argument conflicts, and the fully populated arguments commonly emitted by schema-defaulting clients. It also verifies the v2 bounded UBS result-window contract: Mark 10:19 observes an additional group at the default limit but returns seven groups with no additional match observed at `maxGroups: 10`; 2 Kings 18:13 preserves its complete Kings/Chronicles/Isaiah group; Matthew 3:3 returns distinct source groups; and a legacy-only request reports that UBS was not evaluated. These observations are deliberately not totals, cursors, or exhaustiveness claims.

The server bounds every returned passage excerpt to 200 Unicode code points
before the audit receives it. The evidence therefore records only bounded
excerpts, never a full provider passage payload.

Use `--timeout-ms`, `--fixture`, or `--output` to override their defaults. The evidence file deliberately records no request headers or credentials; the preview endpoint must be reachable using its normal anonymous MCP access policy.
