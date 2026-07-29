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

The retained deployment above is historical release evidence. The current
preview baseline is deployment `5e812152-355b-4a5f-a123-2485e89f1550`, Worker
`06b9a603-8339-42b6-a246-ef9238563043` (#140), and the same
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`) D1.

A separate, zero-retry targeted audit of the ten newly activated works also
passed. Its 84-exchange main audit checked landing, browse, natural search,
scoped local primary-source search, and direct reads; its separate 12-exchange
pagination/cursor audit also passed. Sanitized evidence hashes are
`1b56d093b298f41a7845b6c328dbf63ade72ca8fdf8cf82bc68004defaa09a05` and
`aedef2ffffe6d3de04a5c341a09f137df7abc0d90cee11929ee988fb90f95080`.

Production did not change during the preview release. The checked-in root
binding selected the separately prepared, initially unbound ENAM candidate
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`), prepared once from merge
`501ae7840a71ceb589dc3b1ae9863aef83e3586f`, exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`, and the exact 49-file,
1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and full
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed.
Protected PR #108 workflow `30496350408` then deployed merge
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` as deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), bound to that exact D1.
Historical core passed 8/8, Transform-11 spine passed 10/10,
original-language passed 11/11, primary-source edge stabilization matched on
attempt 4 and remained stable, and independent post-release review returned
`SHIP`. Preserve the former PR #101 assignment for rollback: Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), deployment
`71b76d24-bf5f-490e-adc4-31cf63fb046e`, and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`).

The exact ten-work audit added after this activation is documented in
[Transform-11 Historical-Spine Release Audit](HISTORICAL-SPINE-RELEASE-AUDIT.md).
