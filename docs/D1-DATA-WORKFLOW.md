# D1 schema and corpus workflow

TheologAI treats database structure and corpus data as separate artifacts:

- `migrations/*.sql` is the tracked, reviewable D1/SQLite schema history.
- `data/data-manifest.json` identifies the tracked canonical corpus inputs.
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
key ordering from that database, and uses the schema version named by the source
manifest. It never copies schema SQL into the seed.

Each SQL file is generated in an explicit table and primary-key order. Files
target 8 MiB, and every individual statement is checked against D1's current
100,000-byte maximum. Long historical sections are assembled from smaller,
byte-validated statements. `seed-manifest.json` records, in application order:

- the source-manifest and schema hashes;
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
and verify the complete source manifest before building a replacement database.
The manifest file is itself recorded in `theologai_metadata` as
`corpus_manifest_sha256`; an existing D1 database therefore retains the previous
corpus identity until it is replaced and cut over through the authorized remote
workflow. Updating source files or the manifest does not mutate preview or
production D1.

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
continues to cover all 846,860 rows. The exact production readiness query is
separately exercised against the complete derived SQLite database.

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
npm run d1:remote:check -- --database theologai-db
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

Cloudflare's import guidance and tracked migration behavior are documented at:

- <https://developers.cloudflare.com/d1/best-practices/import-export-data/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
