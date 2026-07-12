# UBS/Paratext Parallel Passages snapshot

This directory vendors the exact `ParallelPassages.xml` snapshot from the
United Bible Societies (UBS) open-license repository. The XML is retained
byte-for-byte and is the source of truth for the generated local corpus.

- Source: [UBS open-license repository](https://github.com/ubsicap/ubs-open-license/tree/fd7bcf88b20a1522d3916f437f012c561466fe7b/parallel%20passages)
- Resource description: [UBS Paratext Parallel Passages Database](https://translation.bible/tools-resources/paratext-parallel-passages-database/)
- License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Copyright: © 2023 United Bible Societies

TheologAI's compiler validates the pinned bytes, parses only the expected
`Passages`/`Passage`/`Verse` XML shape, preserves source group/member order,
retains raw references and alignment strings, and writes a deterministic
derived JSON artifact. The generated artifact is an adapted database under
the same CC BY-SA 4.0 license. The transformation does not select, classify,
or infer directionality for UBS passage groups.

The pinned source metadata, including byte size, SHA-256, Git blob, and source
commit, is in `SOURCE.json`. Normal builds and tests use these local files and
do not fetch from the network.
