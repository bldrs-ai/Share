# bldrs-share Specs

Portable feature specifications for the bldrs-share BIM viewer. Each spec is self-contained and can be copied to other repos for reference.

## Features
| # | Spec | Description |
|---|------|-------------|
| 01 | [Viewer Core](01-viewer-core.md) | 3D viewer, IFC loading, selection, highlighting, isolation |
| 02 | [Cut Planes](02-cut-planes.md) | Section/plan/elevation clipping planes |
| 03 | [Nav Tree](03-nav-tree.md) | IFC spatial structure tree with hide/show |
| 04 | [Properties](04-properties.md) | IFC property set display for selected elements |
| 05 | [Notes](05-notes.md) | GitHub Issues-backed annotations with 3D placemarks |
| 06 | [Share](06-share.md) | URL state encoding, QR codes, collaboration |
| 07 | [Bot Chat](07-bot-chat.md) | AI assistant via OpenRouter LLM API |
| 08 | [Imagine](08-imagine.md) | AI architectural rendering from screenshots |
| 09 | [Versions](09-versions.md) | Git commit history timeline navigation |
| 10 | [Apps](10-apps.md) | Iframe-based plugin system with Widget API |
| 11 | [Search](11-search.md) | In-model search + URL/GitHub path input |
| 12 | [Camera](12-camera.md) | Camera controls + URL state persistence |
| 13 | [Auth & Profile](13-auth-profile.md) | Auth0 authentication + profile management |

## Dev Work
| # | Spec | Description |
|---|------|-------------|
| 14 | [Memory Leak Fixes](14-memory-leak-fixes.md) | 8 leaks fixed across 11 files |
| 15 | [Codebase Improvements](15-codebase-improvements.md) | 15 pre-existing issues (backlog) |

## Comparison
| # | Spec | Description |
|---|------|-------------|
| 16 | [ThatOpen Comparison](16-thatopen-comparison.md) | Floor plan architecture: bldrs-share vs ThatOpen v2 |
