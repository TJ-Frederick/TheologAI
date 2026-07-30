# Norton Capacity Decision Experiment

This is a local-only, disposable capacity experiment for the reviewed
EEBO-TCP A17662 Norton translation package. It does not activate the corpus or
change a manifest, migration, runtime, binding, remote D1 database, R2 bucket,
or deployment.

Run it only with the repository-pinned Node version:

```bash
npm run audit:norton-capacity
```

The command accepts no options and emits one sanitized JSON object to stdout.
It builds every database under a temporary directory and removes that
directory on exit.

The compact, source-controlled decision record is
[`docs/evidence/norton-capacity-decision-evidence.json`](evidence/norton-capacity-decision-evidence.json).
Regenerate it under pinned Node 22 with:

```bash
npm run audit:norton-capacity:write-evidence
```

That file intentionally omits repetitive per-import D1 metadata and elapsed
times. It retains exact source, base, script, candidate, Workerd, rights,
recommendation, and hash identities.

## Decision being tested

The experiment compares three decision candidates from fresh, direct builds:

- **A — current four-copy layout:** content remains in both base tables and
  both content-bearing FTS indexes.
- **B — historical external-content FTS:** the reviewed-edition FTS index
  references its base table; the current runtime FTS layout remains unchanged.
- **C — historical and runtime external-content FTS:** both content-bearing
  FTS indexes reference their base tables.

Candidate D is deliberately lower-scope sidecar research. It omits normal
catalog, repository, service, tool, ranking-merge, and D1 release behavior, so
it is not a release candidate. There is no hybrid or R2 candidate in this
experiment.

Each A/B/C result is produced independently. B and C create their external-
content tables in an empty target before copying the pinned baseline rows;
their reported direct size therefore cannot contain dropped-table residue.
A separate mutation diagnostic copies A, drops and rebuilds indexes, and
reports pre- and post-`VACUUM` residue only to show why mutation measurements
must not be treated as direct-build capacity evidence.

## Evidence and compatibility

The experiment derives the baseline document count and corpus profile from the
pinned data manifest. It records the source commit and tree, Norton package and
authority-artifact identities, Node/SQLite/Wrangler versions, build and query
timings, database page accounting, seed bytes/import time, query metadata, and
the exact experiment-script hash. It emits both a complete canonical artifact
hash and a deterministic evidence hash whose documented domain recursively
excludes every timing key ending in `Ms` (including schema-import and FTS
rebuild/seal timings) plus engine-metadata keys ending in `Meta`.

Compatibility is checked across:

- direct boundary retrieval and pagination;
- terms, phrases, punctuation, work and creator/date filters;
- relevance and work-diversity selection;
- result limits of 1, 3, and 8;
- repository, service, and MCP tool output hashes; and
- ordered FTS results.

B and C additionally import a focused Norton fixture into separate isolated
local Workerd/D1 stores. Each proof imports seed chunks in order, rebuilds and
integrity-checks FTS, verifies direct retrieval and ordered `MATCH` results,
and records import/query timing and D1 metadata. Ordered results are compared
with a same-layout SQLite fixture containing the exact same focused corpus;
full-corpus A/B/C order is compared separately, because FTS relevance scores
depend on corpus-wide statistics. This is a compatibility proof, not a remote
D1 capacity measurement or a full release-corpus import.

Candidate C also imports a complete deterministic generated seed from the
fresh C database through a third isolated local Workerd/D1 store. It applies
the rewritten migration sequence in order, imports every base table, rebuilds
and integrity-checks all four FTS indexes, seals the experimental corpus,
checks every base-table count, and compares full-corpus Norton query order plus
the exact boundary section keys, ordinals, heading hashes, and content hashes
with the independently built fresh Candidate C SQLite database. This proves the experimental C shape can pass
that local release-seed path; it does not create a reviewed migration or
manifest identity and does not authorize release.

The mutation-residue measurements are a separate diagnostic path. They copy a
separate legacy-layout database, never mutate fresh A, B, or C, and are
explicitly excluded from the capacity decision. The compact record preserves
that isolation contract and summarizes the diagnostic deltas; the authoritative
capacity inputs remain the three fresh direct pre-`VACUUM` candidate builds.

External-content layouts use an immutable-corpus contract: seed base tables,
rebuild FTS once, run integrity checks, then seal all corpus tables against
insert, update, and delete. Incremental FTS maintenance is intentionally
unsupported under that contract.

## Capacity and rights boundaries

The 350 MiB threshold is a conservative **TheologAI project release gate** for
this decision. It is not described or used as a Cloudflare D1 platform limit,
and the experiment makes no claim about current Cloudflare quotas.

The exact authority artifact keeps the reviewed package's CC0 rights evidence.
`normalizedTextRights` remains `null` because this experiment does not make the
separate release judgment needed for a transformed, normalized-text artifact.
Migration 0006 requires its database column to contain a JSON object, so the
disposable candidates store an explicit `not_reviewed` /
`no_release_authority` compatibility marker rather than a positive rights
claim. A release transform must explicitly review and replace that marker
before the edition can become ready. The catalog metadata deliberately omits
edition-ready provenance, making accidental activation fail closed.

Measured elapsed times and engine metadata naturally vary by machine. The JSON
serialization, identities, query definitions, hash domains, and build
procedures are deterministic and auditable. The complete artifact hash covers
every emitted field except its own `completeArtifactSha256` field. The
deterministic evidence hash recursively excludes only keys named `elapsedMs`,
ending in `ElapsedMs`, or ending in `Meta`; its exact domain string is stored
beside the hash. The compact record has its own complete and deterministic
envelope hashes.

Candidate C is the provisional capacity leader because it retains the most
fresh pre-`VACUUM` headroom. It is not a final architecture or release
decision. A real migration, normalized-text rights review, manifest/transform
identity, complete release verification, and separately authorized preview
preparation/deployment remain mandatory gates.
