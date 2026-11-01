# Successor authority design — reviewed for local implementation only

### Event sequence and metadata-only handoff

1. A later same-repository PR on any non-main branch gets ordinary PR validation against
   its exact synthetic merge. A deploy-preview label forces all five suites. Its separate
   unprivileged source-head Worker/corpus artifacts bind source tree and source-plan hash.
2. The unprivileged operator source gate verifies live PR/base/main/run and unique successful
   named jobs/artifacts, then waits at most 60 minutes for a new owner authorization artifact.
   It exposes candidate identity/run/plan in the step summary while waiting. Missing authorization
   times out before either protected approval or cloud inventory. It does not immediately fail.
3. The owner explicitly grants a new real operation by dispatching existing `pr.yml` at the
   exact candidate branch, using a bounded authorization JSON in a separate manual input.
   The no-cloud uploader authenticates owner/triggering owner/attempt1 and live source metadata,
   writes an immutable artifact, and never accesses cloud credentials. For metadata-only dispatch, the five validation jobs have dispatch-only prefixed names and
   are omitted; PR/schedule/full manual names remain exactly the existing five names. This
   prevents skipped upload checks from replacing substantive PR contexts on the same SHA.
   No new workflow/default-branch bootstrap is required. Hosted routing remains unverified.
4. Source gate downloads the uniquely matched artifact, verifies native archive digest and
   exact file roster, strict schema and live metadata, then records its digest/identity outputs.
   Only then can the existing protected operator job request preview approval. That job repeats
   live verification and receives the exact artifact. Its challenge binds the authorization,
   run/attempt, source/branch/base/tree/plan, nonce and existing 90-minute single-day window.
5. Local operator uses the existing persistent ledger and exact challenge. The owner submits
   the integrity proof through the existing uploader. The protected reader completes every
   cell/schema/FK/physical check and produces the existing full envelope. Deploy Preview consumes
   the successful same-run proof under its separate approval and unchanged live tests.
6. After a separately authorized merge, production resolves the actual main dispatch commit,
   canonical first parent and exact successful preview receipt with matching merge tree. It
   separately waits for a *production* owner authorization bound to the production run/source.
   Production protected approval/challenge/operator/read proof remain independent of preview.
   Production never substitutes preview proof or preview authorization for its own proof.

### Authenticated authority, source trust, and bounded schema

GitHub actor/run/artifact metadata authenticates who submitted bytes, not their truth. The
manifest is accepted only with owner ID 40179660 as actor AND triggering actor, attempt1,
pr.yml workflow_dispatch, exact candidate branch (preview) or main (production), source SHA,
unique artifact and valid native digest/expiry. Live PR/run/tree/base/main/plan independently
match the asserted fields. The authorization schema fixes repository/owner/role, PR number
and branch, source/base/tree/plan, target run/attempt, unique authorization ID, ledger ID,
notBefore/expiry, per-proof 3,510,997 reservation, <=3.8M cap, four diagnostic commands/writes,
and explicit new-additional-operation scope. No configured owner artifact means no authority.
No date activates PR170 continuation or waiver. Normal 200K uncertainty/4M account headroom
and UTC-day restrictions remain. Production has its own authorization ID and ledger.

The candidate contains the reviewed verifier/source scripts, as in today's protected flow;
the existing protected-base isolated release toolchain supplies executable dependencies.
Owner artifact metadata and protected approval are separate from candidate declarations.
This is not a claim that a malicious approved candidate is sandboxed by the base toolchain.
No new signing service or general release framework is introduced.

### Ledger and replay boundary — deliberately no automatic continuation

To keep this slice bounded, a new authorization is exactly ONE target run/attempt and ONE
complete operation. Its ledger ID is stable for that operation; authorization ID is immutable
and cannot be rebound by a new challenge/run/source/time. A first authorization must explicitly
state `new-additional-operation`, zero inherited budget, and no predecessor. This is an
explicit additional owner scope, never a silently renewed PR170 or previous operation budget.
The entire reservation and all four diagnostics remain outstanding until terminal evidence
accounts for BOTH local integrity costs and protected reader costs. A failed/cancelled or
missing artifact never releases that reservation. A second challenge for the same authorization,
reused nonce, extra owner submission or duplicate authorization is refused. Local persistent
ledger must be initialized deliberately from this authenticated authorization; missing ledger
is a hard failure, not a zero-ledger fallback. Any existing nonce/attempt, including integrity
passed/awaiting CI and ambiguous attempts, refuses another local command sequence.

No cross-run ledger recovery or continuation is implemented in this slice. A continuation
request, inherited nonzero counters, predecessor/reused ledger or exhausted allowance stops.
An owner may later explicitly authorize an additional *new* operation accepting the still
outstanding prior reservation; that is a new scope decision, not reconstructed lower counters.
The mechanism is not an append-only global ledger. Native metadata detects duplicate/replayed
handoffs within its finite, expiring history; deliberate local deletion/reconstruction cannot
be cryptographically distinguished from a fresh file. We prevent accidental missing/reset
ledgers and require owner-reviewed accounting, rather than claim global anti-tamper custody.
PR170 envelopes and their completed budgets are rejected by the successor v2 schema and
remain historical evidence. No receipt or budget reuse policy is changed.

### Minimal edits and verification

- Shared validation composite + thin pr.yml/validate.yml; local checkout-context CLI and tests;
  named source-job consumer updated with duplicate rehearsal removal.
- Existing source verifier, owner-artifact bridge/uploader, operator challenge/envelope consumer,
  operator action, preview/production admission wiring, deliberate tooling-script classification.
  A narrowly scoped authorization verifier is shared by the CJS and TS consumers.
- No application/corpus/binding/permissions changes. Keep application-only declaration.
- Local fixtures: later PR DIFFERENT branch succeeds source->authorization->challenge->upload->
  integrity/full acceptance; same-tree actual merge succeeds independent production handoff.
  Fail wrong PR/ref/branch, moved head/base/main, missing/failed/duplicate jobs, stale/wrong digest,
  owner/triggering owner mismatch, old v1/PR170, duplicate submissions/challenges, missing/reset/
  exhausted ledger, unsupported continuation, expired authorization. CLI env/output and early
  wrong-checkout/missing-baseline/audit checks. No remote fixture I/O.
- GitHub hosted check naming, artifact endpoint behavior, dispatch-at-branch availability and
  protected environment timing require separately authorized hosted CI; local tests cannot prove them.


Review correction R1: native artifact metadata alone cannot authenticate separately supplied
JSON. Local challenge admission, ledger initialization and every diagnostic gate download both
bounded native authorization and ledger-marker ZIPs, verify their native SHA-256 and exact
content, and reject duplicate markers before any Cloudflare transport request.

Deploy Preview preserves its existing contents:read / pull-requests:write permissions. It
receives the admitted package only from the exact same-run protected proof artifact, verifies
its bytes against the original source-admission SHA and the envelope against protected-producer
SHA, then independently checks strict package/expiry/source and live PR/main/tree before cloud
inventory. Production already has actions:read and re-authenticates native owner artifacts.
No additional GitHub permission is granted to Deploy Preview.
