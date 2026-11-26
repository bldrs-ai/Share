# Share 100

**Epic:** [share-100: Share a link to the current view · #2284](https://github.com/bldrs-ai/Share/issues/2284) · **Scope snapshot: 2026-11-25**

## Motivation

A reviewer can point someone to the model and the view they are discussing without describing where to look.

**Journey:** Open a hosted model → open Share → copy the URL or scan the QR code → open the model and supported view terms in Share. The text field, clipboard and QR code use the current viewer URL, so the recipient needs whatever access the source requires. A URL pointing to a mutable source can open newer content. For a browser-local upload, Share explains the restriction and offers to open a hosted file.

Camera, cut planes and display follow the live-link rules in [model-display-controls.md](../new/model-display-controls.md) §6.4. An element link carries the selection when its permalink is in the URL.

## UX stories

| Story | Scope |
|---|---|
| [Copy or scan a link to the current view · #2374](https://github.com/bldrs-ai/Share/issues/2374) | The dialog, link field, clipboard action, QR, and the local-only explanation. |

| Related capability | Owner |
|---|---|
| Camera position | `view-120` ([#2272](https://github.com/bldrs-ai/Share/issues/2272)) |
| Link to an element | `search-100` ([#2278](https://github.com/bldrs-ai/Share/issues/2278)) |
| Cut planes and display state | `view-110` ([#2271](https://github.com/bldrs-ai/Share/issues/2271)), `view-140` ([#1705](https://github.com/bldrs-ai/Share/issues/1705)) |
| Share sign-in and upgrade | `share-120` ([#1421](https://github.com/bldrs-ai/Share/issues/1421)) |
| Audience and visibility | `share-130` ([#2206](https://github.com/bldrs-ai/Share/issues/2206)) |
| Opaque exact-version links | `share-200` ([#2144](https://github.com/bldrs-ai/Share/issues/2144)) |
| GLB export in Save | `share-140` ([#1831](https://github.com/bldrs-ai/Share/issues/1831)) |

The [triage record](share-100-triage.md) records evidence and ownership. Live status is in [#2284](https://github.com/bldrs-ai/Share/issues/2284).
