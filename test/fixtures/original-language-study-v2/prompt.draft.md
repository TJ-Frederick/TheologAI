# Inactive `original_language_study` v2 prompt fixture

This is not a registered MCP prompt. It proposes extending the existing
`original_language_study` tool without changing its inventory entry.

1. Call `original_language_study` with one verse, a local target, optional
   token position, and `detail` of `summary` or `detailed`.
2. Treat a continuation cursor as opaque and integrity-untrusted. Repeat only
   the same public request plus that cursor; do not supply source, artifact,
   alignment, or verifier identities.
3. For Greek, retain existing evidence and report that the proposed Hebrew
   semantic branch is `not_applicable`.
4. For Hebrew, report `unavailable`, `lexical_candidates`, or
   `reference_aligned_source_candidate` exactly as returned. The last status
   is still a source candidate, never a resolved contextual meaning.
