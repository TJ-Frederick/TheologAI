# TheologAI roadmap

**Current baseline:** Phase 3 begins after PR #10, **Harden MCP architecture
and release pipeline**, merged to `main` as commit
`71a3f0d120ffd31c09424ba2a7caef88961d21e3` on 2026-07-11. The merge was
deployed to production after the build, test, conformance, dependency-audit,
and read-only D1 readiness gates passed. Preview contains the hardened PR #10
application code from `ccdfb8c`; its later production-only changes are not
part of that preview baseline.

This document is the tracked source of truth for current sequencing. The
ignored [dated architecture and roadmap assessment](../test-output/ARCHITECTURE_AND_ROADMAP_ASSESSMENT.md)
is retained as local source context only; it does not define the current
implementation contract.

## Completed baseline

- **Phase 1 — MCP foundation:** completed through the current Node.js and
  Workers composition roots, shared MCP registry, typed errors, and test
  coverage.
- **Phase 2 — production hardening:** completed by PR #10, including the
  shared async service boundary, Worker/D1 parity, request policy and logging
  controls, reproducible data/readiness gates, and release workflow checks.

The current public contract remains the one described in [README.md](../README.md),
the MCP registry, and the deployed configuration. This roadmap does not change
tool schemas, result types, commentary attribution, donation verification, or
the Markdown response contract.

## Phase 3 sequence

### PR 1 — production cleanup and roadmap baseline

Status: **current bounded work item**.

- Publish this roadmap and quarantine stale planning documents with prominent
  historical banners and links forward.
- Record the 2026-07-11 production/preview deployment and D1 rollback posture
  without secrets or unverified resource IDs.
- Make the top-level production Wrangler target explicit for both secret upload
  and deploy; retain the existing production and preview configuration model.
- Document the Matthew Henry source-granularity boundary: scalar commentary is
  returned only when the provider exposes an exact trustworthy identity;
  chapter lookup is the fallback for section-level commentary.
- Document fake-hash Ethereum `unavailable` as a non-blocking public-RPC
  availability observation. Preserve fail-closed verification semantics.

**Non-goals:** no runtime inference changes, provenance model, structured
output schema, D1 migration/seed/binding/secret changes, provider swap or paid
RPC, action dependency upgrade, remote operation, or rollback rehearsal.

**Exit criteria:** the tracked docs contract test protects the roadmap link and
historical banners; Wrangler production and preview dry-runs pass; typechecks
and the full local test suite pass; no runtime or data contract files change.

### PR 2 — provenance primitives

Depends on PR 1. Additive domain primitives for source, edition, license,
retrieval reference, provider anchor, coverage, and citation identifiers. Keep
current Markdown responses backward-compatible. Do not expand scalar
commentary until the model can distinguish declared coverage from inferred
coverage.

### PR 3 — structured research envelopes

Depends on PR 2. Add MCP `outputSchema` and `structuredContent` envelopes using
the provenance fields. Text remains backward-compatible; structured fields are
introduced only after their identifiers and compatibility rules are stable.

### PR 4 and later — section-aware research

Depends on PR 3. Evaluate section-span commentary/CCEL retrieval, search
bundles, richer citation output, and other research capabilities. A provider
anchor must not be relabeled as an exact verse or inferred range without an
explicitly represented coverage model.

Independent operational maintenance—such as a paid RPC/SLO decision, action
runtime upgrade, or rollback rehearsal—may be scheduled separately when it has
its own authorization and evidence.

## Operational guardrails

- Production and preview D1 bindings are managed through the approved workflow;
  deployments do not migrate or seed remote D1.
- The read-only readiness gate must continue to require schema and corpus
  identity markers. Do not weaken it to make an older database pass.
- A code rollback and a D1 binding rollback are separate decisions. When the
  predecessor database crosses a schema or metadata era, use a matched earlier
  Worker/config/workflow revision or prepare a compatible replacement.
- Public Ethereum RPC defaults are light-use defaults, not an uptime
  commitment. A fake transaction hash is not a health probe; release smoke
  tests use an operator-selected, already-mined public transaction.

## Deferred decisions

- Whether to add section-span commentary after provenance primitives exist.
- Whether a supported RPC provider and an operational budget justify an
  availability target.
- When to upgrade pinned GitHub Actions after an official, mechanical release
  review. Node-runtime warnings remain maintenance work, not PR 1 scope.
- When predecessor D1 retention and compatibility have been independently
  verified well enough to authorize cleanup.
