# CCEL live-search preflight record

> **Current status:** exposure-only preview record. Production uses the
> local-only v6 contract. Preview advertises the v7 CCEL discovery shape, but
> both execution switches remain off: no public call can reach the adapter,
> coordinator lookup/RPC, or upstream fetch. TheologAI does not retrieve or
> republish CCEL document bodies. Live discovery still requires a fresh
> operational preflight and explicit release review.

Originally recorded 2026-07-11, updated 2026-07-15 for dormant parser-policy
hardening, and reconciled 2026-07-16 for preview-only v4 exposure. Updated
2026-07-17 for preview-only v5 exposure. This is an architecture record, not
an enablement approval. The live-search and coordinator flags remain off in
production and preview.

- Search surface reviewed: `https://ccel.org/?page=1&text=...`
- Search contract reviewed: [CCEL Search Help](https://www.ccel.org/help/search), including the documented `author`, `authorID`, `title`, and `bookID` fields.
- Exact locator shape reviewed: `https://ccel.org/ccel/{author}/{work}/{section}.html`.
- Product boundary approved by the owner on 2026-07-16: retain the existing
  bounded discovery model of at most five attributed, 240-character search
  snippets and clean result links. Do not scrape full content, retrieve document
  bodies, mirror or host CCEL material, or durably store CCEL content. This is a
  product boundary, not a claim that CCEL separately licenses search snippets.
- Copyright status: no rights determination is made by this adapter. Search snippets are discovery-only metadata; edition-specific copyright and permission checks remain required for any separate local-corpus republication. The [CCEL Copyright Policy](https://www.ccel.org/about/copyright.html) is reference material, not an approval.
- Terms status: not reviewed or approved for this feature. Terms approval remains an explicit operator gate; copyright policy is not treated as a substitute for terms-of-use approval.
- Robots observation on 2026-07-16: `https://ccel.org/robots.txt` returned HTTP
  200 with a wildcard `Crawl-delay: 10` and no wildcard disallow rule. This
  observation is not permission or a durable policy guarantee. Recheck it
  immediately before an authorized preview audit; automated tests never fetch
  robots or the live search surface.
- Interface status: tests use synthetic markup that models the reviewed
  `h2#CCEL_Search_results` plus Bootstrap `.card` anatomy without copying real
  titles, authors, snippets, or tracking values. Each card must contain exactly
  one `h5.card-title` with separate title and author spans, exactly one snippet
  paragraph, and exactly one “Read online” anchor. An earlier cover/image link
  is never treated as the section locator. Selector or anatomy ambiguity fails
  closed as `interface_changed`. HTML is parsed once with the standards-based
  `parse5` HTML5 tree builder; the same pure-ESM implementation bundles for
  Node and Workers. Result cards must be direct siblings after the reviewed
  heading, and `.card-body`, title heading, title/author roles, snippet, and
  “Read online” anchor must retain their reviewed direct-containment paths.
  Metadata outside a closed card, nested cards, unreviewed wrappers, implied
  closing tags, and ambiguous card boundaries are rejected. `template`,
  `noscript`, `textarea`, `script`, `style`, SVG/MathML, other inert elements,
  and subtrees marked with `hidden`, boolean `inert`, or ASCII-normalized
  `aria-hidden="true"` do not contribute metadata or visible text. Title and
  author are selected by their exact `title` and `author` span class roles
  rather than DOM order, and the author role retains the reviewed `by` marker.
  Accepted direct ancestry must also agree with parse5 source locations.
  Table-context elements or source tags anywhere after the results heading are
  rejected because the reviewed interface does not use tables and HTML5 foster
  parenting can otherwise move card markup outside its source wrapper. Narrow
  source-gap checks around accepted structural nodes likewise reject formatting
  wrappers repaired by the adoption-agency algorithm; they do not implement a
  second HTML tokenizer.
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
  wall/stream timeouts, queue bounds, cache bounds, circuit state, and
  policy/security latches remain fail closed. Because the HTML5 parse itself is
  synchronous, input is capped at 256 KiB before parsing. The projected tree is
  additionally capped at 10,000 nodes, 10,000 total attributes, 64 attributes
  per element, depth 64, 100,000 text code units, and a 100 ms parse/traversal
  deadline.
- Parser dependency: `parse5` is exact-pinned at `8.0.1`, the current version
  returned by the authoritative npm registry during this 2026-07-15 review.
  Its package metadata declares MIT, pure ESM, and an ESM export at
  `./dist/index.js`; its sole installed dependency edge is `entities@8.0.0`
  (BSD-2-Clause). Worker dry-run bundling and Node/Worker typechecks are release
  gates for this dormant adapter.
- 2026-07-15 local verification on Node 22.23.1 measured 1,000 valid parses at
  0.035 ms median / 3.419 ms maximum, 50 pre-parse rejections of a 100,000-
  attribute input at 0.795 ms median / 0.885 ms maximum, and 50 bounded
  rejections of 10,000 nested headings at 5.636 ms median / 11.760 ms maximum.
  These figures are diagnostic observations, not portable performance SLAs.
  Against the pre-parse5 `a47573f` baseline, the preview Worker dry bundle grew
  from 2,603,119 to 2,899,157 raw bytes (+296,038) and from 492,279 to 555,191
  gzip bytes (+62,912); Wrangler 4.107.0 completed both dry runs successfully.

No live CCEL request, body persistence, production flag change, coordinator
execution, or remote mutation is authorized by this record. The preview-only
exposure flag changes an MCP contract, not the upstream execution policy.

The content-free admission/circuit design and staged gates are documented in
[CCEL-UPSTREAM-COORDINATOR.md](./CCEL-UPSTREAM-COORDINATOR.md). Preview v5
exposure does not supersede this preflight's operational, robots, terms, or
interface-review gates.
