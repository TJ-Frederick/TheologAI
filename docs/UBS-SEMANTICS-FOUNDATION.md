# UBS Hebrew semantic foundation

The approved source acquisition and the M4A local-only materialization are
complete. The repository contains the exact approved UBS source pair, an
executable local migration `0004_ubs_hebrew_semantics`, transform 7, a derived
SQLite build, deterministic D1 seed generation/import verification, and
inactive Node SQLite and Worker-D1 aggregate adapters. Those local artifacts
are verification inputs only: no runtime composition root registers them, and
they cause no tool, prompt, resource, manifest-public-contract, binding,
remote-D1, preview, production, or deployment change.

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
Neither approval authorizes public exposure, a remote D1 import, a binding
change, or a deployment.

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
schema. This work is complete only locally; no remote D1 database has received
the migration or seed, and no Worker binding has changed.

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

M4A implements inactive Node SQLite and Worker D1 adapters behind the
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

An inactive, source-free `HebrewSemanticEvidenceService` now exercises this
boundary only with invented synthetic fixtures. It is deliberately absent from
all composition roots and public exports. The seam accepts only the existing
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

The public semantic service and aggregate seam remain unregistered in both
Worker and Node composition. The local adapters name the completed storage
layout so it can be verified, but no runtime path can call them and no remote
D1 binding, preview, or production environment has been changed.

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

The inactive draft caps the serialized semantic response at 32 KiB UTF-8 and
also bounds every definition, gloss, identifier, reference, domain, candidate
array, and provenance field. Every branch carries an honest result window.
A continuation is allowed exactly when `hasMore` is true and carries the opaque
cursor plus its exact operation, artifact identity, public/source identity pair,
and normalized-reference binding. JSON Schema enforces the structural and field
bounds only; it cannot enforce relational arithmetic or the total serialized
byte size. The inactive pure presenter guard separately binds the request,
top-level identity/reference, continuation, and provenance artifact, validates
status-specific counts and window arithmetic, and returns the exact serialized
string after enforcing the 32 KiB UTF-8 cap. Runtime registration and actual
presentation remain later work. The stronger reference-aligned status also
requires the output token identity and verifier version to match a trusted
caller-supplied alignment assertion. That assertion also binds the exact source,
sense, and evidence-row identities, so a valid token/verifier pair cannot
authorize swapped semantic evidence. None of those values is trusted merely
because it appears in the proposed output. One shared bounded normalized-
reference validator is used by compiler ingestion, repository cursor
creation/parsing, and the presenter request; it rejects control, format,
bidirectional, line-separator, noncharacter, and malformed non-scalar Unicode.

### H. Release and audit

The completed local checks are prerequisites, not release evidence. A future
release must separately authorize a fresh preview D1, remote migration/seed,
binding change, protected preview deployment, and black-box audit before any
production decision. It must cover beginner/expert, ambiguity, missing-data,
attribution, withheld-evidence, environment-isolation, and rollback paths.
Code and D1 rollback remain a matched pair; no predecessor database is deleted
without separate permission.

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
