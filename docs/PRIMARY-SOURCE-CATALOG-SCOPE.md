# Primary-source catalog scope

The local `primary_source_search` provider uses a reviewed catalog manifest for
all 17 hosted works. This slice adds no document bodies and grants no new
rights. It only makes the already-hosted collection's work identities,
composition-date scope, and explicitly attributed creators machine-readable.

## Source and materialization

- `data/historical-document-catalog.json` is the reviewed machine-readable
  source of truth. `data/historical-document-catalog-provenance.json` is its
  companion review record: stable provenance IDs, source title, publisher,
  authoritative-source URL, authority class, exact field mappings, and a
  bounded review note for every creator/date claim.
- Every entry has exact lookup-only aliases, a display date, optional paired
  composition-year bounds, explicit creator roles, and one metadata status:
  `reviewed`, `anonymous`, `collective`, or `unknown`.
- The database builder validates one-to-one coverage of all 17 historical JSON
  files, validates complete provenance-field coverage, and stores the catalog
  object in `documents.metadata.catalog` alongside existing topics. The
  materialized `documents.date` comes from the reviewed catalog label rather
  than an unreviewed legacy display value.
- D1 transform 6 and corpus identity
  `c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707`
  bind this metadata change. It is not a marker-only transition: build and
  import a fresh deterministic seed, then run the complete readiness gate.

Creator roles use an exact closed vocabulary: `author`, `issuing_body`,
`drafting_body`, `revising_body`, and `compiler`. An issuing, drafting,
revising, or compiling role is never relabeled as authorship. Empty
creator lists for anonymous or collective works are preserved as incomplete
metadata rather than filled by association or influence.

The review prefers official denominational sources (Church of England, CRCNA,
GOARCH, LCMS, OPC, USCCB, and the Holy See), with bounded confessional or
institutional archives where no official page makes the historical claim.
Deterministic builds never fetch these mutable pages: both checked-in manifests
are checksum-pinned in `data/data-manifest.json`, and an explicit review is
required to change a claim or source mapping. This provenance concerns catalog
metadata only; it neither imports source-page content nor establishes edition,
transcription, or republication rights.

The source review corrected conservative catalog drift: the official Articles
text says 1562, USCCB dates the Baltimore Catechism's origin to 1884, the Synod
of Dort spans 1618-1619, and CRCNA describes the Heidelberg project as a team
of ministers and university theologians. The Athanasian catalog entry follows
an official LCMS overview: it retains an approximate sixth-century display
label but no machine-filterable year or creator. The present
Niceno-Constantinopolitan text matches 381 only; Nicaea 325 remains historical
origin context and does not make intervening years eligible. The London Baptist
confession matches composition-year scope only at 1677;
the 1689 General Assembly remains title and reception context and is not
modeled as a continuous 1677-1689 interval.

## Query behavior

Each query may include one exact `work`, one exact reviewed creator name in
`author`, and inclusive `startYear`/`endYear` bounds. Date matching uses interval
overlap: a work is eligible when its reviewed composition interval overlaps the
requested interval. Multi-creator research uses separate query-plan entries so
coverage and misses cannot be blended.

Lookup aliases are exact routing aids only. They are not creator/date metadata,
historical evidence, or text shown as a research result. Generic labels such as
`Confession of Faith`, `Larger Catechism`, and `Articles of Religion` are
rejected because they could silently route a query to the wrong hosted work.
The structured evidence policy discloses this separation as
`lookupAliasUse: exact_routing_only_not_metadata_evidence`.

The local provider returns a bounded `scope` containing:

- `matched`, `catalog_miss`, or `metadata_incomplete`;
- the normalized requested restrictions;
- the total eligible work count;
- at most eight eligible work identities and a truncation flag.

Provider status `catalog_miss` means no hosted catalog work positively matched
every restriction and no text search was broadened. Its scope is
`metadata_incomplete` when one or more unknown creator/date fields prevented a
definitive catalog assessment; otherwise the scope is `catalog_miss`.
`no_results` means eligible works were searched but their indexed sections did
not match the text query. Unknown metadata is never treated as a positive match.
Local hits include at most four stable `metadataProvenanceIds`, allowing an
auditor to resolve each runtime creator/date claim to the companion manifest
without embedding source descriptions or URLs in every result.

Search snippets remain discovery-only. Clients must call MCP `resources/read`
on selected canonical section links before quotation, author/work comparison,
or substantive conclusions. Edition and transcription provenance remains
incomplete as stated by the existing evidence policy.
