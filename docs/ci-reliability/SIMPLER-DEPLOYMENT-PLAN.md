# Release a Worker or change its corpus

Use **PR Checks** for preview and **Deploy Production** to promote the accepted build. The person approving a release chooses when to start. The outstanding Norton and Thomas Aquinas release uses the corpus path.

| What changed | Before promotion | After promotion |
| --- | --- | --- |
| Documentation only | Ordinary CI | No deployment |
| Application code, existing databases | Build once. Run the Worker locally, then on protected preview. In each MCP version, connect, list tools, read John 3:16 morphology and resolve a Kempis search citation. | Promote the same bundle. Verify the actual Worker and database, repeat eight checks and confirm final routing. |
| Corpus, schema, database replacement or an unclassified change | Test the source data. Use an independently prepared candidate. Verify its contents, indexes and integrity. Run both MCP versions locally and on protected preview. | Recheck the accepted preview, verify the production candidate under separate authority, switch traffic once, run the full hosted suite and confirm both environments. |

## Run a release

1. Review the proposed change against the version actually serving production. GitHub supplies the source of the last successful protected production release. The workflow checks the actual production Worker and database against that baseline. For the first release after this cleanup, `release/serving.json` supplies the reviewed starting assignment. It also declares the intended database for each role. In a clean checkout, `node scripts/release-promotion.mjs classify` uses this starting point. Pass the workflow’s production baseline JSON as the final argument to reproduce its decision after subsequent releases. A pull request containing only documentation can still be on top of an unreleased corpus change.
2. Run normal CI on the same-repository pull request to main. For a release, authorize preview and apply the existing `deploy-preview` label to the ready PR. **PR Checks** builds the Worker once and exercises that bundle in real local Workerd. The preview job requires its protected environment approval. Removing the label, moving the source or changing the candidate can revoke approval.
3. For a corpus release, complete the owner steps below. For an application release, the workflow goes directly to the small MCP check. Read the preview result. A successful protected job records the build, database and serving version in the accepted preview artifact.
4. After authorization to publish, merge the tested head using a merge commit, preserving its tree. In Actions open **Deploy Production → Run workflow** on main. Enter the reason and the successful **PR Checks run ID**. The job verifies the exact tree, protected preview job and native artifacts, then downloads the preview-tested Worker. A corpus release needs a separate production grant. Review the target database and predecessor in the summary and approve the production environment.
5. After final routing and acceptance pass, retain the previous Worker with its database. Record the accepted pair in [CURRENT-RELEASE](../CURRENT-RELEASE.md). Subsequent jobs use the successful protected release as their starting point. Change the target declarations when an intended database changes.

## Corpus owner steps

* **Prepare once.** Norton and Aquinas already have a populated production candidate. Use the retained preparation evidence, exact source and original ledgers. The `preview` in this candidate's historic database name is intentional. Confirm its UUID against the promotion configuration. For future, newly created empty candidates, the separate `npm run d1:preview:candidate:prepare` and `npm run d1:production:candidate:prepare` tools have their own target, import and authorization requirements. Keep these writes away from serving databases. Routine promotion has no import step.
* **Authorize one role.** The waiting GitHub job supplies the exact run, revision, base, tree and source plan. Use **PR Checks → Run workflow** at that source branch (main for production) with `operator_authorization_json`. Supply the intended target, both current assignments, source ledger hash, an actual UTC window, read and write limits and current daily holds. The normal protected approvals still apply. Use the same recorded spending and custody records across attempts. Keep existing grants and secrets in their existing locations.
* **Complete the proof.** Download the exact source artifact and start the local one-shot operator helper before approving the protected job. It waits for the authorized challenge, uses the persistent ledger for the four diagnostic commands and submits the sanitized envelope on the approved branch. The protected job checks all 39 table digests on this release, schema, ledger and physical integrity, then retains the completed result before switching traffic. [Operator commands](../OPERATOR-CORPUS-PROOF.md)
* **Check both hosted versions.** Norton and Aquinas require 185 checks per MCP version on preview and again on production. This includes the Wesley search that returned HTTP 503 on November 20. Hosted acceptance must succeed against the intended assignment.

## If a step stops

| Where it stopped | What to do |
| --- | --- |
| Build, tree, permissions, expired approval or insufficient headroom | Correct the identified cause. Keep the prepared database and previous evidence. Recheck the approved run and budget before spending again. |
| D1 rate-limits a schema read or a page of corpus data after the physical check | On HTTP 429 with D1 code 7429, the verifier can repeat the identical read once within the same invocation when authority, source, control of writes, assignments and remaining budget still hold. The completed prefix stays in memory. The canonical scan and independent closing checks remain required. A lost runner or ambiguous write requires reconciliation. |
| MCP check, including a 429 or 503 | Read the first failing probe, protocol, HTTP status and completed count from the retained evidence. A failed check prevents acceptance. If traffic already changed, inspect the observed assignment before deciding what to do. |
| Lost response during a deployment or a database write | Keep the original ledger and matched predecessor. Read back the assignment or affected data under current authority. Decide on any further mutation only after the outcome is known. |
| Rollback needed | Obtain Tyler's rollback decision. Compare the predecessor version's actual D1 binding to the retained anchor. Rehearse with `node scripts/release-promotion.mjs rollback-pair ROLE ANCHOR_JSON VERSION_JSON`. Restore the verified pair and check routing and MCP behavior under that approval. |

The previous release-specific restore, runtime-reuse, existing-preview validation, scoped diagnostic and reconstruction entry points are retired. Historical receipts and source recovery evidence remain available. Security, preview revocation, CCEL maintenance and the manual rollback rehearsal retain their separate purposes.
