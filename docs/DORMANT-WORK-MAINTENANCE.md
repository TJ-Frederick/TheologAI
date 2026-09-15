# Dormant work maintenance boundaries — 2026-09-14

This note records maintenance recommendations only. It does not activate,
retire, publish, acquire, or deploy any dormant feature. The existing register
in [ARCHITECTURE.md](ARCHITECTURE.md) remains the authority for status and
activation evidence.

## Interim posture pending retirement decisions

| Work area | Recommended maintenance posture | Owner and review trigger |
|---|---|---|
| CCEL discovery and coordinator | Retain as bounded future-provider architecture. Keep live execution, upstream requests, and secret-bearing operations behind the existing coordinator, canary, and release gates. Do not broaden search scope while inactive. | Research serving + release operations; review when a product gap, upstream contract change, or canary request appears. |
| Primary-source research v8 foundation | Retain as a serving-side contract and testable foundation. Keep its flag, provider availability states, and external execution gates explicit; avoid carrying v8 assumptions into the active v6/local-only path. | Research serving; review on a concrete research use case or contract/parity change. |
| Partial Aquinas Transform 10 | Retain as preparation evidence and disposable materializer. Keep the partial packet out of the normal catalog, public resource map, search index, generated manifest, and deployment seed. | Corpus preparation + research serving; review only with a complete-edition and coverage decision. |
| Complete-edition Aquinas preparation | Retain scripts and package contracts as preparation-only. Keep acquisition, topology, rights and completeness evidence separate from the partial packet. | Corpus preparation; review on source/rights evidence or a proposed deterministic compiler. |
| Norton | Retain generic Candidate-C and capacity proof as disposable preparation. Keep normalized text, catalog rows, and runtime adapters inactive until rights and capacity gates are independently reviewed. | Corpus preparation + release operations; review on a rights decision or activation proposal. |
| MACULA context | Retain source contract and synthetic/capacity experiments outside the serving graph. Synthetic success is not real-corpus alignment or product evidence. | Corpus preparation + language research; review on real-source acquisition, alignment evidence, and measured capacity. |

For all six areas, budget maintenance to one dated review and the narrow tests
needed to preserve frozen evidence. New code should live under preparation or
test-only paths until its use case and contract are accepted. Avoid broad
refactors that mix relocation with activation decisions.

## `editionProvenanceFoundation` coupling

At the review baseline, `src/kernel/editionProvenanceFoundation.ts` had 907 lines and combined two
different responsibilities:

- preparation-side validation, canonicalization, rights/provenance models,
  and `compileEditionPackage`;
- two small Markdown presentation boundaries,
  `escapeEditionPlainTextForMarkdown` and
  `escapeFrozenEditionSectionContentForMarkdown`.

Preparation callers include `scripts/historical-source-packs.ts`,
`scripts/historical-sectioned-delivery.ts`,
`scripts/prepare-augustine-pusey-strict-package.ts`,
`scripts/normalize-eebo-tcp-norton-1561.ts`,
`scripts/norton-capacity-decision-evidence.ts`, and the historical spine replay
script. Runtime callers are `src/formatters/historicalFormatter.ts` and
`src/formatters/originalLanguageStudyV2Formatter.ts`; a v2 draft fixture also
uses the generic escaper. At that baseline, the preparation module was part of the active serving
dependency graph through formatting helpers.

The implemented extraction uses `src/kernel/editionText.ts` for the shared
text boundaries; active formatters now import that helper. The preparation
foundation re-exports the prior names for compatibility. The design was: Move only the two escapers and their directly required boundary
helpers, then update the two active formatters. The frozen draft fixture retains
its original import through the compatibility export to preserve its reviewed
Git object identity. Keep all
provenance types, limits, validators, and compilation in the preparation
foundation. Do not move compilation into formatters or expose the foundation
through a kernel barrel.

Preserve these frozen constraints during extraction:

- generic plain text still rejects invalid outer whitespace and escapes every
  ASCII Markdown punctuation delimiter byte-for-byte;
- frozen section content still preserves LF-only leading/trailing boundaries
  while escaping only the trimmed interior;
- output and SHA-256 identities from compiler/replay tests remain unchanged;
- serving code still imports only the neutral kernel helper, never scripts or
  raw source packages;
- `editionProvenanceFoundation.test.ts`, formatter tests, historical replay,
  and architecture-boundary tests remain passing.

Before editing, capture the current formatter outputs and compiled package
hashes as fixtures. After editing, run focused kernel/formatter/replay tests,
then the normal Node and Worker typechecks. Treat any output or hash drift as
a stop condition requiring review; do not “fix” it by changing frozen evidence.

## Suggested order

The ownership inventory and neutral text-helper extraction are implemented.
Consider further splitting the remaining foundation only when a specific
boundary measurably reduces imports or test scope. Dormant feature decisions
remain separate product and rights decisions.

## Separate retirement decision set

These are recommendations for a later maintainer/product decision. They are
reversible dispositions: this note does not remove files, catalog rows,
generated artifacts, or evidence.

| Priority | Work | Recommendation | Caller and operational impact | Evidence to retain | Benefit still unknown | Decision owner |
|---|---|---|---|---|---|---|
| 1 | Partial Aquinas Transform 10 | Retire the partial packet and disposable materializer if the complete-edition path has no funded product need; otherwise narrow it to a dated preparation fixture. | No active search/catalog/runtime callers by contract. Retirement affects preparation scripts and tests after workflow-reference checks. | Source hashes, topology/hierarchy review, capacity evidence, inactive decision record. | Whether partial coverage has independent research value. | Product maintainer + corpus preparation |
| 2 | Norton | Retire Norton-specific normalization and capacity experiments if rights review is not planned; retain generic Candidate-C contracts only if another candidate uses them. | No active catalog or serving callers. Retirement affects local preparation scripts/tests; shared types require a caller search first. | Acquisition/normalization receipts, rights analysis, capacity measurements, inactive Transform-12 record. | Future value of normalized early-modern text and Candidate-C reuse. | Product maintainer + rights reviewer + corpus preparation |
| 3 | MACULA context | Narrow to the source contract and one labeled synthetic test; retire duplicate capacity experiments without a real-source milestone. | No serving/deployment callers. Local research tooling changes only if source-contract tests and docs remain. | Source contract, synthetic fixtures, alignment assumptions, capacity hashes. | Product value, licensing, and real-corpus alignment cost. | Language research + product maintainer |
| 4 | Primary-source research v8 | Retain the contract and narrow unused providers/flags to preparation-only until a concrete workflow is selected. | Active service and prompts are callers; broad removal risks availability-state and parity contracts. | Foundation docs, parity tests, benchmarks, external execution gates. | Incremental research quality over the active local workflow. | Research serving owner |
| 5 | Complete-edition Aquinas preparation | Retain preparation-only with a review budget; do not retire while the source-topology question remains on the roadmap. | Preparation scripts/package foundations are callers; no runtime/catalog impact. | Acquisition pins, topology locks, discrepancy ledgers, capacity evidence. | Complete-edition demand, rights clearance, sustainable size. | Corpus preparation + product maintainer |
| 6 | CCEL discovery/coordinator | Retain with strict gates; retirement is lowest priority because policy boundaries use the coordinator and adapter. | Runtime coordinator, adapter tests, and protected workflows are callers. Removal requires replacing availability and canary/recovery contracts. | Local-only v6 behavior, policy tests, canary/recovery runbooks, release evidence. | Whether bounded remote discovery improves user outcomes. | Research serving + release operations |

Before any retirement, run a repository-wide caller search, inspect workflow
and test topology references, confirm no current release identity or manifest
depends on the target, and record the decision with an owner and date. Preserve
hashes and sanitized evidence in an indexed historical location so future
reviews can distinguish “not currently useful” from “never validated.”


## Direction update — 2026-09-15

The maintainer superseded the Aquinas/Norton retirement recommendations above:
assess the shortest justified activation path for both. Inactive status and
internal review/authorization markers are not evidence of a licensing or
technical problem. Establish source permissions, exact content gaps and
correctness, and useful labeled coverage; preserve provenance and checks that
protect those properties. No retirement is planned.

See the [Norton assessment](NORTON-ACTIVATION-ASSESSMENT-2026-09-15.md) and
[Aquinas assessment](AQUINAS-ACTIVATION-ASSESSMENT-2026-09-15.md) for current
evidence and implementation options. The dated recommendations above describe the earlier review, not
the current disposition.
