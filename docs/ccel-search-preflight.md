# CCEL live-search preflight record

> **Current status:** architecture record only. The public MCP schemas do not
> advertise CCEL, no public tool can invoke this adapter, and TheologAI does not
> retrieve or republish CCEL document bodies. A future discovery-only rollout
> requires a new preflight and explicit release review.

Recorded 2026-07-11 for PR 1. This is an operational review record, not an
enablement approval. The live-search flag remains off by default.

- Search surface reviewed: `https://ccel.org/?page=1&text=...`
- Search contract reviewed: [CCEL Search Help](https://www.ccel.org/help/search), including the documented `author`, `authorID`, `title`, and `bookID` fields.
- Exact locator shape reviewed: `https://ccel.org/ccel/{author}/{work}/{section}.html`.
- Copyright status: no rights determination is made by this adapter. Search snippets are discovery-only metadata; edition-specific copyright and permission checks remain a later rollout gate. The [CCEL Copyright Policy](https://www.ccel.org/about/copyright.html) is reference material, not an approval.
- Terms status: not reviewed or approved for this feature. Terms approval remains an explicit operator gate; copyright policy is not treated as a substitute for terms-of-use approval.
- Robots status: not fetched by this slice. `https://www.ccel.org/robots.txt` must be checked manually by the operator immediately before any preview enablement and again for adapter releases. No automated test fetches robots or the live search surface.
- Interface status: `search-results.html` is a dated, sanitized capture of the visible `h2` search heading, `h5` result headings, section links, and text metadata; `no-results.html` and `policy-page.html` preserve only their reviewed structural `h2`/`p` and `h1`/`p` states. Adversarial markup is isolated in `malicious.html` and is not provenance. Selector/state drift fails closed as `interface_changed`; upstream selector approval remains pending before enablement.

No live CCEL request, body persistence, production flag change, or remote
mutation is authorized by this record.
