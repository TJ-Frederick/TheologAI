# CCEL live preview audit

`npm run audit:ccel-preview` is inert unless all three arguments are exact:

```bash
npm run audit:ccel-preview -- \
  --preview-url https://preview-mcp.theologai.xyz/mcp \
  --production-url https://mcp.theologai.xyz/mcp \
  --authorize-live-ccel 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS'
```

The command is an operator canary, not a normal CI test. Run it only after the
owner explicitly authorizes live preview and the current robots/interface
preflight is recorded. It makes no production tool call: production is a
`tools/list` v3/000 control only. Preview issues exactly two concurrent,
CCEL-only contenders and requires one bounded discovery result plus one
structured globally busy result. A separate local-only search verifies usable
fallback without touching CCEL. A checked audit-side budget refuses any third
CCEL-bearing call, so isolate/cache changes or elapsed coordinator intervals
cannot raise the mechanical maximum above two possible CCEL-origin admissions.

Audit output records only contract versions, provider statuses, counts, retry
seconds, and pass/fail state. It never retains queries, titles, snippets,
content, locators, headers, or client identity. Omitting or changing the exact
authorization phrase or either canonical URL fails before any connection.
