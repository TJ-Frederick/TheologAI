# Transform 11 historical-spine activation

Transform 11 activates the two reviewed historical-spine source packs prepared
in PR #105. The normal local build now has an exact allowlist of three packs,
18 reviewed editions, 43 pinned source artifacts, and 1,057 sectioned sections.
Together with the unchanged 17 legacy documents, this produces 35 works and
4,111 searchable sections.

The activation reuses the generic schema introduced by migration
`0006_historical_source_packs`; it adds no migration and no new MCP tool. It
changes the data manifest, deterministic corpus identity, local SQLite/D1
materialization, readiness predicates, full authority audit, documentation, and
guided-workflow inventory. Source-pack aliases remain zero. Search, browsing,
canonical section resources, rights disclosure, Node/Worker parity, response
budgets, and CCEL execution policy retain their existing contracts.

The fresh pre-vacuum SQLite rehearsal is 333,111,296 bytes against the
repository's 367,001,600-byte hard ceiling, leaving 33,890,304 bytes of
headroom. This passes the hard gate but crosses the 90% warning threshold.
Transform 11 is viable as scoped; another substantial local corpus should first
revisit storage duplication, limits, or corpus partitioning.

## Exact release boundary

Only the checked-in normalized edition packages plus their reviewed manifests
and checksum sidecars are D1 inputs. Source-preparation records and sanitized
replay receipts are review evidence, not runtime corpus inputs. Raw scans,
EPUBs, Project Gutenberg wrappers, and CCEL content are not materialized.

## Aquinas exclusion

The separately acquired English Dominican Aquinas packet is incomplete:
Prima questions 1–119, Prima Secundae 1–114, Secunda Secundae 1–189, and
Tertia 1–90 are present; Tertia 91 onward and the Supplement are absent. It
must not be advertised as the *Summa Theologiae* catalog work without a
separate coverage and product decision.

Transform 11 therefore requires all hierarchy and publication tables to remain
empty and gives Aquinas no document, catalog, search, resource, runtime, or D1
lineage projection. Its local acquisition packet and standalone rehearsal code
remain future-work evidence only. Activating Aquinas requires a separate
reviewed transform that re-proves edition coverage, text conservation, search
quality, compatibility, and database headroom.

## Release sequence

The activation implementation did not itself change Cloudflare. The fresh ENAM
candidate `theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`) was then created unbound and imported
once from the exact 49-file, 1,630,259-row reviewed seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed. The
checked-in preview target does not bind or deploy it; the protected workflow
must prove that exact cutover before black-box audit. Production remains on the
PR #101 baseline until a separate production authorization.

The first protected PR #107 attempt (`30418227263`) proved the candidate
binding and passed the original-language audit, but the zero-retry historical
audit reached one edge whose `resources/list` inventory had not yet converged
and failed before reading historical bodies. A subsequent bounded read-only
diagnostic observed the exact 38-resource identity, and the complete fixed
historical audit then passed without an application or D1 repair. The release
gate now stabilizes both the primary-source tool schemas and a hash of the
exact checked-out resource URI inventory before either protected audit. It
requires two consecutive matching probes separated by the fixed four-second
convergence delay, records only hashes and booleans, retains bounded attempts,
and does not turn an audit into a retry loop. A fresh protected run must still
prove the repair head, exact candidate binding, and both zero-retry audits; its
workflow evidence is authoritative.
