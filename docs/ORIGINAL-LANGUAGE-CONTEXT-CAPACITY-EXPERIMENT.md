# Original-Language Context Capacity Experiment

This is a source-free, synthetic, local-only feasibility experiment. It does
not acquire MACULA or any other corpus, and it cannot establish linguistic
accuracy, provenance, licensing, release readiness, or a Cloudflare platform
limit. It does not change the MCP runtime or public contract.

Run it with the repository-pinned Node version:

```bash
npm run audit:original-language-context-capacity
```

The command accepts no arguments, builds only disposable databases in an OS
temporary directory, emits one sanitized JSON object, and deletes the
databases on exit.

The compact recorded result is
[`docs/evidence/original-language-context-capacity-evidence.json`](evidence/original-language-context-capacity-evidence.json).
Regenerate it under pinned Node 22 with:

```bash
npm run audit:original-language-context-capacity:write-evidence
```

## Modeled storage contract

The experiment models one compact JSON bundle per biblical reference. The
bundle contains positional alignment and compact syntactic head/relation codes
only:

- Greek supports one-to-one and multiple-source-token-to-one-context-token
  alignment.
- The base Hebrew model supports one source token to one or two ordered
  morphemes. A separate conservative sensitivity candidate models four
  morphemes at every modeled split position. The validator is deliberately
  bounded at six; a real corpus above that bound requires a new decision.
- Aramaic is represented explicitly and uses the same morpheme-capable shape.
- Synthetic Psalm 3 cases exercise a superscription reference and a shifted
  verse reference.

Crosswalks must resolve to exactly one canonical reference. Greek source
positions may not map to multiple context units, and Hebrew/Aramaic morphemes
must be unique and contiguous within a source position. Ambiguity is rejected.

The bundle excludes source text, surface forms, lemmas, morphology, Strong's
numbers, glosses, semantic frames, and domains. Those fields are already
available elsewhere or exceed this workstream's authorized scope.

The fixed reference and token counts are engineering assumptions used to
compare relative storage layouts. They are not observations from MACULA and
must not be treated as corpus facts. In particular, neither the two-morpheme
base profile nor the four-morpheme sensitivity profile is a claim about the
real corpus.

## Architecture comparison

The experiment produces three fresh pre-`VACUUM` measurements:

1. the verified current release database;
2. that fresh database plus the synthetic bundle table, modeling an existing
   D1 binding; and
3. a fresh synthetic-bundle-only database, modeling a separate D1 binding.

The integrated and sidecar candidates must have identical synthetic projection
hashes and inventories. Their hashes are recomputed from canonical stored rows,
not trusted from the generator. Both receive integrity and foreign-key checks.
Post-`VACUUM` sizes are diagnostics only. The evidence records the source
commit/tree, experiment-script hash, pinned manifest profile, engine versions,
complete artifact hash, and a deterministic hash domain that excludes elapsed
time.

The sidecar is also imported through isolated local Workerd/D1. The audit
records schema/seed import latency plus representative Greek, Psalm-crosswalk,
Aramaic, and corpus-identity query latency. Wrangler's isolated local D1
metadata currently reports `duration` but not `rows_read`, so the evidence
records `rows_read: null`, the observed metadata keys, and this observation
limitation rather than inventing a value. Real-corpus read-cost instrumentation
remains a gate. These synthetic measurements are useful implementation signals,
not real-corpus performance evidence.

The 350 MiB hard threshold and 90% warning threshold are internal TheologAI
release-engineering policies, not Cloudflare D1 limits. The decision rule
identifies the existing D1 only if the integrated candidate stays below both
thresholds. If it fits the hard gate but enters the warning band while the
sidecar remains healthy, the experiment identifies a separate D1 as the
**provisional leading candidate** for headroom and failure isolation. It is not
a final architecture recommendation and is not authorization to add a
database, migration, binding, or feature.

A separate D1 would not support a cross-database SQL join with the existing
morphology data. A future runtime would therefore need two bounded reads and a
strict application-layer positional join, failing closed whenever either
coordinate set is missing or conflicts. That operational cost is explicit in
the evidence; the capacity recommendation does not make the runtime work free.

The sidecar metadata pins its expected primary-corpus SHA-256, context
projection SHA-256, and context schema version. A future runtime must compare
those values before returning context. A missing binding or identity/version
mismatch makes context unavailable while allowing the existing base morphology
result to continue without context; partial or mismatched context is never
returned.

A separate database consumes one additional D1 slot per environment: two
additional slots for preview and production. This local experiment does not
inspect account availability. Confirming those slots is a release gate.

Before selecting an architecture, acquire and review the real corpus under
separate authorization, rerun stored-row/capacity evidence using observed
multiplicity, measure real-corpus Workerd latency and `rows_read`, review
identity/version-skew and binding-failure behavior, and confirm D1 slots.

The complete evidence hash covers every emitted field except its own
`completeArtifactSha256`. The deterministic hash recursively removes only
`elapsedMs` and keys ending in `ElapsedMs`; exact domain strings accompany both
hashes.
