# Capacity build handoff

This slice restores only the output handoff from September reference
`3097c03139165a07b3a6d962bd036472152c0476`. The verifier still builds its own disposable
database from the exact checkout, runs full semantic verification, checks the corpus identity,
measures the original pre-VACUUM capacity and measures a separate VACUUM diagnostic copy.
Only a successful report within the unchanged 350 MiB ceiling may publish that original
pre-VACUUM database with `--output-database PATH`. Existing files and symlinks are refused.
No input database, cache, remote operation or failed-report output is accepted.

The shared Data action consumes this output instead of building the database again. Both
deterministic seed exports, manifest comparison, full seed validation/import, generated-DB
readiness, compatibility evidence and all local Workerd authority queries remain in place.
Unknown preparation paths still select full CI. Production/preview source artifact builders
remain independent and unchanged.

The corpus-preserving release classifier adds only the exact reviewed tooling filename
`scripts/release-corpus-capacity.ts`. The overseer approved this narrow classification update;
it does not exempt similarly named/nested tooling, the database builder, source data,
application code or migrations. Corpus fingerprint/schema/security blob/binding constraints
and all fresh proof requirements remain unchanged.

## Local comparison

On the same machine and Node 22.23.4, immediately before and after the change:

| Measurement | Original | Output handoff |
|---|---:|---:|
| Capacity plus downstream database preparation | 45.578 s | 31.605 s |
| Capacity phase alone | 31.759 s | Included above |
| Duplicate build | 13.819 s | Removed |
| Authoritative pre-VACUUM bytes | 306,970,624 | 306,970,624 |
| Headroom under unchanged ceiling | 60,030,976 | 60,030,976 |

The complete capacity JSON reports are identical. The baseline capacity database was
captured immediately after its real measurement; its bytes exactly match the candidate's
public-command output, SHA-256
`b643a6f934f26b751a4a3becc2f5865523b03f97583ba4094ba5bdee21eb6364`.
The original separately built downstream database has a different physical hash; full seed
manifest equality is checked separately rather than assuming physical equality after ANALYZE.
This is one consecutive pair with warm caches and slightly different launcher overhead;
it is evidence for removing one build, not a guaranteed CI speedup.

The full old-downstream/new-output seed manifests are identical, as are both candidate
exports: 49 seed files and 1,630,260 rows. Full SQLite import reconstructed and compared
42 tables; all 49 local Workerd imports, production readiness and the complete 182 authority
queries passed. Generated-database readiness passed 10 tests, and all 152 canonical source
files verified. The unchanged Workerd phase took 227.733 seconds locally.

The four-file capacity/classifier/topology/real-successor-CLI regression passed 106 tests.
Strict capacity and script typechecks, documentation (14 tests), Actionlint, JavaScript syntax
and diff whitespace checks passed. Independent pre-publication review approved the slice,
passed 84 capacity/application-proof tests and verified all 12 changed-file hashes.
No remote SQL, source artifact build/deployment path,
release setting, permission, binding, runtime application or corpus file changed.

Retained local artifacts are in
[capacity-reuse](../../test-output/ci-reliability-remediation/capacity-reuse/verification.log),
including baseline/candidate reports, databases, timings and per-step logs. The prior ordinary
hosted Data baseline on commit `080a85c`, run `41315535953`, was 13m24s. The exact-head
[capacity run 41318753879](https://github.com/TJ-Frederick/TheologAI/actions/runs/41318753879)
on `ef26d39` passed attempt 1 and independent hosted review. Each required context appeared
once; all protected/source/proof/deployment paths were skipped. Core passed 3,039 tests and
three integrations with the same five existing conditional skips and unchanged coverage.
Data passed the complete generated-DB/import/authority checks.

Hosted preparation from the capacity command to generated-DB testing was 78.741960 s before
and 52.633213 s after. The whole Data job was 753 seconds (12m33s), versus 804 seconds
(13m24s) before. These are one consecutive pair on different runners, not a guaranteed gain.
[Retained hosted evidence](../../test-output/ci-reliability-remediation/capacity-reuse/hosted-41318753879/summary.json)
records exact metadata, timestamps and logs. No additional rehearsal dispatch is needed.

## Remaining boundaries

Local authority batching was investigated and is deferred. The September parser bounds the
whole batch at 1,250,000 bytes times its query count, then computes each page's size from a
reconstructed `{results, success}` object. It omits other provider fields and original whitespace;
the current serial parser counts the full original response. A focused comparison with the
actual September module produced a 1,300,045-byte individual response: the current parser
rejected it, while the September two-statement batch accepted it and reported only 29 bytes
for that page. [Comparison evidence](../../test-output/ci-reliability-remediation/capacity-reuse/batching-comparison.json)
records the result. This fails the required unchanged response bounds; porting that parser
would weaken a check. No production parser or authority script was changed.

The serial query count is 182: 25 Transform-8 table pages plus its separate body/FTS sample,
and 156 Transform-11 table pages. The summary's printed table-page counts omit the sample.
Any future batching proposal needs a separately reviewed raw-envelope-preserving approach
and equivalence evidence for complete coverage/order, bounds and errors. No local reuse
substitutes for a fresh preview or production proof. Offline operator
preparation and evidence invalidation remain tracked in the
[remaining audit checklist](REMAINING-AUDIT-SCOPE.md).
