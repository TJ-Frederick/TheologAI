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

The checked-out activation does not itself change Cloudflare. A fresh,
unbound preview D1 must be created from this exact reviewed seed, pass remote
readiness and authority audits, then be bound and deployed through the protected
preview workflow. Production remains on the PR #101 baseline until a separate
production authorization.
