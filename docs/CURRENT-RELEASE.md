# Current release snapshot

This dated, sanitized record is the **designated current snapshot for these
entry/reconciliation documents**: the README, production and preview release
reconciliations, Worker operations, the Phase 3B plan, and primary-source
catalog scope. It was observed through protected run `32165010129`, completed
`2026-08-18T17:44:52Z`; it is not a timeless guarantee or the sole authority
for every historical document in this repository.

## Active production assignment

PR #124 merged as source `7f567ef0d050c91ac24e02e9798ac68cf448f8ff` with tree
`a61e76014037a59d53db6ab92cf9d27707bf2059`. Protected run `32165010129`
recorded GitHub production deployment `5967750549` and the active Cloudflare
assignment: deployment `dec913dc-1c1e-4bb0-b616-8cdb4bb14822`, Worker
`815b6e78-3dfc-435f-bcb4-5715802fd9aa` (version #108), and
`THEOLOGAI_DB` `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`). The numbered Worker version is not
PR #108.

The immediate same-D1 predecessor is retained only as predecessor evidence:
deployment `b2541421-17eb-4cf2-9f35-e16d4e243038`, Worker
`43ec9518-446e-4a26-bd34-ac4b647f0f51` (version #106), on the same production
D1. It is not the active assignment.

## Preview control

The preview control observed with that release remains deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (version #144), and D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). It is a control identity, not a
claim that later release activity cannot change it.

## Rollback boundary and evidence

The separately retained PR #108 matched rollback record is historical
evidence: deployment `3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (version #98), and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). Do not mix a Worker from that pair
with a different D1. Any rollback requires owner authorization plus fresh
compatibility and readiness evidence for the complete matched pair.

Run `32165010129` uploaded seven sanitized evidence artifacts: audit
`9335870200` (`e401a9e6139ef3503780261806890d3cebaf3de04682f08d6b32453e1f8e1651`),
reconciliation `9335869860`
(`86d586ff75cd32893c48501ae6bc5cce2a0f6dc9098701bd0040c3102143c647`),
final routing `9335867356`
(`c5eaec43f82d2571bef3e449c52ff0181f3742de536cee015f7e03dac5b1a283`),
edge `9335841157`
(`be8cc4c98ec86daa193c4113dc2a4166148e2dd733b3bb0b6766253c27597d7b`),
candidate cutover `9335834854`
(`5dc6672e60d0ef3ef4d5c9a5f07a2574b557076b1e94ec0c2ec623825ff4e43a`),
predecessor `9335818590`
(`a0d78b84fbd35ffdf3c87c4513d3558d5d1c9e70b683dbd624c6add3029a2d81`),
and D1 readiness `9335816004`
(`b177d9e0970ff23711059ba74acab2ef9024361cb458a58b47ba95aced297955`).
They retain bounded identities, counts, and hashes rather than request bodies,
tool output, source text, or credentials.

## Scope and deferred authority work

This snapshot intentionally does not reconcile every release claim in the
repository. Confirmed deferred authority debt is in `CLAUDE.md`,
`test/unit/docs/publicContract.test.ts`, `CHANGELOG.md`,
`docs/CUSTOM-DOMAIN-MIGRATION.md`, `docs/D1-DATA-WORKFLOW.md`,
`docs/ROADMAP.md`, `docs/TRANSFORM11-HISTORICAL-SPINE-ACTIVATION.md`,
`docs/UBS-HEBREW-V0.9.2-DERIVED-NOTICE.md`, and
`docs/UBS-SEMANTICS-FOUNDATION.md`. The touched entry/reconciliation documents
also retain contextually scoped legacy fixture literals as temporary debt. CCEL,
architecture, development, and `NOTICE` documents are further-audit candidates,
not confirmed stale claims.

This document makes no no-deployment-canary result claim; only the post-merge
main workflow establishes that result. On a successful documentation-only skip,
Git main advances while the deployed source/tree remains the recorded assignment
until a later protected production release changes it.
