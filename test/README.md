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
npm run test:conformance
```

The manifest also records five maintained TypeScript entrypoints outside the
`test/` tree. MACULA Gate-1 remains separately owned and is not counted as a
sixth general test entrypoint.

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

## Known unsupported commands

The following package scripts are retained temporarily as explicit broken
compatibility records. They are not supported commands and must not be run or
silently repointed to tests with different semantics:

- `test:bibleapi`
- `test:netbible`
- `test:commentary`
- `test:all-books`
- `test:helloao-bible`

Their exact targets and failure causes are recorded in
`test/test-topology.json`. A later command-honesty slice will retire or
quarantine them explicitly without activating provider, credential, network,
or legacy code paths.
