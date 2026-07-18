# Historical section-key foundation

This is a migration-free identity plan for the 17 currently hosted historical
documents. It is not read by either runtime and changes no database, D1
materialization, resource locator, MCP contract, corpus body, rights claim, or
deployment behavior.

## Why a separate key is required

The current database uses `section_number` both as a display label and as the
fragment in an exact-section resource URI. That value is not unique within a
work. Nested enumerations in the Baltimore and Philaret catechisms create 23
duplicate `(document_id, section_number)` groups: 256 rows share a locator and
233 rows cannot currently be named independently. For example, Baltimore
`#section-1` matches both “Who made us?” and multiple numbered list items.

The current Node and D1 section reads filter by document and section number but
specify no `ORDER BY`; SQLite does not promise which matching row `.get()` or
`.first()` returns. No deployed target for an ambiguous locator has therefore
been compatibility-proven. This immutable plan records the first source row in
the legacy-named `provisional_source_first_target` field; a later owner
decision approves those existing values as the authoritative targets for the
future migration, without claiming a deployed result.

The numeric database row ID, JSON array position, section title, content hash,
and a freshly recomputed duplicate suffix are not durable identities. A text
correction or inserted section could change any of them.

## Checked-in plan

`data/historical-section-key-plan.json` assigns every current source section an
explicit immutable `sectionKey`. Its SHA-256 source signatures bind plan
coverage to canonicalized source objects; they are drift detectors, not section
identities and must never be used to regenerate keys.

- Every previously unambiguous section keeps its old fragment as its key.
- The source-first row in each ambiguous group also keeps the old fragment.
  The ledger field remains named `provisional_source_first_target`, but its
  existing value is owner-approved as the authoritative target for the future
  migration. This is not evidence of historical or deployed resolution.
- The other 233 rows have frozen, reviewed assigned IDs. Their IDs are
  authoritative because they are checked in, not because of their numbering.
- Each distinct old fragment has exactly one legacy-resolution sentinel aimed
  at the owner-approved source-first row.
- New keys must use the existing URI-safe alphabet, contain 1–160 characters,
  form a canonical resource URI within the shared encoded-length bound, and be
  unique within a work.
- Removed keys move to the document's append-only `retiredSectionKeys` ledger.
  Retired keys remain reserved forever and cannot reappear as active keys or
  legacy aliases.

The verifier rejects missing or extra source sections, changed source
signatures, duplicate keys or aliases, unsafe identities, wrong legacy targets,
source-snapshot drift, and any change to the reviewed 23/256/233 collision
report. This initial ledger explicitly declares one-time `genesis` lineage and
has no predecessor. Run its full snapshot and history check with Node 22:

```bash
npm run data:verify-section-keys -- --genesis
```

Every later revision must declare `successor` lineage with the canonical
SHA-256 of the exact reviewed predecessor. Its required command is:

```bash
npm run data:verify-section-keys -- --previous-plan /path/to/reviewed-previous-plan.json
```

The PR and production workflows derive that predecessor from the exact PR base
or prior `main` commit. They choose `--genesis` only when that commit contains no
ledger; once a ledger exists, a maintainer cannot keep using genesis to bypass
append-only transition checks.

For a content correction, carry the same `sectionKey` forward, replace its
current source signature, and append the old signature to that key's sorted
`supersededSourceSignatures`. Never regenerate, renumber, or swap keys. For a
deletion, remove the active entry and append its key to `retiredSectionKeys`;
never reuse it. The transition verifier enforces unchanged-signature ownership,
explicit correction history, deletion retirement, and append-only retired keys.

## Future database consumption

The planned UBS semantic runtime owns migration `0004` and transform 7, subject
to its separate license and vendoring decision. Only after that slice is
settled should historical corpus provenance use migration `0005` and transform
8.

That later migration should consume this plan by adding a unique canonical
`section_key`, retaining `section_number` as a non-unique display citation, and
supporting unique legacy aliases. Runtime reads should resolve canonical keys
before aliases and must never fall back to an ambiguous display number. The
later versioned MCP contracts can then expose canonical `sectionKey` separately
from display `sectionNumber`.

The owner has approved the existing source-first targets for future migration
`0005`, so no production-observation capture is required to select those
targets. Migration `0005` itself remains a separate gated implementation: it
must add deterministic canonical/alias reads, receive independent review and
black-box audit, and only then may be considered for preview or production.
It is intentionally not implemented in this foundation branch.

This foundation does not authorize a source pack or establish edition,
translation, transcription, OCR, or republication provenance. Those remain
separate review and release gates for transform 8.
