# Primary-source research v8 foundation

Status: **dormant implementation foundation**. This record is not release
identity authority and does not authorize a preview or production change. See
[`CURRENT-RELEASE.md`](CURRENT-RELEASE.md) for the deployed assignments.

## Scope

The v8 candidate keeps the eleven-tool and six-prompt inventories unchanged.
It extends `primary_source_search` rather than adding a tool, retains the v7
provider and locator seams, and adds only the routing proof needed by the three
Phase 3B.2 journeys:

1. survey a topic across historical works;
2. locate material in one exact work; and
3. compare separately scoped historical creators.

Production v6 and preview v7 remain the checked-in deployed profiles. V8 is
selected only when both discovery exposure and the otherwise absent
`THEOLOGAI_ENABLE_PRIMARY_SOURCE_RESEARCH_V8` flag are true. No Wrangler
environment sets that flag in this slice. CCEL execution still additionally
requires the existing live-search and coordinator gates.

## Local evidence policy

All 35 local works remain ordinary usable local search results. The 17 legacy
works are not split, demoted, blocked, or assigned a lower rank because their
edition provenance predates the source-pack compiler. Existing readiness data
remains quiet per-result provenance context; it is not an eligibility rule.

Norton remains dormant. The incomplete Aquinas packet remains unpublished, and
this foundation does not acquire or activate a replacement edition.

## Standard-first routing

The prompt or host chooses the research journey; the server does not classify
natural-language intent. Every guided v8 workflow starts with a bounded
`searchDepth: "standard"` local plan.

- Useful general historical coverage stays local.
- A targeted work, creator, period, or comparison gap may receive one
  `searchDepth: "expanded"` retry without a separate user request.
- When adequacy is genuinely uncertain, the workflow says broader or more
  detailed sources can be requested. Uncertainty is not silently converted to
  an external call.

An expanded retry must include exactly one prior-result `expansionBasis`:

- `catalog_miss`;
- `no_results`; or
- `insufficient_diversity`, with a two-to-five-work minimum and the observed
  distinct local work count.

The service atomically validates the complete plan, reruns local search first,
and compares the supplied basis to the current local result. It permits at most
one external-bearing query per call. A stale basis, incomplete local metadata,
unavailable local search, malformed result, or mismatched requested scope yields
a non-triggered `expansionDecision` and no external provider call.

Distinct-work evidence is counted from canonical local locator `documentId`
values, never section count, title text, or inferred authorship. Date bounds
remain on the local search and are omitted from any eligible external request
with the existing composition-date warning.

## Truthful coverage boundary

Each v8 query returns a closed `expansionDecision` containing the supplied
basis, the current distinct-work count, and whether it was revalidated.
Provider groups remain ordered local then external. Existing server-observed
searched/not-searched facts remain separate from later host activity:

- `searched` means the server observed provider execution;
- `not searched` means the server observed provider non-execution;
- `read` is recorded only after the host successfully opens the exact MCP
  resource or direct page; and
- `deferred` is recorded only when the host intentionally leaves a selected
  lead unread and supplies a reason.

Local snippets and external snippets remain discovery-only. External metadata
and rights remain unreviewed, and a search result is never promoted to read
evidence merely because the search succeeded.

## Deterministic evidence and parity

The checked-in journey fixture freezes the initial standard plans for topic
survey, exact-work location, and two-creator comparison. Service tests freeze
all three eligible retry reasons, stale/uncertain rejection, local-before-
external ordering, bounded result counts, and the complete execution-gate
truth table. Node and Worker composition select the same dormant v8 descriptor
without changing their deployed defaults.

## Follow-on gates

This foundation deliberately does not:

- make a live CCEL request or approve current CCEL policy/interface evidence;
- stage or promote credentials;
- deploy a Worker, mutate D1, add a migration, or change a binding;
- acquire or activate an Aquinas corpus;
- activate Norton; or
- authorize persistent preview or production CCEL.

Those streams may proceed against this contract only after review. Any live
CCEL production objective still requires an exact passing preview canary and a
separate release decision.
