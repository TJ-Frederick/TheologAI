# Norton/Aquinas successor candidate

Local implementation from reviewed main `328168d5b817e9eaa0e702de382adc2c46c858ef`. This succeeds frozen PR #168 without changing its source or evidence. The existing security release and current dependencies, runtime floor, input limits, protected environments, shared preview concurrency and native operator-artifact bridge remain intact. Broader v9/CCEL execution and SEC-06 stay deferred. `CURRENT-RELEASE.md` remains assignment authority; this document grants no remote authority.

The local candidate has twelve tools, 36 flat historical works, Norton’s 1,250 preserved source segments and a separate Aquinas hierarchy: 3,184 direct bodies / 3,185 nodes, four authored parts through Tertia Q90, excluding the Supplement. The current deployed corpus is schema0009 with 35 flat works / eleven tools. No deployed assignment is changed by this candidate.

## Fixed targets and source

| Role | Target UUID | Procedure |
|---|---|---|
| Preview | `62b871a6-5b4d-4d9b-8f52-301f6c878f48` | Complete fresh proof only; never replay seed, terminal insertion, migration, rebuild or seal |
| Later production candidate | `74f456e2-6951-4003-bb6f-91951342bf8f` | Reuse the old populated preview only after approved preview cutover, fresh unbound evidence and separate preparation approval |
| Production rollback | `9bc79346-338b-439e-a2a5-424f4418eb21` | Preserve its database and freshly captured matching Worker |

Account `0594ed1e4c9fe35ab7d9f47991e99f3e`. Target names and UUIDs are closed in `.github/scripts/norton-aquinas-policy.cjs`; no substitute or empty delta target is accepted. Operation-local Wrangler configs select the approved pair; root bindings are unchanged.

Candidate source DB SHA-256: `f6bb6843cf0b783cb8f4a34eb88f6988c7961e61ac7e204118cbf1793f2f18fc`.
Corpus identity: `ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1`; schema `0010_active_aquinas_hierarchy_publication`. The declaration pins the exact reviewed activation blob map and baseline. Producer and consumer bind source commit/tree, source-plan bytes, database bytes, policy, target, budget, FK witness and original migration ledger timestamps.

The old byte-pinned schema0009 baseline is no longer available. The replacement retained PR172 native source DB is `0712d1a61f84a979019d471f0da1447100dab512b5385dcf52cc1738ca447c7c`, identified by native plan digest `dd42daacdc18740a6fcf77d045f0aa80395fd331e29ba22b4d08d12b587375f9`. `release/schema0009-baseline.json` pins its exact catalog and all 39 canonical table digests. Preparation checks all of them, source-replayed schema, global FK cleanliness and physical health before deriving the delta; physical-file hash substitution alone cannot authorize it. Remote original nine-row ledger timestamps still require an explicitly reviewed witness.

## Correctness and measured costs

Accepted verification remains complete: all 39 canonical tables (1,635,226 rows), exact raw schema/provider catalog, original ten-entry ledger, explicit clean-local-FK/schema/all-child-parent-cell witness, standalone global `quick_check`, and rank-1 integrity on **all four** FTS indexes. The independent Strong’s postings hash is optional. Eleven negative corruption controls and fifteen graph/order controls remain. No sampled shortcut or multi-day stitched proof is permitted.

Rank-1 checks rely on SQLite’s integrity implementation/checksum semantics, not cryptographic equality of each posting. Source correctness, compatible SQLite semantics, owner-exclusive data writes and sealed continuity are documented assumptions. Analytics has no ingestion watermark or provider-enforced reservation lock. Exact cells/schema, authority checks, corruption controls, direct live body comparisons and the physical check constrain those assumptions.

| Work | Earlier measurement | Actual successor local implementation |
|---|---:|---:|
| Expensive terminal trigger | 10,169,724 reads / 7 writes | 29,195 / 7 |
| Baseline preparation + exact readbacks | 126,786 / 51,459 excluding preflight | **127,124 / 51,459 including four preflight queries**; 882 requests |
| Complete accepted proof | 3,346,717 / 4; older paging | **3,332,195 / 4**; 3,337 SQL requests |
| Both-era preview live | same corpus profile | **69,696 / 0**; 382 HTTP / 370 checks |
| Both-era production live | same corpus profile | **68,222 / 0**; 382 HTTP / 370 checks |

These are local Native/Workerd estimates, not Cloudflare billing or current quota observations. The preparation difference is exactly 338 preflight reads. Current main’s owned-FTS rowid paging explains the proof implementation change; no source-cell/schema discrepancy remains. Do not repeat measurements without an implementation change or demonstrated discrepancy.

The temporary traversal-first trigger uses `CROSS JOIN` and the existing `(hierarchy_id,parent_node_key)` index: the old child scan becomes a parent-key seek. Restore the exact original trigger before sealing; no new permanent index/migration is needed. Exact inserted-cell readbacks use verified PK-index seeks rather than singleton full scans. Local semantic checks run once; full remote canonical/schema equality transfers their results. The separate remote FK scan is redundant under the explicit witness. Physical health and four rank-1 checks remain independent mandatory work.

## Complete proposed budget

| Operation | Reserved reads | Reserved writes |
|---|---:|---:|
| Populated 74f baseline preparation/readback | 250,000 | 115,000 lifetime; 80,000/day |
| Preview complete proof, 62b | 3,560,000 | 4 |
| Preview live / compatibility and controls | 90,000 / 10,000 | 0 |
| Production complete proof, 74f | 3,560,000 | 4 |
| Production live / compatibility and controls | 90,000 / 10,000 | 0 |
| **Successful complete path** | **7,570,000** | **115,008 lifetime** |

The corpus proof reservation and hard cap are both 3,560,000, narrower than the generic 3.8M cap. Full source planning ceiling is 3,544,615; the generic 3,510,997 reservation is inadequate and is rejected. Each proof retains another 100,000 for live/controls throughout producer/consumer handoff. Proofs cannot borrow it. Four integrity commands reserve exactly four writes; older 4,100-write proof estimates remain historical evidence.

Normal operation uses a 4,000,000 account-read ceiling plus the required 200,000 analytics uncertainty inside that ceiling: a complete preview/proof reservation of 3,660,000 requires effective starting usage at most **140,000**. The old October29 headroom waiver is expired and is not reused. There is no present quota admission. Preparation’s full reservation and a full proof do not fit together in that ceiling; complete preparation, then separately admit one whole proof, after reset if necessary. No multi-day verification scheme is introduced.

Full captures are bounded to 120 seconds and at most 256 control exchanges, including at most two fixed token self-verification GETs only after a preview authorization failure. SQL has zero retries, 500ms minimum start spacing, bounded primary results and per-operation source ceilings. Proof ceiling: 5,000 SQL requests, 90 minutes and one UTC day; activation requires at least 15 minutes of remaining challenge authority. Live ceiling: 200 HTTP per era (400 total), 650ms spacing, ten minutes total, 30 seconds/request, 256KiB/response, 16MiB aggregate. The exact normal corpus profile uses 382 exchanges.

An incomplete/failed proof keeps its entire 3,560,000-read reservation and four diagnostic writes outstanding; its 100,000 live/control reservation is retained too. A separately authorized replacement full role window adds **3,660,000 reads / four writes**, making the whole-path contingency **11,230,000 reads /115,012 writes**. No retry is implicitly authorized. Failed preparation has no bounded replay: retain actual or uncertain operation ceilings, stop, reconcile the exact durable journal and price a separate recovery. Never replay an unknown batch or manufacture a completed-prefix receipt.

## Protected execution procedure

1. Publish the successor PR without `deploy-preview`; ordinary unprivileged CI, review and exact source freezing precede any cloud access. Keep the frozen original and unpublished v9 workspace intact. Hold merge and Cloudflare activity for the coordinator’s review.
2. Under fresh bounded authority, verify the existing preview credential’s complete Worker/Pages access, current assignments, target metadata, shared workflow status and account usage. The historic preview token was account token `dac2ed85288c21310268159147e942dc`, named **TheologAI Preview GitHub**; this is dated identity, not proof of current secret contents or permissions. If Pages denies access, the existing transport records sanitized route/status and at most two fixed self-verification requests, then stops before SQL. Do not submit the historical unsaved browser edit or inspect production credentials. Minimum Pages Read correction, if still needed, requires the applicable current approval.
3. Use the standard operator v2 owner-manifest/challenge/native-artifact procedure already in `pr.yml`. The preview deployment secret stays read-only for D1. The existing separately authenticated local operator executes only the four exact rank-1 commands through the standard bridge. No deployment-token D1 Write expansion or new release flow is needed. No authentication is initiated by local tests.
4. Renew owner custody for this exact source/62b: stop local candidate clients/import jobs, pause candidate-write workflows, confirm the shared preview mutation group is idle, and record that no other host/person/job writes during the same-day proof/activation window. Owner manifest requires `exclusiveDataWritesDuringWindow:true`, `candidateWriteJobsPaused:true`, original ledger hash, exact run/attempt/source/plan and expiry. These procedural controls are not a new locking system.
5. Existing protected GitHub approval, label/head/revocation checks and shared concurrency remain mandatory. Native owner authorization and ledger marker must be unique. The protected job emits the closed source plan/challenge; the operator proves four commands with fsynced intent/result and persistent reservation; the native bridge returns exact protected artifact evidence. The protected read token then proves every cell/schema/physical check. Fresh complete unbound Workers/Pages inventories before/after and before acceptance must match. No candidate SQL is permitted before complete admission. Use the workflow’s generated full TOML for metadata/reconciliation; upload only the rendered Worker JSON.
6. After strict receipt acceptance, the same protected job captures the exact current predecessor Worker/deployment/74f and verifies preview cutover to the approved Worker/62b. It runs edge stabilization, one both-era corpus/live profile and final identity/production-control/isolation checks. Both eras retain current security protections; production v6/local-only and preview v7 disabled discovery contracts stay distinct. Artifacts contain metadata/hashes only. Local JSON does not replace native protected provenance.
7. Return successful preview evidence and **one separate production approval package**. No 74f preparation, production mutation or production deployment is covered by preview authority. Preparation requires fresh unbound/populated-baseline/original-nine-ledger evidence and the source-bound preparation plan. Production subsequently needs its own owner manifest, complete proof, protected approval, exact same-tree preview provenance and live checks.

## Failure, rollback and invalidation

Any dispatched request without a definitive bounded primary result, malformed/partial response, retry metadata, unknown metering, journal failure, changed control/target/source, exceeded budget or expired authority stops the session. Preserve the whole reservation and journal. Do not auto-retry or continue a partial proof, even for read-only or integrity commands. Recovery is a separately approved exact bounded check, not another release attempt.

Invalidate receipts on changed source/tree/plan/database bytes/schema/canonical cells/provider ledger/target, expired or cross-day custody, unapproved writes, changed binding/Worker, partial proof, unmatched journal intent or failed controls. After approved activation, preserve sealed continuity and the exact matched Worker. No analytics sample or retained marker renews authority.

Preview rollback is the freshly captured preceding Worker with unchanged 74f, using the existing protected reviewed rollback procedure under separate authority. Do not prepare 74f until preview is accepted: preparing it invalidates that old preview rollback pair. Production rollback preserves freshly captured production Worker with 9bc; no database restore is included. Unknown routing outcome requires read-only reconciliation, not blind deployment replay.

Unresolved remote inputs: current token/Pages capability, operator credential availability, account usage and workflow exclusivity, present assignments/unbound target metadata, original remote ledgers, owner custody and actual remote timing/metering. All remain explicit approval/admission inputs, not local-test claims. No Cloudflare, credential, quota, SQL, binding or deployment operations occurred during the November3 local rebaseline.

## Preserve application releases and finish the release operationally

The source selector has exactly two routes. If the closed Norton declaration exists, its complete checked-source/blob classification must pass; the coexisting historical application declaration must remain unchanged. Invalid or removed Norton identity cannot fall back to an application proof: the original application classifier rejects the activated data/schema/runtime delta. Without the Norton declaration, only a source that passes the established application classifier selects application policy. The source-plan digest/classification, owner package, challenge, complete receipt, workflow output and promotion receipt must agree before provider access.

The original application grant/challenge shapes, 3,510,997-read reservation and 3.8M hard cap remain supported. Bound-target application verification retains its original targets and controls; the Norton 3.56M/100K/unbound checks are exclusive to activation. Exact release-tooling filename exceptions are added to the application classifier for the shared selector's dependencies; product/data exemptions and application identity are unchanged. Original application fixtures exercise both real CLI handoffs. The original fixed application audits remain policy-gated alongside the corpus-only both-era suite.

A successful production cutover is not operational completion until a separate reviewed source rebaseline makes routine application releases usable against the new bound corpus. Minimum completion work: capture the already-proved source and matched assignments; update the existing application declaration/baseline/security blob witnesses and schema/corpus/target constants to schema0010 and preview62b/production74f; make checked-in bindings describe that same proved pair; retire the one-shot Norton declaration; and pin the twelve-tool/36-work/separate-hierarchy audit contract for bound application updates. Advance the application reservation to cover the measured 3,544,615 planning ceiling, retain a reviewed live/control reserve, and keep the 3.8M hard cap or a separately reviewed narrower cap. Validate the bound application producer/operator/reader/receipt/live path locally before accepting that completion change. The original schema0009 reservation cannot silently carry forward: it is 33,618 reads too small.

Use reviewed commits to establish the binding/corpus baseline before pointing the existing application declaration at that commit; do not derive a new baseline automatically from provider observations. This completion work is a required dependency of the later production approval package, not authority to change bindings, merge or deploy now. Future application updates use the bound application route, never the one-shot unbound Norton route. No generalized release framework is introduced.
