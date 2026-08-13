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

Transform 12 uses the Candidate C lifecycle: seed canonical base tables,
which contain zero Norton rows; populate the
unchanged content-bearing Strong's FTS once, rebuild the three external-content
indexes once, integrity-check all four FTS indexes, then insert the corpus seal.
The converted historical indexes do not have body-bearing `*_fts_content`
tables. A sealed database rejects later mutation of all four FTS base tables;
an interrupted or partial import must be discarded and replayed from empty.

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
continues to cover every row declared by the generated canonical seed manifest
(currently 1,630,260 rows across 49 ordered files, with zero Norton rows),
including the normalized UBS corpus and original-language
usage aggregates. The exact production readiness query is separately exercised
against the complete derived SQLite database.

For the reviewed Transform-9 historical source packs, readiness also runs a
separate read-only authority audit. It regenerates the approved 1/8/8/25/512
pack/work/edition/artifact/section inventory from checksum-bound source inputs,
then reads direct normalized section bodies in ordered eight-row pages. A
separate compact projection audit proves every selected edition/profile,
canonical identity, document section, edition FTS row, and runtime
`sections_fts` row agree. This catches an extra normalized section even when it
has no delivery profile, as well as projection or FTS drift. It performs no
remote fetch and does not authorize a migration, binding, or deployment.

The separate disposable Norton Transform-12 audit regenerates the exact pinned
A17662 package and reads all 1,250 authority bodies in exactly 157 ordered
eight-body pages. It proves every authority field, full FTS MATCH coverage,
pending rights, dormant cursor identity, temporary seed reconstruction, and
zero public/runtime projection in copied SQLite and isolated Workerd databases.
The command accepts no arguments, cannot write the canonical seed, and refuses
remote D1. It does not authorize canonical materialization, activation, or
deployment.

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

### Schema-0009 preview-release preparation record

The reviewed pre-release baseline is commit
`e1baa04fecbb066860d06f262142e3450823b7d0`, tree
`673af4a75c770c541a8be3c84e77d8f91033bd07`. Both schema-`0009` candidates
were prepared and audited while unbound. The preview candidate is
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`); the separately prepared production
candidate is `9bc79346-338b-439e-a2a5-424f4418eb21` and is not this release's
binding target.

The deterministic seed identity was manifest
`ecbd23bb3c692665c7031a8c1fa7733e17a56fbc7e3a167ba4011f6c1cca62d8`, sourced
from data manifest `14e30a32f316f1c7a954a9641f7d1b8bd6608d8e0f4bdc2eaba4c565f472f83d`,
with D1 materialization identity
`66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07` and
migration-`0009` identity
`989dd945ac633ecb1ba83cc80a1b88234cac31d78b3d905ae0242eb66c533eb3`. It
contained 49 ordered files, 1,630,260 rows, and 177,923,082 bytes. Each
candidate passed the read-only readiness plus Transform-8 and Transform-9
authority audits with 60 tables, 307,617,792 bytes, 35 documents, 4,111
sections, zero `historical_sectioned_publications` rows, and one corpus seal.

This commit changes only the checked-in preview binding. It does not bind or
deploy either Worker, change the root production binding, or activate the
production candidate. Its protected preview workflow writes a minimal
sanitized readiness receipt with independently hashable readiness and authority
outcomes, then captures and compares production deployment, Worker, and D1
identities against the checked-in production D1 name/UUID and fresh inventory.
It re-proves that control immediately after deployment and after the final
preview audit; any drift blocks release evidence.

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
4. Use the checked-in candidate-preparation orchestrator. It resolves the
   candidate from a fresh Cloudflare inventory by both exact name and UUID,
   generates a temporary non-deployable preview-only Wrangler config pinned to
   that one D1 binding and this repository's migrations directory, then applies
   migrations, the manifest-ordered seed, and read-only readiness through that
   same config.
5. Compare remote table counts with the manifest before deploying application
   code that depends on the corpus.

### Fresh-database replacement and cutover

Create each replacement under a unique name and match the current database's
location or jurisdiction. Do not use `--update-config`: leave the deployed
Worker bound to the known-good database while the replacement is prepared.
Record the old binding for rollback, then use the candidate orchestrator. This
prepares the target without changing the deployed Worker or the checked-in
binding:

```bash
CANDIDATE_D1_NAME='theologai-preview-YYYYMMDD-unique-suffix'
CANDIDATE_D1_ID='exact-cloudflare-d1-uuid-in-canonical-lowercase'
npm run d1:preview:candidate:prepare -- \
  --remote \
  --candidate-d1-name "$CANDIDATE_D1_NAME" \
  --candidate-d1-id "$CANDIDATE_D1_ID" \
  --confirm-candidate-d1-name "$CANDIDATE_D1_NAME" \
  --confirm-candidate-d1-id "$CANDIDATE_D1_ID"
```

`d1:preview:candidate:prepare` is intentionally a preview-only command. It
accepts no environment, config, deploy, binding, delete, retry, resume, or
repair override. The candidate name and **canonical lowercase UUID** are each
repeated byte-for-byte. Before any mutating target SQL it validates the
reviewed seed manifest and a fresh inventory in which that name/UUID pair occurs
exactly once, rejects the D1 currently in the checked-in preview binding, then
issues one read-only `sqlite_schema` preflight through the generated binding.
“Pristine” is deliberately conservative: the result must be either no
non-`sqlite_*` schema objects or exactly one table named `_cf_KV` with no
migration state. The latter is Cloudflare's empty-D1 housekeeping table; it is
the only exception, with exact spelling, case, type, and cardinality. Any other
table, migration ledger, index, trigger, view, FTS shadow table, duplicate, or
extra object causes refusal before migrations. It then creates an owner-only
temporary config whose only D1 binding is `THEOLOGAI_DB` to the resolved
candidate; its Worker entrypoint intentionally does not exist and it declares
neither routes nor Workers.dev exposure. Migration application, every
manifest-listed seed file, and all readiness/authority queries address that
binding through the same config. The checked-in `wrangler.toml` remains
unchanged.

The old `d1:seed:apply-preview` script is now an internal helper rather than an
operational entrypoint; it refuses a direct remote invocation. Do not recreate
the former three-command sequence with hand-written `wrangler` calls.

Failures are intentionally classified differently:

- **Pre-mutation resolution failure:** local manifest/config validation, the
  read-only D1 inventory, or the pristine-schema preflight cannot prove one
  exact candidate name/UUID pair and empty target. No migration or seed command
  was issued, so the candidate is untouched apart from the read-only preflight.
  Correct the local invocation or resolution evidence before starting again.
- **Partial-target failure:** a migration or seed command fails after target
  SQL may have begun. Do not retry, resume, repair, bind, or deploy that
  candidate. Abandon it and begin again only with a new empty D1 target and
  explicit authorization.
- **Post-seed readiness failure:** the candidate is not ready for binding or
  deployment. Do not repair or retry it in place; preserve the diagnostics and
  use a separately approved replacement plan.

Only after readiness passes should a reviewed PR change the local preview
`database_name` and `database_id` to that prepared target. The protected
workflow re-maps that checked-in ID/name through a read-only D1 inventory,
re-runs readiness by exact name, records whether the candidate changes the D1
binding, and only then permits a Worker deploy. The generic release workflow
also supports a same-D1 code-only release; Transform-9 freshness is enforced by
the current readiness contract, which a predecessor lacking migration `0006`
cannot satisfy. If any migration or seed import fails or is interrupted, do not
resume against that partial database. The orchestrator stops at the first
failed phase and intentionally has no retry, resume, checkpoint, repair,
binding, or deployment mode. Abandon the partial target, give the next empty
replacement a new name, and restart only under the next approved
candidate-preparation operation.
Preserve the previously bound database through the cutover and initial
verification window; rollback is restoring its name and ID in `wrangler.toml`
and redeploying through the normal approval gate. Database creation, binding
edits, rollback deployments, and eventual deletion remain separately authorized
operations.

### Future production candidates

`npm run d1:production:candidate:prepare` is the production-only preparation
path. It requires a literal `--remote`, a fresh
`theologai-production-YYYYMMDD-suffix` name with a real calendar date, the
exact canonical UUID, and both repeated confirmations. It resolves that exact
pair through `d1 list`, requires its authoritative `created_at` timestamp to
be within the bounded fresh-candidate window, rejects the active checked-in
production binding, creates a temporary no-deploy configuration, and verifies
the checked-in migration/source/seed identity before any target SQL command.

Run it from a checked-out revision whose root production binding still names
the active predecessor; it deliberately refuses a candidate that is already
the checked-in root binding. The binding update belongs to the later reviewed
cutover change, after preparation evidence is retained.

It then permits exactly one pristine-schema preflight, one migration pass, one
manifest-ordered pass through every deterministic seed file, and the complete
read-only readiness check. The readiness check includes the Transform-8 and
Transform-9 authority audits plus the Transform-10 inactive-hierarchy
lineage, profile/artifact, topology, and FTS integrity checks derived from the
checked-in corpus identity. A failure after migration or seed SQL may have
started is terminal for that candidate: do not retry, resume, repair, bind,
deploy, or reuse it. Create a new candidate under a separately authorized
operation instead.

This preparer does not change `wrangler.toml`, a Worker binding, deployment,
or database inventory. It does mutate only the separately named, unbound
production candidate corpus: migrations and deterministic seed files are
applied there after the pristine-target guard passes. It never mutates the
active/bound production corpus. The PR #101 candidate is older retained
rollback history:
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`) was unbound when its one-use operation
completed with 49/49 seed files, 1,627,474 rows, schema `0008`, corpus identity
`c43bfa2f5e7ff04c3641a228092bdc91d597edc60dc7d596507e8ca6c0ac90fe`,
remote readiness `ready`, passed Transform-8/9 authority audits, and satisfied
Transform-10 normal-corpus exclusion predicates proving hierarchy, publication,
and Aquinas-lineage rows empty. The preparer ran from the predecessor-bound
revision. PR #101 subsequently merged as
`e2d351a11fce9c2cb1f72add0bcf365332737f3c`, and protected production workflow
`30401732957` proved the candidate binding before and after its black-box
audits. That PR #101 production assignment—deployment
`71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`)—is older retained rollback history.
The retained PR #101 preview
predecessor was deployment `070b292b-0bae-400a-b983-3d72157b5a96`, Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), and D1
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). That former Transform-11 preview
binding is historical. The current preview baseline is PR #123 deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (#144), and schema-`0009` D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). Its same-D1 PR #122 predecessor was
deployment `13393917-fa91-4afc-aeaf-2809db6701a2`, Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe` (#142). The checked-out Transform-10 Aquinas
hierarchy remains local-only and unpublished, with no catalog, runtime, or MCP
projection. Future production workflows retain the same reconciliation
contract: re-resolve the checked-in candidate name/UUID, rerun readiness by
exact name, record the predecessor Worker/D1 identity, and refuse to start
black-box audits unless the sole active deployed Worker is bound to the
readiness-tested candidate.

PR #107's replacement preview candidate
`theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`) was prepared unbound from the exact
reviewed 49-file, 1,630,259-row schema-`0008` seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and the complete
Transform-11 source-pack authority audit (`1/1/1/1/1/1/133/17` pages) passed.
An authorized read-only audit rerun followed one transient Cloudflare
authentication failure; migration and seed application were not retried,
resumed, or repaired. Protected preview deployment
`5e812152-355b-4a5f-a123-2485e89f1550` now serves Worker
`06b9a603-8339-42b6-a246-ef9238563043` (#140) with that exact D1; this preview
assignment remained unchanged during the later PR #108 production release.

The historical checked-in root production binding selected the separately prepared,
initially unbound Transform-11 candidate
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). It was created once in ENAM from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f`, exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`, and the exact reviewed 49-file,
1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed. Do not
retry, resume, repair, re-seed, or directly mutate this prepared database.
Protected workflow `30496350408` later deployed merge
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` as deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), bound to that exact D1.
Historical core passed 8/8, Transform-11 spine passed 10/10,
original-language passed 11/11, primary-source edge stabilization matched on
attempt 4 and remained stable, and independent post-release review returned
`SHIP`. For this schema-`0009` cutover, the exact PR #108 pair is the
immediately preceding primary rollback unit: deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). PR #101 remains older rollback
history only and is not the immediate cutover rollback claim.

PR #122 promoted the separately prepared schema-`0009` candidate
`theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`). Protected workflow `31631924636`
deployed Worker `02174f95-abe2-480b-84bf-3e8c1a3a0320` through deployment
`e62698f3-f6b0-4145-97bf-28abdeae0e3a`. It emitted the sanitized readiness
receipt, proved preview unchanged before deployment, after deployment, and
after every production audit, pinned the final production Worker to the exact
audited identity, and emitted the final receipt proving the distinct exact
schema-`0009` preview/production bindings against fresh inventory. The PR #108
pair above is retained as the immediate matched rollback unit.

Approved deploy jobs perform the last compatibility check read-only against
the candidate name resolved from the checked-in name/UUID pair:

```bash
npm run d1:remote:check -- --database "$candidate_d1_name"
npm run d1:remote:check -- --database "$candidate_d1_name" --env preview
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

### Historical primary-source catalog scope (transform 6)

Transform 6 persists the reviewed 17-work catalog manifest into
`documents.metadata.catalog`. Its companion provenance manifest is also a
checksum-pinned D1 input and must map every materialized creator/date field to
an authoritative source review. Stable metadata provenance IDs are persisted
with each catalog object; no source-page content is imported. It changes
materialized rows and the scoped D1
identity; it is not eligible for a metadata-marker-only transition. The exact
manifest, conservative creator-role rules, filter semantics, readiness checks,
and identity are recorded in
[`PRIMARY-SOURCE-CATALOG-SCOPE.md`](PRIMARY-SOURCE-CATALOG-SCOPE.md).

Cloudflare's import guidance and tracked migration behavior are documented at:

- <https://developers.cloudflare.com/d1/best-practices/import-export-data/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
