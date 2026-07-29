# Transform-11 Historical-Spine Release Audit

`npm run audit:historical-spine-preview` and
`npm run audit:historical-spine-production` are fixed post-deployment release
gates for exactly the ten Transform-11 historical-spine works. They are not
general MCP test clients, corpus crawlers, or a mechanism for reaching CCEL.

The checked-in fixture is immutable in code: changing a work, edition, natural
query, first section, or pagination expectation fails before a request is sent.
The audit uses the same bounded, HTTPS-only MCP transport as the historical
core audit. Its only allowlisted endpoints are the canonical preview and
production custom-domain `/mcp` endpoints.

Each release profile performs protocol negotiation, checks the exact resource
inventory, and reads the authoritative primary-source catalog to prove each
live edition ID, source-pack provenance, and readiness before probing every
activated work through:

- `classic_text_lookup` landing and bounded directory;
- a direct landing read and a direct exact-section read;
- a natural global classic-text search plus a direct read of that hit's exact
  canonical locator;
- a scoped, local-only `primary_source_search` and exact locator/resource
  coherence check; and
- an opaque continuation page when the work has more than 32 sections.

The preview query uses only standard depth and proves `ccelAttempted: false`.
The production query supplies only `providers: ["local"]` and rejects any
CCEL-shaped execution evidence. Neither profile makes a CCEL request.

The inventory is exactly 82 logical requests and 83 HTTP exchanges (including
the initialized notification), with zero audit retries. Its dedicated
`TheologAI-HistoricalSpine-{preview|production}-Audit/1.0` identity is distinct
from the historical-core audit identity, so the two fixed release gates do not
share a Cloudflare IP/user-agent rate-limit tuple. It fails closed at
180 seconds total, 30 seconds per request, 256 KiB per response, 2 MiB
aggregate response bytes, and 128 KiB sanitized evidence. Retained evidence
contains hashes, counts, work/edition identifiers, and booleans only—never
text, snippets, locators, cursors, error payloads, credentials, or D1 details.

Both protected workflows run this gate after release-registration stabilization
and the existing original-language/Transform-9 historical-core gates, and
before final Worker identity reconciliation. The sanitized JSON is retained in
the release artifact (seven days for preview, thirty days for production); its
SHA-256 appears in the preview release PR comment and production job summary.
Failure cannot trigger an automatic rollback, deletion, binding change, or
deployment.
