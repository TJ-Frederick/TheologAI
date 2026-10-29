# SEC-01–05 corpus-preserving security release — review candidate

This candidate keeps the application/corpus contract of the deployed September 1
source `8fbfccfc73628918cfbcf4ca22676f2f7a0b55ab`: 35 flat works, schema 0009,
corpus `66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07`.
It retains SEC-01 input/diagnostic bounds, SEC-02 Node 22.23.4, SEC-03 hashed IP
rate limiting, SEC-04 dependency repairs, and SEC-05 isolated release tooling
and source-bound artifacts. Worker bindings and configuration match that source.

SEC-06 stays open and paused. Existing account-wide preview Worker-write access,
same-account production-data binding risk and shared coordinator are documented
preventive risks. There is no account migration, permission change, credential
rotation, billing change or production configuration change in this candidate.

## Fresh verification required

On October 27 the owner could not attest to either bound database's write history
and required fresh verification. Historical validation, custody assumptions,
matching markers and the preserved v9 preparation receipt cannot authorize this
release. The application-only path therefore reconstructs and fully validates
source locally, then compares every remote canonical cell, raw-migration
executable schema and exact ledger, physical integrity, and every FTS index. FK correctness is
proved by the independently replayed schema, clean local FK check, and complete
comparison of all child and parent cells. It is not described as a remote global
FK scan. External-content FTS is checked against its proved base content; owned
Strong's FTS content is compared completely with physical document IDs normalized.

The four exact rank-1 FTS integrity commands use diagnostic INSERT syntax. They
do not seed, migrate, restore, rebuild indexes or change application records,
but local Workerd meters four writes. They must be explicitly included in the
protected preview approval. The deployment token is D1 Read-only and cannot
execute these direct REST writes. The approved repair uses the existing local
operator's D1 write access for the complete proof, without changing that token.

The local complete counter measured about 3.30 million reads versus 10.25 million
for the old remote query; the source plan reserves 3,510,997 reads. Remote usage
may differ. Before SQL, unsampled account usage plus the whole reservation and
200,000 reads of analytics uncertainty must fit a 4,000,000-read operating ceiling,
leaving at least one million of the Free allowance for other traffic. Periodic
usage, single primary-attempt metadata, response/time limits and exact per-query
caps stop overruns. No automatic retries or cleanup follow ambiguous results.
The four writes must fit below an 80,000-write account operating ceiling.

The owner must reserve target data writes during the bounded proof window.
This is a prospective operational agreement, not a claim about past custody or
an enforced Cloudflare lease. Catalog, migration ledger and both environments'
active bindings/deployments are observed before and after. Application reads can
continue. A conflicting write invalidates the proof even if markers do not change.

Source artifacts are built without credentials. The existing protected preview
environment admits and accepts the operator's complete source-bound proof; the
operator credential remains local. Deployment still runs behind that environment.
A fresh v2 preview
receipt binds the data proof, plan, source/tree, active Worker/D1 and live audit.
Production needs its own fresh proof inside its separate approval gate; a preview
receipt is never production data authority. No successful remote proof or deployment
exists for this candidate. Stop at production approval after approved preview/live tests.

The October 28 protected attempt at `acf0a153e3195a573f03c6806b940366584f36cb`
stopped at its first schema comparison after 324 reads and zero writes. A bounded
read-only diagnosis found six table definitions with line comments omitted; all
129 application schema objects and executable SQL matched. This repair ignores
only SQL line-comment text outside quoted strings/identifiers in that initial
comparison. Other whitespace and block comments remain exact, as does the raw
before/after remote catalog check. Captured definitions and negative constraint,
FK, trigger, quoted-content and catalog-drift regressions cover the boundary.
All other data, physical, FK, FTS, quota, target and approval checks are unchanged.
The owner subsequently authorized routine corrections and resulting source
changes within the renewed cumulative budget and existing preview gates.

## Historical FTS-only diagnostic and corrected credential path

After the first FTS request failed without usable response details, the owner
approved one FTS-only diagnostic through the existing preview environment.
The first manual dispatch was rejected before any job steps or SQL: the existing
preview branch policy permits only `refs/pull/*/merge`. The diagnostic used
PR #167's normal event with both `deploy-preview` and `preview-fts-diagnostic`
labels. It waits for all normal CI/artifacts in that same run, verifies their
exact source, and selected the diagnostic instead of the full preview proof.
No branch policy or reviewer configuration changed. The protected diagnostic used the existing preview
secret and shared mutation lock, with live PR/source checks before cloud access.
Its only SQL is the fixed rank-1 `strongs_fts` integrity command; it has no Worker
upload, secret synchronization, seed, migration, rebuild or production path.

The cumulative prior total remains 3,303,879 reads spent/reserved and one diagnostic
command/write reserved. This one attempt reserves at most 4,096 additional reads
and one additional command, even if rejected or ambiguous; a day, source or run
change does not reset the totals. A separate zero-SQL observer checks controls
after the attempt. Sanitized evidence includes status, numeric provider codes,
allowlisted SQLite/authorization categories and hashes, without raw error text,
response bodies, SQL data or credential values. The diagnostic receipt is not
complete corpus verification and cannot satisfy a preview/production release
receipt. Its actual authorization rejection brought the frozen prior total to
3,307,975 reads spent/reserved and two diagnostic commands/writes reserved.

The token's D1 Read grant and the requirement for D1 Edit on direct HTTP writes
were documented before the full proof. Introducing write-classified integrity
commands without reconciling that credential was an implementation/admission
error. It is not evidence of a generic D1 FTS restriction. Complete local checks
pass; rank-1 detects damaged external-content indexes that rank-0 misses.

The owner authorized an additional full preview proof: 3,510,997 reserved reads,
3.8M hard cumulative cap and four diagnostic commands/writes, including retries.
The old ledger stays frozen; unused old allowances are not transferred. The
FTS-only route is retired. Its existing protected stage now accepts the complete
operator proof before the ordinary preview deployment and live tests. The same
receipt consumer is wired behind the existing production gate so this exact tree
can later be released without another source change. This does not dispatch or
approve production. See [the bounded handoff](OPERATOR-CORPUS-PROOF.md).

SEC-06 stays paused, permissions are unchanged, and production remains unapproved.

## Main reconciliation and restoration

The review commit is prepared as a descendant of PR #167 head
`9edf8176a7c754f9bd6b5751fc4e1dcab8615f65`, itself descended from main
`f6026ab14128d4719b0ca8b120e8d5573837d8ec`. Its tree deliberately uses the
older deployed application plus the five security fixes and fresh-proof gate.
This is an explicit temporary deferral of newer application work, including
Norton/Aquinas activation, research/formatting changes and other post-baseline
behavior. It is a larger release diff than the security changes alone and needs
review before merge or deployment. It must not be presented as an ordinary small patch
that preserves all of current main's behavior.

All newer work remains reachable through those parent commits and the original
main/PR history. Both original working directories are untouched. The separate
`release/deferred-main-paths.json` enumerates every path changed between the
deployed baseline and current main, with both Git blobs. After the security
release, restore that work through a separate reviewed PR, using the manifest
and main commit as authority; retain the SEC-01–05 changes and release gates,
then use a separately approved corpus activation. Do not blindly revert this
whole release commit, which would also remove the security fixes. A normal
main-descendant PR merge must preserve the exact preview tree/production gate.
No force push, main reset or production release is part of preparing this candidate.

## Validation evidence

October 26 baseline-backport validation passed 2,662 unit tests (five skipped),
90.84% line / 81.17% branch coverage, three integration tests, 28 Worker and 17
coordinator runtime tests, both Node transports/protocol eras, MCP conformance,
all type checks, deterministic corpus build/verification and strict advisory audit.
October 27 validation passed all 2,698 unit tests (five skipped), 90.84% line
and 81.17% branch coverage, all type checks, three integration tests, 28 Worker
and 17 coordinator runtime tests, production-profile local Workerd checks, both
compiled Node transports/protocol eras, MCP conformance, corpus verification,
the local complete counter and end-to-end source preparation. Failure tests
cover invalid approval/plan/target, changed cells/schema/ledger/FTS postings,
insufficient quota, sampled analytics, retries/replicas, unexpected writes,
read overruns, redirects/network failure and control drift. The dependency
audit passed its strict existing exception policy. Local counters and synthetic transport tests are planning
and implementation evidence, not a remote database verification receipt.

The only advisory exception is development-only GHSA-mrhx-c7xc-m3w5 beneath the
pinned Cloudflare test pool, expiring `2026-11-22T00:00:00Z`. SEC-06 is not closed
by this exception or by deploying the other fixes. Incremental changed-data
verification remains a proposal; this release only implements the unchanged
corpus/security classification and full fresh comparison.
