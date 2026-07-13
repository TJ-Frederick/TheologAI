# Original-language usage data foundation

This internal foundation materializes deterministic usage statistics from the
corrected STEPBible morphology corpus. It does not change any public MCP tool,
schema, prompt, formatter, or advertised behavior.

## Semantics

- `morphology.book_order` stores the 1–66 canonical Protestant book order. The
  source-attested Psalm superscriptions remain at verse `0`.
- `strongs_usage_stats` counts raw morphology tokens, distinct verses,
  distinct books, and exact source surface-token variants for each exact
  Strong's key.
- `strongs_book_stats` stores per-book token and distinct-verse counts.
- `strongs_form_stats` groups only by exact `word_text` surface form and
  Strong's key. Punctuation, accents, breathing marks, and cantillation remain
  significant: for example, a token with trailing punctuation is a different
  row from the otherwise identical token without it. These are source surface
  variants, not linguistically normalized inflected forms.
- Lemma, morphology code, gloss, and exact source Strong's identity remain on
  every raw token occurrence. They are deliberately not conflated with surface
  form identity.

The repository foundation exposes totals, per-book usage, surface-form usage,
and non-distinct raw token occurrences. Occurrence pages use the strict keyset
`(book_order, chapter, verse, position)` and fetch one extra row to derive the
next position. The older lossy occurrence/distribution methods remain intact
until a later consumer migration.

## Determinism and verification

Migration `0003_original_language_usage.sql` is schema-only. The database
builder materializes the aggregates from the same pinned, corrected source used
for `morphology`; D1 receives them through the ordered deterministic seed.

The usage-foundation slice's reviewed baseline contract is:

- schema `0003_original_language_usage`;
- materialization transform version `5`;
- D1 identity
  `93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881`;
- scoped morphology-usage identity version `1`, transform version `1`, and
  identity
  `c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd`;
- 13,836 usage rows, 57,781 book rows, and 138,293 exact surface-form rows;
- 1,069,506 total seeded rows across 17 manifest tables; and
- 36 ordered seed files.

The later historical-catalog integration advances the whole D1 materialization
to transform `6` and identity
`c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707`.
That unrelated metadata input does not change the scoped morphology-usage
identity above, its result semantics, or existing usage cursors.

Readiness verifies canonical book order, exact columns and indexes, aggregate
token conservation, complete Strong's-key coverage, first-occurrence evidence,
the existing Unicode correction contract, and the existing UBS/corpus
contract. Local verification additionally asserts that occurrence, book, and
form queries use their intended covering/ranking indexes without a temporary
sort.

The public usage cursor, structured schema, and provenance are bound to the
scoped morphology-usage identity, not to the whole D1 materialization. Its
canonical projection is defined by `scripts/morphology-usage-identity.ts` and
includes all 66 ordered morphology artifacts, the Hebrew lemma source, the
canonical `{number, stepbibleId}` map, and versioned occurrence-row, aggregate,
and keyset semantics. It deliberately excludes migrations, global D1 transform
and schema versions, unrelated table counts, historical documents,
cross-references, UBS parallels, and other sources that cannot change a
morphology-usage result.

The mandatory identity-drift tests recompute that projection from the manifest
and fail until the pinned `MORPHOLOGY_USAGE_IDENTITY` in
`src/kernel/morphologyUsageCursor.ts` is updated for a relevant change. A
relevant source or semantics change therefore stales old cursors, while an
unrelated catalog or database change does not.

## Storage impact and later product work

Against PR #27 transform 4, the reproducible SQLite database grows from
120,188,928 to 155,316,224 bytes: +35,127,296 bytes (+29.23%). The deterministic
seed grows from 149,271,790 to 197,638,031 bytes: +48,366,241 bytes (+32.40%).
The principal new SQLite allocations are approximately:

| Object | Bytes |
|---|---:|
| `idx_morph_strongs_canonical` | 11,071,488 |
| `strongs_form_stats` | 7,315,456 |
| `idx_strongs_form_stats_rank` | 5,881,856 |
| `strongs_book_stats` | 1,507,328 |
| `idx_strongs_book_stats_order` | 1,028,096 |
| `strongs_usage_stats` | 266,240 |

This storage/import increase is an explicit D1 cost and release consideration.
Before a public output calls these rows “forms,” it must either label them as
exact source surface variants with this caveat or add a separately reviewed
linguistic normalization layer. No such normalization belongs in this
foundation.
