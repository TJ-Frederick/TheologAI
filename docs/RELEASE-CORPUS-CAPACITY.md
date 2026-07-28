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

The audit runs the normal full database verifier. For this one call, the
verifier defers only its duplicate early 350 MiB abort to the audit; integrity,
foreign keys, schema, row counts, corpus identity, D1 readiness, source
authority, normal hierarchy-exclusion, and language checks still run normally. The audit then
prints the complete structured capacity/growth report and returns exit 1 when
the measured database is over the ceiling. Running `data:verify-db` directly
retains its existing early size guard.

## Controlling measurement and thresholds

The controlling value is `capacity.preVacuumBytes`: the direct fresh database
size after `ANALYZE` and before `VACUUM`. `capacity.headroomBytes` is exactly
`350 MiB - capacity.preVacuumBytes`; it is negative only after a hard failure.

| Boundary | Behavior |
|---|---|
| Below 315 MiB (90%) | `within_capacity` |
| 315 MiB through 350 MiB inclusive | `warning_at_or_above_90_percent`; report succeeds |
| Above 350 MiB | Full `exceeds_350_mib` report is printed, then the command exits nonzero |

The 350 MiB ceiling is the existing conservative D1 database limit used by the
UBS and Aquinas capacity gates. The report’s `postVacuumDiagnostic` is useful
for packing analysis but is deliberately not a substitute for the controlling
pre-`VACUUM` value.

## Growth evidence and baseline

`docs/release-corpus-capacity-baseline-transform9.json` records the exact
reviewed PR95 pre-Transform-10 head
`9f8c2f16ae81bcdcf684840b91e920481c18430c`, with corpus identity
`4e182bfd2953fe06e7c8d7e13a705988e85b5a58001e7fe72440333d34f6d442`.
This is source-controlled release evidence; it does not independently claim a
remote deployment. The record includes its Node/SQLite versions, database
size, and complete sorted `dbstat` inventory. The report compares every named
`dbstat` object—tables, explicit and automatic indexes, FTS tables/shadows, and
SQLite internals—against that baseline. Added and removed objects appear with
a zero value on the absent side. Growth rows are ordered by descending byte
growth, with lexical object names breaking ties.

Every baseline and current `dbstat` row must satisfy
`bytes == pages * pageSize`. The sum of all `dbstat` pages plus
`freelistPages` must equal `pageCount` and the corresponding bytes must equal
the complete file size. A stale, truncated, or tampered baseline therefore
fails before comparison.

Output contains no timestamps, temporary paths, or unordered collections. The
same checkout and SQLite build therefore produce stable, reviewable JSON.

The `Fresh Checkout & Data` pull-request job runs this command as a
non-mutating capacity check before its generic verifier step. It builds only
below runner temporary storage, prints the warning and complete growth report,
and blocks the check above the 350 MiB ceiling. This order ensures capacity
evidence is retained before the generic verifier can issue its terse early
size error. Operators should also run the same command manually when preparing
release evidence; CI does not update the recorded baseline.

## Transform 10 release interpretation

The normal release corpus intentionally excludes all Transform-10 hierarchy
rows and Aquinas shared lineage. Its capacity is therefore measured only by
this normal-release gate. The separate
`audit:aquinas-source-pack-capacity` command starts from that verified normal
baseline and materializes the dormant packet only in a disposable copy; its
measurement is a future-capacity rehearsal, not release corpus evidence.
Re-run both commands with Node 22 before a release decision because physical
SQLite page packing can vary with the bundled SQLite build.

## Operator response

At a warning, inspect `growthSinceBaseline.dbstat` (largest positive
`byteGrowth` first) and record the intended release evidence; do not use a
post-`VACUUM` result to clear it. Above 350 MiB, the command is a release block:
do not export/import a seed or deploy on the assumption that D1 will compact it.
Reduce the proposed corpus/storage scope or obtain an explicitly reviewed
capacity change, then rebuild and re-run the gate. Updating the recorded
baseline is a separate, reviewable release-record action after a successful
release; it must never be changed merely to silence a warning or failure.
