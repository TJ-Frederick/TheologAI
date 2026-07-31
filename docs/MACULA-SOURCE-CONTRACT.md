# MACULA source contract (candidate only)

This document describes a local-only source-contract candidate. It does not
add MACULA corpus material to TheologAI and does not authorize source
acquisition, a projection, a migration, D1 work, a repository adapter, an MCP
surface, a composition-root binding, runtime reachability, a catalog entry, or
a preview or production deployment.

The executable lock is
[`data/biblical-languages/macula/SOURCE-CONTRACT.json`](../data/biblical-languages/macula/SOURCE-CONTRACT.json).
It pins untagged source commits and trees instead of tracking a branch:

| Candidate | Commit | Tree | Selected local-only input shape |
| --- | --- | --- | --- |
| MACULA Greek | `8423afe47b9e8f24b7772e808af45c7159a6fe7e` | `eea78df4b0f1efb857f1575243a1ec4548267a11` | 27 `SBLGNT/lowfat/*.xml` files plus two notices |
| MACULA Hebrew | `47db250bd55d0d8577f2a94fba114ef16c35b23c` | `594f395cf473795d6984003800b4bf86ca691a26` | 929 `WLC/lowfat/*-lowfat.xml` files plus four notices |

There is no floating revision, URL fetcher, downloader, or corpus file in this
repository. Any later acquisition must happen in a reviewed, separate local
workflow and must verify the exact commit, tree, selected-path count, and
source-file evidence before a materializer reads anything.

## Authoritative evidence and compatibility

Only `/private/tmp/theologai-macula-source-audit/audit-output/final-replay-2`
is the present local audit authority. Its deterministic identity is
`2d5e770ee05260fbbf4f6810153f815e55b86b602ca301e30b7274c3637124b7`.
The root diagnostics and `replay-1`/`replay-2` are superseded and must not be
cited, copied, packaged, or used as authority.

The lock records the audited current-main source identity
`2f12262c9a37d3588bee9b5071954823c15cbd12` /
`9922aedb74c690e7a3fcb926b3d621f28fa44535`, plus the exact morphology-usage,
72-artifact runtime-inventory, STEPBible, and D1 corpus identities. These are
compatibility gates, not activation or a claim that any MACULA artifact exists
in the runtime.

Run the compact verifier without network access:

```bash
npm run data:verify-macula-source-contract -- --audit-dir \
  /private/tmp/theologai-macula-source-audit/audit-output/final-replay-2
```

It checks the source lock, the local `origin/main` object, the two compact
audited JSON artifacts, and their recorded relationship to the final replay.
It deliberately does not open the 197 MiB SQLite projection, source XML, any
source checkout, or a superseded replay. Full projection reproduction is a
separate, future gate.

## Field and publication boundary

The only candidate retained source attributes are stable word coordinates and
structural fields (`xml:id`, `ref`, `class`, `role`, `lang`), syntax-group
fields (`class`, `role`, `rule`, `Rule`, `head`), and participant relationship
fields (`subjref`, `referent`, `participantref`). Word-element text is
alignment-only and must never be retained. Glosses, translations, semantic
domains and senses, frames, Cherith/SILHA material, morphology, Strong's,
lemmas, normalized forms, transliteration, Unicode duplicate data, synonyms,
mappings, nodes, TSV, TEI, and aggregate lowfat files are excluded.

The contract is closed: a materializer must reject every explicitly excluded
attribute and fail closed on every unknown attribute until review updates the
contract. Structural role labels remain source diagnostics, not theological,
pastoral, grammatical-certainty, or interpretive verdicts; future presentation
would need a separate review and must not expose excluded data by default.

The content-free exclusion ledger records nine unresolved Hebrew participant
relationships (four `participantref`, five `subjref`). They are ineligible for
all public output. No source or target identifiers are preserved here, and no
target may be guessed. This blocks publication until independent adjudication.

## Rights, provenance, and later gates

The pinned MACULA Greek and Hebrew notices identify their datasets as CC BY
4.0 and specify the corresponding MACULA attribution. If any material is ever
distributed, the future change must provide the required attribution and CC BY
4.0 link, retain applicable notices, identify modifications, avoid implying
upstream endorsement, and avoid additional restrictions. The selected fields
and exclusions reduce scope; they do not erase source-specific obligations.

MACULA Greek's selected SBLGNT lowfat inputs are SBLGNT-derived. That is
different from the separately audited Faithlife SBLGNT checkout: the latter is
a standalone notice-only provenance record at
`c4d241a9c1c479a55b989ba35a4976c1d0b8052c` /
`1237db9d579eb13457157ca266a6f822dd4353b9`, never an alignment, projection,
deterministic-hash, or public-output input. The standalone XML and license
content are neither copied nor read by the contract verifier.

This is an operational rights record, not a legal opinion. Before any public
use, separate review must settle rights/provenance, source acquisition,
full-reproduction evidence, the nine dangling relationships, data modeling,
materialization/import, runtime integration, public-output design, and release
authorization.
