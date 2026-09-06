# Primary-source research quality benchmark

This benchmark is a deterministic retrieval regression gate for the complete
generated 35-work local corpus. It complements protocol, schema, and release
audits by checking whether bounded local queries still find selected canonical
section locators and whether those exact locators still resolve to non-empty
source text.

The fixture contains 42 natural research questions: 15 exact-term cases, 14
paraphrases, six intentionally ambiguous multi-work questions, three exact
catalog misses, and four bounded no-result cases. A natural question is kept
separate from one or two explicit local query attempts. The demonstrated
`all_terms` failure for `historical perspectives on church government` is
followed by one bounded local reformulation, `church government`.

Run it against an existing full database:

```bash
npm run benchmark:primary-source-research -- --database data/theologai.db
```

`THEOLOGAI_TEST_DATABASE_PATH` is used when no argument is supplied. The PR
workflow builds a fresh database from tracked sources and runs the benchmark
against that artifact after the normal database verifier. The benchmark opens
the database read-only and performs no provider, network, corpus, migration, or
deployment mutation.

## Current checked-in baseline

Against the 35-work, 4,111-section generated corpus, the fixture runs 54
bounded query attempts. All 41 checked-in locator regression anchors appear in
their declared five-result-or-smaller windows, and all 41 resolve through the
canonical exact-section path with matching source ordinals and non-empty text.
The six ambiguous cases each retain at least four distinct works in a
work-diverse result window. Catalog-miss and no-result cases must preserve their
different searched/not-searched meanings.

These are engineering regression anchors selected from checked-in source
evidence. They are not comprehensive, and they are not human-reviewed
scholarly relevance judgments. Passing means that known useful retrieval paths
and exact reads remain intact; it does not mean the highest-ranked result is
the best scholarly answer.

The report does not evaluate synthesis, theological correctness, historical
representativeness, user satisfaction, latency, token use, or monetary cost.
A `no_results` result describes only the bounded query against this local
collection and is never evidence of historical silence. Future qualitative
evaluation should add separately reviewed relevance and synthesis rubrics
rather than silently treating these regression anchors as ground truth.
