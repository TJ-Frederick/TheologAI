# D1 schema and corpus workflow

TheologAI treats database structure and corpus data as separate artifacts:

- `migrations/*.sql` is the tracked, reviewable D1/SQLite schema history.
- `data/data-manifest.json` inventories every tracked canonical source and
  separately declares the inputs consumed by the D1 materialization.
- `data/theologai.db` is an ignored, reproducible local SQLite build artifact.
- `scripts/d1-seed/` is an ignored, reproducible D1 bulk-seed artifact.

Do not put the corpus into a migration. Migrations version structure; the seed
loads a complete corpus into a new, empty database.

## Build and verify locally

Requirements are Node 22, the project dependencies, and the `sqlite3` command.

```bash
npm run data:verify-sources
npm run build:db
npm run data:verify-db
npm run d1:seed:export
npm run d1:seed:verify
npm run d1:seed:verify-import
npm run d1:seed:verify-workerd
```

The exporter creates `scripts/d1-seed/`. It refuses to overwrite a non-empty
seed directory. After inspecting an old artifact, replace it explicitly:

```bash
npm run d1:seed:export -- --clean
```

For a separately built database, pass exactly one explicit `.db` path:

```bash
npm run d1:seed:export -- --database /absolute/path/to/corpus.db --clean
```

The exporter is read-only with respect to its source database. It verifies the
canonical source checksums and database row counts, derives columns and primary
key ordering from that database, and uses the ordered migration set named by the
source manifest. It never copies migration SQL into the seed.

Each SQL file is generated in an explicit table and primary-key order. Files
target 8 MiB, and every individual statement is checked against D1's current
100,000-byte maximum. Long historical sections are assembled from smaller,
byte-validated statements. `seed-manifest.json` records, in application order:

- the full source-inventory hash, scoped D1 materialization identity, and ordered migration hashes;
- every seed file's SHA-256 and byte size;
- statement and inserted-row counts;
- the D1 statement and target-file limits used by the exporter; and
- aggregate counts.

These limits were checked against the Cloudflare D1 limits documentation on
2026-07-09. Re-check the official limit before changing the constants in
`scripts/d1-seed-utils.ts`:
<https://developers.cloudflare.com/d1/platform/limits/>.

The seed SQL and generated seed manifest are intentionally ignored by Git. The
tracked exporter, verifier, canonical source manifest, schema migrations, and
this runbook are the reproducibility contract.

### Corpus revisions and deployed metadata

When a canonical source changes, update its checksum in `data/data-manifest.json`
and verify the complete source inventory. `materializations.d1.inputs` is the
explicit allowlist of files read by `scripts/build-database.ts`. The build fails
if it reads an undeclared source or leaves a declared D1 input unused.

`theologai_metadata.corpus_manifest_sha256` stores a canonical D1 materialization
identity, despite the legacy column name. The identity covers the D1 identity and
transform versions, schema version plus every ordered migration path/checksum,
sorted D1 input paths/checksums, and sorted
expected table counts. The generated UBS parallel-passage artifact is now a D1
input; the smaller curated legacy parallel corpus remains Worker-bundled and is
not a D1 input. The seed manifest records the full inventory
hash separately for provenance. Changing a non-D1 source therefore does not
claim that D1 changed; changing any D1 input or materialization contract still
blocks deployment until the corresponding database is prepared.

For preview, a later deployment built from the revised manifest will remain
blocked by the read-only readiness gate until a separately authorized preview
replacement is seeded and bound. Production remains on its existing database and
deployment until its own approved replacement/cutover; no production change is
implied by a local corpus revision.

The two import verifiers are complementary: `verify-import` reconstructs every
row and compares deterministic table hashes with the source SQLite database;
`verify-workerd` applies complete metadata/document/FTS chunks plus a generated
chunk of every large table through Wrangler's isolated local D1 runtime. This
keeps the D1 syntax/runtime check practical while the full semantic verifier
continues to cover all 859,596 rows, including the exact 12,736-row normalized
UBS delta. The exact production readiness query is
separately exercised against the complete derived SQLite database.

### Readiness compatibility and rollback

The deploy readiness query requires the current schema and corpus identity
markers, including `theologai_metadata`, in addition to integrity, foreign-key,
index, column-signature, and exact manifest-count checks. A predecessor D1
database that predates those markers cannot pass the current readiness gate,
even if its older application revision previously used it successfully.

Rollback therefore has three distinct forms:

- **Code-only:** restore a known-good Worker revision while retaining the
  active compatible D1 binding, then run that revision's normal readiness check.
- **Data-binding:** bind a retained, independently verified compatible D1
  database while keeping application code constant; readiness must pass before
  deployment.
- **Combined:** when a predecessor database lacks the current schema or
  identity markers, restore the matched earlier application/config/workflow
  revision and database, or prepare a new compatible replacement. Do not weaken
  the readiness query for rollback convenience.

Before claiming a rollback target is available, confirm its Cloudflare
retention, exact Worker revision, and readiness compatibility through a
read-only inventory/check. If retention or compatibility has not been verified,
document the target as candidate/unverified. Database deletion remains a later,
separately authorized operation after the retention window and rollback review.

## Optional local D1 rehearsal

Wrangler defaults D1 commands to local state, but specify `--local` explicitly
in operational commands. Apply the tracked schema first, then the generated
seed files in manifest order. Do not use shell glob order as a substitute for
the order in `seed-manifest.json`.

```bash
npx wrangler d1 migrations apply THEOLOGAI_DB --local
npm run d1:seed:verify
```

Then execute each manifest-listed SQL file against the local binding:

```bash
npx wrangler d1 execute THEOLOGAI_DB --local --file=scripts/d1-seed/00-empty-target-check-000.sql
# Continue with each remaining file in seed-manifest.json order.
```

The first seed file deliberately fails unless all corpus and FTS tables are
empty. Normal inserts also omit conflict suppression, so duplicate or partial
loads fail visibly instead of silently producing mixed corpora. If an import is
interrupted, discard the local target, recreate it, and restart from an empty
database.

## Remote application is separately authorized

Generating or verifying a seed does **not** authorize a remote Cloudflare
operation. Applying migrations, seeding data, replacing a database binding, or
deploying a Worker is a separate operational step that requires explicit user
approval and an identified preview or production target.

Before a full remote seed:

1. Verify `data/data-manifest.json`, the SQLite database, and the generated seed.
2. Name the exact Cloudflare environment and D1 database being changed.
3. Confirm that the target is new or that every corpus and FTS table is empty.
4. Apply tracked migrations with an explicit `--remote` and environment.
5. Execute seed files in `seed-manifest.json` order, again with explicit
   `--remote` and environment flags.
6. Compare remote table counts with the manifest before deploying application
   code that depends on the corpus.

### Fresh-database replacement and cutover

Create each replacement under a unique name and match the current database's
location or jurisdiction. Do not use `--update-config`: leave the deployed
Worker bound to the known-good database while the replacement is prepared.
After recording the old binding for rollback, edit only the local environment's
`database_name` and `database_id` in `wrangler.toml`. This local edit does not
change the deployed Worker. Apply migrations and execute every seed file, in
manifest order, through that environment binding, then validate the same
binding before committing or deploying it:

```bash
npx wrangler d1 migrations apply THEOLOGAI_DB --remote --env preview
# Execute every manifest-listed seed file with --remote --env preview.
npm run d1:remote:check -- --database THEOLOGAI_DB --env preview
```

If any migration or seed import fails or is interrupted, do not resume against
that partial database. Give the next empty replacement a new name and restart
from migration application. Preserve the previously bound database through the
cutover and initial verification window; rollback is restoring its name and ID
in `wrangler.toml` and redeploying through the normal approval gate. Database
creation, binding edits, rollback deployments, and eventual deletion remain
separately authorized operations.

Approved deploy jobs perform the last compatibility check read-only:

```bash
npm run d1:remote:check -- --database THEOLOGAI_DB
npm run d1:remote:check -- --database THEOLOGAI_DB --env preview
```

The check requires normal Wrangler Cloudflare credentials and verifies database
integrity, foreign keys, schema/corpus identity markers, required column
signatures, exact manifest row counts, and the indexes required by runtime query
paths. It does not apply migrations, import data, or deploy code. Remote
databases created before the `theologai_metadata` marker must be rebuilt and
cut over through a separately approved operation; do not bypass the gate.

Never apply a full seed to a populated database. The seed is not an incremental
upsert or repair mechanism. Future corpus revisions need either a new empty D1
database followed by a binding cutover, or a separately designed and reviewed
incremental data migration.

### Biblical-language Unicode correction (transform 4)

The transform-4 corpus repairs a bounded historical UTF-8 decoding failure in
the pinned biblical-language artifacts. The machine-readable correction ledger
is `data/biblical-languages/UNICODE-CORRECTION.json`. It records exactly 246
source cells: 9 Strong's fields and 237 morphology fields. D1 materializes 255
changed cells because the 9 Strong's corrections are also copied into the
external-content `strongs_fts` table; morphology contributes the same 237
cells. The only correction that is not a U+FFFD replacement repair is the
source-attested John 1:1 position 11 restoration from `τὸ` to `τὸν` (lemma
`ὁ`, Strong's `G3588`, morphology `T-ASM`).

The verifier requires all of the following before a seed can be accepted:

- exact 9 + 237 ledger membership and the 45-artifact change boundary;
- portable content-identity reproduction of the corrected 72-artifact language
  inventory from the exact OpenScriptures and STEPBible pins (canonical
  decompressed JSON for gzip artifacts; raw SHA-256 for uncompressed files);
- reverse projection of every ledger cell to all 45 predecessor artifact
  content identities and the predecessor content-inventory identity; raw gzip
  hashes remain diagnostic because zlib containers vary across platforms;
- no U+FFFD in the Strong's or morphology textual fields;
- unchanged row counts, schema `0002_ubs_parallel_passages`, and D1 identity
  version 1; and
- transform version 4 with scoped D1 identity
  `652245709aaed181345b0cf17f0091471ac3a3e323f6ae84cfd73a5d8b409c51`.

This is a data-changing transition, not a metadata-only transition. Prepare a
fresh empty D1, apply the existing two migrations, import the complete seed,
and pass the full readiness gate before any binding or deployment change. The
matched rollback is the predecessor Worker/config revision together with its
transform-3 database identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`.
Do not pair transform-4 code with that database, marker-update it in place, or
claim a retained remote database as a rollback target without a fresh read-only
inventory. Local preparation does not authorize creating a remote D1, changing
Wrangler bindings, or deploying either environment.

### One-time legacy identity transition

Databases seeded before scoped D1 identities contain the full source-manifest
hash. A reviewed release may transition only that metadata row after deterministic
table-hash comparison proves the old and new D1 materializations equivalent.
This is a remote production/preview write and always requires explicit owner
authorization naming the environment, database, and exact hashes. It must never
run automatically from a deploy job.

Forward template (replace placeholders only after review):

```sql
UPDATE theologai_metadata
SET value = '<NEW_SCOPED_D1_SHA256>'
WHERE key = 'corpus_manifest_sha256'
  AND value = '<EXPECTED_LEGACY_SHA256>';
SELECT changes() AS changed_rows;
```

Require `changed_rows = 1`, then run the new read-only readiness check before
deployment. If rollback to a release whose gate expects the legacy identity is
required, obtain separate authorization and run the inverse conditional update:

```sql
UPDATE theologai_metadata
SET value = '<EXPECTED_LEGACY_SHA256>'
WHERE key = 'corpus_manifest_sha256'
  AND value = '<NEW_SCOPED_D1_SHA256>';
SELECT changes() AS changed_rows;
```

The current reviewed transition is from
`0e5f19341d99fc9ec18f3a45b0ce019ed78d1fd40478997bde8fdee94a02ca55`
to `118844cc76b2c091ca60f88d890c3253bbcefd15cad416d03bce3d0af0f4e0ad`.
Do not copy either value to another database without independently proving its
current marker and corpus equivalence.

The subsequent Hebrew-lemma materialization is intentionally **not** a
metadata-only transition. D1 materialization transform version 3 joins blank
TAHOT Hebrew token lemmas to exact, tracked TBESH Strong's identities and has
scoped identity
`91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5`.
Its immediate transform-version-2 predecessor is
`961615b1da2ea26609e289d30d3bf000de5b2ea0f3542ffd01cb7ffe852d38ee`.
Because morphology rows change between those identities, prepare a freshly
migrated and fully seeded database and run the complete readiness gate; never
advance an older database to the new identity by updating only
`theologai_metadata`.

### Original-language usage foundation (transform 5)

Migration `0003_original_language_usage.sql` adds the canonical occurrence
order and deterministic Strong's usage, book, and exact surface-token variant
aggregates. This is another full data materialization: prepare a fresh database
rather than applying the migration to a populated transform-4 database. The
schema, semantics, exact counts and identity, keyset behavior, verification
contract, and measured storage/import impact are recorded in
[`ORIGINAL-LANGUAGE-USAGE-FOUNDATION.md`](ORIGINAL-LANGUAGE-USAGE-FOUNDATION.md).

The aggregate “form” dimension is exact source `word_text`; it deliberately
does not remove punctuation, accents, breathing marks, or cantillation. Public
output must preserve that caveat or introduce a separately reviewed linguistic
normalization layer.

Cloudflare's import guidance and tracked migration behavior are documented at:

- <https://developers.cloudflare.com/d1/best-practices/import-export-data/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
