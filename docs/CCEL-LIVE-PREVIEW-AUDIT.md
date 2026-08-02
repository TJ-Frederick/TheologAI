# CCEL live preview audit

`npm run audit:ccel-preview` is inert unless both URLs and the authorization
phrase are exact and the production Worker UUID is syntactically valid:

```bash
npm run audit:ccel-preview -- \
  --preview-url https://preview-mcp.theologai.xyz/mcp \
  --production-url https://mcp.theologai.xyz/mcp \
  --production-worker-version-id '<exact live production Worker UUID>' \
  --authorize-live-ccel 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS'
```

The command is an operator canary, not a normal CI test. Run it only after the
owner separately authorizes a live canary and the current robots/interface
preflight is recorded. Production remains deployed v6/local-only. Preview is
deployed and audited on the v7/discovery-only contract, with CCEL execution
disabled before adapter, coordinator, or fetch. It makes no production MCP tool
call: production is a `tools/list` v6 local-only schema control. Before any
preview tool call, the canary also uses the already-protected production
operator route and exact live Worker UUID to read a content-free coordinator
snapshot. The token is read only from `THEOLOGAI_CCEL_OPERATOR_TOKEN`; it is
never accepted as a command argument or written to the report. Preview's
`tools/list` must advertise the v7 CCEL discovery schema before the canary
proceeds. These schema observations prove v6 local-only versus v7 CCEL
exposure; they do not prove which endpoint-bearing code revision is deployed
or attest exact deployed flag bits. In particular, observing the v7 schema does
not prove PR #115's repository-only `/home3/search` pin is active. The safe
current-main `100` refresh prerequisite is documented in
[CCEL live-preview canary transaction](CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md).
A successful
origin admission separately proves that the separately authorized canary's live
execution was effective, which differs from the deployed inert baseline.
Preview issues exactly two concurrent `searchDepth: "expanded"` contenders.
Each must retain its curated local result group first; one external group must
report a bounded discovery result and the other must report structured global
busy state as a partial, non-error response. A separate
`searchDepth: "standard"` call verifies usable catalog search without touching
CCEL. A checked audit-side budget refuses any third expanded call, so
isolate/cache changes or elapsed coordinator intervals cannot raise the
mechanical maximum above two possible CCEL-origin admissions.

The pre-snapshot must show a clean closed circuit with every prior admission
retired. The post-snapshot must show the same operator epoch, exactly one
additional admission, a one-step terminal-retirement watermark advance, and a
closed circuit. Below the 64-record retained window, the terminal-record count
also rises by one; at the full window it remains constant because one retired
record is safely evicted. These checks use the deployed snapshot contract and
do not require a new coordinator field.

Audit output records only contract versions, provider statuses, bounded counts,
retry seconds, content-free coordinator snapshots/deltas, and pass/fail state.
It separately records the hard maximum of two CCEL-bearing preview tool calls
and the protected-snapshot observation of one upstream origin admission.
It never retains queries, titles, snippets, content, locators, URLs, headers,
tokens, nonces, or client identity. Omitting or changing the exact authorization
phrase or canonical URL, or supplying a malformed production Worker UUID, fails
before any connection. A different but syntactically valid UUID is rejected by
the signed operator route after the production and preview `tools/list` checks
but before any preview `tools/call` invocation.

For the main-only, temporary preview 111 deployment and exact-predecessor
recovery procedure that may invoke this audit, see
[CCEL live-preview canary transaction](CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md).
