# Norton Transform 12 inactive authority

Status: disposable local-only proof, deterministic, inactive, and unpublished.
Transform 12 advances the machine D1 schema from 10 to 12, but the canonical
build and D1 materialization contain zero Norton rows. It does not register
Norton in the 35-work catalog, create a runtime document or delivery profile,
change a Worker binding, authorize normalized-text redistribution, or authorize
preview/production preparation or deployment.

## Exact authority

Transform 12 replays the checked-in EEBO-TCP A17662 source at commit
`32191150ad4a919dfd2c28c89b1dbc1c2396252a` and XML SHA-256
`90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4`.
The compiled package SHA-256 is
`3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33`.
The disposable proof inserts one pack, work, edition, authority artifact, and
1,250 exact sections in one transaction into an operating-system temporary
copy of a freshly verified canonical database. Frozen keys run from
`a17662-source-ordinal-0001` through
`a17662-source-ordinal-1250`; labels are `Source segment N`. The source's
provenance uncertainty is preserved.

`normalized_text_rights_json` is deliberately negative: `not_reviewed` and
`no_release_authority`. This is not a public-domain or redistribution approval.
Page images, facsimiles, CCEL material, and the separate Aquinas packet are not
part of this transform.

## Dormant delivery seam

Migration `0009_norton_transform12_inactive.sql` adds a generic, immutable
`historical_sectioned_publications` seam. Canonical builds leave that seam
empty. Only the disposable proof binds the Norton document/edition ID
`calvin-institutes-norton-1561-eebo-tcp-a17662`, a 16,384-byte landing cap,
32-entry browse pages, cursor contract `historical-sectioned-only-cursor-v1`,
and exact-section-only body delivery. Its only allowed activation state is
`dormant`. Triggers reject later document or delivery-profile registration, so
dormancy fails closed without weakening migration 0006's active profile rules.

## Candidate C storage lifecycle

The migration implements Candidate C as real schema:

- `historical_edition_sections_fts` is external-content over
  `historical_edition_sections(rowid)`;
- `sections_fts` is external-content over `document_sections(id)`;
- hierarchy FTS remains external-content; and
- `strongs_fts` remains content-bearing.

Canonical builds and seeds insert base tables first, populate or rebuild all four
FTS indexes once, run FTS integrity checks, prove row/content parity, and then
insert the singleton Transform-12 corpus seal. Twelve base-table triggers reject
insert, update, and delete after sealing. The converted indexes therefore have
no `*_fts_content` body shadows and no supported incremental-maintenance path.

## Disposable audit boundary

Run the complete proof with:

```bash
npm run audit:norton-transform12-disposable
```

The command accepts no arguments. It builds and verifies a canonical zero-Norton
database, copies it into an OS temporary directory, materializes Norton there,
creates a separate temporary seed, and imports that seed through isolated local
Workerd. It filters Cloudflare credentials, requires `--local`, rejects
`--remote`, never writes `scripts/d1-seed`, and removes its workspace on exit.
Both disposable databases must fail the canonical readiness gate.

The read-only authority audit regenerates the package from the pinned local
inputs and compares every stored field and body. It reads at most eight bodies
per keyset page: 1,250 bodies in exactly 157 ordered pages. It also proves
external-content FTS MATCH coverage for all 1,250 frozen identities, boundary hashes for ordinals 1, 625,
and 1,250, exact lineage and dormant cursor identity, pending rights, and zero
Norton rows in public documents, runtime sections, delivery profiles,
identities, or aliases. SQLite and isolated Workerd run the same full authority
audit. The current disposable evidence identity is
`adc1a0b60a3597ee37324f8d74622c63daf6fbe37d614ee4c19c07d5e3ecdfd1`;
it is not a canonical corpus identity or release seed identity.

Activation remains a later, separately reviewed transform requiring an explicit
rights decision, runtime implementation, catalog/routing change, full release
verification, and separately authorized deployment.
