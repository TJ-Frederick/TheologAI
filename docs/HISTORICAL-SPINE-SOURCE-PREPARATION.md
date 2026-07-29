# Historical spine source preparation (inactive)

The ten editions under `data/historical-source-packs/historical-spine-early/`
and `data/historical-source-packs/historical-spine-later/` are reviewed,
dormant source-pack artifacts. They are deliberately absent from
`data/data-manifest.json`, all D1 seed inputs and counts, migrations, runtime
catalogs, tools, prompts, and deployment workflows. Nothing in this folder is
a runtime/catalog activation authorization. The checked-in normalized text is,
however, repository redistribution: it is reviewed under the edition-specific
U.S. public-domain policy below and must not be confused with a private local
scratch artifact.

`scripts/replay-historical-spine-source-packs.ts` is a deterministic, offline
replay verifier. It has no network client. It requires a caller-provided source
root containing the exact reviewed local inputs described in
each pack's `source-preparation.json`. Before it even resolves or reads that
caller-provided root, it strictly validates the checked-in source-pack manifest,
every edition package, the exact member/input/artifact bijection, and all
hash/byte pins. It then validates every supplied input's SHA-256
and byte length, derives any declared intermediate input, validates that
identity before section parsing, writes a complete candidate pack to a temporary
directory, and requires byte-for-byte agreement with the reviewed package JSON,
manifest, and manifest checksum. With `--write-receipts`, only after that exact
replay succeeds, it writes a sanitized receipt and marks that replay evidence
complete; it never rewrites normalized package text from unverified input.

Example, after a separate acquisition/review step has supplied the local files:

```bash
npx tsx scripts/replay-historical-spine-source-packs.ts \
  --source-root /absolute/path/to/reviewed-inputs --pack all --write-receipts
```

The expected layout is documented in each `source-preparation.json`, for
example `historical-spine-early/{authorities,comparators}` beneath the supplied
root. Raw source artifacts are intentionally not committed or redistributed by
this repository. The normalized public-domain text is committed as the explicit
repository-redistribution artifact and retains its edition/source disclosure.

## Evidence maturity and activation guard

Each pack has a machine-readable `replay-readiness.json`. It deliberately
separates the review of a normalized package from replay evidence for its exact
declared inputs. Each pack has a sanitized current
`replay-receipt.json`: it contains only the verifier script SHA-256, logical
edition/role/hash/byte identities, and normalized output identities—never source
bodies or a local source-root path. Its `completed` status is valid only when
the receipt's current verifier identity, input pins, manifest identity, and
normalized output identities all agree. A source or verifier change invalidates
the receipt until a new exact replay is completed.

Both packs carry the separate
`blocked_separate_transform11_release` activation state. A successful local
replay does not authorize Transform 11, D1 materialization, preview, production,
or any runtime use. The reviewed Transform 11 release record is the separate
authorization boundary; source-preparation evidence never self-authorizes.

The source-first corrections are deliberately narrow. *The Imitation of
Christ* is normalized only from the pinned Project Gutenberg no. 1653 text,
which identifies William Benham as translator; the unrelated 1901 Finch scan
is neither an authority input nor a provenance claim, and no independent
facsimile cross-check is asserted. *Revelations of Divine Love* is normalized
only from the pinned Project Gutenberg no. 52958 text, which identifies Grace
Warrack's Methuen 1901 first edition; no claim is made about a 1907 edition.

Hooker is explicitly two-stage: the raw OLL EPUB is pinned as the comparator
(`c6ec…b8c4`, 852,534 bytes); the bounded derived Book I text is separately
pinned (`6e26…d44e`, 181,926 bytes) and checked before parsing. The edition's
source identity now names the raw EPUB rather than mistakenly presenting the
derived Book I extraction as the remote EPUB itself.

Pascal has a source-boundary rule rather than a redaction rule: the pinned
comparator must contain the marked T. S. Eliot introduction, and normalized
sections must begin only at `SECTION I`, end before `NOTES`, and contain no
Eliot preface attribution. If any of those conditions fails, replay stops.

## Redistribution basis and residual policy caveat

The Hooker 1888, Julian/Warrack 1901, Benham, and Trotter 1910 English texts
are included only under the project's reviewed U.S. public-domain basis. The
repository does not redistribute scans, EPUBs, Project Gutenberg wrappers, or
the excluded T. S. Eliot introduction. This is a conservative publication
assessment, not a worldwide legal conclusion or a claim about every electronic
presentation. Any runtime/D1 release remains a separate rights, corpus,
capacity, migration, and deployment decision.
