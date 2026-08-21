# TheologAI test topology

`test/test-topology.json` is the executable inventory for every tracked
TypeScript file under `test/`. `test/unit/config/testTopology.test.ts` requires
that each path belongs to exactly one partition and that the inventory stays
in sync with the maintained runners.

## Supported suites

```bash
npm run test:unit
npm run test:integration
npm run test:worker-runtime
npm run test:ccel-coordinator-runtime
npm run test:worker-production-runtime
npm run test:e2e:compiled
npm run test:e2e:stdio
npm run test:conformance
```

The manifest also records six maintained TypeScript entrypoints outside the
`test/` tree. MACULA Gate-1 remains separately owned and is not counted as a
seventh general test entrypoint.

The compiled MCP parity matrix covers Node stdio v6 with logging, Node HTTP v6
without logging, a production-like Worker v6 bundle, and the real preview
Workerd v7 contract. It compares complete public tool, prompt, resource-template,
static-resource, ordering, and capability metadata while leaving dynamic local
document resources runtime-specific.

## Quarantined and manual files

- `activeVitest` contains tests selected by the four maintained Vitest configs.
- `support` contains setup, helper, and fixture modules; these are not tests.
- `manual` contains four explicitly invoked evidence scripts under
  `test/scripts/`; CI does not discover them as Vitest tests.
- `legacyOrphan` contains 50 retired-architecture, provider-facing, or otherwise
  unowned files. Maintained suites must not import or execute them.
- `conformance` contains the single maintained MCP conformance entrypoint.

The legacy inventory is a quarantine ledger, not deletion authority. Moving,
executing, migrating, or deleting one of those paths requires a separate
reviewed change that updates the manifest in the same slice.

## Retired legacy commands

The following former package commands have been removed. They are not runnable
aliases and must not be reintroduced or silently repointed to maintained tests
with different semantics:

- `test:bibleapi`
- `test:netbible`
- `test:commentary`
- `test:all-books`
- `test:helloao-bible`

Their exact former targets, failure causes, and `retired` status are retained
as closed provenance in `test/test-topology.json`. The four surviving former
targets remain quarantined under `legacyOrphan`; the former Bible API target
is absent. None may be executed, imported, or repointed through this record.
