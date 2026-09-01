# Original-language v3 depth preview audit

`original_language_study` v3 has a fixed, release-gating preview audit:

```bash
npm run audit:original-language-v3-preview -- \
  --output test-output/original-language-v3-preview-audit.json
```

The runner is fixed to `https://preview-mcp.theologai.xyz/mcp`, negotiates MCP
`2025-11-25`, requires the breaking-release candidate version `4.0.0-preview`,
has no URL override or retry loop, rejects redirects, and stops
on HTTP 429. It permits 21 logical operations and 22 HTTP exchanges: initialize,
the initialized notification, `tools/list`, `prompts/list`, three fixed
`prompts/get` calls, and fifteen fixed `original_language_study` calls.

Each HTTP response is capped at 256 KiB and the aggregate MCP response body is
capped at 1 MiB. Requests have a 30-second deadline, the entire audit has a
180-second deadline, and sanitized evidence is capped at 256 KiB. Evidence
does not retain Markdown, prompt prose, response bodies, cursors, headers,
sessions, URLs, source text, SQL, D1 details, or stacks.

Each successful tool result separately enforces a 32 KiB serialized structured
packet, a 16 KiB v3-added Markdown suffix, and a 32 KiB total Markdown result.

The immutable fixture is
`test/fixtures/original-language-v3-preview-audit.json`. When the protected
audit passes, it proves the closed depth schema, omitted-depth `intermediate`
default, beginner/intermediate/technical behavior, technical-only bounded
corpus occurrences, semantic and occurrence continuations, source provenance,
the prompt depth contract, and fail-closed rejection of stale v2, wrong-depth,
corrupt, removed-`detail`, and forbidden-control requests.

The protected PR workflow runs this gate before the historical and dual-era
audits. Its sanitized evidence hash is bound into the source-bound dual-era
preview release receipt. Production re-verifies that exact preview evidence
before deployment and runs the corresponding fixed production endpoint audit
after cutover.
The production counterpart is fixed to version `4.0.0` at the canonical
production custom domain.

This document describes an unreleased audit candidate. It does not claim that
schema v3 is active at either endpoint; `docs/CURRENT-RELEASE.md` remains the
sole active release authority.

The released v2 runner, fixture, test, and audit documentation remain checked
in as immutable historical release evidence; they are not active gates.
