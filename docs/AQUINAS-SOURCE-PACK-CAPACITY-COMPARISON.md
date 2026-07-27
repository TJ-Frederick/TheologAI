# Aquinas source-pack capacity comparison

This is a local-only capacity rehearsal of the checked-in inactive Project
Gutenberg Aquinas package. It first builds a normal zero-hierarchy release
baseline, then copies that baseline and materializes the generic
edition-scoped hierarchy only in the disposable copy. It does not authorize
runtime wiring, binding changes, deployment, remote D1 work, Cloudflare
operations, or a source-pack release.

Run it only from a clean checkout with Node 22 and installed dependencies:

```bash
npm run audit:aquinas-source-pack-capacity
```

The public command accepts no paths, output locations, schema options, or
targets. It builds and verifies a fresh normal-release database only below the
operating system temporary directory, proves the four hierarchy tables and
Aquinas lineage are empty, then copies it for the standalone rehearsal. It
measures both databases before `VACUUM`, reports the normal manifest-derived
corpus identity, then removes every temporary file. Tests may inject a
disposable fixture baseline or builder; the CLI cannot.

## Locked input

The comparison refuses anything other than this inactive identity:

```text
work:       thomas-aquinas-summa-theologiae
edition:    aquinas-summa-english-dominican-gutenberg-electronic
collection: aquinas-summa-pg-v1
status:     local_only_inactive
```

It attests the manifest, the five canonical shard IDs in manifest order, all
package hashes, aggregate/question/article hashes, and the source, receipt,
topology, and discrepancy-ledger locks. It requires this exact child inventory:

| Item | Count |
|---|---:|
| Shards | 5 |
| Questions | 512 |
| Articles | 2,669 |
| Question preambles | 512 |
| Part prologues | 3 |
| Authority bodies | 3,184 |
| Underlying Gutenberg source artifacts | 4 |

Tests also prove that the reader rejects missing, reordered, byte-tampered,
hash-tampered, identity-tampered, and duplicate inputs.

## Standalone Transform 10 rehearsal

The disposable rehearsal keeps the 3,184 individual authority bodies in
generic, edition-scoped hierarchy tables. Its implicit work root has four ordered part
landings, 512 ordered question landings, and 2,669 ordered article nodes:
3,185 nodes in total. Part landings have optional prologue body pointers,
question landings point to preambles, and article nodes point to articles.
Sibling ordinals are contiguous within each parent (`1..n`), rather than copied
from source-global ordinals.

The comparison proves the stored flat preorder equals an independent,
sibling-ordered hierarchical traversal. Its FTS5 index is external-content over
the hierarchy authority-body table, includes an FTS integrity command and
representative `MATCH` row-ID-parity check, and has no body-bearing
`*_content` copy. It does not write documents, sections, catalog entries,
runtime projections, or MCP registrations.

## Capacity measurements

The normal release capacity gate is the separate
`npm run audit:release-corpus-capacity` measurement. This report's controlling
standalone-rehearsal value is the copied database **before `VACUUM`**, after
the explicit Aquinas materialization and `ANALYZE`. The report exposes it as
`standaloneAquinasRehearsal.preVacuumFullCopy`, and its
`capacityGate.finalBytes` is exactly that file size. It prints the complete
result and exits nonzero when the rehearsal exceeds 350 MiB.

`postVacuumDiagnostic` is deliberately non-gating and cannot replace the
direct measurement.

`VACUUM` can make the database smaller by repacking partially occupied B-trees,
indexes, and FTS structures; it does not replace the controlling pre-`VACUUM`
measurement. Reproduce the command locally for the controlling measurement:
SQLite implementation and build details can affect physical page packing even
when the attested corpus matches.

## Node 22 evidence

The following is a published Node 22 / bundled `better-sqlite3` SQLite run, not
a universal assertion about every SQLite build. It exists to make the current
decision boundary concrete; structural tests intentionally do not hardcode
these machine-native sizes.

| Rehearsal | Direct `preVacuum` | Post-`VACUUM` diagnostic | 350 MiB gate |
|---|---:|---:|---|
| Normal zero-hierarchy baseline | 315,314,176 | 301,740,032 | not this rehearsal's gate |
| 10 rehearsal: 3,184 bodies and 4/512/2,669 implicit-root navigation | 341,135,360 | 325,775,360 | within by 25,866,240 bytes |

The command records `dbstat`, integrity, foreign-key, page-count, and FTS
evidence every time; do not replace those checks with estimated text sizes.

## Current contract boundary

Transform 10 has a reviewed local materializer and standalone integrity
rehearsal. Its packet remains tracked and hash-pinned in the top-level source
inventory, but is deliberately absent from normal D1 materialization inputs.
There is no composition-root wiring, MCP tool/resource/prompt registration,
catalog or document projection, runtime lookup path, binding change, or remote
D1/deployment operation. Activation remains a separately reviewed compatibility
and release decision.
