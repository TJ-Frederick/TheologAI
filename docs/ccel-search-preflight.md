# CCEL live-search preflight record

> **Current status:** architecture record only. The public MCP schemas do not
> advertise CCEL, no public tool can invoke this adapter, and TheologAI does not
> retrieve or republish CCEL document bodies. A future discovery-only rollout
> requires a new preflight and explicit release review.

Originally recorded 2026-07-11 and updated 2026-07-15 for dormant parser-policy
hardening. This is an architecture record, not an enablement approval. The
live-search flag remains off by default.

- Search surface reviewed: `https://ccel.org/?page=1&text=...`
- Search contract reviewed: [CCEL Search Help](https://www.ccel.org/help/search), including the documented `author`, `authorID`, `title`, and `bookID` fields.
- Exact locator shape reviewed: `https://ccel.org/ccel/{author}/{work}/{section}.html`.
- Copyright status: no rights determination is made by this adapter. Search snippets are discovery-only metadata; edition-specific copyright and permission checks remain a later rollout gate. The [CCEL Copyright Policy](https://www.ccel.org/about/copyright.html) is reference material, not an approval.
- Terms status: not reviewed or approved for this feature. Terms approval remains an explicit operator gate; copyright policy is not treated as a substitute for terms-of-use approval.
- Robots status: not fetched by this slice. `https://www.ccel.org/robots.txt` must be checked manually by the operator immediately before any preview enablement and again for adapter releases. No automated test fetches robots or the live search surface.
- Interface status: tests use synthetic markup that models the reviewed
  `h2#CCEL_Search_results` plus Bootstrap `.card` anatomy without copying real
  titles, authors, snippets, or tracking values. Each card must contain exactly
  one `h5.card-title` with separate title and author spans, exactly one snippet
  paragraph, and exactly one “Read online” anchor. An earlier cover/image link
  is never treated as the section locator. Selector or anatomy ambiguity fails
  closed as `interface_changed`. A bounded Node/Worker-compatible structural
  tokenizer requires balanced cards and tracked child elements; metadata
  outside a closed card, nested cards, and ambiguous div/card boundaries are
  rejected. Title and author are selected by their explicit `title` and
  `author` span class roles rather than DOM order, and the author role retains
  the reviewed `by` marker.
- Empty-state policy: `no_results` requires exactly one reviewed
  `h2#CCEL_Search_results` immediately followed by exactly one
  `<p>No results found.</p>`. A competing results heading, duplicate empty
  marker, `.card` opening, `h5.card-title`, `p.card-text`, or “Read online”
  anchor makes the response an interface contradiction. Contradictions are
  never inserted into the negative cache.
- Locator policy: a result locator must reduce to the exact allowlisted HTTPS
  path `https://ccel.org/ccel/{author}/{work}/{section}.html`. The complete
  provider query and hash are discarded before construction of the returned
  locator; `token`, `queryID`, `resultID`, and analogous opaque values are not
  returned, cached, persisted, or logged by this adapter.
- Request/output policy: page 1 only; at most five hits; at most 240 Unicode
  characters per snippet; one upstream GET for an admitted cache miss; manual
  redirect mode with zero redirects followed; zero retries. Existing response
  byte limits, wall/stream timeouts, queue bounds, cache bounds, circuit state,
  and policy/security latches remain fail closed.

No live CCEL request, body persistence, production flag change, or remote
mutation is authorized by this record.
