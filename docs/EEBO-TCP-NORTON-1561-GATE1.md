# EEBO-TCP A17662 Norton 1561 — Gate 1

Status: local, inactive acquisition and normalization foundation. This packet
is not a publication decision and is not wired into SQLite, D1, the Worker,
the MCP catalog, or deployment.

## Exact source and rights evidence

The packet vendors exactly two upstream files from the Text Creation
Partnership `A17662` repository at commit
`32191150ad4a919dfd2c28c89b1dbc1c2396252a`:

| Artifact | Git blob | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `A17662.xml` | `16a1c67eede080180fad5c8f7790eac811255fa6` | 4,820,278 | `90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4` |
| `README.md` | `8acbc19251c8c4bbd3bbdc8a86d1c18a241f1d2a` | 32,260 | `79287eb13717149ec5d3fdbf461b21ebd83aa211745c87c41b23260d5ff87b8a` |

`SOURCE.json` is the machine-readable lock. The unmodified per-work README is
the exact-artifact rights evidence. It states that this Phase I keyboarded and
encoded text is reusable under CC0 1.0 Universal. The project also records the
[CC0 instrument](https://creativecommons.org/publicdomain/zero/1.0/) and the
[TCP licensing page](https://textcreationpartnership.org/about-the-tcp/about-partner-libraries/licensing-and-access/).
The approval applies to the transcription and XML encoding only. Page images
and facsimiles are excluded, and no CCEL material is used.

## Offline normalization contract

`scripts/normalize-eebo-tcp-norton-1561.ts`:

- verifies both vendored artifacts against exact byte and SHA-256 locks;
- parses locally without network or external entity resolution;
- rejects DTDs, processing instructions, comments, CDATA, custom entities,
  malformed XML, unknown text elements, and unknown glyph references;
- accepts only XML predefined and valid numeric character references;
- retains original spelling and Unicode text;
- resolves EEBO line-end hyphen markers without modernizing words;
- preserves all 1,999 gaps, 3,203 body/front/back marginal notes, and two
  unresolved `char:abque` glyphs as explicit textual markers;
- removes all 1,044 page/facsimile pointers from the compiled package; and
- compiles twice and requires byte-identical canonical output.

Run the checked-in verifier with:

```bash
node_modules/.bin/tsx scripts/normalize-eebo-tcp-norton-1561.ts --verify
```

The generated report records 4 books, 80 chapters, 1,178 explicit milestones,
1,250 normalized sections, 3,748,054 content bytes, and a 4,058,746-byte
compiled package. Every configured foundation cap has positive headroom.

## Citation-key finding

The proposed semantic key shape
`book-{book}-chapter-{chapter}-milestone-{milestone}` was rejected. The source
contains milestone values that restart at `1`, skip, repeat, contain anomalous
values, or appear before any chapter content. Gate 1 therefore uses stable
source-ordinal keys (`a17662-source-ordinal-0001`, etc.) and records the full
evidence in `NORMALIZATION_REPORT.json`. Publication must not reinterpret
these source milestones without a separately reviewed mapping. Because the
semantic assessment failed, user-facing labels are deliberately nonsemantic:
`Source segment 1` through `Source segment 1250`. They must not be rendered or
cited as section symbols, paragraph numbers, or source-authored divisions.

## npm packaging disclosure

The repository currently has no narrow npm publish allowlist, so `npm pack`
incidentally includes tracked data and documentation that are unrelated to the
Node runtime entry point. A Gate 1 `npm pack --dry-run --json` inspection on
2026-07-17 reported 1,000 package entries, 66,674,295 unpacked bytes, and a
21,720,207-byte compressed tarball. The five files under this packet's data
directory accounted for 8,950,208 of those unpacked bytes.

That incidental tarball inclusion is not MCP, catalog, database, Worker, or
product publication, and no npm publication is authorized by Gate 1. This
slice deliberately makes no `package.json`, package-lock, publish-allowlist,
or npm-release-policy change. Before any future npm release containing this
packet, packaging scope and artifact size require a separate reviewed decision.

## Deliberately excluded from Gate 1

- migration `0005` or any later migration;
- transform 8 or other corpus transforms;
- SQLite or D1 imports;
- runtime repositories, services, catalog entries, resources, tools, prompts,
  Worker bindings, or deployment configuration;
- page images, facsimiles, and CCEL content; and
- preview or production deployment.

Rollback is simply removal of this inactive source packet, normalizer, test,
notice section, and documentation. Because Gate 1 has no runtime or database
integration, rollback requires no data migration or deployed-state change.
