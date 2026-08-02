# MACULA Gate-1 synthetic sidecar contract

This is a pre-acquisition, source-free engineering slice. It exercises a
closed schema, parser, alignment classifier, privacy boundary, capacity
policy, and isolated local-Workerd harness using only the two tiny synthetic
XML fixtures under `test/fixtures/macula-gate1/`. It does not acquire, copy,
open, infer from, or reproduce any MACULA corpus or historical projection.

The executable plan is
[`data/biblical-languages/macula/GATE1-SYNTHETIC-PLAN.json`](../data/biblical-languages/macula/GATE1-SYNTHETIC-PLAN.json).
Validate the plan and schema without Workerd:

```bash
npm run data:verify-macula-gate1
```

Run the optional disposable local-Workerd proof:

```bash
npm run test:macula-gate1-workerd
```

The Workerd command accepts no caller-provided path, query, binding, or
database identity. Its worker, config, schema copy, seed, state, home, XDG
configuration, temporary files, and logs exist beneath one fresh OS operation
directory and are deleted on completion. An exact ordered argument grammar
requires one `--local` invocation, one realpath-checked config and state path,
one checked file or approved query, and final `--json`; extras, duplicates,
every `--remote` spelling, and every environment selector fail. The child gets
an explicit minimal environment rather than inherited process state, so proxy,
auth, account, Wrangler configuration, and `NODE_OPTIONS` variables cannot
leak in. Evidence records closed proof counts, observed metadata keys, and
`rows_read` only when local Wrangler actually reports it. It makes no remote
or billing claim.

## Closed data model

The generic sidecar SQL has exactly six tables: `source_file`,
`reference_context`, `syntax_group`, `token`, `participant_ref`, and
`group_reference`.

Every row ID is deterministically derived from its table namespace and ordered
identity parts, and SQL enforces the prefix and fixed length. Composite
source-file/corpus keys scope syntax groups, tokens, parent groups, participant
token targets, and group references so they cannot cross a source or corpus.
The graph verifier rejects foreign-key violations, orphans, duplicates, and
parent cycles.

`reference_context`, rather than `token`, owns alignment at exact corpus,
book, chapter, verse, and orthographic-word ordinal coordinates. It records
explicit source-segment, runtime-segment, and runtime-candidate cardinalities.
Tokens are ordered source morphs beneath that context. A `runtime_only` context
therefore has zero source segments and no token row. Before sealing, every
context must have exactly `source_segment_count` token rows. Native SQLite and
local Workerd both prove the zero-violation state, deliberately add and detect
one mismatch, remove it, and prove the final zero state.

The alignment classifier is closed to these values:

- `validated_normalized_alignment`
- `missing_runtime`
- `ambiguous_runtime`
- `segmentation_conflict`
- `text_conflict`
- `runtime_only`

Only `validated_normalized_alignment` contexts may participate in a future
runtime display-text join. Neither runtime nor source text has a schema column;
source word text is parser-ephemeral alignment evidence. Segmentation conflict
means an actual nonzero source/runtime segment-count mismatch. Coordinate
mismatch and empty segments are invalid inputs, not classifications. The
runtime segment count for `ambiguous_runtime` is SQL `NULL`: choosing the first
candidate would be order-dependent and falsely authoritative. The
66-book validator requires one row per book and enforces Hebrew ownership for
books 1–39 and Greek ownership for books 40–66. Synthetic coverage rows are
not observations about either real corpus.

## Fail-closed parsing and public exclusion

The streaming parser accepts only regular, non-symlink
`*.synthetic.xml` files below the explicit fixture root, capped at exactly 1
MiB of streamed bytes. The parser opens the validated path with `O_NOFOLLOW`,
compares the descriptor identity with the pre-open file identity, streams that
same descriptor, and closes it in `finally`; replacement of the path cannot
redirect parsing. Fatal UTF-8 decoding rejects malformed byte sequences. It
rejects XML 1.0-prohibited characters, `<` in attribute values, non-conservative
`xml:id` NCNames, traversal, symlinks, DTDs, entities, comments, CDATA, extra
or non-exact XML declarations, malformed or unsafe coordinates, nested words,
unknown elements, unknown attributes, and every explicitly excluded field.
Raw tag interiors are validated before trimming: whitespace immediately after
`<`, `</`, or `<?`, whitespace between an empty-element slash and `>`, and a
literal `]]>` in text are rejected. XML-permitted whitespace before an ordinary
`>` or before the slash in `/>` remains intentionally accepted and bounded by
the byte ceiling. The XML declaration remains one exact reviewed spelling.
Its direct-parent grammar and word/group/participant attributes are checked
against the existing corpus-specific source contract.

`participant_ref` privately distinguishes `exact_token`,
`orthographic_word`, SQL `NULL`, and `dangling`, with separate token and
context foreign keys. The plan preserves the historical totals only as a
future reproduction target—144,418 exact-token, 2,380 orthographic-word, six
null, and nine dangling—and synthetic evidence makes no reproduction claim.
The public view admits only foreign-key-backed exact-token and
orthographic-word rows. Null and dangling rows and their target identifiers
are absent. The only public dangling evidence is the content-free aggregate of
four `participantref` and five `subjref`, with `releaseEligible: false`; no
target is guessed.

The non-Workerd verifier byte-pins the SQL schema, executes it, introspects the
exact six tables plus reviewed views, indexes, foreign keys, checks, and later
sealing triggers, then proves fixed synthetic counts and negative graph/public
tests. Sealing installs deterministic INSERT/UPDATE/DELETE blockers on all six
tables and switches the active verifier connection to `query_only`. Local
Workerd independently imports the same pinned schema and all six tables,
checks all six alignment states and all four participant states, asserts the
exact validated-context count, proves the context-token negative/final-zero
sequence and public exclusion, rejects a cross-source write, and rejects a
post-seal mutation. Rows-read evidence is either a nonnegative safe integer or
`null` with the matching approved observation label; observed metadata keys
are bounded, string-only, sorted, and unique.

## Capacity, rights, and inertness

The 350 MiB ceiling is an internal TheologAI planning policy, explicitly not a
Cloudflare limit. A candidate one byte over the ceiling fails. Synthetic
fixtures cannot support a real-corpus capacity claim.

The plan carries future-distribution templates for MACULA Greek, MACULA
Hebrew, SBLGNT-derived Greek input, and OSHB-derived Hebrew `lang` evidence.
They preserve attribution, notice, source/license link, modification marking,
non-endorsement, and no-additional-restrictions requirements. They are
operational templates, not a legal opinion or publication authorization.

The historical audit and projection hashes remain non-executed future
reproduction locks only. This Gate-1 command never opens their files. Corpus
acquisition, repository XML or SQLite artifacts, canonical migrations,
manifests, seeds, adapters, MCP/catalog changes, composition roots, runtime
reachability, Cloudflare bindings, and preview/production workflows remain
outside this slice.
