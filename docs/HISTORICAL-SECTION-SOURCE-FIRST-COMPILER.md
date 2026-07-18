# Historical section source-first compatibility compiler

Status: **migration-free preparation; runtime inactive**
Scope: **the existing 17 checked-in local historical works only**
Activation gate: **migration `0005`, transform 8, separately reviewed and approved**

## What this freezes

The offline compiler in `scripts/historical-section-compatibility-compiler.ts`
reconstructs a content-free compatibility map from three authoritative inputs:

1. the current JSON documents in `data/historical-documents/`;
2. the immutable section-key ledger in
   `data/historical-section-key-plan.json`; and
3. the approved source-first decision packet in
   `test/fixtures/historical-section-compatibility/real-local-evidence.json`.

For every source section, the output binds the existing document ID, one-based
source ordinal, source signature, old display-number locator, immutable section
key, and canonical resource locator. For every old locator, it binds exactly one
future alias target: the first matching section in checked-in source order.
Canonical section keys are resolved before legacy aliases. An alias that would
shadow a different canonical key is rejected.

The regenerated output has exactly:

- 17 documents;
- 3,054 canonical section rows;
- 2,821 legacy locator aliases; and
- 23 collision groups, covering 256 sections and making 233 sections newly
  addressable.

The output intentionally contains no title, body, question, answer, topic, or
edition-rights fields. Source signatures bind the map to the unchanged current
content without copying that content into compatibility evidence.

## Compact attestation

`test/fixtures/historical-section-compatibility/source-first-compiler-attestation.json`
is a compact fail-closed attestation. It pins:

- compiler schema version and the exact inactive policy;
- canonical hashes of the section-key plan, ordered historical source set, and
  approved source-first evidence;
- all six exact count sentinels; and
- the SHA-256 of the complete canonical compiled output.

The attestation is not a source of section identities or content. Verification
always regenerates and validates every map row from the authoritative inputs,
then compares the complete output hash. A future migration may obtain the full
map only by running the compiler; it must not expand or reinterpret the compact
attestation as data.

## Verification and future emission

The compiler is intentionally absent from package scripts, builds, runtime
imports, deployment configuration, manifests, Wrangler configuration, and
workflows. It makes no database or filesystem writes.

```bash
npx tsx scripts/historical-section-compatibility-compiler.ts
npx tsx scripts/historical-section-compatibility-compiler.ts --emit-map
npx vitest run test/unit/scripts/historicalSectionCompatibilityCompiler.test.ts
```

The first command regenerates every row and verifies the tracked attestation.
The second writes the verified full map to standard output for inspection or a
future separately gated migration compiler. Neither command migrates data or
changes runtime behavior.

## Explicit non-goals

This preparation does not add migration `0005`, transform historical sources,
change D1 or SQLite, regenerate seeds or manifests, register MCP resources,
alter document content or IDs, assign edition rights, or claim production
observation. It does not include Norton/EEBO-TCP acquisition work or establish
the separate `sectioned_only` delivery contract.
