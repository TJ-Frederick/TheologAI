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

## Snapshot maturity is reproducibility evidence only

The Greek pin is 29 reachable commits after baseline tag `24.06.17` (peeled
commit `b5b7ecec0882a3e9a609ecac99e157391e5d9b46`); all 27 selected lowfat
files differ from that tag. The Hebrew pin is three reachable commits after
baseline tag `26.04.13` (peeled commit
`09f8ea9e25025841ec45e2b6e7fc01595a080568`). Its repository-level changes
cover CGJ stripping, NFC normalization, and merge work, while zero selected
`WLC/lowfat` files and zero selected notices differ from the tag.

Both pins are untagged snapshots. Exact pins prove reproducibility only: they
do not establish independent scholarly QA, product acceptance, full
reproduction, rights review, or resolution-or-exclusion of the nine dangling
relationships. Those remain independent publication gates.

## Authoritative evidence and compatibility

Only `/private/tmp/theologai-macula-source-audit/audit-output/final-replay-2`
is the present local audit authority. Its deterministic identity is
`2d5e770ee05260fbbf4f6810153f815e55b86b602ca301e30b7274c3637124b7`.
The root diagnostics and `replay-1`/`replay-2` are superseded and must not be
cited, copied, packaged, or used as authority.

The lock records the historical source identity that was current-main when the
audit ran:
`2f12262c9a37d3588bee9b5071954823c15cbd12` /
`9922aedb74c690e7a3fcb926b3d621f28fa44535`, plus the exact morphology-usage,
72-artifact runtime-inventory, STEPBible, and D1 corpus identities. These are
compatibility gates, not activation or a claim that any MACULA artifact exists
in the runtime. The verifier checks that this pinned commit object and tree are
available locally; it intentionally does not require `origin/main` to remain
at the historical commit, because later main advancement is expected.

Run the compact verifier without network access:

```bash
npm run data:verify-macula-source-contract -- --audit-dir \
  /private/tmp/theologai-macula-source-audit/audit-output/final-replay-2
```

It checks the source lock, the local historical commit/tree object, the two
compact audited JSON artifacts, and every field of the unhashed final
`run-summary.json`. Material evidence is exact; timestamps, absolute paths,
host tooling, and benchmark timing are bounded non-authoritative diagnostics
with closed shapes. Unknown nested fields fail closed. `pass: true` records
structural projection checks, while `releaseEligible: false` is the separate
publication result. It does not fetch, move, or otherwise modify a Git ref.
It deliberately does not open the 197 MiB SQLite projection, source XML, any
source checkout, or a superseded replay. Full projection reproduction is a
separate, future gate.

## Field and publication boundary

The executable capability matrix is corpus-specific:

| Corpus | Word | Group | Participant |
| --- | --- | --- | --- |
| Greek | `xml:id`, `ref`, `class`, `role` | `class`, `role`, `rule`, `Rule` | `referent`, `subjref` |
| Hebrew | `xml:id`, `ref`, `class`, `role`, `lang` | `class`, `role`, `rule`, `head` | `subjref`, `participantref` |

Word-element text is alignment-only and must never be retained. All morphology
and morphological-analysis fields are excluded except the Hebrew-only raw
`lang` evidence expressly identified below. Glosses, translations, semantic
domains and senses, frames, Cherith/SILHA material, Strong's, lemmas,
normalized forms, transliteration, Unicode duplicate data, synonyms, mappings,
nodes, TSV, TEI, and aggregate lowfat files are excluded.

`lang` is retained only in MACULA Hebrew as raw OSHB-derived H/A language
evidence only. It is not morphological analysis, an ISO code, an independently
adjudicated language conclusion, a general classifier, a Greek capability, or
authorization to retain any other OSHB morphology field. The candidate records
local pipeline evidence: the MACULA Hebrew notice says its trees combine
Westminster syntax with OSHB morphology; the retained `lang` attribute is
copied from MACULA's derivative/reorganized/corrected OSHB source layer; and
the selected WLC lowfat input otherwise has composite provenance. The pinned
repository source README records the MACULA source layer provenance, while its
XQuery copies node `@lang`; that XQuery is provenance evidence, not one of the 933 selected
paths. The audit observed `lang` on all 475,911 selected Hebrew tokens (H
468,362; A 7,549) and absent from the Greek source.

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

For Hebrew `lang`, the operational record identifies Open Scriptures Hebrew
Bible, its [source URI](https://github.com/openscriptures/morphhb), and the
[CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). A future
distribution must retain the supplied attribution, notices, and source URI;
mark modifications; and avoid endorsement claims or additional restrictions.
The contract deliberately does not invent an attribution phrase. This is not a
legal conclusion or publication authorization.

SBLGNT has two separate executable records. The standalone Faithlife checkout
is notice-only provenance evidence at
`c4d241a9c1c479a55b989ba35a4976c1d0b8052c` /
`1237db9d579eb13457157ca266a6f822dd4353b9`; it is never a selected corpus
input and is prohibited from selection, materialization, alignment, projection,
deterministic identity, and public output. Its XML and notices are neither
copied nor read by this verifier.

Separately, the selected MACULA Greek lowfat input is SBLGNT-derived. A future
projection must carry the SBL Greek New Testament’s CC BY 4.0 obligations,
including `Copyright 2010 Society of Biblical Literature and Logos Bible
Software`, supplied source/link/license/copyright/disclaimer notices,
modification marking, and no endorsement or additional restrictions. This does
not claim that the standalone Faithlife checkout supplied the selected XML.
Obligations may attach to future projection; source-by-source and legal review
remain mandatory before publication.

This is an operational rights record, not a legal opinion. Before any public
use, separate review must settle rights/provenance, source acquisition,
full-reproduction evidence, the nine dangling relationships, data modeling,
materialization/import, runtime integration, public-output design, and release
authorization.
