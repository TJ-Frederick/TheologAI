# UBS Hebrew semantic foundation

## Current production release record (PR #96; 2026-07-24)

This foundation preserves the pre-release M4A design and acquisition record;
those historical local-only statements are not current production-state claims.
PR #96 audit evidence fixes source commit
`ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
`adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, canonical endpoint
`https://mcp.theologai.xyz/mcp`, and server `3.6.0`. Cloudflare checks before
and after the audit found deployment `2d10d693-958e-47a6-ae24-81647679c2f6`
and Worker `7a3f5078-37bc-453e-bac7-a0743afd508a` as the sole 100% active
production version, bound to D1 `theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

The stateless public `original_language_study` v2 audit passed 11/11 cases in
14 exchanges under 180-second end-to-end, 30-second per-request, 256 KiB
per-response, and 1 MiB aggregate caps. Fixture SHA-256:
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`.
Evidence retains sanitized metadata and hashes, not tool output or source text.
This audit establishes observed public behavior, not an assertion that every
historical internal seam below is the current composition architecture.

PR #72 remains only the compatible rollback record: merge
`72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`).

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

The approved source acquisition and the M4A local-only materialization are
complete. The repository contains the exact approved UBS source pair, an
executable local migration `0004_ubs_hebrew_semantics`, transform 7, a derived
SQLite build, deterministic D1 seed generation/import verification, and
historical Node SQLite and Worker-D1 aggregate adapters. At that M4A stage,
those artifacts were verification inputs only and did not themselves establish
a remote binding or deployment.

The earlier authorization for draft-PR publication of the local M4A slice did
not itself authorize remote migration, runtime registration, or deployment.
PR #96 is the separately recorded production outcome above.

`SOURCE.json` remains the historical acquisition-gate snapshot for the pinned
source packet and derived support files. It is not a current release-state
record and must not be rewritten to imply a remote release.

The planned Hebrew-only layer uses exactly
`UBSHebrewDic-v0.9.2-en.JSON` and
`UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`. It keeps dictionary entries,
one-to-many `H####`/`A####` identities, senses, lexical domains, and
source-attested reference evidence as separate records with per-artifact
provenance. A dictionary reference is evidence about a source sense; it does
not establish that a local morphology token has that sense. Public output may
say `reference_aligned_source_candidate` only when a separately versioned
verifier proves both the source sense/reference and exact local token alignment.
That status still reports a source candidate, not an adjudicated contextual
meaning. Otherwise output is `lexical_candidates` with an explicit reason or
`unavailable`.

Internal compilation and repository cursors preserve and may query both fixed-
width `H####` and `A####` source identities. The future public boundary does
not broaden the shared Strong's parser: a user-facing identity remains the
existing unpadded `H430`, mapped explicitly to the source/internal `H0430`.
Repository entry lookup accepts only a validated, branded fixed-width internal
identity, including on the cursor-free first page; invalid raw strings fail at
the boundary instead of reaching a future adapter.
Public Hebrew v1 never accepts or emits `A####`; it explicitly reports that
those identities are withheld from the public scope. TBESH `Meaning` remains
separately withheld at the rights boundary.

## Bounded implementation slices A–H

### A. Owner and rights boundary

The owner approved vendoring the exact two files above under the scoped CC
BY-SA 4.0 policy, and separately approved M4A local-only materialization.
Those earlier approvals did not themselves authorize public exposure, a remote
D1 import, a binding change, or a deployment; PR #96 is recorded separately
above rather than inferred from them.

### B. Source pins and provenance

After approval, pin both exact artifact paths, versions, byte counts, Git
commit, per-file Git blob, SHA-256, publisher notice, license, and modification
description. Do not silently substitute another language, edition, version, or
file. Both records must declare exact artifact version `0.9.2` and transform 7;
a mixed version/transform pair fails closed. The inactive NOTICE template names
the complete required pair.

### C. Source-specific decoders

Write decoders against the inspected approved raw schemas. They must explicitly
allowlist publishable fields and reject unknown fields, malformed encodings,
third-party witness/note tags (including `{A:...}`), and embedded data whose
license is not covered. The present compiler accepts only a normalized
intermediate marked `invented_synthetic_only`; it makes no claim about raw UBS
field names.

### D. Normalized compiler and identity

Map approved fields to strict source, domain, entry, sense, and reference
records. Validate nested ownership, IDs, ordinals, foreign keys, parent-before-
child domain order, and domain acyclicity with color-state DFS. NFC-normalize
text. Canonically sort set-like identity/domain references using code-point
order and compute a reproducible SHA-256 over the normalized artifact. Run the
compiler twice from a fresh checkout. Preserve `A####` internally only.

### E. Schema, materialization, and D1 capacity

M4A turned the reviewed SQL design into migration `0004`, moved the local data
transform from 6 to 7, and materialized the full derived projection into local
SQLite. The migration separates dictionary and lexical-domain sources, retains
the cross-source sense/domain join, and requires parent domains before children.
The deterministic local D1 seed/import and Workerd verification use that exact
schema. At the M4A stage this work was complete only locally; the subsequent
PR #96 production release record above supersedes that point-in-time statement
for the active D1 binding without changing the historical provenance record.

Measure the built database and deterministic seed, not only source size. The
project gate is at most 350 MiB. The harness also enforces Cloudflare D1's
current 2 MB row, 100 bound-parameter, and 100 KB statement limits plus
TheologAI's 8 MiB seed-chunk limit. Cloudflare's limits were rechecked on
2026-07-17 at <https://developers.cloudflare.com/d1/platform/limits/>.

The deterministic exporter batches ordinary literal INSERTs at 16 KiB, below
the 100 KB D1 limit: local Workerd rejects some otherwise-valid near-limit
statements with `SQLITE_NOMEM`. Historical sections remain one-row INSERTs so
their source-first compatibility evidence can retain its exact row ordinal.

Capacity input must contain the complete named table, query-operation, and seed-
file inventories without omissions or duplicates. Seed inventory comes from a
generated-style manifest and supports contiguous numbered chunks per table,
each no larger than 8 MiB. Each file records its SHA-256, statement count, and
maximum seed-statement size; manifest aggregates must reproduce those values.
Repository-query statement sizes are measured and gated separately. Synthetic
measurements test only the harness. After
approval, counts and byte samples must be derived from
both exact artifacts, generated statements, and the built database; the final
gate requires the actual materialized database size.

### F. Repository and adapter parity

M4A implements historical inactive Node SQLite and Worker D1 adapters behind the
`IUbsSemanticEvidenceBundleRepository` aggregate contract. They preserve the
shared caps and order identifiers and are verified for parity, query plans,
bounded result windows with
honest totals, stable ordering, deterministic keyset cursors bound to the exact
operation, query scope, and semantic artifact identity (preventing replay after
a corpus or environment change), and no Worker-bundle inclusion of source
artifacts. The repository returns evidence and candidates; it never resolves a
contextual token sense. Every page records the count returned by prior pages;
`prior + showing` may never exceed the honest total, and a continuation is
present if and only if more rows remain. This makes a short terminal page
honest instead of comparing the global total only with the current page.

At that historical stage, an inactive, source-free
`HebrewSemanticEvidenceService` exercised this boundary only with invented
synthetic fixtures and was deliberately absent from composition roots and
public exports. The seam accepts only the existing
public Hebrew H-number grammar, forwards an internal repository page request,
and returns candidates or unavailable evidence by default. The stronger
`reference_aligned_source_candidate` status requires a separately versioned
assertion bound to one exact morphology token, H#### identity, normalized
reference, source, entry, sense, and reference-evidence row. Exact reference
matching does not infer overlap for ranges. Multiple exact assertions remain
ambiguous; every supplied assertion must match one exact returned evidence row,
and missing, off-page, or mismatched trusted evidence fails closed rather than
promoting a sense. Caller-controlled request fields and each alignment assertion
are copied into immutable primitive snapshots before the first repository await,
so later caller mutation cannot change a validated result. Each request,
cursor, alignment-array element, and exact alignment property is read only once;
accessor- or Proxy-backed records therefore cannot swap a value between
validation, matching, and presentation. The alignment collection must also be
a dense zero-to-eight-element array with an honest safe-integer length and no
own assertion index hidden beyond that reported length.

The seam inspects at most 16 senses and returns at most eight publishable
candidates per call, with explicit incomplete-coverage metadata when those
bounds intervene. It never reports evidence as unavailable from an offset,
partial, or capped window, and its unpaged sense, domain, and exact-reference
queries must return internally consistent complete first pages. This
deliberately temporary per-operation choreography is not suitable for runtime
composition or public registration.

OL-S2 adds an inactive `IUbsSemanticEvidenceBundleRepository` contract for one
bounded aggregate operation. It returns at most eight entry/sense candidate
rows plus their bounded domain, exact-reference, and two-source provenance
evidence, together with honest lexical-entry, semantic-sense, nested-evidence,
and candidate-window totals. Thus a future resolver can distinguish no entry
from an entry without senses and can fail closed when a returned or whole-query
window is incomplete without issuing one query per candidate. The operation's
repository call count is exactly one for an empty, short, or full page.

Every published aggregate object is reconstructed from an explicit allowlist of
validated fields; adapter-only properties are neither read nor carried into the
result. Lexical identities, bounded domain references and details, and exact
reference evidence are canonicalized with stable code-point and ordinal
ordering, so equivalent Node and D1 rows produce the same result. A candidate's
`domainTotal` is the authoritative pre-slice count: its returned domain refs
and details are capped at 16 and may be fewer than that total, in which case
`domain_evidence` explicitly records incompleteness. This supports real senses
with more domains than one response can safely include without pretending that
the capped window is complete.

Aggregate continuation cursors use the candidate's canonical entry/sense
keyset and bind the exact aggregate operation, order, semantic artifact SHA-256,
internal H#### identity, normalized reference, and prior result count. The
decoded cursor remains an untrusted request: the single aggregate repository
operation must validate that its exact keyset and prior count describe a real
ordered boundary for that exact artifact/query/order, then return its own
authoritative boundary attestation. The coordinator rejects missing, stale,
forged, noncanonical, false-terminal, or mismatched attestations before it
publishes any result or coverage window. A synthetically constructed cursor is
acceptable only when it names a genuine boundary; it grants no access beyond
public source material. No HMAC secret is needed for this read-only continuation
model.

The public semantic service and aggregate seam were unregistered in the
historical M4A composition. The local adapters name the completed storage layout
so it can be verified. PR #96's bounded v2 audit establishes the current public
result only; it must not be read as a claim that this historical seam is the
current runtime path.

Repository validation also mirrors compiler identity guarantees: lexical
identities and source ordinals are unique where their schema defines them, and
source-qualified sense and reference-evidence identities cannot recur across a
single resolution.

### G. Structured contract and presentation

Review and version the draft fixture before registering it. Every
`reference_aligned_source_candidate` result includes a human-readable
definition, glosses, structured domain evidence, source-attested reference
evidence, and verified token alignment while explicitly denying that this
settles contextual meaning. Beginner output always gives a plain-language
explanation. Candidate output gives an explicit ambiguity reason. Expert
provenance retains both exact artifact versions, commits, blobs, hashes,
modification descriptions, publisher, license, and transformation identity.
Public provenance includes each exact HTTPS source URL. Reference evidence
always carries its exact `sourceId` and `senseId`; an evidence row cannot be
presented without both identities.

The public identity boundary labels both forms without conflating them:
`publicStrongs` uses existing unpadded user syntax such as `H430`, while
`sourceIdentity` records the matched fixed-width UBS key such as `H0430`.
Only H identities cross that boundary. Its exact two-item withholding array
reports both the `A####` public-scope withholding and TBESH `Meaning` rights
withholding; extra or missing entries fail validation. Neither withheld field
may be blended into UBS definitions or glosses. Markdown remains compatible.

The historical inactive draft caps the serialized semantic response at 32 KiB UTF-8 and
also bounds every definition, gloss, identifier, reference, domain, candidate
array, and provenance field. Every branch carries an honest result window.
A continuation is allowed exactly when `hasMore` is true and carries the opaque
cursor plus its exact operation, artifact identity, public/source identity pair,
and normalized-reference binding. JSON Schema enforces the structural and field
bounds only; it cannot enforce relational arithmetic or the total serialized
byte size. The historical inactive pure presenter guard separately binds the request,
top-level identity/reference, continuation, and provenance artifact, validates
status-specific counts and window arithmetic, and returns the exact serialized
string after enforcing the 32 KiB UTF-8 cap. PR #96 later observed public v2
presentation under the bounded audit above; the audit does not prove that the
historical presenter is its current runtime implementation. The stronger
reference-aligned status also
requires the output token identity and verifier version to match a trusted
caller-supplied alignment assertion. That assertion also binds the exact source,
sense, and evidence-row identities, so a valid token/verifier pair cannot
authorize swapped semantic evidence. None of those values is trusted merely
because it appears in the proposed output. One shared bounded normalized-
reference validator is used by compiler ingestion, repository cursor
creation/parsing, and the presenter request; it rejects control, format,
bidirectional, line-separator, noncharacter, and malformed non-scalar Unicode.

### H. Release and audit

The completed local checks were prerequisites, not release evidence. PR #96 is
the separately recorded production decision and bounded black-box audit above;
it does not erase the release requirements for any later material change. Later
releases must cover beginner/expert, ambiguity, missing-data, attribution,
withheld-evidence, environment-isolation, and rollback paths. Code and D1
rollback remain a matched pair; no predecessor database is deleted without
separate permission.

## Relational boundary

The historical SQL test fixture remains a compact design guard. The executable
local migration now separates both sources, domains, entries, entry-to-identity
joins, senses, cross-source sense-to-domain joins, reference evidence, and
normalized coordinates. It enforces strict text/ID/hash/language/JSON and
foreign-key boundaries. Each coordinate retains only the globally unique parent
evidence key, so a duplicated evidence ID cannot drift; its target ordinal is
unique per evidence. Reconstructing the stored artifact additionally rejects a
non-canonical normalized-reference string. These local guarantees do not
register or expose a runtime feature.
