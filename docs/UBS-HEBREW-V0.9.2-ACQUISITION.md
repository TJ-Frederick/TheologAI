# UBS Hebrew v0.9.2 acquisition record

## Scope and state

This remains an inactive source-acquisition package. TheologAI has
vendored exactly two unmodified English UBS Hebrew v0.9.2 JSON artifacts from
the pinned upstream revision, plus the exact relevant upstream license and
notices. A strict raw decoder and raw-coordinate verifier now produce separate
deterministic audit reports without changing the immutable Gate 1 schema
report. No migration, transform 7, D1 materialization, runtime registration,
tool, prompt, resource, or public semantic output exists in this change.

| Artifact | Upstream blob | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `UBSHebrewDic-v0.9.2-en.JSON` | `39e218d17f1961495ea7052e342bd9707432cdc0` | 23,110,129 | `1686a25dd31dc9afb7b932927e160070667c73caedad11aa7e4482c21f800e8e` |
| `UBSHebrewDicLexicalDomains-v0.9.2-en.JSON` | `88b69b48b00d8306c6d596107b3123de1d41574b` | 114,281 | `fbc862b2c46966cf7f3bf19c2f3e79a7391c34f8c737e1979fa5178ac603d0df` |

Both files are pinned to [`ubsicap/ubs-open-license` commit
`3a6edd8212df2e1189037ad39687726990c80d56`](https://github.com/ubsicap/ubs-open-license/tree/3a6edd8212df2e1189037ad39687726990c80d56).
The executable verifier recomputes each raw SHA-256, Git blob SHA-1, byte
count, and the inspected schema report. Coordinate validation additionally
pins `usfm-bible/usfmtc` commit
`a222dd3e78360f8e275ca56f4307af7e02b2430a`, its reviewed `reference.py`, and
its MIT license. The existing four exact TAHOT source pins remain authoritative
for raw Hebrew coordinates.

`COORDINATE-AUDIT.json` is itself byte-pinned as
`d174d827bbfdf7d1c35a8836ff28a5453a2947ac5020eb5df060fed1732a1f30` in
`SOURCE.json`. `npm run data:verify-ubs-hebrew-coordinate-audit` downloads all
four exact immutable TAHOT inputs through the hash-first pinned-source
downloader, rebuilds the 260,813-reference audit, and rejects either report
byte drift or a structural-report mismatch. This is a verification-only
command; it writes no source, transform, database, or runtime artifact.

## Attribution, license, and provenance

The retained upstream copyright statement is “(UBS Dictionary of Biblical
Hebrew © United Bible Societies, 2023.  Adapted from Semantic Dictionary of
Biblical Hebrew © 2000-2023 United Bible Societies.)” It is licensed under [CC BY-SA
4.0](https://creativecommons.org/licenses/by-sa/4.0/). The exact upstream
license, dictionary release note, and Hebrew-specific notice are retained under
[`data/biblical-languages/ubs-open-license/v0.9.2/upstream-notices/`](../data/biblical-languages/ubs-open-license/v0.9.2/upstream-notices/).

The exact source URIs, source paths, pins, local locations, and notices are in
[`SOURCE.json`](../data/biblical-languages/ubs-open-license/v0.9.2/SOURCE.json).
The original source files have not been normalized, reformatted, or otherwise
modified.

The Hebrew-specific upstream notice calls the SDBH ongoing and says that around
90% of Old Testament words are included. A broader dictionary release note says
v0.9.2 added entries and is “now at 99%.” Those statements are not reconciled
here. TheologAI must therefore treat this source as non-exhaustive and make no
completeness claim in a future feature without a separately reviewed evidence
basis.

If a later approved implementation shares derived rows, exports, database
copies, or semantic output, it must retain UBS/SDBH attribution, the pinned
source URI, the CC BY-SA 4.0 URI, and a clear change description, and offer the
derived semantic layer under CC BY-SA 4.0 or a compatible license. This is a
conservative product policy, not legal advice. It deliberately does not claim
that CC BY-SA applies to unrelated TheologAI code or datasets; every applicable
license still remains in force.

## Inspected schema and reference boundary

The raw dictionary is an array of 7,932 entries, containing 8,902 base forms,
16,224 lexical meanings and 16,224 English sense-localization records. The
separate domain artifact is an array of 411 nested semantic-domain records.
The deterministic schema report records the exact field shapes and counts.

`LEXReferences` is stronger than verse-only evidence: all 260,813 records begin
with a 14-digit `BBBCCCVVVSSWWW` source anchor. The Hebrew-specific UBS notice
defines it as book, chapter, verse, segment, and word; the segment is irrelevant
for Hebrew, and source words are counted with even numbers. Most anchors are
bare; 2,697 retain an appended footnote suffix containing 2,698 markers. The
inspection preserves and counts the source's exceptional `!{N:001}` marker,
negative `{N:-033}` marker, and one multi-marker suffix instead of silently
normalizing them.

Every anchor is structurally checked against the global field ranges observed
in the pinned artifact: book 1–39, chapter 1–150, verse 1–176, segment exactly
`00`, and a positive even word number. These checks do **not** validate that a
particular chapter belongs to a book or that a particular verse belongs to a
chapter. Gate 1 establishes the encoded field shape and observed ranges only;
it does not establish biblical-reference validity or a source-versification
crosswalk. That boundary is explicit in `SCHEMA-REPORT.json`.

The anchor is therefore evidence that UBS associates a lexical meaning with an
encoded source token location, subject to those unresolved validity boundaries.

It is not a verified alignment to TheologAI’s generated morphology positions.
The coordinate verifier proves exact native-coordinate coverage and can attest
one explicitly supplied UBS-anchor/TAHOT-token locator; it never derives that
pair from word position and cannot establish a TheologAI morphology-token
alignment, lexical identity, or contextual sense. The caller-supplied locator
is replaced by the canonical raw indexed TAHOT token before evidence is
emitted, so cloned-field mutations cannot forge coordinates or word elements.
Coordinate-only evidence is always unpromoted lexical-candidate evidence.

Any future `verified_token_alignment` status requires a different,
server-side `theologai-exact-hebrew-token-alignment.v1` proof contract. That
contract must bind one independently pinned TheologAI morphology-token witness
to canonical UBS evidence and must not trust a client-supplied coordinate or
token ID. It is intentionally not implemented, accepted, or emitted by this
inactive package.

The decoder audit records 8,345 exact `H####`/`A####` identity occurrences and
excludes 617 base forms with no representable exact identity. It drops 208
blank domain-assignment rows. Twenty-seven senses have a null domain source and
another 207 contain only blank assignments, leaving 234 usable zero-domain
senses; zero domains are valid rather than fabricated. Definitions are
published only when all source markup is safe and fully validated. Glosses
remain available when a definition is absent or excluded.

## Capacity boundary

The verifier measures 23,224,410 raw artifact bytes and 26,532 raw notice
bytes (23,250,942 bytes total) against the planned 350 MiB database ceiling.
That is only an acquisition-size measurement. There is no migration, transform,
generated seed, or materialized SQLite/D1 database in this change, so it would
be misleading to claim D1 capacity verification. The existing final capacity
gate remains separately required after those approved steps exist.

## Deferred work

This package does **not** authorize migration `0004`, transform 7, SQLite/D1
storage, seed generation, a database import, runtime wiring, or any
preview/production deployment. The decoder, normalized inactive contract, and
coordinate attestation remain design-time inputs for a separately reviewed
materialization and release.

## npm publication boundary

`npm pack --dry-run --json --ignore-scripts` currently includes this inactive
packet incidentally. The package has no `files` allowlist
or `.npmignore`, and the same dry run omits the configured `dist/index.js`
entrypoint. That is existing packaging debt, not a supported distribution
surface or evidence that these sources are intended for npm.

Do **not** publish the current package or this acquisition packet to npm. npm
distribution is not a product goal. This acquisition makes no change to
`package.json`, package-private state, `.npmignore`, or any package command;
packaging policy can be addressed only in a separately approved workstream.
