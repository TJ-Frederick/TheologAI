# UBS normalized D1 internal runtime

This slice materializes the reviewed UBS/Paratext v2 generated artifact into D1
for Worker runtime use. It is internal plumbing only: it does not change the
`parallel_passages` tool, MCP resources, prompts, schemas, structured output,
Markdown, defaults, or guided workflows. A later public hard-cutover requires a
separate product contract and release review.

## Storage and identity

`migrations/0002_ubs_parallel_passages.sql` adds one source row, ordered groups,
ordered members, and reference segments. The source row stores the independently
pinned artifact root and complete reviewed provenance. The canonical D1 input
allowlist adds only `src/data/ubs-parallel-passages.generated.json`; the vendored
XML, license, metadata, and compiler remain source-inventory evidence rather than
additional materialization inputs.

The expected delta over the PR15 corpus is exactly:

- `ubs_parallel_sources`: 1
- `ubs_parallel_groups`: 2,193
- `ubs_parallel_members`: 5,266
- `ubs_parallel_segments`: 5,276
- total: 12,736 rows (859,596 total seeded rows)

Seed export is parent-first and primary-key ordered. Full import verification
reconstructs and hashes all 14 tables, verifies the artifact root, and rejects
memberless groups or segmentless members. Runtime lookup accepts at most eight
reference segments and ten complete groups, then caps reconstruction at 400
members and 800 segments.

## Runtime acceptance

The JSON-backed Node repository remains the local/stdin implementation. Its
measured cold construction cost before this slice was approximately 127 ms and
20.6 MiB; this slice must not materially regress that baseline. Workers use the
D1 repository and the Worker dependency graph must not contain
`ubs-parallel-passages.generated.json`. Acceptance requires:

- Node and D1 repositories return identical immutable complete groups and provenance;
- production-like Worker dry bundle initializes without unsafe evaluation;
- the dry bundle remains below the existing Worker upload limit and contains no
  UBS JSON module path or multi-megabyte artifact payload;
- existing public MCP protocol snapshots remain byte/shape compatible.

Record final measured Node construction and Worker raw/gzip bundle sizes in the
implementation handoff; measurements are evidence, not public performance SLOs.

Local Node 22.23.1 runs on 2026-07-11 measured 154–163 ms for file read, parse,
whole-artifact validation, and repository construction (the identical approved
repository measured 171 ms in a control worktree during the same run). Heap/RSS
deltas are allocator-sensitive and ranged around 28/63 MiB in the implementation
worktree. The preview dry bundle contained 404 inputs, measured 2,307,852 raw
bytes / 427,709 gzip bytes, and its esbuild metadata contained no UBS generated
JSON input.

## Preview replacement runbook (not authorization)

The current preview database lacks migration 0002 and the normalized rows, so a
metadata-only marker update is invalid. When separately authorized:

1. Inventory the currently bound preview database and retain it for rollback.
2. Create a uniquely named empty preview replacement in the same jurisdiction;
   do not use `--update-config`.
3. Apply the tracked 0001 and 0002 migrations in order.
4. Execute every generated seed file in `seed-manifest.json` order from the
   empty-target guard onward. If interrupted, discard the partial replacement.
5. Run the remote readiness gate and confirm exact counts, both UBS indexes,
   artifact root, source SHA, transform version, foreign keys, and integrity.
6. Update only the preview binding in a reviewable config change, pass the normal
   environment approval gate, deploy preview, and smoke-test existing public
   behavior plus the internal service.
7. Roll back by restoring the retained prior binding and its matched code/config
   revision. Do not weaken the readiness gate or delete either database during
   the verification window.

No command in this document authorizes remote creation, migration, import,
binding change, deployment, or deletion. Production requires its own later
authorization and replacement plan.
