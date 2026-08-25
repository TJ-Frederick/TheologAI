# Stabilization exit audit

This audit was completed on `2026-08-24` against released main source
`7fb1440d468920d90331d7d9ade22e155b2f0b95`, tree
`1f9582c48344a69675f5bd9e77e69511a95e0132`. It supports the final
documentation-only reconciliation; it does not predict that reconciliation's
merge commit, workflow run, or GitHub tree.

## Verdict

**PASS with one owner-accepted evidence-retention debt.** The audited source has
zero Critical findings, zero High findings, and zero unaccepted Medium findings.
The accepted Medium is H1 Option A natural expiry, bounded below. No finding
authorizes a deployment, rollback, cleanup, deletion, credential operation, or
Cloudflare/D1 mutation.

## Released identity and evidence

The designated [current release snapshot](CURRENT-RELEASE.md) records the full
active assignment. PR #138's protected run `32686081134` completed successfully
at `2026-08-24T03:44:34Z`. Its unprivileged classifier and plan verifier passed
before the production environment, and the protected job revalidated the same
plan before package installation or mutation.

The run produced exactly one pre-environment gate artifact plus seven separate
post-deployment release artifacts. Gate artifact `9505689392` is named
`production-deployment-plan-32686081134-attempt-1`; its ZIP SHA-256 is
`101a86827d3eadad075e8f98cfa34a896d9fbbd5213fbb00eeaecf5042fa9fd4`,
and its canonical plan/sidecar SHA-256 is
`d39321451fa8c49a495fbffbf8fa02419a370d539fb1a40d509123ec24bc387b`.
The seven artifact IDs and digests are recorded in the current snapshot and
were independently matched to GitHub. Their private 27-JSON receipt set had a
maximum string length of 72 bytes, no prohibited privacy-key category, and
aggregate sorted-roster SHA-256
`92042f48b7dd845ce490ff0ae95a29cc1b8ac6f08efe211b8a7892989f03cff2`.

The release used one protected-environment approval, one masked same-value
`ESV_API_KEY` re-put, and one production Worker deployment. It performed no D1,
schema, or data write and no preview mutation. Production audits passed
original-language `11/11`, historical core `8/8`, and historical spine `10/10`.
The final active production Worker, production D1, and unchanged preview control
are recorded in the current snapshot.

## Executable topology and public contract

A fresh filesystem enumeration found exactly 277 test TypeScript paths. The
executable topology manifest partitions them exactly once as:

| Partition | Count |
|---|---:|
| active Vitest | 200 |
| support/setup/fixtures/helpers | 22 |
| manual maintained entrypoints | 4 |
| quarantined legacy/orphan | 50 |
| separately owned conformance entrypoint | 1 |

The public MCP contract remains exactly 11 tools and 6 prompts, with descriptor,
schema, annotation, order, resource/template, and logging differences checked by
the shared transport oracle. The maintained runtime matrix is:

| Runtime | Contract | Logging |
|---|---|---|
| compiled Node stdio | v6 | enabled |
| compiled Node HTTP | v6 | omitted |
| base production-like Worker | v6 | omitted |
| real preview Workerd | v7, discovery visible and execution disabled | omitted |

The protected PR #138 release reran unit coverage, current integration, real
Workerd, production-like Worker, compiled Node HTTP, and applicable official MCP
conformance checks successfully. The stdio row remains owned by the P1 public-SDK
process test and the common full-descriptor oracle; no runtime-specific result is
normalized away.

## Stabilization ownership outcomes

- D3 made AJV `8.20.0` an explicit production dependency without resolution
  drift; D4 removed repository-`.env` loading from Node unit setup.
- M2a established the closed executable topology manifest. M2b retired exactly
  five broken package commands without repointing or executing their legacy
  targets; all 50 legacy/orphan modules remain classified exactly once.
- P1 established the four-runtime MCP parity oracle. W1 Stage 1 centralized
  static workflow-topology ownership, and Stage 2 made both production callers
  consume the pure release-context resolver while retaining independent Git
  validation.
- M1 made the runtime-neutral primary-source descriptor and exact bound-tool
  identity the shared registration/prompt boundary without moving CCEL execution
  policy or changing the 11-tool/6-prompt contract.
- PR #136 introduced the canonical one-gate-plus-seven-release-artifact workflow:
  classification or verification failure cannot queue the production environment,
  and the protected job must revalidate the reviewed plan before mutation.
- PR #137 made `CURRENT-RELEASE.md` the sole present-tense release authority;
  PR #138 added the remaining CCEL runbook/architecture markers and time-scoped
  their historical PR #122/#123 identity claims.

The authority graph contains exactly one closed marker in each of its 17 owned
documents. `CURRENT-RELEASE.md` is the only `current-snapshot`; every other node
routes present identity to it. A negative scan found no competing unqualified
current-release phrases owned by the graph. Historical evidence remains dated
and operational runbooks require the current snapshot plus fresh live reads.

## Dependency and security review

Using Node `22.23.1` and npm `10.9.8`, both the complete lockfile high-severity
audit and the production-only lockfile high-severity audit reported zero known
vulnerabilities. Required protected CI and release tests passed on the audited
source.

Repository-hosted scanning is an evidence limitation, not an executed check:
GitHub reports Dependabot security updates and secret scanning disabled, while
the authenticated code-scanning and secret-scanning alert endpoints are
unavailable. This audit therefore does not claim that GitHub code scanning,
Dependabot alert review, or secret scanning ran. The conclusion rests on the
lockfile audits, pinned workflow dependencies, executable tests, bounded release
receipts, and independent review described here.

## Accepted debt: H1 natural expiry

| Field | Accepted value |
|---|---|
| severity | Medium, owner accepted |
| owner | TheologAI owner |
| scope | 98 release artifacts in fourteen seven-artifact cohorts plus three separate gate artifacts |
| decision | H1 Option A, natural expiry accepted on `2026-08-24`; no durable archive |
| containment | private metadata, SHA-256 digests, and independently reviewed release verdicts remain |
| evidence impact | exact ZIP, content, file-roster, and privacy revalidation may become unavailable after natural expiry |
| reassessment | `2026-11-15`, evidence status only; never automatic cleanup |

The private decision receipt
`theologai-h1-retention-decision-20260824-v1.tsv` has SHA-256
`2fde36eee0516c232902460e8b1a3cba4c8a94754accd4bc028807654001e90a`.
The preserved H1 ledgers account for fourteen complete seven-artifact release
cohorts (PRs #124–#126 and #128–#138) whose artifact IDs/digests and prior
sanitized privacy reviews were independently verified, plus the three separate
PR #136–#138 plan gates. Their release-ledger and gate-ledger SHA-256 values are
`380536682ac876641854538e0f9ac5148bf8e117bb697a663d63c876564301fc`
and `7deb71b1a8d96f9c8bd40da63bab8778e595ad17366344bf8ceb3b14a9b2486b`.
The v7 summary and manifest SHA-256 values are respectively
`80de22709eee5d0deee728f73c96f2f30c0b68f2650b6656f1ca36fe12fe3d6c`
and `1c1b097600d76a22f0e6d517680b7bb93d5445bcdae0b53b226ca63ccc6ae495`.
Option A authorizes neither archive/download nor deletion, including deletion of
temporary copies, and grants no cleanup or rollback authority.

## Terminal reconciliation boundary

This audit and the current snapshot are the exact two documentation paths in the
terminal reconciliation. Its post-merge proof must independently show a valid
documentation-only plan, `classification_succeeded=true`,
`deploy_required=false`, `decision=skip`, `reason=markdown-documentation-only`,
and the exact two changed paths. The classifier must upload exactly one
short-lived deployment-plan gate artifact containing only the plan and SHA-256
sidecar, and the unprivileged verifier must validate it successfully. The
production job must skip before environment entry; GitHub deployments and the
seven-artifact post-deployment release cohort must remain zero. The bounded
closed-event Preview Revocation acknowledgement must pass without environment,
secrets, artifacts, or Cloudflare action.

Until that evidence exists, this document claims only the audited PR #138 source
and release identity above. Any third-path correction or substantive finding is a
new change and restarts the terminal audit.
