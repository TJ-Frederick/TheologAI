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
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed.

The first protected PR #107 attempt (`30418227263`) proved the candidate
binding and passed the original-language audit, but the zero-retry historical
audit reached one edge whose `resources/list` inventory had not yet converged
and failed before reading historical bodies. A subsequent bounded read-only
diagnostic observed the exact 38-resource identity, and the complete fixed
historical audit then passed without an application or D1 repair.

The repaired exact PR #107 head `8dd6b4fa306b8f9412c1a08207261ea34d477f37`
then passed protected preview run `30419373527`. It deployed
`f5ef7a40-1b4b-4120-a1bb-70b33630b4a6` as sole 100% assignment of Worker
`83b1ec5f-3b0d-4388-8c0b-e017076442dd` (#134), bound to
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`). The protected original-language and
historical-core audits passed. Preview authorization was then removed; the
revocation workflow `30420256210` passed and PR #107 has no `deploy-preview`
label.

A separate, zero-retry targeted audit of the ten newly activated works also
passed. Its 84-exchange main audit checked landing, browse, natural search,
scoped local primary-source search, and direct reads; its separate 12-exchange
pagination/cursor audit also passed. Sanitized evidence hashes are
`1b56d093b298f41a7845b6c328dbf63ade72ca8fdf8cf82bc68004defaa09a05` and
`aedef2ffffe6d3de04a5c341a09f137df7abc0d90cee11929ee988fb90f95080`.

Production did not change: it remains the PR #101 production baseline on
Worker #96 and D1 `f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`. The later local-only convergence
hardening commit `5346be93237086a541d7bb1982b96752807878be` and the current
durable historical-spine audit work are unpublished. They require a fresh
push, exact-head CI, and protected same-D1 preview release before any
production-D1 preparation, merge, or production deployment is considered.

The exact ten-work audit added after this activation is documented in
[Transform-11 Historical-Spine Release Audit](HISTORICAL-SPINE-RELEASE-AUDIT.md).
