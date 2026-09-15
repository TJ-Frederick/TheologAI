# Norton activation assessment — 2026-09-15

This is a read-only activation assessment. It does not change Norton source
files, Transform12 proof, the database, runtime registration, deployment, or
secrets.

## Finding

The checked-in evidence supports activating the **EEBO-TCP Phase I
transcription and its derived normalized text**. No concrete remaining
restriction on that text was identified; an additional permission request is
not justified by an internal unreviewed marker. The evidence does not support activating page images,
facsimiles, or CCEL material. The shortest safe implementation path is to
admit the existing Norton package to the reviewed Transform11 source-pack
release and use its existing active projection. The dormant Transform12
Candidate C row is a capacity and authority experiment, not the runtime path.

## Rights evidence and limits

- The pinned `data/historical-sources/eebo-tcp/A17662/README.md` states that
  the Phase I keyboarded and encoded text is available under CC0 1.0 and may
  be copied, modified, distributed, and performed, including commercially,
  without asking permission. The repository lock and XML hash are recorded in
  `SOURCE.json` and `NORMALIZATION_REPORT.json`.
- The primary source repository is [TCP A17662](https://github.com/textcreationpartnership/A17662).
  The official [CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/)
  and [legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)
  permit copying, modification, and distribution without requesting permission. The source package contains transcription/XML only;
  its metadata explicitly excludes images and facsimiles.
- `norton-1561.edition.json` already records exact-artifact redistribution as
  approved under CC0, with a review date of 2026-07-17. Its uncertainty is
  about page-image rechecking and transcription quality, not a detected license
  prohibition.

The evidence therefore supports a current activation provenance record scoped
to the normalized transcription. It does not justify rewriting frozen source
hashes or historical proof metadata, and it does not make claims about assets
outside the pinned transcription/XML.

## What is and is not blocking

| Area | Evidence | Classification |
| --- | --- | --- |
| `NORTON_NORMALIZED_TEXT_RIGHTS_PENDING` | Used by `scripts/historical-transform12-norton.ts`, its authority audit, and its unit test to assert the dormant proof remains inactive. No active compiler, repository, MCP resource, or Worker/Node runtime imports it. | Internal inactive-proof marker; not an active licensing gate. Preserve it. |
| Active normalized-text rights | `scripts/historical-source-packs.ts` requires a new manifest member to carry `status: no_known_conflict`, `scope: normalized_public_domain_text_only`, a basis, and an ISO review date. | Internal provenance schema requirement, not a newly discovered legal restriction. Populate it from the existing CC0 evidence; no separate permission process is needed. |
| Release admission | `loadHistoricalSourcePacks()` accepts only manifest-declared files under `data/historical-source-packs/**`, with `editions/*.json` members and manifest hashes. Norton currently lives under `data/historical-sources/eebo-tcp/A17662`. | Technical admission work. Add an explicit source-pack member/manifest while preserving the existing pinned package. |
| Runtime projection | `materializeHistoricalSourcePacks()` creates `documents`, `document_sections`, FTS, delivery profiles, and section identities. Active repositories read these tables; they do not read `historical_sectioned_publications`. | Real integration step. Use the existing source-pack projection. Do not flip Candidate C `activation_state`. |
| Section semantics | The normalizer rejected inferred semantic milestones and retained source-ordinal labels (`Source segment N`). | Editorial choice and citation contract. Retain these accurate labels and distinguish the Norton 1561 edition from Beveridge; this is routine implementation, not a new approval requirement. |
| Provenance uncertainty | The package discloses light-touch transcription, illegible gaps, and no page-image recheck. | Quality/provenance disclosure. Keep it visible in metadata; do not silently “correct” the text. |

## Shortest justified activation path

1. Use an edition-specific public title (Norton, 1561), preserve source-ordinal
   citation labels, and keep existing Beveridge lookup behavior. The package already uses a distinct work identity,
   `calvin-institutes-of-the-christian-religion`, and edition identity,
   `calvin-institutes-norton-1561-eebo-tcp-a17662`, so it does not collide with
   the existing Beveridge work row.
2. Create a source-pack manifest/member that references the
   existing package identity and hashes, records the current normalized-text
   rights decision, and lists only the pinned transcription/XML artifacts.
   Use the existing manifest conventions; any required package placement or
   narrow loader extension is an implementation choice; the source package and frozen
   Transform12 evidence should remain unchanged.
3. Add the member to the active release inventory and update the generated
   database/readiness/catalog expectations for one additional pack member,
   its sections, artifacts, delivery profile, and identities.
4. Run the existing source-pack, database, Node/Worker contract, and D1
   readiness checks before any deployment approval.

## Evidence that should stop being treated as a blocker

Do not require another rights-approval ceremony for the CC0 transcription or
mechanical normalization. The positive manifest record is provenance to write,
not new permission to obtain. Keep the old pending record only as an accurate
record of the disposable proof; it is not an active prohibition.

The Candidate C triggers protect a separate dormant schema. Bypassing them is
unnecessary when the existing active source-pack projection already provides
section retrieval. Preserve content hashes, explicit transcription gaps,
source-ordinal citation identity, complete import checks, and edition distinction.

## Capacity and remaining implementation evidence

The historical capacity experiment already tested three complete Norton layouts;
all fit its 367,001,600-byte project budget. Candidate C measured 311,681,024
bytes with 55,320,576 bytes headroom, using external-content historical and
runtime FTS. See `docs/evidence/norton-capacity-decision-evidence.json`.
That was a different source revision; measure a fresh activated build rather
than treating the old result as today's release artifact. Current main already
contains the external-content migration. The budget is a project policy, not
a demonstrated Cloudflare storage limitation.

No additional product decision is needed merely to use the CC0 text with the
existing 1,250 source-segment citations. The remaining work is implementing and
verifying its manifest, catalog, and database projection. More scholarly
book/chapter citation mapping would be an optional separate feature.
