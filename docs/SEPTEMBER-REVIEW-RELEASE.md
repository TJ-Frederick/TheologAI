# September review improvements release candidate

Status as of 2026-09-07: prepared for protected preview; not deployed by this
candidate. [CURRENT-RELEASE.md](CURRENT-RELEASE.md) remains the dated release
identity authority. This document records the candidate transaction, not an
active assignment.

## Candidate scope

The candidate starts from PR #160 merge
`09892c8d39aed34074312f46c0c724b4212e25ee` and contains the merged improvements
in PRs #155–#160: architecture ownership, dependency repairs, Bible footnotes
and remote-work budgets, content-free tool telemetry, and bounded local
research query planning with its regression benchmark, and roadmap
reconciliation in PR #160. See the
[roadmap](ROADMAP.md#september-review-improvements--merged-release-pending)
for completed scope and limitations.

This candidate PR's delta is documentation-only; eventual promotion deploys
the accumulated runtime changes as a new Worker version. Package version remains
`3.6.0`. No schema, data, binding, secret, or Worker configuration change is
included. PR #154's unmerged original-language depth implementation is outside
this candidate.

## Shared preview coordination

PR #154's protected run `33564178896`
deployed its candidate on 2026-09-01, then failed the primary-source edge audit
with `transport_failure`. Therefore a failed workflow is not evidence that
preview remained at the PR #151 identity in the dated release snapshot.

The owner approved the shared-preview handoff. PR #154's `deploy-preview`
label was removed at `2026-09-07T20:35:31Z`; GitHub recorded the unlabeled
event. Its merge conflicts suppressed the `pull_request` revocation workflow,
so no workflow acknowledgment exists. All its runs were completed and its
live label was absent before PR #161 received preview authorization. PR #154
remains open with its code unchanged.

Use the existing protected workflow to capture the fresh
preview predecessor and production control, verify the configured D1, and
serialize the preview mutation. Do not infer rollback authority or modify
PR #154's code as part of this release.

## Validation and promotion sequence

1. Pass all five required checks on the exact candidate head and independently
   review its delta and release boundaries with Sol.
2. After the shared-preview handoff is resolved, authorize the open candidate
   with `deploy-preview` and satisfy the protected preview environment gate.
   Retain the workflow's source/tree-bound receipt and its bounded audits of
   registration, original language, historical sources, dual-era protocol,
   deployment identity, and environment isolation.
3. Validate the improvement-specific behavior: multi-translation footnotes,
   deadline/cancellation and partial-result behavior, telemetry privacy and
   failure isolation, and bounded local research planning. Use deterministic
   Node/Worker tests for fault injection; distinguish that evidence from live
   preview smoke. The 42-case benchmark is a local regression check, not a
   scholarly quality evaluation. Logging support does not prove a durable
   monitoring baseline exists.
4. Have Sol review the exact candidate and evidence. Report any live behavior
   that cannot be verified, together with the remaining production risks.
5. Obtain the owner's production-promotion approval before merging this
   release candidate or dispatching production. Recheck that main has not
   advanced and that the merge tree matches the audited preview tree. A
   documentation-only merge does not itself deploy; the existing manual main
   workflow must verify the fresh exact preview receipt before production.
6. After approved production promotion, complete the bounded post-release
   audits and reconcile the release snapshot and roadmap from the resulting
   verified evidence. Do not mark this candidate shipped in advance.

No production promotion, D1 mutation, corpus activation, rollback, or cleanup
is authorized by this document.
