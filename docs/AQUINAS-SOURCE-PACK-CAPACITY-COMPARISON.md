# Aquinas source-pack capacity comparison

This is a local-only capacity measurement of the checked-in Project Gutenberg
Aquinas package and its active Transform 13 projection. It builds a fresh
active release baseline, then attests the stored hierarchy against the same
immutable packet. It does not create a second Aquinas corpus. The command does
not authorize binding changes, deployment, remote D1 work, or Cloudflare
operations.

Run it only from a clean checkout with Node 22 and installed dependencies:

```bash
npm run audit:aquinas-source-pack-capacity
```

The public command accepts no paths, output locations, schema options, or
targets. It builds and verifies a fresh active-release database only below the
operating system temporary directory, measures that database before `VACUUM`,
and attests the four hierarchy tables and Aquinas lineage in place. It reports
the manifest-derived corpus identity, then removes every temporary file. Tests
may inject a disposable fixture baseline or builder; the CLI cannot.

## Locked input

The frozen packet retains this historical source identity:

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

## Active Transform 13 baseline attestation

The active baseline keeps the 3,184 individual authority bodies in generic,
edition-scoped hierarchy tables. Its implicit work root has four ordered part
landings, 512 ordered question landings, and 2,669 ordered article nodes:
3,185 nodes in total. Part landings have optional prologue body pointers,
question landings point to preambles, and article nodes point to articles.
Sibling ordinals are contiguous within each parent (`1..n`), rather than copied
from source-global ordinals.

The comparison first builds the dormant packet representation to prove source
conservation, then compares it with the active projection and attests every
stored hierarchy row in the fresh baseline. Its FTS5 index is external-content
over the hierarchy authority-body table and has no body-bearing `*_content`
copy. The active projection has its own reviewed runtime and resource tests;
this capacity command does not perform remote operations.

## Capacity measurements

The normal release capacity gate is the separate
`npm run audit:release-corpus-capacity` measurement. This report's controlling
value is the active baseline **before `VACUUM`**, exposed by
`baseline.preVacuum` and reused as
`activeAquinasAttestation.capacityGate.finalBytes`. It prints the complete
result and exits nonzero when that baseline exceeds 350 MiB.

`postVacuumDiagnostic` is deliberately non-gating and cannot replace the
direct measurement.

`VACUUM` can make the database smaller by repacking partially occupied B-trees,
indexes, and FTS structures; it does not replace the controlling pre-`VACUUM`
measurement. Reproduce the command locally for the controlling measurement:
SQLite implementation and build details can affect physical page packing even
when the attested corpus matches.

## Historical Node 22 evidence (pre-activation)

The following published Node 22 / bundled `better-sqlite3` SQLite run predates
Transform 13. It remains historical comparison evidence, not a v5 measurement
of the active corpus. Structural tests intentionally do not hardcode these
machine-native sizes.

| Rehearsal | Direct `preVacuum` | Post-`VACUUM` diagnostic | 350 MiB gate |
|---|---:|---:|---|
| Normal zero-hierarchy baseline | 315,314,176 | 301,740,032 | not this rehearsal's gate |
| 10 rehearsal: 3,184 bodies and 4/512/2,669 implicit-root navigation | 341,135,360 | 325,775,360 | within by 25,866,240 bytes |

The command records `dbstat`, integrity, foreign-key, page-count, and FTS
evidence every time; do not replace those checks with estimated text sizes.

## Historical contract boundary

Before Transform 13, the packet was intentionally absent from normal D1
materialization and this command created a standalone rehearsal copy. That
boundary no longer describes the active corpus. The frozen source locks and
the dated measurements above remain intact; active bounded retrieval is now
covered by the current release verification.
