# UBS Hebrew v0.9.2 derived-material notice

This notice applies only to the inactive U3-T7 coordinate bridge and the
transform-7 derived semantic layer reproducible from the exact pinned inputs.
It does not apply CC BY-SA to TheologAI code or unrelated datasets. The
reproducible artifact itself embeds versioned `rightsNotice` and
`provenanceNotice` records with this same scoped boundary, source identity, and
change disclosure.

## UBS/SDBH source and ShareAlike boundary

The source pair is the United Bible Societies' `UBSHebrewDic-v0.9.2-en.JSON`
and `UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`, version `0.9.2`, pinned at
`ubsicap/ubs-open-license` commit
`3a6edd8212df2e1189037ad39687726990c80d56`.

- Dictionary: blob `39e218d17f1961495ea7052e342bd9707432cdc0`, SHA-256
  `1686a25dd31dc9afb7b932927e160070667c73caedad11aa7e4482c21f800e8e`.
- Lexical domains: blob `88b69b48b00d8306c6d596107b3123de1d41574b`, SHA-256
  `fbc862b2c46966cf7f3bf19c2f3e79a7391c34f8c737e1979fa5178ac603d0df`.

The retained attribution is: “UBS Dictionary of Biblical Hebrew © United Bible
Societies, 2023. Adapted from Semantic Dictionary of Biblical Hebrew ©
2000-2023 United Bible Societies.” The source is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), including its
[legal-code warranty disclaimer](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en#s5).

The U3-T7 compiler NFC-normalizes safe text, assigns reversible canonical IDs,
retains all H#### and A#### source identities internally, retains arrays of
parts of speech, excludes unresolved definition markup, links lexical domains,
and retains raw source anchors and suffixes. The derived semantic layer and the
coordinate bridge are offered under CC BY-SA 4.0 on this conservative policy.
M4A materializes the derived rows only in the local SQLite build and
deterministic local D1 seed for verification; no full derived semantic corpus
is bundled in a Worker, served by MCP, or published to a remote database.

Every reproduced artifact carries the exact source names, pinned URLs, Git
blobs, SHA-256 values, the retained UBS/SDBH copyright and ancestry statement,
this notice's path, the CC BY-SA legal-code warranty/disclaimer link, and the
above modification summary. Its audit separately records both the semantic
payload identity (which excludes `artifactIdentity` itself) and the SHA-256 of
the complete canonical artifact bytes; neither hash represents a tracked copy
of the semantic corpus.

## Coordinate witnesses

The bridge is derived from four exact STEPBible TAHOT pins at commit
`0f60797c170f11a1f8dc75c5f7617973e2e66b0d`, with attribution to Tyndale House,
Cambridge / STEP Bible (www.stepbible.org), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The compiler verifies
the reviewed 19-line TAHOT attribution header before parsing. It also binds the
MIT-licensed `usfm-bible/usfmtc` reference table at commit
`a222dd3e78360f8e275ca56f4307af7e02b2430a`; its retained license remains
applicable. usfmtc supplies only the reviewed book/chapter reference table; it
does not endorse TheologAI, this derived layer, or any future interpretation.

The bridge file is canonical, override-only, and preserves every one-to-many
native-to-normalized mapping. It proves coordinate conversion only. It does
not prove a UBS anchor identifies a particular morphology token, nor does it
adjudicate a contextual word sense.

## Current state

U3-T7 plus M4A are local-only and runtime-inert. M4A adds migration `0004`,
transform 7, local SQLite materialization, deterministic D1 seed/import
verification, and inactive Node/D1 adapters. None is registered in a runtime
composition root. No remote D1 import, Worker binding, preview deployment,
production deployment, MCP output, tool, prompt, or resource is authorized or
present.

`SOURCE.json` is retained as the historical acquisition-gate snapshot for the
pinned source packet and support artifacts; it is not rewritten as a release
record. Any later remote SQLite/D1 use or MCP response based on this semantic
layer must separately authorize and carry the scoped UBS/SDBH attribution,
source links, modification description, and applicable ShareAlike provenance
without implying a license change for unrelated project material.
