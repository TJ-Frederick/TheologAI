# Historical section compatibility evidence

This is an inactive, offline prerequisite for a later historical-section-key
migration. It changes no historical JSON source, database schema, D1 seed,
repository query, MCP resource, tool, prompt, Worker configuration, or deployed
behavior.

## What the packet proves

The checked-in
[`real-local-evidence.json`](../test/fixtures/historical-section-compatibility/real-local-evidence.json)
is deliberately content-free. For each of the 23 duplicate current locators,
it records only:

- the document ID and duplicated display locator;
- one-based source-array ordinal and canonical source-object SHA-256;
- the already-reviewed planned section key;
- the generated SQLite builder row ID; and
- the deterministic D1 `document_sections` INSERT ordinal.

It covers all 256 rows in those collision groups and the 233 rows that become
independently addressable under the future key plan. It contains no title,
question, answer, chapter, section body, request data, user data, live result,
or private telemetry.

The verifier regenerates that compact projection from the local source JSON and
the checked-in section-key ledger. It then reads only `id`, `document_id`, and
`section_number` from a newly generated SQLite database, and only the matching
identity columns from a manifest-checked D1 seed. For every collision group it
checks that these four *local* projections agree:

1. first source-array row;
2. lowest generated SQLite row ID;
3. first deterministic D1 seed INSERT; and
4. the ledger's source-first legacy alias target.

The owner has approved that existing source-first target as authoritative for
the future migration. This packet still does **not** say what the public
runtime returned, and the approval does **not** change a future migration's
separate implementation, review, or release gates.

## Why no runtime target is claimed

The current Node repository calls better-sqlite3 `.get()` and the D1 repository
calls `.first()` on the same `document_id`/`section_number` predicate with no
`ORDER BY`. SQLite and D1 therefore provide no compatibility-safe target for a
duplicate locator. The packet is intentionally fixed at:

```json
{
  "nodeGetCurrentResolution": "unordered_no_compatibility_proof",
  "d1FirstCurrentResolution": "unordered_no_compatibility_proof",
  "productionObservedTarget": null,
  "decisionStatus": "approved_source_first"
}
```

The verifier reads those query declarations too. If either query becomes
ordered, this evidence must be reviewed and revised rather than silently being
treated as proof of the new behavior.

## Verification

Build the derived database and deterministic seed in a disposable location,
then verify both artifacts together:

```bash
npm run build:db -- --output /tmp/theologai.db
npm run d1:seed:export -- --database /tmp/theologai.db --clean
npx --no-install tsx scripts/historical-section-compatibility-evidence.ts \
  --database /tmp/theologai.db \
  --seed-directory scripts/d1-seed
```

The pull-request and production workflows run the same verifier only after
they have built the database and reproduced the local D1 seed. It makes no
network request and does not contact preview or production.

## Approved target and remaining gates

The owner approved source-first for every ambiguous legacy locator. The
checked-in source-first alias targets are therefore authoritative **only as the
selected target for a future migration**; no production-observation capture is
needed. `productionObservedTarget` deliberately remains `null`, because this
is not a claim about the unordered deployed Node or D1 reads.

Migration `0005`, transform 8, canonical-key/legacy-alias runtime behavior,
database or D1 changes, and any preview or production release remain separate
gates. That later work must implement deterministic canonical/alias reads and
receive its own review and black-box audit; this inactive evidence packet does
not make a public behavior change.
