# Norton/Aquinas corpus release candidate

This preparation-time record precedes execution. The owner subsequently authorized
publication and protected preview in PR #168; live execution receipts, not the
preparation-time statements below, determine what has actually run. Production
preparation, deployment and merge remain outside that approval.

Local candidate integrated into the existing protected PR and production workflows.
The isolated source starts at `f6026ab14128d4719b0ca8b120e8d5573837d8ec`.
The primary checkout's unpublished v9 work is preserved; its only focused edit is
four aggregate materialization hints fixing source-equivalence setup. No commit,
push, PR, remote write, binding change or deployment occurred. The authorized
read-only refresh passed at `2026-10-28T19:39:30.437Z`: 115 metadata GETs,
two read-only GraphQL calls and all 17 pinned SELECTs, costing 1,439 reads and
zero writes in 68.917 seconds. The earlier known Pages coverage refusal consumed
49 metadata GETs and no SQL. The tested corpus-only guard covers every relevant
post-database deployment using complete D1-free version histories and distinct,
non-overlapping deployment intervals. No full remote readiness proof or integrity
command has run; publication and protected preview execution remain unapproved. This is an execution plan; `docs/CURRENT-RELEASE.md` remains release
identity authority.

## Target decision and retained evidence

The owner selected **reuse the old populated preview after approved cutover**.

| Role | Database | UUID | Required state before use |
|---|---|---|---|
| Corpus preview | theologai-preview-20260728-transform11-a | 62b871a6-5b4d-4d9b-8f52-301f6c878f48 | Freshly confirmed unbound; full successor equivalence |
| Production candidate | theologai-preview-20260811-schema0009-a | 74f456e2-6951-4003-bb6f-91951342bf8f | Preview has moved to 62b; fresh unbound check; populated schema0009 baseline |
| Production rollback | theologai-production-20260811-schema0009-a | 9bc79346-338b-439e-a2a5-424f4418eb21 | Preserve database and matched Worker assignment |

Account: `0594ed1e4c9fe35ab7d9f47991e99f3e`.
The Oct 26 retained inventories identify 74f as populated (307,617,792 provider
bytes). A byte-pinned local schema0009 baseline is available at
`/private/tmp/theologai-sec0105-corpus-preserving-backport/data/theologai.db`.
An empty database is explicitly ineligible for this delta. The old Transform-11
production target 53211f50 remains the independent PR108 rollback rehearsal target.

The retained Oct 26 production pair was deployment
`244914a5-4c40-4a4e-a71e-c9a1e57038f6`, Worker #138
`8f75b4c3-fb6e-42c2-91a3-df9c1469caed` with 9bc. The retained preview pair
was deployment `ac4db27b-15c8-4108-a010-6ca144bb8b4e`, Worker
`5637c0b0-a796-4cc9-9440-bc090fd68adf` with 74f. The Oct 28 read-only refresh confirmed these exact pairs. Recapture them at
cutover; historical or compatibility evidence alone never authorizes rollback.

The Oct 18 conditional preparation receipt for 62b has SHA-256
`b802389f457c179e2302c9ea1f10285789b8b34fc215a4136b2c8268540b0c02`.
Its custody window ended. Oct 26 repeated local comparison matched all 39 table
digests, and 17 authenticated compatibility SELECTs cost 1,439 reads / zero writes.
Those dated observations identify a plausible target; they do not renew custody,
prove present bindings, or authorize replay. Never replay preparation H, terminal
insertion, rebuild, or seal against 62b on the strength of that unfinished journal.

## Small implementation

`scripts/corpus-release.ts` supplies the source proof, populated-baseline plan,
preparation execution, bounded per-operation session, exact readbacks, complete
verification, strict receipt consumer, and fixed-target D1 transport. The transport
accepts an already-authorized fetch dependency; it never discovers credentials.
The executor/session target is checked before dispatch, preventing the production
preparation path from accidentally unsealing the prepared preview target.
The session accepts the existing control/analytics producer and durable journal
callbacks. These callbacks are required operational dependencies, not optional
permission or locking systems. The thin `corpus-release-operator.ts` adapter now provides the concrete protected
workflow commands. Missing, pending, expired or wrong-target input fails before
credential access or candidate SQL. The corpus control/API adapters reuse the
existing bounded inventory/analytics algorithms without importing v9 product code.

`scripts/corpus-release-data.ts` reuses the existing delta and canonical keyset
algorithms. Exact insert readbacks derive and verify the source primary-key index
before adding `INDEXED BY`; scans still fail the query-plan guard.

Preparation admits only the exact retained populated schema0009 identity and
schema replayed from source migrations 1–9. It verifies unchanged foundation
cells locally, checks every existing historical row for update/deletion, and adds
exactly 10,134 rows. Only migration 0010 is applied. It temporarily unseals,
installs the equivalent traversal-first trigger, appends the rows, rebuilds three
historical FTS indexes, checks all four indexes at rank 1, restores the exact source
trigger, updates two identity markers, and seals. The plan batches at most 25
same-phase statements / 90 KiB per operation and performs 414 exact readbacks.
All SQL and readback cells are source-bound by the plan hash. Journals store SQL
and response hashes plus metering, never returned source bodies.

The trigger uses `traversal CROSS JOIN historical_edition_hierarchy_nodes child`
to force the existing hierarchy/parent index lookup. The final source schema and
migration inventory are unchanged; no permanent new migration/index is needed.

`scripts/audit-corpus-release.ts` uses the fixed core-eight, spine-ten, and eleven
language cases with the actual MCP SDK in both protocol eras. It checks all twelve
tools, the frozen v6/v7 contracts, 36 flat works, Norton source sections, Aquinas
nodes/resources in all four authored parts, browse continuation, search readbacks,
legacy behavior and rejected cursors. Selected resource bodies are compared with
exact source text. The traditional Supplement remains excluded; Beveridge and
Norton's 1,250 source-segment citations are preserved. No v9 discovery is enabled.

The slow local readiness SQL materializes four shared aggregates. It retains every
predicate and source authority check. Source setup now fits the unchanged 30-second
hook limit. Three existing language assertions are exported for the fixed profile.

## Why the accepted verification is sufficient under its assumptions

The newly built source runs the complete legacy semantic and historical authority
checks once locally. Remote semantic aggregate re-scans duplicate those results
when **every canonical cell and exact source schema** has been proved equal.
The 39-table proof includes all owned Strong's FTS content, not just counts or
sentinels. Keyset readers compare all columns, reject missing/extra/wrong rows,
and enforce bounded indexed source query plans. FTS physical IDs need not match.

The explicit FK witness verifies local global FK cleanliness, exact source-replayed
schema (including uniqueness, collations, and actions), and complete child/parent
coverage. This makes the additional remote global FK scan redundant. It is not a
claim that `PRAGMA foreign_keys` enforces every possible historical write.

The standalone global `PRAGMA quick_check` remains mandatory for physical database
health. Each of all four indexes then executes
`INSERT INTO index_name(index_name,rank) VALUES('integrity-check',1)`.
Rank 1 checks index/content consistency, including external-content indexes;
rank 0 misses relevant missing/orphan/position faults. Eleven negative corruption
controls are preserved as implementation tests. These commands are mutations for
budget, unknown-outcome, and authorization purposes even though healthy checks
have no intended corpus change.

The independent complete Strong's postings SHA-256 remains optional research
corroboration, not release authority. The accepted FTS witness relies on SQLite's
rank-1 integrity implementation and its checksum behavior. This is a documented
assumption, not cryptographic equivalence of every posting. Source builder/runtime
compatibility and source authority are also assumptions; the exact schema/data,
negative controls, direct content checks, and global physical check constrain them.

A proof is a single uninterrupted, owner-custodied, unbound-target run, at most
90 minutes and within one UTC allowance window. Consume it within 120 minutes.
Pin the reviewed original ten-entry preview ledger, or the nine-entry production
baseline ledger that preparation must preserve, including original timestamps.
`verifyCorpus` requires this input; it never adopts observed ledger timestamps as
its own expected baseline. Capture exact catalog, provider definitions, ten-entry ledger, bindings and source
identity before and after. Local provider fixtures are synthetic and carry no
remote/protected authority. Do not combine partial proofs across days.

## Query-plan evidence

The measured original terminal plan used the existing parent index only as
`SEARCH child ... (hierarchy_id=?)`, followed by `SCAN traversal`. It re-read the
whole hierarchy for each traversal row. Both optimized variants (with and without
source statistics) use `SCAN traversal` followed by
`SEARCH child USING COVERING INDEX idx_historical_edition_hierarchy_nodes_parent (hierarchy_id=? AND parent_node_key=?)`.
The 15 graph/order controls return the same predicate result for both definitions.
The source keyset guards also reject hidden sorts, correlated scans and materialized
joins. The singleton exact-readback fix changes `SCAN b` to a verified PK-index
`SEARCH b`; only the bounded requested-key relation may scan.

Raw measured plans and rejected alternatives are retained in
`test-output/corpus-release-feasibility-20261026/trigger-results.json`,
`verification-diagnose.json`, `readback-and-write-model.json`, and
`feasibility-summary.json`. No additional measurement was taken without an
implementation change or a specific unresolved discrepancy.

## Measurements and complete budget

All costs below are **local Workerd estimates**, not remote billing measurements.
Source database SHA-256:
`f6bb6843cf0b783cb8f4a34eb88f6988c7961e61ac7e204118cbf1793f2f18fc`.
Manifest SHA-256: `1d1110a5a693245f4daa4396e051c16d434d991f62adaec15c26e197ed88cae0`.
Successor identity: `ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1`.

| Check | Before | Focused path | Purpose / duplicated work removed |
|---|---:|---:|---|
| Terminal insertion | 10,169,724 reads / 7 writes | 29,195 / 7 | Same graph predicate; repeated child scans replaced by existing parent index seeks |
| Full old remote readiness | 12,423,152 reads in retained local D1 measurement | Complete preview proof 3,346,717 / 4 | Local semantics transferred by complete cell/schema equality |
| Separate global FK scan | 834,911 reads | explicit equivalence witness | Clean source FKs plus equal keys, collations, child/parent cells |
| Complete production proof | earlier no-statistics rehearsal 3,344,962 reads / 4 writes | final populated-baseline implementation 3,346,452 / 4 | Retained baseline statistics and engine bookkeeping are included in the final estimate |
| Global physical check | 1,694,398 reads | retained | Physical corruption cannot be inferred from semantic equality |
| Setup semantic SQL | about 1,924 seconds in failed hook | 6.7 seconds standalone; full source proof about 20 seconds | Materialize shared aggregates, same checks |
| Exact inserted-cell readbacks | singleton scan refusal | 10,134 reads in 414 queries | Force the reviewed PK index rather than relax scan guards |
| Preview live, both eras | old profiles expect 11 tools / 35 works | 69,696 reads / 0 writes, 382 HTTP exchanges | One fixed corpus-only profile, including all language cases |
| Production live, both eras | old profiles expect 11 tools / 35 works | 68,222 / 0, 382 exchanges | v6 contract retained |

The final batched implementation measured preparation plus all readbacks at
126,786 reads / 51,459 writes. This includes 464 bounded preparation operations
and 414 readback operations. The earlier unbatched preparation estimate was
115,162 reads before readbacks; the final run retains the exact baseline statistics while the earlier rehearsal
removed statistics. Migration-0010 accounting and the final production physical
proof each read 1,490 more rows. The final estimate includes this engine/statistics
overhead; its precise internal counter attribution is not part of the equivalence
proof. No source/schema/cell discrepancy remains. Use the final implementation result. Prepared data equals the
fresh source in all 39 canonical tables and restores exact application schema.
The earlier independent local rehearsal additionally matched all four full logical
postings hashes. Derived target size is about 348 MB without VACUUM; retain the
367,001,600-byte admission ceiling until fresh target metadata is checked.

| Operation | Read reservation | Write reservation |
|---|---:|---:|
| Baseline preparation plus readbacks, 74f only | 250,000 | 115,000 lifetime |
| Preview complete proof, 62b | 3,560,000 | 4,100 |
| Preview fixed live profile | 90,000 | 0 |
| Preview compatibility/control/stabilization SQL | 10,000 | 0 |
| Production complete proof, 74f | 3,560,000 | 4,100 |
| Production fixed live profile | 90,000 | 0 |
| Production compatibility/control/stabilization SQL | 10,000 | 0 |
| **Entire planned attempt** | **7,570,000** | **123,200 lifetime** |

Each proof/live/control window reserves 3,660,000 reads plus 1,000,000 production
headroom and 200,000 analytics lag reserve: 4,860,000 total. Start only if effective
account usage is at most 140,000 reads. Every individual operation rechecks
admission; a table page does not receive permission from the headline total alone.
For the owner-authorized **2026-10-29 UTC preview only**, protected input may set
`useRemainingProductionReserve:true`. At proof start the operator reserves all
3,660,000 preview reads and the unchanged 200,000 analytics margin, then fixes
production headroom at the remaining reads (at most the normal 1,000,000). It
refuses if those reservations do not fit, records the exact amount in
`corpus-budget-admission.json`, and retains that same reserve for every SQL
operation and the live profile. The owner accepts possible shared-allowance
exhaustion and production-query interruption until reset. Other UTC days and
production retain the normal reserve; verification, write ceilings, custody,
unknown-outcome controls and separate production approval are unchanged.
Preparation has its own allowance window(s); do not add its 250,000 reservation to
a full proof window. Never exceed the project operating ceiling of 80,000 writes
per UTC day. The 115,000 lifetime preparation reservation allows two write windows
if provider metering requires them. Locally measured actual writes fit one window.
Unused operation reservation is released only after a definitive metered result.
The conservative write model uses SQLite rebuild total_changes of 24,828 / 16,261 /
11,377 plus 1,024 each, four 1,025 integrity reservations, and ordinary writes:
111,090 rounded to 115,000. Appending FTS postings instead was rejected: more
lifecycle changes and 57,140 native writes despite a smaller conservative model.

SQL pacing at 500 ms gives a complete-proof floor of 27m48s for 3,336 requests;
metadata, transport and response sizing add time. Preparation's batching keeps it
878 HTTP operations including readbacks rather than 10,574 individual statements. A complete planned attempt also caps
control-plane work at thirteen full captures (including both possible preparation windows), at most 256 metadata GETs per capture,
and 96 read-only analytics requests including cached four-minute usage refreshes.
Allow at most 200 HTTP exchanges per era per live profile and 64 control SQL
requests per role within the stated read caps. This gives a ceiling of 11,902
Cloudflare/MCP exchanges for the planned path (878 preparation/readbacks + 6,672
proof SQL + 800 live + 128 control SQL + 3,328 metadata GETs + 96 analytics).
The known failed metadata attempt adds 49 exchanges, making the remaining planned
path plus observed failure 11,951 exchanges; D1 read/write reservations are unchanged.
GitHub publication/CI operations are separately approved and do not consume this
D1 row budget. A capture reaching its exchange/byte/time cap stops; it does not
expand the inventory scan silently.
The receipt's 90-minute limit is enforced. Local run timing is not a remote ETA.

## Custody, invalidation, failure and recovery

Before any candidate SQL, the named operator reserves all candidate SQL access,
pauses preparation/import jobs and candidate-targeting workflows, confirms no
running candidate job, stops local candidate clients, and records a time-bounded
owner witness identifying account/UUID/source/plan and the held write window.
All other operators acknowledge the reservation. Confirm the target is unbound
across existing complete Workers/Pages inventory tooling. Do not edit global
permissions or add a lock service. The assumption is operator exclusivity; no
provider-enforced lock or analytics ingestion watermark is claimed.

Use the existing bounded authenticated inventory/analytics tooling as session
`guard` and `usage` dependencies. Refresh usage within five minutes and apply the
maximum of observed account usage and start usage plus locally metered operations.
Keep uncertainty reserves; never subtract guessed overlap from analytics. At a UTC
rollover, restart admission from fresh account evidence. A known quota pause may
resume preparation only from a complete, durable, exact plan-prefix journal, with
fresh controls and known current-window metering. Preserve lifetime totals and
same-window prior usage in the baseline supplied to the resumed session.

Any missing response, timeout, malformed/partial response, unknown metering,
unsuccessful statement, journal failure after dispatch, or exceeded source ceiling
halts the session. It does not retry SQL, including rank-1 commands. A partial
multi-statement batch is UNKNOWN as a unit. An odd intent/completion journal cannot
resume automatically. Reconcile provider state with separately admitted read-only
checks and the existing recovery tooling; issue a new explicit recovery plan before
another mutation. Never replay terminal insertion, migration, FTS rebuild or seal
from a guessed checkpoint. If the target cannot be reconciled, abandon it and
return for a separately budgeted baseline restore/recreation decision.

A failed complete proof yields no receipt. The conservative cost of one additional
**full proof** is 3,560,000 reads / 4,100 writes in a newly admitted window; add its
role's live/control costs only if those must be repeated. Therefore one failed
proof and one replacement attempt reserve at least **11,130,000 reads / 127,300
writes lifetime**, or **11,230,000 reads / 127,300 writes** when that role's entire
live/control window is repeated. A replacement full proof reserves another 4,000 API/MCP exchanges; repeating
that role's entire live/control window instead reserves 5,500 additional exchanges.
These are contingency totals, not automatic retry authorization. No automatic retries are enabled; unused read-recovery slack
remains inside the proof ceiling. A failed preparation has no bounded full replay:
charge the actual/uncertain batch ceiling, stop, and price a concrete recovery.
No additional target is silently created.

Invalidate preparation/readiness/promotion evidence on source/manifest/plan/schema,
canonical data, provider ledger, target name/UUID, owner custody, binding or Worker
assignment change; unknown outcomes or writes; interrupted/cross-day proof;
failed integrity/control checks; or expired receipt. After approved activation,
retain the sealed corpus and fail if any write is discovered. A source rebase or
security reconciliation requires renewed source binding and appropriate reruns.

## Execution sequence and next approval boundary

1. **Read-only refresh completed.** At `2026-10-28T19:39:30.437Z`, 62b was
   unbound across the complete stable Workers/Pages inventory; its name/UUID and
   348,291,072-byte size matched the admission contract. Old populated preview
   74f remained bound to preview, at 307,617,792 bytes. Production/preview matched
   assignments remained the dated pairs above, each sole 100%. Pages production
   and preview each had seven D1-free versions; three and five post-database
   deployments respectively had distinct interval witnesses. All 17 compatibility
   projections matched the reviewed hashes, including the original ten-row ledger
   `81d15b50167e4c09d53c44553b6bb0cfe3d0d4d68c7a3e1952806c58231bb5b1`.
   Effective same-day account usage is at least 66,530 reads / zero writes:
   maximum of observed usage and starting observation plus 1,439 metered reads.
   This admits the 4,860,000-read proof/live/control/headroom envelope with 73,470
   reads remaining at observation time. Fresh job-time admission is mandatory.
   This compatibility refresh is not a complete remote readiness receipt.
   Use `reviewed-refresh.json` and the complete `control.inventory.workers`
   as assignment authority. The raw optional per-page `controls` diagnostic
   overwrites deployment IDs on later history pages and is excluded from release
   or rollback decisions; the complete validated inventory is unaffected.
2. **Separately approve publication of the focused patch and protected preview.**
   Use an isolated checkout from the committed corpus base. Do not copy primary
   v9 work. The security source/release remains independent: this candidate neither
   imports nor gates on a security backport. Later source changes invalidate
   source-bound evidence and need an appropriate fresh preview.
3. **Hold operator custody and supply protected input.** Pause every candidate SQL
   client/import/preparation job, confirm none is running, and reserve exact
   source/62b exclusively. Set the existing protected `preview` environment's
   `CORPUS_RELEASE_APPROVAL_JSON` variable only under separate remote-write
   approval. It names role/UUID, original ledger hash, owner custody-record digest,
   UTC-day allowance start, known same-window usage, expiry two to three hours
   ahead, `exclusiveCandidateSql:true` and `candidateJobsPaused:true`.
   Start with at least two hours left in the UTC day, no more than 140,000
   effective account reads (except the explicit October 29 preview headroom
   authorization above), and admission for the full 4,100-write reservation.
   Existing label/head/revocation checks, shared preview concurrency and protected
   environment approval remain intact. No new locking or permissions system exists.
4. **Execute the existing protected PR job once.** It builds the source DB, runs
   focused local tests, and uses these actual entry points:

   ~~~sh
   npx --no-install tsx scripts/corpus-release-operator.ts config --role preview --output "$RUNNER_TEMP/corpus-wrangler.toml"
   npx --no-install tsx scripts/corpus-release-operator.ts verify --role preview --output "$RUNNER_TEMP/corpus-verification.json"
   npx --no-install tsx scripts/corpus-release-operator.ts admit-activation --role preview --output "$RUNNER_TEMP/corpus-activation-admission.json"
   ~~~

   The proof confirms 62b unbound before/after and production on 9bc, pins the
   original ledger, runs all accepted checks with per-operation admission and
   fsynced intent/completion journals, and executes **four rank-1 mutations**.
   No migration, seed, rebuild or seal replay runs on 62b. Immediately before
   deployment the local consumer checks the strict receipt, unchanged custody,
   same UTC day, source commit/tree and at least 15 minutes of lease remaining.
   Only a temporary runner config selects preview 62b; production remains 9bc.
   The source binding file is unchanged. Existing secrets are inherited.
5. **Activate and test preview under that separate approval.** The existing
   Wrangler 4.114.0 action captures the real preceding Worker/74f pair and proves
   sole assignment to the approved Worker/62b. The workflow calls
   `operator.ts live --role preview` and `operator.ts create-preview-artifact`.
   One fixed corpus profile covers both protocol eras: 382 HTTP exchanges, paced
   650 ms, at most 200 per era, 30 seconds/request, 256 KiB/response,
   16 MiB aggregate, 10 minutes total, zero retries. It includes all core, spine,
   language, Norton and four-part Aquinas checks. Production controls and preview
   identity must match before/after. Existing failed/unknown-deploy observations
   stay mandatory. Private JSON has no protected provenance: production requires
   the exact successful same-repository PR workflow/deployment job, GitHub ZIP
   digest and source tree. Promotion age is seven days under sealed continuity;
   readiness itself must be consumed within 120 minutes at activation.
6. **Prepare 74f only after preview passes and under separate approval.** Freshly
   prove it unbound and pin the populated schema0009 baseline, original nine-row
   ledger, identity/seal and retained local baseline. The tested path is existing
   `checkPreparationBaseline`, `planPreparation`, `applyPreparation`.
   Do not delta-seed an empty DB. Reserve 250,000 reads / 115,000 lifetime writes
   in separate preparation window(s), with an 80,000-write daily operating ceiling.
   Resume a known quota pause only from a definitive exact journal prefix with
   fresh current-window admission. Unknown outcomes need a new recovery plan.
7. **Production keeps its separate protected approval.** Its protected input also
   requires `previewCustodyUnbroken:true` and the digest of the owner's sealed
   preview continuity record. The workflow consumes the protected preview receipt
   twice around approval, proves 74f in one new window, checks the exact current
   preview assignment before proof and immediately before deploy, consumes its
   activation receipt, then deploys the matched source/74f pair. Its fixed live
   profile, preview controls and narrow final environment isolation are mandatory.
   Production retains v6/local-only and preview v7 disabled discovery; v9 is deferred.
8. **Rollback needs separate matched-pair approval.** Capture the actual predecessor
   Worker/deployment/D1 before each cutover. Production rollback preserves 9bc and
   its captured Worker without database writes. Preview can restore its captured
   Worker/74f while 74f is unchanged. **After preparing 74f that preview rollback
   becomes invalid**: preserve proven 62b and its matching Worker or request a
   separately priced restore. No restore, recreation, automatic rollback or retry
   is included. Failed unbound targets remain unbound.

The protected workflows are locally wired and tested. The next remote-write
approval must cover the reviewed published source, protected input, four integrity
commands, preview Worker/62b cutover and fixed live profile, with the freshly
captured rollback pair. Production preparation/activation remains a later approval.

## Explicit unresolved inputs and assumptions

- The Oct 28 refresh passed. Current custody, usage and assignment evidence must
  still be recaptured by the protected job before readiness/activation; the
  compatibility refresh does not replace the complete accepted proof.
- The source is unpublished and protected inputs/operator custody are unset.
- Original 74f baseline ledger timestamps must be reviewed in its later approved
  preparation preflight. Never manufacture them or adopt them silently.
- Remote D1 cost/timing may differ from local estimates. Per-operation ceilings
  stop discrepancies and do not authorize expanded work. Rank-1 integrity relies
  on SQLite checksum behavior, not cryptographic equivalence of every posting.
- Exclusivity and sealed-preview continuity are owner procedures. There is no
  global lock or atomic analytics watermark. Unknown outcomes invalidate evidence.
- Failed 74f restore/recreation needs a concrete, separately priced plan after
  state reconciliation. Default: stop with production 9bc and preview 62b intact.

## Local validation commands

Use Node 22.23.1 (the installed system Node 26 cannot load the current native
better-sqlite3 binary). From this candidate folder:

```sh
THEOLOGAI_LOCAL_BASELINE=/private/tmp/theologai-sec0105-corpus-preserving-backport/data/theologai.db /opt/homebrew/opt/node@22/bin/node node_modules/vitest/vitest.mjs run test/unit/scripts/corpusRelease*.test.ts --maxWorkers=1 --no-file-parallelism
/opt/homebrew/opt/node@22/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.release-scripts.json
/opt/homebrew/opt/node@22/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.corpus-release-test.json
```

The two populated-baseline tests explicitly skip when the retained local baseline
is not supplied; all release validation reported here supplied it. The 30-second
source setup hook remains unchanged. Full proof tests have explicit 120-second
local-test deadlines because they scan the complete corpus; this does not change
the production proof's 90-minute policy or the setup timeout.

Validation covers the full native source-data proof through the actual workflow
driver/D1 transport, exact ledger pinning, activation receipt consumption, eleven
FTS corruption controls, graph/order controls, both-era live profiles, populated
preparation/readbacks, protected provenance and workflow/reconciliation guards.
Final counts and logs accompany this execution package. The earlier proof passed
all 53 original source-equivalence tests and eight existing readiness cases.
Node, Worker, release-script and relevant test TypeScript checks pass. General CI
passes without a prebuilt DB; protected preview explicitly builds it before full
cases. The full unrelated unit suite and a remote protected run were not executed.

## Publication dependency prerequisite

The initial hosted core job stopped at the existing dependency audit. The focused
repair updates dependency pins/lockfile and their compatibility tests, without
copying the security application backport or changing the Node version. Wrangler
4.114.0, measurement Miniflare 4.20260722.0 and better-sqlite3 12.6.2 remain fixed.
The Worker test pool uses 0.20.0 with Zod 4.6.7; the required audit reports zero
vulnerabilities. The SDK update uses an explicit redirect-follow option only in
the known-public-redirect compatibility test. Production transport policy and
bindings are unchanged. Existing guard tests now follow the single corpus profile.

Post-repair validation passed all 40 corpus cases, all 63 repaired guard/compatibility
cases, 26 Worker-runtime cases and relevant types. Exact preparation, verification
and both-era live costs are unchanged; the original D1 reservations stand.
