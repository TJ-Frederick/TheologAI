# UBS Hebrew v0.9.2 derived-material notice

<!-- theologai-release-authority v1 role=historical-rights-notice current=docs/CURRENT-RELEASE.md -->

This notice owns rights and provenance for the described historical derived
material, not active deployment identity. See the
[current release snapshot](CURRENT-RELEASE.md).

This notice applies only to the historical U3-T7 coordinate bridge and the
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
At the M4A stage, the derived rows were materialized only in the local SQLite
build and deterministic local D1 seed for verification. PR #96 subsequently
deployed the release-bound derived rows to the production D1 for the bounded
public v2 surface. That deployment does not bundle the full semantic corpus in
a Worker or expose or publish it wholesale through MCP.

The draft-PR/local-M4A statement is historical. PR #96 separately records the
subsequent production D1 binding and public v2 audit; it does not change this
notice's source, attribution, or ShareAlike boundary.

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

## Historical release state (PR #96; 2026-07-24)

The historical local-only status above is superseded for deployment state by
PR #96. Its production audit fixed source commit
`ac4b5ed774302fbfc86bf846b6ee77a07beed456`, exact tree
`adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, canonical endpoint
`https://mcp.theologai.xyz/mcp`, and server `3.6.0`. Before and after the
audit, Cloudflare showed deployment `2d10d693-958e-47a6-ae24-81647679c2f6`
serving Worker `7a3f5078-37bc-453e-bac7-a0743afd508a` as the sole 100% active
production version, bound to D1 `theologai-production-20260723-a`
(`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

The public `original_language_study` v2 audit passed 11/11 cases in 14
stateless exchanges under 180-second end-to-end, 30-second per-request, 256
KiB per-response, and 1 MiB aggregate caps. Fixture SHA-256:
`dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7`.
Evidence retains only sanitized metadata and hashes, not tool output or source
text. This observation does not change the source-license boundary in this
notice or assert the exact current internal implementation.

PR #72 is retained solely as the compatible rollback record: merge
`72a8ee5eef9b909a373b085d1a4f193484ddfe8a`, deployment
`a4697fd1-deda-4dae-a16c-635454218bc8`, Worker
`762485da-9e02-46a0-9777-e0d8743b9dbf`, and D1
`theologai-production-20260715-a`
(`c6535a4a-1953-4279-b277-7368445fc61a`).

> **PR96 broad MCP smoke — PASS:** Completed in 8.834 seconds. Sanitized
> `production-mcp-smoke-audit.json` evidence SHA-256:
> `f33680b7f9f0f2dfbc0df427bcf43d62fb07254d899a9b59a22d483d776a2e26`.
> It verified 26 MCP operations across 27 HTTP exchanges and 293,466 aggregate
> MCP response bytes, stateless with no retries or redirects. Pre/post identity
> was unchanged: deployment `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88), and D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`).

> **PR96 deployment/audit tail — PASS_WITH_OBSERVATION_LIMITATIONS:** Two
> post-smoke unfiltered JSON Wrangler 4.107.0 tails were pinned to Worker
> `7a3f5078-37bc-453e-bac7-a0743afd508a` (#88) at requested sampling `0.999999`.
> Attempt 1: `2026-07-24T13:03:40Z`–`13:34:06Z`, raw 0600 5,634,265 bytes,
> SHA-256 `819ab5dbbca47719edb5a9292e41c54cd6c15d21488640023ad7e148a609617b`,
> 1,324 events. Attempt 2: `13:36:32Z`–`13:56:16Z`, raw 0600 3,603,881 bytes,
> SHA-256 `a56d25424fdeca4207e9039d0efeec5ee0d272d04fd924f0caa1d8bebd3f83f8`,
> 848 events. Combined command time was 50m10s; observed event-span 49m29.544s.
> Two automatic reconnect warnings and a maximum uninterrupted segment of about
> 19m12s mean this is neither a continuous 30-minute observation nor an
> exhaustive/global request count. Wrangler tail authoritatively cannot provide
> a request total: 2,172 observed events = 2,167 ok + 5 separately classified
> client cancellations; 0 observed 5xx, 0 429, 0 exceptions, 0 error logs, 0
> truncated events, and 0 unexpected release errors. Raw captures are private
> and unpublished because they contain request metadata. Final authoritative
> identity after each: source `ac4b5ed774302fbfc86bf846b6ee77a07beed456`, tree
> `adf08edbf6bfcb14b9613354b2b8fb9f62ec8c16`, deployment
> `2d10d693-958e-47a6-ae24-81647679c2f6`, Worker #88 above, D1
> `theologai-production-20260723-a` (`3f7faa0e-689f-47aa-a601-dc662db9a6cf`),
> sole 100%; identity SHA-256
> `a6959d24fb7f50a9848fe2d011f425894718471b8a0609e7833780a291721a44`.

`SOURCE.json` is retained as the historical acquisition-gate snapshot for the
pinned source packet and support artifacts; it is not rewritten as a release
record. Any later material change to remote SQLite/D1 use or MCP responses
based on this semantic layer must separately authorize and carry the scoped
UBS/SDBH attribution, source links, modification description, and applicable
ShareAlike provenance without implying a license change for unrelated project
material.
