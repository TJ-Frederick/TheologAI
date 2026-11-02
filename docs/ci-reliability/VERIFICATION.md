# Local verification — revised first remediation slice

Local acceptance snapshot HEAD: `8a0ad10c53d81b1e575dfd6b4b3df876d77ed5dc`.
Project Node **22.23.4** was used, including native SQLite ABI127. At local acceptance,
no source commit, push, PR, workflow dispatch, remote SQL, credential/permission change
or deployment had occurred. Tyler subsequently authorized a commit, branch push, draft PR
and ordinary hosted PR CI. Release paths, manual dispatch, merge and remote operations
remain unauthorized; [hosted evidence](../../test-output/ci-reliability-remediation/hosted-ci.json)
is retained separately from this local verification snapshot.
Runtime production remains PR170 source `a1b684b`; preview remains `d72d292`;
this checkout begins at the PR171 documentation merge. No operation budget is granted.

## Outcomes

| Check | Result / evidence |
|---|---|
| Shared core action body | Exit 0. All type/config checks, strict audit, production audit, coverage, integration and build passed. 213 unit files: **2,976 passed / five existing conditional skips**. Integration **3/3**. Coverage statements **86.68%**, branches **81.17%**, functions **91.95%**, lines **90.84%**. |
| Shared data action body | Exit 0. **152** canonical files verified; full actual source database built; generated-database tests **10/10**; two deterministic exports/manifest comparison; **49** seed files / **1,630,260** rows; SQLite import compared **42** tables; compatibility evidence; all **49** local Workerd imports, production readiness and Transform-8 **1/12/12** and Transform-11 **1/1/1/1/1/1/133/17** authority pages passed. |
| Shared Worker action body | Exit 0. Worker **28/28**, coordinator **17/17**, UBS bundle exclusion and production-like Workerd MCP contracts for both protocol eras passed. |
| Shared Node action body | Exit 0. Compiled HTTP and stdio process-boundary contracts passed for both eras; E2E typecheck/build passed. |
| Shared conformance action body | Exit 0 under the **unchanged expected-failures baseline**. Modern stateless harness **24/28**: four existing checks require unavailable diagnostic capabilities/streams; no unexpected failures or warnings. No conformance criteria changed. |
| Final targeted verification | **8 files / 285 tests passed** after the final test-only additions, including native archive replay/substitution, downstream hash/expiry/source, waiver inactivity, CLI and topology regressions. |
| Strict typechecks | `npm run typecheck` exit 0; final `typecheck:test-scripts` exit 0 after final fixtures. |
| Documentation | `npm run docs:check`: **14/14** passed. AGENTS.md / CLAUDE.md remain matching and unchanged. |
| Static checks | Actionlint on pr.yml, validate.yml and deploy.yml; CJS syntax checks; `git diff --check`: all exit 0. |

The complete core run preceded the final historical-waiver regression and additional
native proof-finder assertions; the final 285-test run and test-script typecheck cover those
test-only deltas. Initial fixture/catalog failures were corrected without weakening checks.
The audit retains exactly the existing dev-only Zod exception and November 22 UTC expiry.
Core's conditional database skips are supplemented by the explicit generated-database run.

## What the successor test proves

[The real-CLI flow test](../../test/unit/scripts/operatorSuccessorFlow.test.ts) exercises the
actual owner-authorization uploader, native ZIP fixture, source admission, challenge CLI,
ledger initialization, local integrity CLI, integrity uploader/finder, protected completion
CLI and downstream acceptance CLI. It uses a different-branch PR, then a real Git merge
commit with the same tree and a separate production authorization/ledger. The mocked cloud
transport executes actual bounded SQLite queries over 39 controlled canonical fixture tables;
only the operator's four diagnostics write. The complete verifier runs every fixture cell,
schema/ledger, physical and FTS check. This is separate from the older acceptance-only CLI
fixture, which deliberately manufactures an already-admitted package.

Altered authorization/ledger IDs preserving genuine native metadata and duplicate marker
fixtures fail before ledger creation and issue **zero additional Cloudflare transport requests**.
A replay fails before further transport. A missing/cancelled protected phase retains the full
both-phase reservation; an ambiguous read preserves unmatched read reserves and operator costs.

The actual repository data suite separately verifies the complete current local corpus and
Workerd import. Neither test is a remote proof or authorization to reuse a remote proof.

## Retained local evidence and limits

[Log manifest with SHA-256 values](../../test-output/ci-reliability-remediation/log-manifest.json)
links the retained core/data/Worker/Node/conformance/targeted/type/docs logs. They are local,
ignored test-output artifacts, not uploaded/shared evidence. Original temporary logs and
retained incident workspaces were preserved. [Review patch](../../test-output/ci-reliability-remediation/review.patch)
and [changed-file digest roster](../../test-output/ci-reliability-remediation/changed-files.json)
record the reviewed local state. The original accepted patch and digest roster are preserved
as `local-accepted-review.patch` and `local-accepted-changed-files.json` beside them.

The local tests do not establish hosted check-name/routing semantics; ordinary hosted PR CI
is now separately authorized. First branch-dispatch availability, protected approval timing
and release artifact endpoints/download behavior remain **unverified**. Local tests
use native-byte fixtures and server-metadata mocks, not GitHub-hosted execution. Existing
owner/protected policies and required contexts were not changed through repository settings.
Finite artifact history and local ledger tampering limitations remain in the reviewed design;
missing or ambiguous terminal evidence never releases the whole outstanding reservation.

## Final independent review

Overseer chat `01a194bc-c79a-75a2-af44-296eb4b26260` approved the completed local
implementation/testing scope with no remaining blocking findings. It independently ran
**45** targeted tests including the Node22 real successor CLI flow, verified all **24**
changed-file and **10** retained-log SHA-256 values, inspected the data authority-audit PASS
and final 285-test result, and confirmed unchanged HEAD and clean diff whitespace. The native
artifact/content finding R1 is closed. That local acceptance granted no hosted or operational action; the later owner authorization
covers only branch publication, a draft PR and ordinary PR CI.
The review patch and file roster were refreshed afterward for these acceptance-note edits;
no code changed after review and no further testing was required for this bookkeeping.
