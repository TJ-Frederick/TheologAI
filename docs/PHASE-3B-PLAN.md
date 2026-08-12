# Phase 3B plan

This document defines the next TheologAI delivery program after the protected
schema-`0009` preview and production releases completed by PR #122. Earlier
roadmap sections use "Phase 3" for already-shipped work; **Phase 3B** is the
unambiguous name for this successor program.

## Known-good starting point

GitHub `main` is PR #122 merge
`86475ecf8288cb0ebcb6467c77c0fd0998a8f1c2`, exact tree
`8150aa29e7e4a22141edbfc9ab568df933f9c9b3`. Its five required CI checks
passed. Protected production workflow `31631924636` completed successfully.

| Surface | Active release | D1 | Product profile |
| --- | --- | --- | --- |
| Production | deployment `e62698f3-f6b0-4145-97bf-28abdeae0e3a`; Worker `02174f95-abe2-480b-84bf-3e8c1a3a0320` (#100) | `theologai-production-20260811-schema0009-a` (`9bc79346-338b-439e-a2a5-424f4418eb21`) | v6 local-only; CCEL execution disabled |
| Preview | deployment `4108d59a-4092-4389-824c-fa3820ab66f6`; Worker `70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (#144) | `theologai-preview-20260811-schema0009-a` (`74f456e2-6951-4003-bb6f-91951342bf8f`) | v7 discovery-aware; CCEL execution disabled |

Production readiness, Transform-8/9 authority, edge stabilization,
original-language v2, historical-core, and Transform-11 historical-spine
audits passed. The final isolation receipt proved the exact distinct
production and preview Worker/D1 pairs. Preview did not change during the
production release.

The immediate production rollback unit is the captured PR #108 matched pair:
deployment `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). Retain both databases. Any rollback
or deletion remains separately authorized.

The production Worker is the exact PR #122 `main` merge. PR #123 subsequently
deployed its exact reviewed head `7fb3ec5113a16ed86bfc4a403a3ec3678d4d4dd0`
(tree `28e555808ad3840d145a7ddd7e57934dc30e45c2`) to preview without changing
the D1 binding. Its readiness, edge, original-language, historical-core, and
historical-spine audits passed; production remained unchanged. This
post-release evidence update is documentation-only and is not itself a new
runtime claim.

## Current product boundary

TheologAI exposes eleven tools and six guided prompts across local stdio/HTTP
and hosted Worker transports. It provides eight Bible translations, six
commentary sources, 35 locally indexed historical works, UBS-attested parallel
passages, Strong's and morphology evidence, contextual original-language
study, local primary-source research, and donation support.

The following boundaries remain deliberate:

- production primary-source research is local-only;
- preview exposes the discovery-aware contract but cannot execute CCEL before
  adapter, coordinator, or fetch;
- CCEL bodies are never mirrored or durably stored;
- the partial Aquinas packet and Norton packet are not public corpus members;
- npm distribution is unsupported; local execution and hosted Cloudflare
  deployment remain the supported forms.

## Phase 3B sequencing

### 3B.0 — Rebaseline and simplify

1. Use a clean branch from `origin/main`; do not treat the dirty historical
   primary checkout as a release source.
2. Inventory the primary checkout and stale/prunable worktree registrations.
   Preserve them until the owner separately authorizes any deletion.
3. Add a narrowly reviewed mechanism that prevents evidence-only or
   documentation-only merges from causing an unnecessary production deploy.
4. Merge the post-PR-#122 evidence record only after that mechanism is proven.
5. Consolidate current release identity into one authoritative record and keep
   historical records explicitly time-scoped.
6. Rehearse the matched PR #108 Worker/D1 rollback without changing live
   traffic, then define a retention policy before any predecessor cleanup.

### 3B.1 — Dual-era MCP modernization

The current server uses `@modelcontextprotocol/sdk` v1 and negotiates the
legacy `2025-11-25` protocol. The current MCP specification is `2026-07-28`,
and the official TypeScript v2 packages support both legacy and modern eras.

Implement this as a behavior-neutral infrastructure release:

1. Spike the official TypeScript SDK v2 and current Cloudflare Agents SDK in
   isolation; record bundle, runtime, and compatibility findings before
   selecting versions.
2. Preserve `2025-11-25` stdio and Streamable HTTP compatibility while adding
   `2026-07-28` negotiation on the same endpoints.
3. Add `server/discover`, per-request protocol/client capability metadata,
   required `resultType`, cache metadata, deterministic list ordering, modern
   request headers, and matching CORS policy.
4. Keep all eleven tool schemas, six prompts, resources, data, and product
   behavior unchanged during this migration.
5. Replace new uses of deprecated MCP Logging with stderr or OpenTelemetry;
   retain only the compatibility behavior required by legacy clients.
6. Add separate legacy and modern protocol fixtures, conformance coverage, and
   black-box audits. Preview must prove both eras before production.

Do not add Tasks, MCP Apps, or Skills-over-MCP merely because they exist. Add
an extension only when it solves a defined product workflow. Tasks are not
currently justified by the server's bounded calls. MCP Apps may later help
with interlinear, parallel-passage, or source-comparison presentation.

Authoritative protocol references:

- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://modelcontextprotocol.io/specification/2026-07-28/changelog>
- <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md>

### 3B.2 — Historical research project

Treat broad historical research as one product workflow rather than unrelated
"add documents" and "turn on CCEL" features. Start from natural research
requests such as topical surveys, locating a passage in one work, and
comparing two historical authors.

The target workflow is:

1. turn the user's question into a bounded query plan;
2. search rights-reviewed local texts first;
3. use approved external providers only for missing discovery coverage;
4. keep reviewed local evidence separate from unreviewed discovery results;
5. return exact locators and short attributed snippets;
6. track searched, read, deferred, unavailable, and not-searched coverage;
7. read selected exact local sections before synthesis; and
8. disclose when an external result has not been read.

The retained CCEL path remains discovery-only: clean links, at most five short
attributed 240-character snippets, no body retrieval, mirroring,
republication, or durable CCEL content storage. A current interface,
robots/policy, and operational review plus a separately authorized preview
canary remain prerequisites to any live request.

In parallel, run a rights-reviewed local-corpus program. The first candidates
are one complete defensible English edition of Aquinas rather than presenting
the partial packet as the whole *Summa*, and the approved Norton translation of
Calvin. Reuse the generic part/question/article hierarchy, retain explicit
edition provenance, and prefer one edition per work unless a second edition
has a defined scholarly purpose.

### 3B.3 — Original-language experience

Preserve the existing evidence boundary while making one tool useful at
multiple levels:

- beginner: explain a likely nuance missed in English and the limits of the
  evidence;
- intermediate: lemma, morphology, translation range, and local context;
- technical: source identity, attested semantic candidates, ambiguity, and
  bounded occurrence windows.

Update guided prompts to choose an appropriate depth. Evaluate MACULA
discourse/context data only after a separate source, license, and product-scope
review.

### 3B.4 — Public operations

1. Add privacy-safe custom-domain traffic observability before changing access
   policy.
2. Diagnose the sustained anonymous Frankfurt/AWS traffic and then consider a
   narrow WAF or limiter response that keeps the MCP publicly usable.
3. Revisit the production `workers.dev` compatibility alias only with separate
   authorization.
4. Optionally configure `www.theologai.xyz` as an apex redirect; it currently
   has no DNS record.
5. Continue consolidating release workflows and sanitized evidence retention.

## Release order

The default critical path is:

```text
3B.0 rebaseline and release hygiene
  -> 3B.1 dual-era MCP preview and production
  -> 3B.2 historical-research specification
  -> local corpus and CCEL canary workstreams
  -> unified historical-research preview audit
  -> separately authorized production hard cutover
```

Original-language experience and public-edge observability may proceed in
parallel after the MCP modernization has passed preview. No Phase 3B item
authorizes a deployment, D1 operation, secret change, CCEL request, WAF change,
or deletion merely by appearing in this plan.
