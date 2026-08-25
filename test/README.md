# TheologAI test topology

`test/test-topology.json` is the executable inventory for every tracked
TypeScript file under `test/`. `test/unit/config/testTopology.test.ts` requires
that each path belongs to exactly one partition and that the inventory stays
in sync with the maintained runners.

`test/unit/config/typeAuthority.test.ts` is a static compiler-API guard for the
shared type boundary. It verifies that the retired `src/types/` module remains
absent and scans maintained, manual, conformance, and legacy-quarantine source
files for imports or exports that target it. The guard does not execute or
typecheck quarantined files, and changing their ownership remains a separate
reviewed decision.

## Static typecheck ownership

The manifest's `maintainedTestTypecheckProjects` is the compiler ownership
matrix. Configured roots (the files selected by each project's `include`/`files`)
are counted exactly once; imported dependencies are not reassigned as roots.

| Owner | Project | Roots |
|---|---|---|
| `node-vitest` | `tsconfig.test-node.json` | unit tests except script tests, current integration, fixtures, helpers, Node setup, and the generated Worker declaration |
| `node-script-vitest` | `tsconfig.test-scripts.json` | `test/unit/scripts/**/*.test.ts` except the frozen context-capacity evidence test |
| `node-script-frozen-context-vitest` | `tsconfig.test-frozen-context-capacity.json` | `test/unit/scripts/originalLanguageContextCapacity.test.ts` (strict; pinned script bytes are preserved by the `.mjs` wrapper and checked `.d.mts` facade) |
| `worker-workerd` | `test/worker-runtime/tsconfig.json` | Worker runtime setup and tests |
| `ccel-coordinator-workerd` | `tsconfig.ccel-coordinator-test.json` | coordinator runtime setup and tests |

The Node projects are strict noEmit checks and may statically include inactive
test packets. Emit-capable Node/Worker builds and Workerd runtime projects remain
packet-free. Manual, legacy-orphan, and conformance paths have no maintained
test typecheck owner.

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

`test/unit/config/applicationBoundaries.test.ts` is the corresponding
zero-allowlist service-boundary guard. It resolves all static, type-only,
dynamic, import-equals, and literal CommonJS module specifiers under
`src/services/`; no adapter allowlist exists. The synthetic cases prove the
detector remains non-vacuous while quarantined tests remain untouched.

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
