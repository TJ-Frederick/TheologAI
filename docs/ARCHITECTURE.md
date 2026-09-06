# Architecture and ownership

This guide describes the maintained source layout. Deployment identity belongs
only to [CURRENT-RELEASE.md](CURRENT-RELEASE.md), and delivery sequencing belongs
to [ROADMAP.md](ROADMAP.md). The earlier
[architecture plan](bible-mcp-architecture.md) is historical.

## Three maintenance responsibilities

The application remains one modular codebase with Node and Worker transports.
These ownership roles describe responsibility for a change, not additional
services or a new organization. A PR names its responsible contributor and
reviewer; an agent assignment does not grant release or source-rights authority.

| Responsibility | Main locations | Owns | Verification |
|---|---|---|---|
| Research serving | `src/mcp`, `src/http`, `src/tools`, `src/services`, `src/adapters`, `src/presenters`, `src/formatters`, `src/kernel` | Input/output contracts, query behavior, source interpretation boundaries, request budgets, transport compatibility | Unit tests, current integration, Node/Worker typechecks, compiled process tests and Workerd tests as relevant |
| Corpus preparation | `scripts/build-*`, source acquisition/compilation/verification scripts, `data`, `migrations` | Pinned inputs, edition provenance, deterministic transformations, canonical section identity, generated SQLite and seeds | Source reproduction, integrity and authority checks, capacity, SQLite/D1 parity, deterministic seed verification |
| Release operations | `.github/workflows`, candidate preparation, release/audit/reconciliation scripts, `wrangler*.toml`, release runbooks | Privilege boundaries, exact source/tree/Worker/D1 evidence, compatible rollout and recovery, evidence custody | Workflow and script tests, protected preview receipts and release gates; local correctness alone does not establish a deployed assignment |

Some scripts participate in both preparation and release. Assign responsibility
according to the behavior being changed: seed bytes belong to preparation;
permission to apply them belongs to operations. The existing TypeScript project
and test inventories remain compiler authority; this table does not create a
second file-by-file compiler manifest.

## Request flow and dependency direction

1. `src/index.ts` or `src/worker.ts` applies transport policy and creates the
   appropriate composition root.
2. `src/mcp/server.ts` and the shared registrars advertise and validate the
   protocol. `src/tools` adapts calls into application services.
3. Services own provider ports. Adapters implement those ports or the kernel's
   persistence interfaces. SQLite and D1 use the same domain contracts.
4. Presenters and formatters construct public structured/Markdown results.
   The registrar validates structured output before returning it.

Keep shared domain behavior in services. Keep transport policy in `src/http`
and storage/provider details in adapters. Node and Worker composition roots
remain explicit because their dependencies and lifetimes differ. Extract a
shared factory only when repeated wiring produces real drift.

The kernel imports only other kernel modules within `src`. Services cannot
import adapters. Language services cannot import presenters or formatters.
`LocalPrimarySourceSearchProvider` retains its documented historical formatter
dependency for exact resource sizing/identity; extending that exception needs
an explicit compatibility rationale.

Serving source cannot import preparation scripts, tests, documentation, or raw
root-level `data` modules. Generated artifacts under `src/data` are permitted.
The Node database adapter opens the derived database read-only; builds create
their own writable connections. Node's generated UBS loader reads the compiled
artifact, while the Worker uses D1 and its separate bundle-exclusion check.

These module boundaries are enforced in
[`applicationBoundaries.test.ts`](../test/unit/config/applicationBoundaries.test.ts),
including regression examples for import/export, import types, dynamic imports,
and literal `require`. This static guard is not a filesystem-access sandbox:
nonliteral imports and runtime file/network operations require normal review.
See [test ownership](../test/README.md) for compiler and execution partitions.

## Dormant work register

Review baseline: **2026-09-05**. Next maintenance review: **2026-10-05**, or
before a PR proposes activation, whichever comes first. Review dates trigger
a decision to continue, narrow, or retire work; they never authorize deletion,
source acquisition, flags, publication, or deployment. The project maintainer
assigns the responsible contributor when scheduling each review.

| Work | Responsible review role | Current boundary and retained locations | Evidence needed before activation |
|---|---|---|---|
| CCEL discovery | Research serving + release operations | Adapter/coordinator code is present in the serving graph; execution remains gated. It is not dead code merely because live search is disabled. See [coordinator](CCEL-UPSTREAM-COORDINATOR.md) and [canary transaction](CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md). | Demonstrated gap after adequate local search, current interface/policy review, preserved discovery-only bounds, authorized canary and separate release decision |
| Primary-source research v8 | Research serving | Implemented contract/prompt foundation selected by otherwise absent flag; see [v8 foundation](PRIMARY-SOURCE-RESEARCH-V8-FOUNDATION.md). | Useful local research outcomes, contract/parity tests, existing external execution gates, protected release evidence |
| Partial Aquinas Transform 10 | Corpus preparation + research serving | Source packet, hierarchy contracts and disposable materializer remain; normal corpus excludes Aquinas lineage/publication. See [Transform 10](AQUINAS-HIERARCHY-TRANSFORM10.md). | Explicit complete-edition/coverage decision, edition-specific source evidence, conservation and search quality, capacity, reviewed activation transform |
| Complete-edition Aquinas preparation | Corpus preparation | Collection/package foundations and Gutenberg acquisition/topology scripts remain preparation-only. Their presence does not replace the partial packet or activate a catalog work. | Verified acquisition/topology and completeness, source/rights review, deterministic compiler, integration and release decisions |
| Norton | Corpus preparation + release operations | Generic Candidate-C schema is maintained, but Norton rows are confined to disposable proof. See [inactive Transform 12](NORTON-TRANSFORM12-INACTIVE.md). | Normalized-text rights decision, reviewed canonical activation, retrieval/section identity and capacity proof, separate release preparation |
| MACULA context | Corpus preparation + language research | Source contract and synthetic parser/capacity experiments; see [source contract](MACULA-SOURCE-CONTRACT.md) and [synthetic Gate 1](MACULA-GATE1-SYNTHETIC.md). | Product scope, real source/rights review and acquisition, alignment correctness, measured real-corpus capacity and research benefit |

Keep new experiments outside the serving dependency graph until their use case,
contract and source boundary are decided. Existing kernel foundations may be
shared by compilers and serving code; inspect callers before moving them. Do
not combine speculative relocation with feature activation or rewrite frozen
evidence scripts to make the tree appear uniform.

## Change handoff

Each substantial assignment identifies an observable outcome, owned files,
preserved contracts, relevant verification, and decisions that need escalation.
Keep separate worktrees for independent changes and one owner for shared files.
Review the resulting diff and tests against the assignment rather than relying
only on its implementation summary.

For a boundary change, record which import becomes legal or illegal and prove
the guard detects a violating example. For a corpus change, record source and
materialization identity. For an operations change, record the preserved
approval and rollback conditions. Keep runtime/configuration, corpus, and
release-state claims separate in every handoff.
