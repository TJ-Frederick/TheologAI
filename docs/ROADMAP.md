# TheologAI roadmap

This is the tracked source of truth for delivery status and sequencing. The
ignored [dated architecture and roadmap assessment](../test-output/ARCHITECTURE_AND_ROADMAP_ASSESSMENT.md)
is local source context only and does not define the current product contract.

## Shipped baseline

- **Phases 1–2 / PR #10:** MCP architecture and release-pipeline hardening,
  merged as `71a3f0d120ffd31c09424ba2a7caef88961d21e3`.
- **Phase 3 cleanup / PR #11:** current roadmap, honest public documentation,
  explicit deployment configuration, and source-granularity guardrails, merged
  as `3122843298b2dca5684c4544f21b9146f98a28bc`.
- **Structured-output foundation / PR #12:** provenance primitives plus
  structured results for Bible and Strong's lookup, merged as
  `0cbe9ec044fcf3189e14f508f276017a810934ef`.
- **UBS compiler / PR #13:** pinned UBS/Paratext source, license and provenance,
  deterministic compiler, generated-artifact verifier, and regression tests,
  merged as `4e02564531351f4a2de61d95dcebfd0dfd06d404`.
- **Phase 3 research foundations / PR #21:** bounded inactive CCEL provider
  architecture, D1 materialization identity, exact Strong's identities, local
  primary-source research, normalized UBS runtime and public cutover, and
  contextual original-language study, merged as
  `639d0a02c1c666340f0e2ee3bcb4b4d5a336d9fb`.
- **Phase 3 evidence follow-up / PR #26:** pinned biblical-language source
  reproduction plus structured primary-source evidence handoff, merged as
  `65db03e8cd02098064a748f96cca8da22c974381`.
- **Biblical-language Unicode correction / PR #27:** pinned-source Unicode
  corrections and exact generated-artifact reproduction, merged as
  `7b4e6c72182901ff77b5d175132a72d260e0418e`.
- **Integrated Phase 3 research output / PR #34:** original-language usage,
  catalog-aware local primary-source research, structured morphology, compound
  gloss resolution, and release-contract repairs, merged as
  `ce335266d989b40afebe398aeb39dbd2082d926a` after protected preview audit.
- **Phase 3 production binding / PR #39:** reviewed transform-version-6
  production binding and release records, merged as
  `2412ee4031b8bbef16f359879d4a8a4884a6e053` and deployed through the protected
  production workflow.
- **Commentary coverage correction / PR #40:** source-specific scalar identity,
  fail-closed section coverage, official content-shape parsing, and aligned
  public guidance, reviewed at `32441d99de673eccce0a57fd74801fb94db04944`
  and merged as `9f6aa128eeab663ef04a315ab0c14b8ae9a3376d`.
- **Release-record reconciliation / PRs #41–#42:** recorded the reviewed Phase
  3 production correction and reconciled the shipped structured-output train,
  merged as `7dc6ef9d6e0f3b76ff10384a2b3f6fed94270ef4` and
  `e9eb7a71088518040a2467d654b73e6470d064dd`.
- **Dormant CCEL parser hardening / PR #43:** standards-based, fail-closed
  parsing with strict request, result, snippet, URL, and resource budgets;
  public schemas and all rollout flags remained unchanged, merged as
  `2009b3ae41433af4a207f2c917c41238112c570c`.
- **CCEL coordinator stages A–B / PRs #44–#45:** created the dedicated
  non-public global-budget owner, then wired dormant public clients behind a
  separate coordinator flag; the dedicated owner gained no public route or
  `workers.dev` target, and no live CCEL request was enabled, merged as
  `6752480895421d290c4c3f95a1cb4130b8115f24` and
  `1377648c01593b848f625c056187530de2086832`.
- **Modern CCEL discovery contract / PRs #46–#47:** added the bounded v4
  primary-source contract behind three gates, then exposed only that contract
  in preview while leaving live search and coordinator execution disabled;
  production remains v3/local-only, merged as
  `1b13d5958d32835c3821498dfad52236cd5f3069` and
  `a763eac9df51727dae97a03d53a6b853128c0ca4`.
- **Honest UBS result window / PR #48:** `parallel_passages` structured schema
  v2 reports whether one private lookahead group was directly observed without
  returning, reconstructing, or enriching it, merged as
  `ccb2db182f61a6dd15df29aa270666425c1b70b4`.
- **Structured cross references / PR #35:** bounded, provenance-bearing v1
  output for `bible_cross_references`, merged as
  `d9b24eb2b7045b8d156b90be185c399a661c6f40`.
- **Structured donation configuration / PR #36:** conservative v1 public
  configuration output, merged as
  `551b599a12f4844915504ba5529066a1bbff7797`.
- **Structured donation verification / PR #38:** fail-closed v1 transaction
  evidence and coverage output, merged as
  `1d7369b1c232e9469abe5475d8e5f77cd22c9f13`.
- **Structured commentary / PR #37:** provider-evidenced coverage identity,
  rights and delivery provenance, and bounded v1 output, merged as
  `d395b3641eb00f6826eaba670c287f9a39dfa3da`.
- **Bounded parallel-text enrichment / PR #50:** fixed-budget text scheduling,
  bounded excerpts, per-target outcome identity, and executable remote audit,
  merged as `16e633bc70dbbea668caacf87f994a2536441092` and released through the
  protected production workflow.
- **Canonical custom domains / PR #51:** infrastructure-only canonical website
  and MCP routing with legacy compatibility aliases retained, merged as
  `989fe5a7cdb04823c46085289dd8653741e394f5` from reviewed source
  `01570c78289cd5a5aafa652fa8da1f9ea936a506`. Merge evidence alone does not establish a runtime deployment.
- **Classic-text structured output / PR #52:** bounded, storage-validated v1
  output for the curated local collection, merged as
  `9250bbd393ed99530e52ee656eee11fb8e841c7e` from reviewed source culminating
  in `ec2ae6480f372d2b8869592e51c199c66894508a`. Merge evidence alone does not establish a runtime deployment.
- **TBESH Meaning suppression / PR #53:** withheld the Online-Bible-derived
  Hebrew `Meaning` field while preserving safely sourced identity, form,
  morphology, lemma, and brief-gloss evidence, merged as
  `5588a1fdf2e4d8a4203aba0bba3eb3cdc205837e`.
- **Guarded CCEL readiness / PR #54:** shipped the protected operator and
  release architecture inertly, with production flags `000` and no live CCEL
  request, merged as `c3f4b8df82104eb7a32002e2ed820026a1d6dc4c`.
- **Guided CCEL date fallback / PR #55:** kept hosted-local date bounds exact,
  made the single guided external query explicitly unbounded by date, and
  added search-and-synthesis warnings. Production remained at flags `000` and
  made zero live CCEL calls; merged as
  `671a0f3fd632358f001dd5ac8e1721e32c09d39e`.
- **Catalog-capacity prerequisite / PR #56:** centralized the existing
  100-work and 2,000-section ceilings and replaced variable D1 scope binds
  with one JSON/`json_each` bind, without changing the hosted corpus or public
  behavior; merged as `427748f637a66b9faed05994c08d2d90209e186a`.
- **Protected CCEL secret workflow / PR #57:** shipped separate protected
  staging and promotion paths for the operator secret, but did not provision
  that secret, enable execution, or make a live CCEL request; merged as
  `38b9ad4940cb77e7672ac330662bfdbba82888a9`.
- **Historical section-key foundation / PR #58:** added the migration-free
  plan, verifier, and workflow guards needed to identify ambiguous legacy
  locators. PR #58 itself did not add a migration or change D1; a later owner
  decision approves its existing source-first targets for a future migration.
  It merged as `36daf0d6fa29b0354c8c83b11a5bc46b1ea2854b`.
- **UBS Hebrew semantics foundation / PR #59:** added source-free contracts,
  synthetic fixtures, capacity gates, and a non-executable draft schema. It
  did not vendor UBS artifacts, add migration `0004`, advance transform 7,
  change D1, or register semantic MCP behavior; merged as
  `f0c9e8a5f24f6164a4ebba74b53910a0049d3f81`. Required exact-head CI passed.
  Protected preview run `29566989144` successfully deployed Worker
  `cc0b798d-37ee-4438-8ff9-c7fffd21263f`; preview deployment authorization was
  then removed and verified revoked. Protected production run `29568524548`
  successfully deployed Worker `afaa3361-df99-4b38-9597-c9076e29ac83`.
- **Roadmap reconciliation / PR #60:** recorded the PR #56–#59 status,
  approved cursor direction, and bounded CCEL excerpt policy in this tracked
  roadmap only, merged as
  `552043fdfb6efd1f34990167fa5dd3c7fb48092c`. It changed no runtime,
  source, migration, or D1 state, but its normal protected production run
  `29574373701` deployed Worker `7affe60a-90e5-4588-9711-83ad589fbf51`
  against the existing production D1.
- **UBS semantic draft-contract hardening / PR #61:** corrected inactive,
  source-free semantic identity, result-window, cursor, evidence, alignment,
  Unicode, and byte-bound contracts, merged as
  `4add86f6453fb82d96426fb3b858d4a96be58c9c`. It did not vendor semantic
  artifacts, add migration `0004`, advance transform 7, alter D1, or register
  semantic MCP behavior. Its normal protected production run `29575501471`
  deployed the behaviorally inactive code as Worker
  `9faca1e3-0d64-4927-befc-d702e0d17707` against the existing production D1.
- **Edition-provenance foundation / PR #62:** added strict source-free work and
  edition rights/provenance contracts and adversarial checks, merged as
  `315ddb73d99bb8c93993344588ce74db12559d56`. It did not acquire corpus
  bytes, alter D1, or register a runtime surface. Its normal protected
  production run `29576509796` deployed the behaviorally inactive code as
  Worker `baecc989-5d88-4281-98d0-43c30465f6da` against the existing
  production D1.
- **Inactive Hebrew semantic-resolution seam / PR #63:** added the source-free,
  unregistered, trusted-alignment seam and its complete-evidence guards, merged
  as `e781a419f7d6c4ad9c403bc0dc83671d8d91bd88`. It did not activate a
  semantic provider, vendor source artifacts, add a migration, or change MCP
  behavior. Its normal protected production run `29578634873` deployed the
  behaviorally inactive code as Worker
  `96adff83-dd42-4604-b253-f135dbb7120c` against the existing production D1.
- **Inactive UBS semantic aggregate / PR #64:** added a source-free,
  unregistered aggregate contract, merged as
  `e20132f63cf22fa54d3a4821807efbce93879ae8`. This is a foundation only, not
  a public feature or deployment: it did not add semantic artifacts, migration
  `0004`, transform 7, D1 rows, runtime wiring, or an MCP surface.
  Its GitHub deployment record `5490679777` moved from waiting to error when
  production run `29587993437` was cancelled before protected approval; the
  run had no steps, no Worker was deployed, and no Worker version was created.
- **Primary-source output hard cutover / PR #65:** released the same-tree
  production-v4/local-only and preview-v5/discovery-only profiles without a
  new tool, corpus body, or live CCEL execution, merged as
  `2af3c206b9d537a8bf9d29cad535db9664e9556e`. Protected production run
  `29596472550` deployed Worker `7453b578-08db-4c3e-a5e4-43ba38fc0abf` against
  the existing production D1 and passed its post-deployment black-box audit.
- **Server-validated parallel-passage cursor / PR #66:** released the v4
  continuation cursor hard cutover, including UBS-only continuation behavior
  and rejection of legacy/OpenBible controls with a cursor, merged as
  `b26bc518722733503e3601c4dee147e77ecae3b9`. Protected production run
  `29602026367` deployed Worker `59cd1385-8635-4823-9b7e-add61e01ecbe` against
  the existing production D1 and passed its post-deployment compatibility
  audit.
- **Inactive original-language-study v2 contract / PR #67:** added only
  synthetic fixtures and test-scoped draft contract/design checks, merged as
  `3480a8d42f3ad0cefcc181c7fae837a5d5ae3c9a`. It is not compiled or registered
  by either runtime, carries no source bytes, and changes no schema, migration,
  D1, Worker, or public MCP behavior. GitHub deployment record `5494097938`
  moved from waiting to error when automatic production run `29605213950` was
  cancelled before protected approval; the run had no deploy step and created
  no Worker version. Production remained on
  `59cd1385-8635-4823-9b7e-add61e01ecbe`.
- **Release-ledger reconciliation / PR #68:** documented the completed Phase 3
  releases through PR #67 only. It changed no runtime, corpus, D1, Worker, or
  deployment state, merged as
  `1ae5842747a5f4e14ce871fd3e45273f1e5e6e59`. Its automatic production run
  `29610768745` was cancelled with zero steps; no Worker was deployed.
- **Durable inactive-study guard / PR #69:** strengthened the test-only,
  synthetic `original_language_study` v2 packet guard. It does not change a
  public tool, prompt, resource, source artifact, migration, D1, or Worker,
  merged as `403cdfe9ad7564c1dab4e885d692899f7f9714fe`. Its automatic
  production run `29609784254` was cancelled with zero steps; no Worker was
  deployed.
- **Bounded parallel-passage cursor repair / PR #70:** repaired finite
  chapter-boundary parsing and Node/D1 continuation-cursor validation, then
  updated the guided workflow. Protected preview run `29618447214` deployed
  Worker `42ca956c-bf0b-46bf-bdcc-df0c56ef3eb5`; protected production run
  `29619813297` deployed Worker `e5a7db48-776c-460d-9309-d7d5a96d8f26`.
  The two production audits passed 22/22 and 11/11 assertions. It adds no new
  corpus, migration, or semantic UBS contract, merged as
  `ee9dd8fc65d7c97b46c63f22872b83d970e0fe2f`.
- **EEBO-TCP Norton acquisition / PR #71:** acquired and byte-locked the CC0
  1561 Norton translation source plus a normalization report and Gate 1
  evidence. It is not in SQLite, D1, the historical catalog, a resource, or
  an MCP response. The future bounded `sectioned_only` publication remains
  transform 9, not a present feature, merged as
  `f6888fc4dbee03a3ccdd20411d284318ea22a21b`.
- **Legacy production-host migration / PR #72:** established the current
  known-good remote baseline. It redirects the production
  `theologai.tjfrederick.workers.dev` host to `mcp.theologai.xyz` for ordinary
  requests (while preserving CORS preflight behavior); the exact documented
  abusive-poller IP-plus-user-agent tuple is rejected instead of redirected.
  The preview `workers.dev` host remains a direct compatibility endpoint.
  Protected deployment and audit produced
  production Worker `762485da-9e02-46a0-9777-e0d8743b9dbf` and preview Worker
  `8ed4ad1a-f45f-4cdc-a6de-5358f59b6d44`. The primary-source MCP contract is
  production v4/local-only and preview v5/discovery-only, with CCEL execution
  disabled in both environments. Merged as
  `72a8ee5eef9b909a373b085d1a4f193484ddfe8a`.
- **Historical compatibility evidence / PR #73:** checked in a source-first
  alias decision and ordering evidence only. It does not create migration
  `0005`, transform 8, rows, runtime behavior, or a deployment, merged as
  `7303f4cdaeab9061a8c0b956af56300df5657f34`.
- **Unsupported npm distribution / PR #74:** set `package.json` to
  `private: true` and recorded that npm publication and `npm pack` are not
  supported distribution paths, merged as
  `2190d5af8b3d04dd115a36758ae18d3335ca11ec`.
- **Pinned UBS Hebrew acquisition / PR #75:** vendored the approved two
  English UBS Hebrew v0.9.2 artifacts and notices under the conservative
  CC BY-SA policy, with acquisition verification. The packet remains absent
  from D1, runtime composition, MCP schemas, resources, and output; migration
  `0004` and transform 7 are still separately gated, merged as
  `cd1a72e7fdd00dec365952b71b770f03db42d4ed`.
- **CCEL canary observability / PR #76:** improved audit evidence for the
  separately gated live-preview path without enabling a provider request,
  merged as `a5fa03185661c4cf09c90c2544e79169efdcd7ab`.
- **Source-first compatibility compiler / PR #77:** prepared deterministic
  compatibility compilation against the approved aliases, without migration
  `0005`, transform 8, D1 changes, runtime registration, or deployment,
  merged as `ba171c0b2247aef55b92398546180770ddcaffc5`.
- **Norton sectioned-delivery preparation / PR #78:** prepared a bounded
  `sectioned_only` transform-9 contract for the acquired Norton source. It
  emits no catalog record, SQLite/D1 row, resource, or MCP output, merged as
  `bf59fa3b1ab19d5243ce1c5ee7bb08095badbf08`.
- **UBS Hebrew U2 preparation / PR #79:** added raw decoding and
  coordinate-attestation evidence for the acquired packet. Its semantic
  candidates remain inactive and unregistered; it does not add migration
  `0004`, transform 7, D1 data, or MCP behavior, merged as
  `a4b1a27f7acfce9ebd1432ca6db03a8df124a05c`.
- **Additional public-domain source preparation / PR #80:** acquired the
  approved Calvin, Aquinas III questions 73–83, and Augustine source packets
  with provenance/normalization evidence. They are not locally published,
  seeded, indexed, or exposed. Cyril remains blocked with zero normalized or
  published output pending reliable translator attribution, merged as
  `6c0ab39052864a3fc1f0628f98d10491fa431719`.
- **CCEL legacy body-reader retirement / PR #81:** removed the unreachable
  body-reading service and adapter. The bounded discovery adapter and its
  safeguards remain, but live execution is still separately gated; no CCEL
  body is fetched, mirrored, stored, or republished, merged as
  `abd1c39ffd37f121e5871e64c6b11bcd10d8d3c8`.

These entries describe merged repository state. Deployment state is established
only by the relevant protected workflow and post-deployment smoke evidence; a
merge or this roadmap is not evidence that preview or production was deployed.
No merge after PR #72 through `6c0ab39052864a3fc1f0628f98d10491fa431719`
was deployed: production remains the PR #72 Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and preview remains the PR #72 Worker
`8ed4ad1a-f45f-4cdc-a6de-5358f59b6d44`.

## Shipped Phase 3 release train

The following component slices were integrated, reviewed, and shipped through
PR #21. Their stacked PRs #14–#20 are closed as superseded review vehicles:

1. **PR #14 — bounded CCEL search adapter.** Defensive live-search transport,
   rights notices, budgets, caching, circuit behavior, and feature gates. The
   adapter was retained as inactive future-provider architecture and was not
   advertised or reachable through the production public MCP schema shipped by
   PR #21. Preview later exposed a non-executing v4 contract through PR #47.
2. **PR #15 — D1 materialization identity.** Distinguishes schema compatibility
   from the exact materialized corpus. Production was cut over to a freshly
   materialized replacement rather than mutating the predecessor database.
3. **PR #16 — exact Strong's identities.** Preserves canonical and extended
   OpenScriptures/STEPBible identifiers without lossy four-digit coercion.
4. **PR #17 — local primary-source research.** Adds the bounded
   `primary_source_search` query-plan workflow and resolvable local result
   locators. External discovery remains future work.
5. **PR #18 — UBS runtime foundation.** Adds strict repositories, provenance,
   source integrity, and source-attested parallel-group domain contracts.
6. **PR #19 — UBS D1 materialization.** Adds deterministic relational export,
   import verification, readiness identity, and Worker repository support.
7. **PR #20 — public UBS cutover.** Makes complete source-attested UBS groups the
   unconditional default, with bounded structured output. Legacy curated edges
   and OpenBible.info evidence remain available only through explicit separate
   selectors; raw UBS alignment is opt-in.
8. **Integrated language-study slice.** Added `original_language_study`, a
   context-first workflow for one token in one verse, with morphology,
   source-separated lexical evidence, provenance, and interpretive limits.

The server advertises eleven tools and six guided prompts. All eleven tools
have versioned structured contracts while retaining Markdown compatibility.
`classic_text_lookup` preserves its four existing modes while adding explicit
bounded result windows. Its catalog is a metadata summary of the complete local
work inventory, with unsized structured locators, no body reads, and no native
catalog links. Directly selected work and search resources retain exact UTF-8
sizes; section directories use unsized locators and cap native links at 32.

Before the hosted inventory reaches 100 works or a work reaches 2,000 sections,
explicitly revisit the current complete-result contracts. The v1 implementation
fails above either ceiling and must not silently truncate or introduce
pagination under its complete-inventory semantics.

The structured-output release ledger is:

- PR #35: production run `29436689148`, deployment `5461346778`, Worker
  `24da1fd6-7a99-447e-86d4-17571d901b09`; coordinator 9/9 and independent
  10/10 audits, with no findings.
- PR #36: production run `29441298979`, deployment `5462262765`, Worker
  `b10427f0-9692-45ec-9089-e3027be58805`; coordinator 7/7 and independent
  23/23 audits, with no findings.
- PR #38: production run `29448002771`, deployment `5463551874`, Worker
  `e0371eb4-05c6-4415-b479-b01ac2630be0`; coordinator 11/11 and independent
  94/94 audits, with no findings.
- PR #37: production run `29451333738`, deployment `5464194228`, Worker
  `9d2b757b-8b9b-4318-b09d-14f62815bf82`; coordinator 73/73 and independent
  91/91 audits, with no P0-P3 findings.

Each release retained production D1 `theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`), passed strict readiness as `ready`,
and performed zero readiness writes. Live CCEL discovery remains intentionally
disabled; only preview exposes its non-executing v4 contract.

PR #47's exposure-only preview audit recorded 91 fresh requests and 126
assertions with no P0–P3 findings; its production control recorded 38 requests
and 70 assertions with no P0–P3 findings. PR #48's preview audit recorded 30
fresh requests and 73/73 assertions, and its production audit recorded 16
fresh-session requests and 65/65 assertions, all with no P0–P3 findings. The
production audit confirmed the parallel-passage v2 sentinels and exact preview
parity except for the intended preview-v4/production-v3 primary-source delta;
it made no CCEL request, chain RPC, limiter probe, or mutation.

PR #50 protected production run `29527760541` and GitHub deployment
`5479150556` produced Cloudflare deployment
`5822242e-d0bf-43a9-bbbc-0ec7d6edd180` and the production Worker above at
100%. Its targeted text audit passed 44/44 assertions, protocol/inventory/CCEL
passed 9/9, and HTTP/CORS/negotiation/under-budget rate behavior passed 19/19:
72/72 total with no P0-P3 findings. Production retained rate namespace
`361201` at 120/60 and preview retained namespace `361202`; no D1 binding or
CCEL flag changed.

## Shipped Unicode correction release

PR #27 corrects pinned-source Unicode artifacts in the biblical-language corpus
without broadening the interpretation contract. Its exact-source and generated-
artifact reproduction checks passed. A fresh transform-version-4 D1 database
passed the complete readiness contract before protected production deployment.

The release preserves eleven advertised tools, six guided prompts, local-only
primary-source evidence, disabled CCEL discovery, and the existing public MCP
contracts. Preview has passed the targeted Unicode audit across all nine
corrected Strong's entries, 237 corrected morphology cells, and 11 affected
parallel-passage cases, plus sampled checks of the remaining MCP surface.
Production then passed the corresponding bounded post-deployment audit.

## Shipped integrated Phase 3 release

The integrated release replays the reviewed original-language usage and
catalog-aware primary-source work onto the PR #27 production baseline. Its four
core feature commits are `2c2a29a`, `eccfad4`, `1b95201`, and `2506413`; the
release also requires the downstream Unicode-manifest preservation fix
`a1c9da3` and source-lock synchronization `e8282c3`. It adds schema
`0003_original_language_usage`, occurrence and distribution evidence with
keyset pagination, progressive original-language output levels, and curated
catalog scope for primary-source research. The separate `e6f7f7f` commit
reconciles release documentation for this candidate.

This transform-version-6 release merged through PR #34 and was released to
production through the reviewed PR #39 binding cutover. Its protected preview
uses the fresh preview database
`theologai-preview-20260714-a`, migrated through schema 0003, populated from all
36 manifest seed files, and verified by the strict read-only remote readiness
gate. Its whole-D1 identity
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707` and scoped
usage identity
`c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd` are
verified for the prepared corpus. An initial protected preview deployment
occurred on 2026-07-14 from commit `a660c97`, producing Worker version
`e86fb87e-8ace-4972-a8a2-dba9682a6a55` with
`theologai-preview-20260714-a` bound. Black-box audits found guided-workflow,
Hebrew morphology interpretation, historical
presenter/search/browse, and derivation-output issues. Corrective application
commit `4760dbd` passed all required
CI checks and Verify Pins, then protected run `29354086467` / job `87160929896`
deployed it on
2026-07-14 as Worker version `5dd1fa0c-343c-4af4-83e6-b65003fb51c4` with the
same D1 database. Targeted and independent full-surface black-box re-audits
found no P0-P2 issues and confirmed all previously identified P0-P2 release
findings were fixed. This is the audited corrective application evidence and
does not predict the Worker UUID produced by any later deployment. At that
point, the immediate preview rollback pair was PR #34 Worker version
`ab270f0b-2627-4057-a182-a66cd750b118` with unchanged D1
`theologai-preview-20260714-a`. Retain the verified PR #27 Worker version
`734aec3b-d6c3-456b-a203-c7f940a2d081` with
`theologai-preview-20260713-c` as older matched rollback history, and retain
`theologai-preview-20260712-b` with Worker version
`3c8ad7ef-50ed-42a7-9c71-2ac8c2dd6d7f` as still older matched rollback history.
PRs #28 and #29 are closed as superseded by PR #30.

The owner-authorized deletion of unused legacy database `theologai-db-preview`
(`f9f415e1-219b-4d17-bcf5-33a8abad02fa`) was completed on 2026-07-14. The owner
later authorized deletion of only `theologai-preview-20260710-a`
(`3d010946-b530-4c7e-9e21-a900ff3c21a2`), completed on 2026-07-15. No other
database deletion is authorized. The corrective preview gate is complete.
Protected production workflow run `29418476587` deployed exact PR #39 merge
`2412ee4031b8bbef16f359879d4a8a4884a6e053` as Worker version
`a74f0848-5b68-4d7a-834e-aa3221ebda3b` at 100%, bound to
`theologai-production-20260715-a`. The post-deployment readiness result was
`ready` with zero writes, and the bounded audit recorded only the commentary
P2 subsequently corrected and released through PR #40. The corrective preview
and production releases both passed 15/15 coordinator and 27/27 independent
audits with no P0-P3 findings while retaining their existing D1 bindings.

### Integrated research-output follow-up (shipped)

PR #34 merged as `ce335266d989b40afebe398aeb39dbd2082d926a`; its reviewed head
was `6467a93da84c095f4fe32a253d8ba816be8cb8c2`. Every production deployment
and audit artifact must match the binding-cutover head derived from that merge.
Component PRs #31-#33 are superseded review vehicles rather than independent
release units. Combined local verification and required GitHub checks passed,
Sol approved the combined integration, and protected preview run `29379359308`
plus independent black-box audits found no P0-P2 release findings. PR #39 then
completed the separately reviewed D1 binding cutover and protected production
gate recorded above.

The integrated local-only application release upgrades
`primary_source_search` to v3 without adding a tool, migration, corpus body,
live CCEL path, configuration, or deployment change. It adds relevance and
deterministic round-robin work-diverse selection, limit-plus-one result-window
evidence, and the listed metadata-only `theologai://primary-sources/catalog`
JSON resource. Guided topic and creator surveys use work diversity; exact-work
location uses relevance; creator scopes remain separate and exact-resource
reads remain mandatory.

The public v3 input, output schema, structured result, and Markdown are strictly
local-only. Dormant external-provider adapters, service types, feature flags,
and composition wiring remain internal and unchanged for a separately reviewed
future rollout.

This slice preserves creator roles, routing-only alias policy, incomplete
edition provenance, unestablished catalog rights status, canonical fail-closed
section locators, and backward-compatible local research behavior while
intentionally removing inert external-provider boilerplate from the public
Markdown. Local protocol, parity, integrated-review, CI, preview-audit,
production-binding, and production-audit gates are complete. The production
audit's sole P2 commentary-coverage finding was corrected and released through
PR #40, with clean protected preview and production audits.

The same release adds v1 structured output for
`bible_verse_morphology`. Its bounded `words[]` retain exact source order, raw
morphology codes, nullable conservative expansions, and distinct provenance
links for the pinned STEPBible morphology and lemma sources. Guided word study,
passage exegesis, and translation comparison prefer that structure while
preserving Markdown fallback and the single-verse input boundary.

Direct `original_language_study` English targets now also resolve aligned
prefix/suffix gloss segments such as `heavens` within `the/ heavens`, while
remaining fail-closed for ambiguous candidates. No corpus rows or source data
were changed by that application-layer correction.

### Structured cross-reference follow-up (shipped)

This modern-output slice adds a v1 object-root contract for
`bible_cross_references` without changing its Markdown. It distinguishes the
caller's requested reference from the canonical verse actually queried,
materializes effective query defaults, preserves raw OpenBible.info vote order
and source-reference tie-breaking, and marks every result as a discovery lead
with relationship classification and directionality unspecified. Positions
and result windows are bounded, totals are scoped to the requested vote
threshold, and every response—including an empty result—carries the exact
checksum-pinned OpenBible.info snapshot provenance. It changes no corpus rows,
SQL semantics, migration, configuration, or deployment behavior.

### Structured donation-configuration follow-up (shipped)

This bounded modern-output slice adds a v1 object-root contract for
`donation_config` while retaining the legacy Markdown. It exposes the existing
public donation page, recipient, and configured asset values in their existing
display order, includes a machine-readable marker that this order is not a
ranking, and distinguishes native assets from tokens with a structurally
enforced null-or-exact contract address. It states that donations are voluntary
and do not affect feature access. The contract does not rank assets or claim price, liquidity, bridging,
or wallet support. It changes no verification behavior, chain configuration,
secret, migration, D1 state, or deployment setting.

### Structured donation-verification follow-up (shipped)

`verify_donation` now pairs its legacy Markdown with a conservative v1 object
contract. It reports exactly Ethereum, Base, and Radius checks; distinguishes
complete, partial, and unavailable provider coverage; and correlates each of
the seven classifications with a transaction outcome and a single verification
boolean. Only status-relevant transfers are returned, capped at 100 after all
eligible transfers are classified so the exact pre-cap total and truncation are
known. Supported amounts are asset-decimal values; unsupported amounts remain
raw base units. Explorer links are generated only from chain-specific
allowlists. Unknown, duplicate, missing, or mismatched chain evidence fails
closed. A successful receipt means only
`receipt_observed_no_confirmation_depth`, not confirmation depth or finality.

### Structured commentary follow-up (shipped)

`commentary_lookup` now pairs its byte-compatible legacy Markdown with a v1
object-root result. Coverage is carried from provider parsing into the service
as explicit identity evidence rather than inferred from the requested
reference. The shared commentator catalog drives provider IDs, aliases, public
coverage guidance, tool enums, and work rights. Its schema makes Matthew Henry
and Keil-Delitzsch exact-verse results impossible, permits John Gill exact
results only with a genuine provider `verseNumber`, and permits JFB, Clarke,
and Tyndale exact results from `verseNumber` or a `number` on an entry explicitly
typed as `verse`. Commentary text is labeled `text/markdown`; exact work
provenance remains separate from unpinned HelloAO delivery provenance. The
retrieval contract says `remote_cached_or_live` because the adapter uses a
process-local one-hour cache and does not expose per-result cache status. The
adapter fails closed unless HelloAO's response container matches the requested
work, book, and chapter, and structured retrieval reports the validated
provider corpus SHA-256 without treating it as edition provenance. Scalar
absence remains an actionable chapter-oriented tool error with no structured
content, while malformed or contradictory provider evidence fails closed.

## Release gates

Code readiness and operational readiness are deliberately separate:

1. Each slice receives implementation review, targeted tests, Node and Worker
   typechecks, build verification, and all required GitHub checks.
2. Stacked changes are merged or rebased in dependency order; passing a child
   PR against an unmerged parent is not proof that `main` is releasable.
3. Preview D1 must have the expected schema and materialization marker before a
   preview Worker is deployed. Migrations and imports are explicit operations;
   deployment does not mutate D1.
4. Preview deployment requires the repository's authorization label and
   protected environment approval. The live PR must still be open, non-draft,
   and authorized immediately before deployment.
5. Preview smoke and a functional audit must cover all eleven tools, the eleven
   structured-output contracts, UBS default and explicit-source behavior,
   Strong's extended identities, local primary-source search, language study,
   resources, all six prompts, and failure/privacy boundaries.
6. Production D1 corpus changes require explicit owner authorization and a
   compatible replacement or reviewed incremental migration. A metadata-only
   transition is valid only when materialized rows are unchanged; it must use a
   conditional one-row update, immediate read-only readiness verification, and
   a prepared conditional rollback.
7. Production merge/deployment occurs only after the integrated Sol review,
   green required checks, successful preview audit, and protected production
   approval. Production then receives the same bounded smoke audit.

## Next work

- The migration-free catalog-capacity prerequisite shipped in PR #56; retain
  its centralized 100-work and 2,000-section ceilings and single D1-safe
  JSON/`json_each` scope bind. The approved UBS artifacts, decoder, and
  coordinate evidence are now present, but they remain acquisition/design-time
  inputs only. Deterministic compilation and capacity verification precede the
  separately owner-gated migration `0004` and transform 7; neither may add
  semantic runtime behavior or reach preview/production without a new review
  and release gate. This data layer must complete before the dependent
  historical migration `0005` / transform 8. Keep the existing 32-source
  provenance cap as a required pack-sizing check.
- PRs #61–#64 and #67 complete the planned inactive semantic and provenance
  foundations: source-free semantic contracts, the unregistered Hebrew
  resolution and aggregate seams, edition/provenance contracts, and a
  synthetic-only v2 `original_language_study` design. They do not license or
  vendor UBS semantic data, acquire corpus bytes, alter D1, or register a live
  schema. The original-language surface decision is resolved: extend the
  existing `original_language_study` tool and keep the tool inventory stable;
  do not register a new tool.
- The v4 `parallel_passages` cursor hard cutover is released and audited in PR
  #66. It preserves UBS-only continuation behavior, rejects legacy/OpenBible
  controls when a cursor is present, and retains `includeText: false` as the
  existing default. Any future workflow or prompt change remains a separate
  slice rather than another cursor implementation.
- The primary-source output-profile hard cutover is released in PR #65:
  production is v4/local-only and preview is v5/discovery-only, with CCEL
  execution still disabled. Prospective corpus work remains limited to
  explicit searched/read/deferred coverage semantics and future
  edition/provenance fields; it is not a rollout of evidence already present
  in current schemas. Any corpus release remains a **pending rights and release
  decision** and must preserve CCEL-disabled behavior during protected audit.
- The historical source-first aliases are authoritative for a future
  compatibility release, but the evidence/compiler remains preparatory.
  `productionObservedTarget` remains null and Node `.get()`/D1 `.first()`
  remain `unordered_no_compatibility_proof`. Migration `0005` and transform 8
  depend on the prior migration `0004` / transform 7 data layer and are then
  separately gated before any deterministic runtime behavior, D1 rows, preview,
  or production change. Norton is a later transform-9
  `sectioned_only` release; Calvin, Aquinas, and Augustine need later
  per-edition transforms and release approvals. Cyril remains a zero-output
  blocked source until translator attribution is established.
- Review a bounded, discovery-only public rollout of the retained CCEL search
  adapter. The owner accepts free, donation-independent discovery with at most
  five short, attributed 240-character provider snippets and clean links, with
  no full-content scraping, body retrieval, mirroring, hosting, republication,
  or durable CCEL content storage. This product approval does not claim CCEL
  separately licenses snippets. Applicable authorization, operational, and
  terms boundaries remain release gates.
  Because CCEL cannot enforce composition-year bounds, the owner approved a
  guided broad topical fallback: retain exact year bounds on hosted-local
  queries, omit them from the one external call, and warn at search and
  synthesis that CCEL results cannot establish membership in the requested
  historical period. Direct CCEL-plus-year tool input remains fail-closed as
  `unsupported_filter` before adapter or coordinator admission.
  Immediately before any live preview canary, recheck the current CCEL search
  interface, robots guidance, copyright policy, and operational/terms boundary;
  record that evidence and repeat the owner decision. Until then preview stays
  `100`, production stays `000`, and neither environment may make a CCEL
  request.
- Expand the local primary-source corpus with rights-reviewed, freely
  redistributable editions and explicit edition provenance. The acquired Norton
  and other public-domain packets do not count as the 17-work hosted corpus
  until their separately reviewed transforms, D1 preparation, and release
  gates are complete. Do not mirror or republish CCEL transcriptions without
  edition-specific rights.
- Broaden original-language study for both beginners and readers of Greek or
  Hebrew using the already selected and acquired UBS Hebrew v0.9.2 semantic
  source (PRs #75 and #79), rather than selecting another semantic-domain
  source. Next comes deterministic compilation, capacity verification, and the
  separately owner-gated migration `0004` / transform 7 materialization, which
  requires explicit authorization; only after that data layer is verified may a
  separate runtime-activation release extend the existing
  `original_language_study` tool. This prerequisite comes before migration
  `0005` / transform 8. Evaluate MACULA
  discourse/context evidence only after that foundation is active and reviewed.
  The owner approved a hard cutover that withholds the TBESH `Meaning` field,
  which derives from Online Bible material whose source notice says permission
  should be obtained before project use. Exact identities, forms,
  transliteration, morphology, lemma, and Tyndale-created brief glosses remain,
  with explicit unavailable-evidence disclosure and no fabricated replacement.
  The separately CC BY 4.0 STEPBible morphology evidence remains usable on its
  own.
- Evaluate section-span commentary only where provider coverage can be stated
  honestly; never relabel a section anchor as an exact verse range.
- Continue modern MCP output improvements tool by tool when a stable structured
  contract materially helps agents, retaining backward-compatible Markdown.
- Rehearse matched Worker/D1 rollback and define retention policy before any
  predecessor database cleanup.
- Revisit the parked public-edge traffic issue: a Frankfurt/AWS client has
  generated sustained anonymous production invocations. The custom domain and
  ordinary-request PR #72 legacy-host redirect are already deployed. Any
  further `workers_dev` disablement, change to the exact abusive-poller tuple
  rule, or narrowly scoped WAF control remains separately gated; no Access,
  hostname, WAF, or limiter change is currently approved.

## Durable guardrails

- Production and preview D1 bindings are distinct and managed through protected
  workflows. Deployment never migrates or seeds remote D1.
- Readiness requires schema and exact corpus/materialization identity. Do not
  weaken it merely to make an older database pass.
- Code rollback and D1 rollback are independent. Use a compatible matched pair
  of Worker code and database state.
- Historical public-domain text may be published when transcription provenance
  is uncertain, but that uncertainty must be disclosed; a third party's
  particular transcription is not assumed redistributable.
- CCEL execution remains inactive. Preview exposes the v5 discovery contract
  only; production remains v4/local-only. A future live discovery rollout
  requires the explicit owner policy decision above and separate review, and
  must not become crawling, catalog mirroring, body republication, or permanent
  storage. The legacy CCEL body reader is retired; the retained discovery
  adapter remains bounded and inactive. Date-fallback contract work does not
  change any rollout flag or authorize a live request.
- Public Ethereum RPC endpoints are light-use defaults, not an uptime SLO.
  Donation verification remains fail-closed.
