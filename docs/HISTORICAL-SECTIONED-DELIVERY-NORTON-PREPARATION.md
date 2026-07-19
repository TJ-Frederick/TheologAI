# Historical `sectioned_only` delivery and Norton preparation

Status: migration-free and inactive. This document records a future delivery
contract and prepares one already-vendored edition for a later transform 9. It
does not add a migration, change the data manifest or D1 seed, register a
runtime service/resource/tool, alter a Worker, or authorize preview or
production deployment.

## Delivery boundary

Large historical works use `sectioned_only` delivery. A future whole-document
resource is only a bounded landing representation (at most 16,384 UTF-8 bytes)
with work and edition metadata plus a browse contract. It must not contain a
full body or a complete section directory.

`classic_text_lookup` will later provide browse pages of at most 32 entries.
Each entry is limited to source ordinal, frozen key, display label, heading,
and a native exact-section resource link. It contains no body. Its cursor is
bound to the delivery-contract version, document ID, edition ID, Gate 1 package
SHA-256, and last source ordinal. This makes cursors invalid if the corpus
identity or edition changes.

Only an exact-section resource may deliver body text. This design prevents a
1,250-entry directory or the approximately 4 MB Norton body from entering a
single MCP response.

## Norton transform-9 preparation

The checked-in plan at
`test/fixtures/historical-sectioned-delivery/norton-transform9-preparation.draft.json`
references, but does not copy, the existing Gate 1 package:

- work ID: `calvin-institutes-of-the-christian-religion`;
- edition/document ID: `calvin-institutes-norton-1561-eebo-tcp-a17662`;
- package SHA-256: `3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33`;
- 1,250 frozen keys from `a17662-source-ordinal-0001` through
  `a17662-source-ordinal-1250`;
- work chronology: 1536–1559, successive Latin editions with final Latin
  edition in 1559; and
- exact Norton edition publication: London, Reinolde Wolfe and Richarde
  Harison, 1561.

The work chronology names the Bibliothèque nationale de France canonical work
record as metadata provenance. The exact edition/transcription provenance,
rights boundary, and unresolved-transcription disclosure remain the existing
local EEBO-TCP A17662 Gate 1 record. This preparation neither re-acquires nor
duplicates those bytes. It does not state an unqualified 6 May publication
date, does not claim Norton translated the French edition, and does not make a
generic Calvin alias active.

Run the local, read-only audit with:

```bash
node --import tsx scripts/historical-sectioned-delivery.ts --verify
```

## Transform ordering and activation gate

Transform 8 remains a separate compatibility release for the existing 17
historical documents. The plan records transform 9 as a future successor and
does not make transform 8 depend on Norton. A later activation must first have
an implemented, transform-8-compatible `sectioned_only` Worker path, then
separately approve migration, deterministic materialization, catalogue/routing,
preview, and production. Generic aliases remain dormant until that later
activation decision.
