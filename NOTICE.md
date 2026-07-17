# Data and content notices

TheologAI combines software with locally indexed and remotely retrieved research
sources. The project license does not replace the licenses or terms attached to
those sources.

## Commentary

- Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, and
  Keil-Delitzsch commentary editions exposed through HelloAO are treated as
  public-domain source texts.
- Tyndale Open Study Notes are provided by Tyndale House, Cambridge under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Adapted or
  redistributed Tyndale material must retain attribution and the applicable
  ShareAlike terms.

## Biblical-language and reference data

- OpenScriptures Strong's dictionaries: public domain.
- STEPBible TAGNT/TAHOT and related lexical data: CC BY 4.0; attribution to
  STEP Bible / Tyndale House, Cambridge.
- OpenBible.info cross references: CC BY.
- [UBS Parallel Passage Database](https://github.com/ubsicap/ubs-open-license/tree/fd7bcf88b20a1522d3916f437f012c561466fe7b/parallel%20passages),
  © 2023 United Bible Societies: CC BY-SA 4.0. TheologAI modifies the
  pinned `ParallelPassages.xml` source by parsing reference locators,
  normalizing them to its canonical book registry while retaining the original
  locators and source order, deriving deterministic group identities, and
  building lookup indexes. The resulting parallel groups remain attributed to
  the UBS Parallel Passage Database and carry the same ShareAlike license; the
  transformations do not add relationship types, direction, quotation status,
  confidence, or inferred parallels.

## Local historical documents

The tracked historical-document JSON files identify the underlying work and
historical date, but most do not yet record the transcribed edition,
translation, source URL, or license. The age of an underlying creed,
confession, or catechism does not by itself establish the status of a modern
edition or translation. Treat this collection as research data pending a
document-by-document provenance audit; do not assume blanket public-domain or
redistribution rights. Completing that audit is a release-roadmap item.

### EEBO-TCP A17662 — Norton 1561 Institutes (inactive Gate 1 packet)

- The exact transcription is `A17662.xml` from Text Creation Partnership
  repository commit `32191150ad4a919dfd2c28c89b1dbc1c2396252a`, accompanied
  by that repository's unmodified per-work `README.md` at the same commit.
- The per-work README dedicates this EEBO-TCP Phase I keyboarded and encoded
  text under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
  The [TCP licensing page](https://textcreationpartnership.org/about-the-tcp/about-partner-libraries/licensing-and-access/)
  provides broader program context.
- Attribution retained as project policy: Text Creation Partnership, EEBO-TCP
  Phase I, A17662. TheologAI converts TEI structure into deterministic
  plain-text sections, resolves line-end glyph markers without modernizing
  spelling, and preserves gaps and marginal notes as explicit markers.
- This rights determination covers the pinned transcription and XML encoding.
  It does **not** cover source page images or facsimiles. No images,
  facsimiles, or CCEL material are included in this packet.
- The packet is an offline acquisition and normalization foundation only. It
  is not registered in the public corpus, database, Worker, or MCP catalog.

## CCEL

The Christian Classics Ethereal Library hosts works with heterogeneous source
and edition rights. The current public MCP tools do not retrieve or republish
CCEL document bodies, and they do not advertise live CCEL discovery. Defensive
discovery adapters remain as inactive future-provider architecture. Any later
rollout requires a fresh provider-policy review and edition-specific rights
handling; CCEL hosting never implies a blanket public-domain or redistribution
license.

Provider URLs and more detailed citations are included in tool output where the
underlying source supplies them.
