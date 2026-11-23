# Share 100

**Epic:** [share-100: Share a link to the current view · #2284](https://github.com/bldrs-ai/Share/issues/2284) · **Scope snapshot: 2026-11-23**

## Motivation

The cheapest way to show someone a model is to send a link to it. Share's link opens the same model, with the camera, cut planes, display state and selected element the sender was looking at, so the recipient doesn't have to be told where to look. Shared links are also the one earned channel the product has, so a link that works matters beyond the single share.

The journey is **open a model → Share → copy the link → the recipient opens the same view**. The link follows each view term only after the sender's own first change to it ([model-display-controls.md](../new/model-display-controls.md) §6.4).

## UX stories

None are formal yet; the story for the Share dialog itself is pending, and no existing issue covers it. The pieces of the link are owned by other epics:

| Piece | Owner |
|---|---|
| Camera position | `view-120` ([#2272](https://github.com/bldrs-ai/Share/issues/2272)) |
| A link to one element | `search-100` ([#2278](https://github.com/bldrs-ai/Share/issues/2278)) |
| Cut planes, display state | `view-110` ([#2271](https://github.com/bldrs-ai/Share/issues/2271)), `view-140` ([#1705](https://github.com/bldrs-ai/Share/issues/1705)) |
| Sign-in and upgrade in the dialog | `share-120` ([#1421](https://github.com/bldrs-ai/Share/issues/1421)) |
| Who can open a share; the visibility chip | `share-130` ([#2206](https://github.com/bldrs-ai/Share/issues/2206)) |
| Unguessable links to an exact version | `share-200` ([#2144](https://github.com/bldrs-ai/Share/issues/2144)) |
| GLB export (in the Save dialog) | `share-140` ([#1831](https://github.com/bldrs-ai/Share/issues/1831)) |

**Milestone:** 1xx, shipped (✔). The hypothesis is in the [triage record](share-100-triage.md). Revise and re-date this snapshot when the story list changes.
