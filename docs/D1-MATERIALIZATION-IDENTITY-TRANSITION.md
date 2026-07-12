# D1 materialization identity transition evidence

This record supports the one-time transition from the legacy whole-manifest
marker to the scoped D1 materialization identity. It does not authorize a
remote write or deployment.

- Baseline commit: `0cbe9ec044fcf3189e14f508f276017a810934ef`
- UBS compiler main commit: `4e02564531351f4a2de61d95dcebfd0dfd06d404`
- Legacy production marker: `0e5f19341d99fc9ec18f3a45b0ce019ed78d1fd40478997bde8fdee94a02ca55`
- New scoped D1 identity: `118844cc76b2c091ca60f88d890c3253bbcefd15cad416d03bce3d0af0f4e0ad`
- Bound migration: `migrations/0001_initial_schema.sql`
- Migration SHA-256: `9d215bf550538e17198dba3012e1db053a1340c9c5331618f6d0b8bb79e6d3b9`

Both commits were built independently under Node 22.23.1. The comparison was:

```bash
npm run d1:corpus:compare -- \
  --before /tmp/theologai-d1-before.db \
  --after /tmp/theologai-d1-after.db
```

The comparison excludes only the `corpus_manifest_sha256` metadata row. Every
other materialized row matched in count and canonical SHA-256:

| Table | Rows | SHA-256 |
|---|---:|---|
| `theologai_metadata` | 1 | `251fe53897d9be888049bae63097dc205b8bbf66d0c2d38b9975fe685f26d7c6` |
| `cross_references` | 344799 | `58485df59e4f53444b72bbefb309f032a0451d25c17673743a694075342d859f` |
| `strongs` | 14298 | `d2471bdf05f4239c6f4895e145df8bd0fba33223c92c05f75ab7124f801ca137` |
| `strongs_fts` | 14298 | `ab80bbd78d95772195cf424f6f3e768a5c03c6ea1248e8ed2c7579f6d6490c5b` |
| `morphology` | 447748 | `1c30dc553101ab18e2e78c5082dce3fa97e4e39e004b3e3febbceb6f8cab1614` |
| `stepbible_lexicons` | 19570 | `09e59cd0f4c098e386ccf862cd5c7861dba33f32a130b233c9adbb1fc619ad91` |
| `documents` | 17 | `eceee8d8ece508120f630c6bd7c2a0ef621807e34d8bca039b098ad114068687` |
| `document_sections` | 3054 | `22d32afcdad3346ea2607c4b2e3d6709bd3040be7aa24896143ab0c86470a383` |
| `sections_fts` | 3054 | `80099736d668fd2131acf1d30e8496999f3a267cf70a13a766e8e8ad8da43495` |
| `morph_codes` | 20 | `98076249ec0315247085957fc7c42f9244519d472129c5bf42e1449bbf8878bb` |

Result: the UBS source/compiler addition changed the source inventory and
Worker bundle, but changed no D1-materialized corpus row. Follow the conditional
forward/rollback templates in `docs/D1-DATA-WORKFLOW.md` only after explicit
owner authorization for the named environment and database.
