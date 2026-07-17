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
checks that these four *local* proposals agree:

1. first source-array row;
2. lowest generated SQLite row ID;
3. first deterministic D1 seed INSERT; and
4. the ledger's provisional legacy alias target.

That is useful evidence for a later compatibility decision. It does **not** say
what the public runtime returned, and it does **not** make a future alias
authoritative.

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
  "decisionStatus": "pending"
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

## Later decision gate

Before migration `0005`, transform 8, or any public canonical-key/legacy-alias
behavior, separately choose one of the following:

1. release and black-box audit an explicit deterministic legacy-read order; or
2. capture an authoritative, privacy-safe production mapping for every
   ambiguous locator.

Only that later reviewed decision may establish historical compatibility.
