# Hosted handoff rehearsal — zero operational authority

This follow-up to PR #172 tests GitHub metadata and artifact transport. The overseer
approved the local diff/test review after independently passing all 48 rehearsal tests.
Publication and three bounded metadata dispatches may proceed after full ordinary CI passes.
Tyler's expanded audit scope permits the bounded nonproduction rehearsal; it grants no
fresh remote-proof allowance and does not renew PR170's completed budgets. No cloud API,
proof SQL, credential value, protected approval, preview label, draft transition or deployment
is needed or permitted by this rehearsal plan. Production deployment and material product
or assurance decisions remain Tyler's decisions.

The existing operational uploader cannot harmlessly accept a positive fake grant: it binds
an actual reservation and requires a live preview candidate. The new route therefore uses
strictly disjoint `theologai-operator-handoff-rehearsal-request.v1` / rehearsal payload schemas.
Its purpose is metadata transport, `grantsOperation=false`, and reads/writes/diagnostics are
all zero. It has no operation ID, ledger, challenge, approval or proof. Operational consumers
must reject its schema and filename. The rehearsal must reject operational grants/envelopes.

The existing `operator_authorization_json` input and existing read-only uploader job are reused.
The job retains contents/actions/pull-requests read permissions and its three-minute limit.
No environment, cloud secret, root dependency installation, release toolchain or Wrangler step
is added. Operational artifact/ledger uploads execute only on the original operation branch.
Rehearsal artifacts use `operator-handoff-rehearsal-<producer-run>-attempt-1` and the single
`operator-handoff-rehearsal.json` filename. No operational markers are published.

## Reviewed sequence and stop points

1. Implement and test locally; independent diff review before publishing the follow-up.
2. Push the reviewed commit and pass ordinary PR CI. Keep PR #172 draft and completely
   unlabeled. Verify live branch/head/base/tree and a successful full ordinary run on that head.
3. Dispatch `pr.yml` at that exact branch to publish zero-authority metadata. The owner and
   triggering owner must both be 40179660, attempt 1. Server time fixes the payload lifetime
   at exactly five minutes. Retain one native artifact for one day. Capture the produced
   window/nonce and immutable artifact ID/digest before consuming it.
4. A second metadata-only dispatch authenticates producer identity, native artifact metadata,
   ZIP digest and exact roster/content, live draft/unlabeled state, source/base/tree and full
   ordinary CI. The pinned download action downloads that exact ID with digest mismatch set
   to error; an independent byte comparison checks its output against the authenticated ZIP
   entry. Recheck live source and freshness after the download.
5. After that exact payload naturally expires, a third bounded metadata-only dispatch first
   authenticates all the same properties, then accepts only the specific expiry rejection.
   Permission, network, digest, source or any other failure cannot count as a successful test.
   Do not change the published expiry or silently extend its lifetime to accommodate latency.

At most three planned metadata dispatches, each with the existing three-minute uploader cap.
Metadata dispatch must skip all full suites under names distinct from the five substantive
PR contexts. Hosted GitHub renders the skipped name expressions literally rather than resolving
the intended `Operator metadata / ...` labels; check-run inspection confirmed the required
contexts remain intact. Preserve native IDs, digests, logs, before/after
check records and time windows. No unrelated artifact deletion, mutation retry or cleanup.
Unexpected real-role output, source/main movement, labels/draft change, required-context
supersession, ambiguous provenance, environment/cloud execution or new paid-service need
stops the attempt for diagnosis. An API refusal of candidate-branch inputs is evidence;
never substitute a real grant or merge an unverified bootstrap to work around it.

## Properties and limitations

This can verify actual branch dispatch, server actor/run metadata, cross-run artifact transport,
ZIP digest/content/roster, pinned download behavior, actual-clock payload expiry and distinct
metadata check routing. Read-only policy inspection confirms preview's PR-merge ref policy,
production's main policy, owner review and no administrator bypass; it does not prove a
protected approval transition. Artifact retention metadata is observable; actual one-day native
artifact expiry is not exercised by the five-minute payload-expiry test.

No operational protected admission, quota observation, remote proof, release receipt or deployment
is established. Cross-run uniqueness observations are finite metadata checks, not global replay
prevention. A successful transport rehearsal cannot authorize a later operation. Hosted evidence
will be retained alongside the accepted local and ordinary-CI evidence, without overwriting it.

## Pre-push verification

The combined rehearsal/operator/full-CLI/topology regression run passed five files / 221 tests.
Strict test-script types, public documentation (14 tests), CJS syntax, Actionlint and diff
whitespace passed. Independent review passed all 48 rehearsal-specific tests and found no
blocking issue. Operational schemas and permissions remain unchanged; the shared archive
reader's existing default filename/JSON contract is retained. Hosted outcomes passed and were independently accepted. Full ordinary CI on commit
`080a85ced92cd38fc85574496cc31b713ee2fc2e` passed in run
[41315535953](https://github.com/TJ-Frederick/TheologAI/actions/runs/41315535953).
The exact three dispatches are complete:

| Step | Run / observed result |
|---|---|
| Publish | [41316767859](https://github.com/TJ-Frederick/TheologAI/actions/runs/41316767859): native artifact `13087802457`, SHA-256 `c138427a01a5a992eb9e08d9c7c13e5354e9cfd14baa1b3fa138f88ce287fa3f`; payload lifetime 14:33:28.669Z–14:38:28.669Z on November 1. |
| Consume | [41317002397](https://github.com/TJ-Frederick/TheologAI/actions/runs/41317002397): pinned action digest and independent extracted-byte comparison passed at 14:36:18.773Z. |
| Reject expired | [41317230666](https://github.com/TJ-Frederick/TheologAI/actions/runs/41317230666): all other authentication passed before the specific original expiry rejection at 14:39:09.916Z. |

Only the existing unprivileged uploader executed in each dispatch. All validation, source,
proof, protected and deploy jobs were skipped. After all three, each of the five required
contexts still had exactly one successful ordinary-run check. The PR stayed draft and
unlabeled; deployment API results for this source were empty. No real grant, ledger or cloud
request was created. Native one-day retention expiry and protected operational admission
remain untested. No more rehearsal dispatches are part of this plan.

[Retained local evidence](../../test-output/ci-reliability-remediation/rehearsal-followup/handoff-rehearsal.json)
links native metadata, the ZIP, exact requests, check records and logs. Independent review
verified all seven then-retained log hashes; the ordinary core/data logs were subsequently
retained as additional evidence. This is a transport result, not authority for another operation.
