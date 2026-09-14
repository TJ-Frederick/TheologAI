# Release history

<!-- theologai-release-authority v1 role=historical-release-history current=docs/CURRENT-RELEASE.md -->

This document preserves the dated release and audit evidence formerly carried
in the project entry document. It is historical evidence, not current release
identity authority. See the [current release snapshot](CURRENT-RELEASE.md) for
the active production and preview assignments.

Use the preview URL only for explicitly authorized release testing. The
following is the historical PR #122 production baseline, not current today:
`86475ecf8288cb0ebcb6467c77c0fd0998a8f1c2` (tree
`8150aa29e7e4a22141edbfc9ab568df933f9c9b3`). Protected workflow
`31631924636` deployed Cloudflare deployment
`e62698f3-f6b0-4145-97bf-28abdeae0e3a`, serving Worker
`02174f95-abe2-480b-84bf-3e8c1a3a0320` (#100) as the sole active assignment,
bound to schema-`0009` D1 `theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`). Remote readiness and authority,
historical core, Transform-11 spine, original-language, edge stabilization,
final Worker identity, preview-control, and environment-isolation checks all
passed. CCEL execution remains disabled.

The exact captured PR #108 Worker/D1 pair is the immediately preceding primary
rollback unit in that dated release record; it is not current today: deployment
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6`, and D1
`theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). PR #101 is older retained rollback
history, not the immediate rollback claim.

The successor delivery program is tracked in
[Phase 3B](PHASE-3B-PLAN.md). The 3B.1 dual-era implementation is locally
release-ready and awaits its separately authorized protected preview proof;
it makes no claim about the currently deployed runtime.

The historical PR #96 `original_language_study` schema-v2 audit passed 11/11
cases.
It made 14 stateless HTTP exchanges (initialization, initialized notification,
`tools/list`, and 11 tool calls), with a 180-second end-to-end cap, 30-second
per-request cap, 256 KiB per-response cap, and 1 MiB aggregate cap. The
audited v2 fixture SHA-256 is
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`; retained
evidence is sanitized metadata and hashes, not live tool output or source text.

PR #72 is retained only as the matched rollback record: merge
`72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`). It is not the active production
binding.

> **PR96 broad MCP smoke — PASS:** Completed in 8.834 seconds. Sanitized
> `production-mcp-smoke-audit.json` evidence SHA-256:
> `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
> It verified 26 MCP operations across 27 HTTP exchanges and 293,466 aggregate
> MCP response bytes, stateless with no retries or redirects. Pre/post identity
> was unchanged: deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

> **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
> post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
> Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
> SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
> 1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
> SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
> 848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
> Two automatic reconnect warnings and a maximum uninterrupted segment of about
> 19m12s mean this is neither a continuous 30-minute observation nor an
> exhaustive/global request count. Wrangler tail authoritatively cannot provide
> a request total: 2,172 observed events = 2,167 ok + 5 separately classified
> client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
> truncated events, and 0 unexpected release errors. Raw captures are private
> and unpublished because they contain request metadata. Final authoritative
> identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
> `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
> `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
> sole 100%; identity SHA-256
> `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

PR95's Transform9 source-pack release is historical preview evidence:
Cloudflare deployment `3467d062-9097-4ffe-9ff1-db900838f538` served Worker
`8d516c26-6cfe-451c-889a-7dd580b1f4ca` at 100% with
`theologai-preview-20260727-normal-a`
(`776944d4-60d1-457f-b13e-b4e7898971ca`). The reviewed core-eight made that
historical checked-out catalog 25 works. The integrated Transform-10 Aquinas work
remains local-only and unpublished: it has no document/catalog projection or
runtime activation.

The protected PR #101 preview release deployed Cloudflare deployment
`070b292b-0bae-400a-b983-3d72157b5a96`, serving Worker
`bd722b69-2e2c-4d8d-b42b-617e8caba13d` (#130), bound to
`theologai-preview-20260728-hierarchy-a`
(`51890e12-1c3f-421f-b661-9a5ea9637e43`). It was unbound when prepared from the
reviewed 49-file, 1,627,474-row deterministic seed for schema `0008`; remote
readiness passed, Transform-8/9 authority audits passed, and Transform-10
normal-corpus exclusion predicates proved hierarchy, publication, and
Aquinas-lineage rows empty. The protected release subsequently proved this
exact binding; it is the retained compatible preview predecessor and makes no
production claim.

PR #107's preview candidate `theologai-preview-20260728-transform11-a`
(`62b871a6-5b4d-4d9b-8f52-301f6c878f48`). Its one-use schema-`0008` import
applied the exact reviewed 49-file, 1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and the complete
Transform-11 source-pack authority audit (`1/1/1/1/1/1/133/17` pages) passed.
Protected preview deployment `5e812152-355b-4a5f-a123-2485e89f1550`
historically served Worker `06b9a603-8339-42b6-a246-ef9238563043` (#140) with
that exact D1 and is the immediate predecessor to PR #122. Production was
unchanged by that preview release. Transform-10 hierarchy,
publication, and Aquinas material remain excluded.

That historical PR #107 preview Worker predates PR #115's repository-only,
unpublished pin to `https://www.ccel.org/home3/search`. It is not a valid
code/resource-equivalent `100` predecessor for a `111` canary built from
current `main`. PR #122 has since completed the schema-`0009` preview
bind/deploy/audit stage. The separately prepared schema-`0009` production
candidate remains unbound; production bind/deploy/audit and read-only
environment-isolation verification remain separately gated. Completion of the
preview stage does not authorize credential work or the canary; see the
[CCEL canary transaction](CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md).

PR #101's former production assignment is older retained rollback history:
deployment `71b76d24-bf5f-490e-adc4-31cf63fb046e`, Worker
`bae58cd3-cad7-4663-879d-408accf061b0` (#96), and D1
`theologai-production-20260728-hierarchy-a`
(`f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395`). It was unbound when its reviewed
49-file, 1,627,474-row schema-`0008` preparation completed: remote readiness
passed, Transform-8/9 authority audits passed, and Transform-10 normal-corpus
exclusion predicates proved hierarchy, publication, and Aquinas-lineage rows
empty. The protected production workflow subsequently proved the exact binding
before and after its black-box audits. Production primary-source stabilization
matched on attempt 1, `original_language_study` v2 passed 11/11 cases, and all
eight reviewed Transform-9 core works passed. This release activates no
Transform-10 hierarchy or publication rows.

The protected PR #108 production release activated the separately prepared
Transform-11 candidate `theologai-production-20260729-transform11-a`
(`53211f50-a893-4b4c-be1e-bc625a595dc7`). It was created once in ENAM from
merge `501ae7840a71ceb589dc3b1ae9863aef83e3586f`, exact tree
`dec0f2d66779e6126b3ddb02e74304b97293c67f`, and the reviewed 49-file,
1,630,259-row seed with corpus identity
`29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4`.
Primary readiness, Transform-8 authority (`1/12/12` pages), and complete
Transform-11 source-pack authority (`1/1/1/1/1/1/133/17` pages) passed.
Protected workflow `30496350408` then deployed
`3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8`, Worker
`291f3292-3fa9-44fc-bf6f-b68fd2f4cef6` (#98), from merge
`8da99fd0a161b90a4bd90ab29bde1abf796b3bf6` and bound it to that exact D1.
Historical core passed 8/8, Transform-11 spine passed 10/10,
`original_language_study` passed 11/11, primary-source edge stabilization
matched on attempt 4 and remained stable, and independent post-release review
returned `SHIP`. The exact PR #108 Worker/D1 pair above is the primary
immediate rollback unit for this schema-`0009` cutover; PR #101 remains older
retained rollback history only.
For a preview-client rollback without changing server state, use the direct preview
`workers.dev` address above; the production `workers.dev` address intentionally
redirects rather than serving a separate legacy Worker.

In the historical PR #122 record, production and preview used their distinct
audited schema-`0009` Candidate-C D1 databases. Earlier local-only and preview-only activation
statements are historical. The historical PR #96 public
`original_language_study` v2 audit does not independently establish the runtime
path for every later historical transform. The pinned packet's `SOURCE.json`
remains a historical acquisition-gate snapshot, not deployment evidence.
Production v6/local-only and preview v7/discovery-only remain deployed with
CCEL execution disabled before adapter, coordinator, or fetch.

### Schema-0009 preview release state

The protected release targeted the prepared preview D1
`theologai-preview-20260811-schema0009-a`
(`74f456e2-6951-4003-bb6f-91951342bf8f`). The workflow re-checked the
candidate, deployed it, proved the active preview binding, and completed its
audit. It validated the fixed production control against the checked-in
production D1 name/UUID and fresh inventory before deployment, immediately
afterward, and again after the final preview audit.
PR #123 subsequently deployed exact source
`7fb3ec5113a16ed86bfc4a403a3ec3678d4d4dd0` (tree
`28e555808ad3840d145a7ddd7e57934dc30e45c2`) as preview Worker
`70bbbecf-3fe6-4a04-8c34-babc3df09ad0` (#144) through deployment
`4108d59a-4092-4389-824c-fa3820ab66f6`, retaining the same schema-`0009` D1.
All fixed audits and three production-control observations passed. The
authorization label was removed and revocation run `31645546905` succeeded.
PR #122 deployment `13393917-fa91-4afc-aeaf-2809db6701a2` and Worker
`b2c62527-5759-4c1d-a9a3-8c1d43dddabe` (#142) are the immediate retained
same-D1 predecessor. The detailed sanitized evidence is in
[docs/PREVIEW-RELEASE-RECONCILIATION.md](PREVIEW-RELEASE-RECONCILIATION.md).
This post-release evidence commit postdates the deployed source and makes no new
runtime claim.
Production is separately bound to schema-`0009` D1
`theologai-production-20260811-schema0009-a`
(`9bc79346-338b-439e-a2a5-424f4418eb21`) by the protected PR #122 release. The
CCEL canary gate remains unrecorded and inert. The exact preparation identity,
seed evidence, and release boundary are recorded in
[docs/D1-DATA-WORKFLOW.md](D1-DATA-WORKFLOW.md).


