# Search 100

**Epics:** [search-100: Search the current model · #2278](https://github.com/bldrs-ai/Share/issues/2278), [search-300: Search across my GitHub repositories · #2279](https://github.com/bldrs-ai/Share/issues/2279), [search-320: Fluid NavTree + breadcrumb-scoped search · #1658](https://github.com/bldrs-ai/Share/issues/1658); `search-310` is absorbed by [assist-310 · #1659](https://github.com/bldrs-ai/Share/issues/1659) · **Scope snapshot: 2026-11-23**

## Motivation

Large models have thousands of elements, so finding one by browsing the tree is slow. Search lets someone type a name and see the matching elements highlighted, jump to one, and send a link that lands on it. Beyond the open model, people also want to search across their repositories, and later to ask questions of the building's data.

The journey is **type a name → matching elements highlight → pick one → share a link to it**. In `search-320` the tree itself becomes a summonable, type-to-filter dropdown from the top bar's breadcrumb, with the search scope following the breadcrumb.

## UX stories

Each linked issue carries its epic's prefix and owns its tasks and acceptance.

| Epic | Story | User goal |
|---|---|---|
| `search-100` | [Share a link to an element · #1180](https://github.com/bldrs-ai/Share/issues/1180) (closed) | Send a link that lands on one element. |
| `search-300` | none yet | Search across my GitHub repositories. Placeholder; post-MVP. |
| `search-320` | [Search the model by element name · #1254](https://github.com/bldrs-ai/Share/issues/1254) | Find every element with a name and see them highlighted. |
| `search-320` | [Dropdown NavTree · #1668](https://github.com/bldrs-ai/Share/issues/1668), [breadcrumb scope · #1669](https://github.com/bldrs-ai/Share/issues/1669), [Versions re-home decision · #1670](https://github.com/bldrs-ai/Share/issues/1670) | A type-to-filter tree from the breadcrumb, with scope that follows it. |
| `search-320` | [Breadcrumb-anchored scope and `SearchProvider` · #1699](https://github.com/bldrs-ai/Share/issues/1699), [lazy spatial provider · #1701](https://github.com/bldrs-ai/Share/issues/1701), [streaming index · #1702](https://github.com/bldrs-ai/Share/issues/1702), [retire subtree selection · #1704](https://github.com/bldrs-ai/Share/issues/1704) | The technical halves of the same journey, filed as stories under `search-320`. |

`search-320` had these eight sub-issues before this pass; only #1254 was retitled.

## Not owned here

- **`search-310` (knowledge graph)** is absorbed by the assistant, [assist-310](assist-310.md): natural-language questions are its job and the graph becomes its retrieval layer.
- **Selection and properties** are `view-100`, in [view-100.md](view-100.md). **Hide and isolate** are `view-200`; #1704 sits here because it changes what selecting a container means.
- **Filtering notes by tag** is `view-230`.

**Milestone:** `search-100` is 1xx and 🟡; `search-320` is stage AI.1a of the AI pivot, not started; `search-300` is 3xx, post-MVP. The hypotheses are in the [triage record](search-100-triage.md), with the aliases and inventory. Revise and re-date this snapshot when the motivation or a story list changes.
