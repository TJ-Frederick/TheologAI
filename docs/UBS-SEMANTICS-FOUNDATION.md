# Source-free UBS Hebrew semantic foundation

This is pre-approval engineering only. It contains no downloaded or copied UBS
dictionary bytes, no executable `0004` migration, no D1 rows, and no runtime,
tool, prompt, resource, manifest, transform, or public-contract change. Every
semantic fixture value is an unmistakable synthetic sentinel, not UBS content.

The planned Hebrew-only layer uses exactly
`UBSHebrewDic-v0.9.2-en.JSON` and
`UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`. It keeps dictionary entries,
one-to-many `H####`/`A####` identities, senses, lexical domains, and
source-attested reference evidence as separate records with per-artifact
provenance. A dictionary reference is evidence about a source sense; it does
not establish that a local morphology token has that sense. Public output may
say `exact_context` only when a separately versioned verifier proves both the
source sense/reference and exact local token alignment. Otherwise output is
`lexical_candidates` with an explicit reason or `unavailable`.

Internal compilation preserves both `H####` and `A####`. Public Hebrew v1
exposes only `H####` and explicitly reports that `A####` is withheld from the
public scope. TBESH `Meaning` remains separately withheld at the rights
boundary.

## Bounded implementation slices A–H

### A. Owner and rights gate

Approve or reject vendoring the exact two files above and the CC BY-SA 4.0
boundary. Until approval, source acquisition, source-specific decoding,
migration creation, materialization, and public exposure are blocked.

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

Turn the SQL design fixture into migration `0004` only after review, then move
the global data transform from 6 to 7. The design separates the dictionary and
lexical-domain sources and uses a cross-source sense/domain join. Parent domains
must be inserted first, matching compiler order and immediate foreign keys.

Measure the built database and deterministic seed, not only source size. The
project gate is at most 350 MiB. The harness also enforces Cloudflare D1's
current 2 MB row, 100 bound-parameter, and 100 KB statement limits plus
TheologAI's 8 MiB seed-chunk limit. Cloudflare's limits were rechecked on
2026-07-17 at <https://developers.cloudflare.com/d1/platform/limits/>.

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

Implement Node SQLite and Worker D1 adapters behind
`IUbsSemanticRepository`. Use the shared caps and order identifiers in the
kernel contract. Prove result parity, query plans, bounded result windows with
honest totals, stable ordering, deterministic keyset cursors bound to the exact
operation, query scope, and semantic artifact identity (preventing replay after
a corpus or environment change), and no Worker-bundle inclusion of source
artifacts. The repository returns evidence and candidates; it never resolves a
contextual token sense.

### G. Structured contract and presentation

Review and version the draft fixture before registering it. Every
`exact_context` result includes a human-readable definition, glosses, structured
domain evidence, source-attested reference evidence, and verified token
alignment. Beginner output always gives a plain-language explanation. Candidate
output gives an explicit ambiguity reason. Expert provenance retains both exact
artifact versions, commits, blobs, hashes, modification descriptions, publisher,
license, and transformation identity.
Public provenance includes each exact HTTPS source URL. Reference evidence
always carries its exact `sourceId` and `senseId`; an evidence row cannot be
presented without both identities.

The public identity list is `H####` only. Its exact two-item withholding array
reports both the `A####` public-scope withholding and TBESH `Meaning` rights
withholding; extra or missing entries fail validation. Neither withheld field
may be blended into UBS definitions or glosses. Markdown remains compatible.

### H. Release and audit

Prepare a fresh preview D1, run readiness and identity checks, deploy only after
protected approval, and black-box beginner/expert, ambiguity, missing-data,
attribution, withheld-evidence, environment-isolation, and rollback paths.
Production follows only after independent review and owner approval. Code and
D1 rollback remain a matched pair; no predecessor database is deleted without
separate permission.

## Draft relational boundary

The non-executable SQL test fixture separates both sources, domains, entries,
entry-to-identity joins, senses, cross-source sense-to-domain joins, and
reference evidence. It applies strict nonempty text, normalized ID, exact
artifact, hash, identity, Hebrew language, JSON gloss-array, and foreign-key
checks. Names and indexes remain draft until real-source inspection and
measurement.
