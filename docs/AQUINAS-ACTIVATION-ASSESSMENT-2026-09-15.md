# Aquinas activation assessment — 2026-09-15

This assessment identifies the shortest justified path to make the checked-in
English Dominican / Project Gutenberg Aquinas edition useful for retrieval. It
does not authorize a release, deployment, source acquisition, or rights
conclusion beyond the evidence recorded below.

## Decision supported by the evidence

Activate the existing **four-part English Dominican Project Gutenberg packet**
through its existing hierarchy retrieval model. Describe it as covering the
authored *Prima*, *Prima Secundae*, *Secunda Secundae*, and *Tertia*; disclose
that it does **not** include the traditional *Supplement*.

Do not describe it as omitting “Tertia q91+.” That is incorrect: the acquired
Tertia source ends at q90, and q90 is the last question of the authored
Tertia. The conventional *Supplementum Tertiae Partis* is a separately headed,
posthumous compilation. The [New Advent Summa index](https://www.newadvent.org/summa/)
lists *Tertia Pars* and *Supplementum Tertiae Partis* separately, and its
[Tertia q90 page](https://www.newadvent.org/summa/4090.htm) is the final
Tertia question. The current `q91+` wording in the hierarchy and publication
metadata is therefore a correctness defect to fix as part of activation.

The existing material is sufficient for useful exact retrieval, bounded
browsing, and bounded full-text discovery. It is not sufficient to claim a
complete traditional *Summa Theologiae*, a facsimile or critical edition, or
worldwide public-domain status.

## Inventory: three distinct Aquinas artifacts

| Artifact | What it contains | Current status | Activation value |
|---|---|---|---|
| Four-part hierarchy packet `aquinas-summa-pg-v1` | Four part landings, 512 question preambles, and 2,669 articles: **3,184 authority bodies** and **3,185 nodes**. Ranges are Prima q1–119, Prima Secundae q1–114, Secunda Secundae q1–189, and Tertia q1–90. | Persisted five-shard, manifest-bound package; generic hierarchy reader, SQLite/D1 repositories, service, presenters, and schemas already exist. It is intentionally unprojected. | **Use this.** It is the only packet with broad, structured retrieval coverage. |
| Earlier `q73–83` prep excerpt | Tertia q73–83 only, ending before q84: 11 question prefaces and 84 articles, **95 sections**. It uses Gutenberg ebook 19950 and a newline-only, wrapper-removing transform. | `inactive`, `sectioned_only`, in `data/historical-sources/public-domain-prep/`; it is preparation evidence and not a separate active work. | Do not activate separately or use as the corpus source; it is wholly contained within the later Tertia packet and would duplicate it. |
| Four-Gutenberg-part acquisition and topology preparation | Pinned Project Gutenberg ebooks 17611, 17897, 18755, and 19950, with acquisition receipt, source/topology/catalog locks, discrepancy ledger, and normalized package. It is complete across those four acquired parts. | Local review evidence and source input to the hierarchy packet; not an independently searchable corpus. | Preserve as provenance. Call it a four-part preparation, not a complete traditional *Summa*, because it has no *Supplement*. |

The packet’s count is not an estimate: its topology lock records three part
prologues, 512 question preambles, and 2,669 articles. The 46 recorded source
topology discrepancies are all represented by explicit ledger rules and
verified or ledgered source-locator states; they are not evidence of missing
authority bodies. One editorial interlude is deliberately excluded.

## Provenance and rights evidence

The packet pins its source identity as
`aquinas-english-dominican-gutenberg-four-part-v1`. The local source lock
records the English Dominican Province / Benziger translation, Sandra K. Perry
e-text, David McClamrock corrections and additions, and CCEL lineage as
provenance. It does not import a CCEL artifact or require a CCEL request.

Each pinned Gutenberg catalog record identifies the edition and carries the
catalog notice “Public domain in the USA”: [17611](https://www.gutenberg.org/ebooks/17611),
[17897](https://www.gutenberg.org/ebooks/17897),
[18755](https://www.gutenberg.org/ebooks/18755), and
[19950](https://www.gutenberg.org/ebooks/19950). The locked conclusion is
therefore `public_domain_in_usa`, with an explicit no-worldwide-conclusion
caveat. Project Gutenberg’s [license policy](https://www.gutenberg.org/policy/license.html)
also directs readers outside the United States to account for local law.

That matches the U.S.-scoped distribution posture recorded for active source
packs; it is not evidence for a worldwide rights assertion. The local labels `local_only_inactive`, `dormant`,
and normalized-text `not_projected`/`not_reviewed` are internal release-state
markers; by themselves they do not identify a source or licensing defect. An
activation must replace the marker with the existing, precisely scoped source
rights conclusion and retain the edition-lineage disclosure.

The packet is normalized plain text, with no page images, no claim to be a
critical edition, and no claim to be diplomatic or facsimile text. Those are
edition characteristics that need product disclosure, not a reason to withhold
a correctly labelled retrieval surface.

## Smallest implementation path

1. Correct coverage wording to say “Tertia q1–90 (the end of the authored
   Tertia); traditional Supplement excluded.” This correction is made in the
   hierarchy profile, publication metadata, its exact tests, Transform 10
   documentation, and the dated Transform 11 historical account.
2. Make one explicit database-build transform materialize the already approved
   hierarchy and publication instead of asserting its exclusion. Migration 0008
   currently restricts publication state to `dormant`, so activation needs a
   reviewed successor migration (and corresponding fresh-schema path) for an
   active state; simply flipping a value is not valid.
3. Compose the existing `HistoricalHierarchyService` in both Node and Worker
   roots. It already supplies bounded landing, exact-node, immediate-child, and
   search operations.
4. Choose the public adapter by the smaller reviewed implementation diff:
   `src/tools/v2/classicTexts.ts` accepts only `HistoricalDocumentService`, and
   its `complete_document`/`sectioned_only` input and output contract in
   `src/mcp/schemas/classicTexts.ts` models only document sections. Extending it
   would require new hierarchy modes, a union output schema, hierarchy resource
   routing in `src/mcp/server.ts`, and changed classic-text semantics. A narrow
   hierarchy handler can reuse the dormant hierarchy schema and presenters, but
   adds a tool registration and a `tools/list` inventory change. Either route
   is a deliberate public-contract change; select the smaller concrete diff
   after wiring a focused implementation, rather than treating tool count as a
   reason to distort either retrieval model.
5. Route canonical direct hierarchy nodes for the chosen public adapter. Keep
   bodies direct-only; retain the existing nine-result search limit, bounded
   snippets, cursor pages, and provenance fields. Update the affected public
   contract fixtures and audits intentionally.

No new source acquisition, broad architecture refactor, catalog merge, or
CCEL integration is needed for that path.

## Verification required for an activation change

- Re-run package/source-lock/topology/discrepancy-ledger attestation and prove
  exactly 3,184 bodies and 3,185 nodes in a fresh SQLite build.
- Run Node and real Worker/D1 parity for a known direct article, a child browse
  page, and a phrase search; retain direct-only body and result-budget tests.
- Test the selected MCP adapter’s schema, discovery inventory, and direct
  resource contract, then update the affected frozen audit expectations
  intentionally.
- Run a fresh Node 22 `audit:aquinas-source-pack-capacity` on the activation
  checkout. PR #163 freshly measured the normal corpus at 306,970,624 bytes
  before `VACUUM`, leaving 60,030,976 bytes below the 350 MiB
  (367,001,600-byte) project gate. The earlier standalone hierarchy result is
  historical rehearsal evidence only; SQLite page packing makes it unsuitable
  as an additive candidate prediction.

The 350 MiB threshold is a conservative TheologAI release policy, explicitly
not a Cloudflare D1 platform limit. If the fresh candidate exceeds it, the
remaining decision is whether to revise the project policy or scope; it is not
evidence that the provider disallows the corpus.

## Remaining product decisions

No additional product decision is evidenced for serving the acquired four-part
edition under the existing project posture: active source-pack records already
carry U.S.-based public-domain provenance, and this packet has the same
explicit `public_domain_in_usa` conclusion and territory caveat. Correct
coverage/provenance wording, fresh capacity verification, and adapter choice
are routine implementation work.

A new decision is needed only if scope changes: adding the traditional
*Supplement*, selecting another edition, or asserting distribution beyond the
recorded U.S. conclusion. “Inactive,” “not reviewed,” and absence from the
current catalog are implementation state, not independent grounds to retire or
reject this acquired corpus.
