# Parallel-passages preview audit

Run the executable MCP audit after a preview deployment and before production promotion:

```bash
npm run audit:parallel-preview -- \
  --url https://preview-mcp.theologai.xyz/mcp \
  --output test-output/parallel-preview-audit.json
```

The command initializes a real Streamable HTTP MCP client and invokes
`parallel_passages` for every case in
`test/fixtures/parallel-passages-preview-audit.json`. It exits nonzero on any
failed case and writes bounded JSON evidence. It covers a valid no-result query,
UBS and legacy corpora separately and together, alignment, text attribution,
separate OpenBible evidence, invalid arguments, and schema-defaulting clients.
It verifies the v4 navigable UBS result window: Mark 10:19 observes an additional
group at the default limit, injects the returned
`sourceAttestedResultWindow.nextCursor` as input `groupCursor`, returns the
remaining strictly later groups without overlap, and returns seven groups with no additional match at
`maxGroups: 10`; 2 Kings 18:13 preserves its complete
Kings/Chronicles/Isaiah group; Matthew 3:3 returns distinct groups; and a
legacy-only request reports that UBS was not evaluated. These are not totals or
exhaustiveness claims; the cursor is canonically encoded and bound to the exact
ordered query, UBS artifact, operation, and `maxGroups` page size. It is an
untrusted position claim: Node and D1 validate the source ordinal and
cumulative prior result count against the current matching set before serving a
continuation. The D1 continuation adds one aggregate boundary query, not a
per-group/member/segment query; its normal group lookup remains bounded to one
ID lookahead plus complete-group reconstruction queries. The audit also
rejects replay against a different passage, malformed or false-terminal
positions, explicit OpenBible controls, and `includeText: true` on a
continuation.

The Mark 10:19 `includeText: true` sentinel supplies more than 12 unique
canonical targets. It requires schema v4, exactly 12 scheduled lookups, a
positive omitted count, both count equations, the fixed budget identity, and
semantically consistent aggregate and per-item statuses. The emitted source
metadata determines the exact target order: every occurrence of each of the
first 12 unique targets must agree on success or failure evidence, and every
later target must be `budget_omitted`. The audit also verifies that every
returned group/member retains its ordered source metadata despite partial text
coverage. These remote checks prove the budget, ordering, counts, statuses, and
metadata of the outcome actually observed from preview.

In other words, a healthy live preview proves the >12-target
success/omission/order/count/status contract for that healthy provider outcome.
It does not deliberately make a Bible provider fail, so it does not prove that
its requests exercised the failure path. The controlled failure case in
`test/unit/services/bible/ParallelPassageTextBudget.test.ts` injects scheduled
failures and proves that failed first-window targets remain `unavailable`, later
targets remain omitted, and no backfill occurs. Separate semantic-validator
unit cases reject contradictory count claims, partial fan-out across duplicate
consumers, text on post-budget targets, and per-member or legacy statuses that
do not exactly match their target states.

The server bounds every returned passage excerpt to 200 Unicode code points
before the audit receives it. The evidence therefore records only bounded
excerpts, never a full provider passage payload.

The compatibility endpoint
`https://theologai-preview.tjfrederick.workers.dev/mcp` should receive a
separate alias smoke check during the custom-domain observation period, but the
custom endpoint above is canonical for release evidence.

Use `--timeout-ms`, `--fixture`, or `--output` to override their defaults. The evidence file deliberately records no request headers or credentials; the preview endpoint must be reachable using its normal anonymous MCP access policy.
