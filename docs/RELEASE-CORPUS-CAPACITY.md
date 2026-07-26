# Release-wide SQLite/D1 corpus capacity gate

`npm run audit:release-corpus-capacity` is the release-wide storage gate for
the SQLite corpus that is exported to D1. It is capacity tooling only: it does
not alter schema, corpus inputs, D1 bindings, a remote database, deployment,
or runtime MCP behavior.

Run it from a clean checkout with installed dependencies and Node 22:

```bash
npm run audit:release-corpus-capacity
```

The public command accepts no paths, output directories, database targets, or
baseline overrides. It builds and verifies the normal current-checkout corpus
below the operating system temporary directory, checks that the stored D1
corpus identity agrees with `data/data-manifest.json`, and removes all temporary
files. Tests alone can inject a fixture builder or baseline.

## Controlling measurement and thresholds

The controlling value is `capacity.preVacuumBytes`: the direct fresh database
size after `ANALYZE` and before `VACUUM`. `capacity.headroomBytes` is exactly
`350 MiB - capacity.preVacuumBytes`; it is negative only after a hard failure.

| Boundary | Behavior |
|---|---|
| Below 315 MiB (90%) | `within_capacity` |
| 315 MiB through 350 MiB inclusive | `warning_at_or_above_90_percent`; report succeeds |
| Above 350 MiB | `exceeds_350_mib`; command exits nonzero |

The 350 MiB ceiling is the existing conservative D1 database limit used by the
UBS and Aquinas capacity gates. The report’s `postVacuumDiagnostic` is useful
for packing analysis but is deliberately not a substitute for the controlling
pre-`VACUUM` value.

## Growth evidence and baseline

`docs/release-corpus-capacity-baseline-transform9.json` records the prior
Transform 9 release measurement. Its commit, D1 corpus identity, Node/SQLite
versions, database size, and sorted `dbstat` inventory are immutable release
evidence. The new report compares every named `dbstat` object—tables, explicit
and automatic indexes, FTS tables/shadows, and SQLite internals—against that
baseline. Added and removed objects appear with a zero value on the absent
side, so a storage change cannot disappear from the comparison.

Output contains no timestamps, temporary paths, or unordered collections. The
same checkout and SQLite build therefore produce stable, reviewable JSON.

## Transform 10 release interpretation

Transform 10 is measured through the complete normal database build, rather
than through the older Aquinas candidate-layout experiment. This makes its
3,184 authority bodies, 3,185 hierarchy nodes, and external-content FTS part
of the one release-wide SQLite/D1 measurement. Current checked-in release
evidence puts Transform 10 at 339,603,456 bytes pre-`VACUUM`: it is above the
315 MiB warning threshold but below the 350 MiB hard ceiling, leaving
27,398,144 bytes of headroom. Re-run the command with Node 22 before any
release decision because physical SQLite page packing can vary with the bundled
SQLite build.

## Operator response

At a warning, inspect `growthSinceBaseline.dbstat` (largest positive
`byteGrowth` first) and record the intended release evidence; do not use a
post-`VACUUM` result to clear it. Above 350 MiB, the command is a release block:
do not export/import a seed or deploy on the assumption that D1 will compact it.
Reduce the proposed corpus/storage scope or obtain an explicitly reviewed
capacity change, then rebuild and re-run the gate. Updating the recorded
baseline is a separate, reviewable release-record action after a successful
release; it must never be changed merely to silence a warning or failure.
