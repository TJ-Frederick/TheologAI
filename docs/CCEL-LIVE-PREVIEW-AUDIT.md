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
owner explicitly authorizes live preview and the current robots/interface
preflight is recorded. It makes no production MCP tool call: production is a
`tools/list` v6 local-only schema control. Before either preview tool call, the canary
also uses the already-protected production operator route and exact live Worker
UUID to read a content-free coordinator snapshot. The token is read only from
`THEOLOGAI_CCEL_OPERATOR_TOKEN`; it is never accepted as a command argument or
written to the report. Preview's `tools/list` must advertise the v7 CCEL
discovery schema before the canary proceeds. These schema observations prove
v6 local-only versus v7 CCEL exposure; they do not attest exact deployed flag
bits. A successful origin admission separately proves that live execution was
effective for the canary, which necessarily differs from the checked-in inert
preview `100` baseline. Preview issues exactly two concurrent,
CCEL-only contenders and requires one bounded discovery result plus one
structured globally busy result. A separate local-only search verifies usable
fallback without touching CCEL. A checked audit-side budget refuses any third
CCEL-bearing call, so isolate/cache changes or elapsed coordinator intervals
cannot raise the mechanical maximum above two possible CCEL-origin admissions.

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
