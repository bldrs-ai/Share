# View 100

**Epics:** [view-100 · #2270](https://github.com/bldrs-ai/Share/issues/2270), [view-110 · #2271](https://github.com/bldrs-ai/Share/issues/2271), [view-120 · #2272](https://github.com/bldrs-ai/Share/issues/2272), [view-130 · #2273](https://github.com/bldrs-ai/Share/issues/2273), [view-140 · #1705](https://github.com/bldrs-ai/Share/issues/1705), [view-200 · #2274](https://github.com/bldrs-ai/Share/issues/2274), [view-210 · #2275](https://github.com/bldrs-ai/Share/issues/2275), [view-220 · #1881](https://github.com/bldrs-ai/Share/issues/1881), [view-230 · #2276](https://github.com/bldrs-ai/Share/issues/2276), [view-300 · #2277](https://github.com/bldrs-ai/Share/issues/2277) · **Scope snapshot: 2026-11-23**

## Motivation

Once a model is open, people need to look at it: orbit and zoom, browse the element tree, select an element and read its properties, cut it with planes, hide parts, and send someone else the same view. These ten epics are that experience. They share one snapshot and one triage record because most are small (one to five stories) and share the same rules: the view, selection, cut and display state live in the link and only follow the user's own first change ([model-display-controls.md](../new/model-display-controls.md) §6.4).

The journey is **load → look around → select → read → cut or hide → share the view**. A recipient who opens the link sees what the sender saw.

## UX stories

Each linked issue carries its epic's prefix and owns its tasks and acceptance. Closed stories are the shipped baseline.

| Epic | Story | User goal |
|---|---|---|
| `view-100` | [Load a model and see it framed · #1031](https://github.com/bldrs-ai/Share/issues/1031) (closed) | See the model centered when it loads. |
| `view-100` | [Center the model and reset the view · #1042](https://github.com/bldrs-ai/Share/issues/1042) (closed) | Get back to the default view. |
| `view-100` | [Keep the 3D view and the tree in sync · #1046](https://github.com/bldrs-ai/Share/issues/1046) (closed) | Select in the scene or the tree and have both follow. |
| `view-100` | [Navigate a model by its element hierarchy · #1048](https://github.com/bldrs-ai/Share/issues/1048) (closed) | Browse the spatial tree. |
| `view-100` | [Read the properties of the selected element · #1242](https://github.com/bldrs-ai/Share/issues/1242) (closed) | See an element's properties. |
| `view-110` | [Cut a model with planes · #1106](https://github.com/bldrs-ai/Share/issues/1106) (closed) | Slice the model to see inside. |
| `view-110` | [Attach a cut plane to a surface · #1045](https://github.com/bldrs-ai/Share/issues/1045) | Click a surface to align the cut to it. |
| `view-120` | [Share the camera position · #1043](https://github.com/bldrs-ai/Share/issues/1043) (closed) | Send a link that opens at the same view. |
| `view-130` | none formal yet | Large models stay fast and usable. |
| `view-140` | S1–S9, [#1706](https://github.com/bldrs-ai/Share/issues/1706)–[#1713](https://github.com/bldrs-ai/Share/issues/1713), [#1793](https://github.com/bldrs-ai/Share/issues/1793) | Scoped display controls and the `#d:` token. Filed as stories, mostly technical; unchanged. |
| `view-200` | [Keep hidden elements hidden across sessions · #1250](https://github.com/bldrs-ai/Share/issues/1250) | Hide or isolate and have it stay. Mostly absorbed by `view-140`. |
| `view-210` | [Frame the camera on a selected element · #1044](https://github.com/bldrs-ai/Share/issues/1044) | Move the camera to a selection. |
| `view-210` | [Measure the distance between two elements · #1047](https://github.com/bldrs-ai/Share/issues/1047) | Measure with snapping. |
| `view-220` | [ViewCube navigation gizmo · #1882](https://github.com/bldrs-ai/Share/issues/1882) (closed) | Orient the view with a cube. Explode, undo and IDS aren't filed. |
| `view-230` | [Anchor a note to an element · #892](https://github.com/bldrs-ai/Share/issues/892), [Find model notes using colored topic tags · #894](https://github.com/bldrs-ai/Share/issues/894) | Pin notes to places; filter them like a map. |
| `view-300` | [View element subsets as a table · #56](https://github.com/bldrs-ai/Share/issues/56) | Choose elements and attributes, see a table, export it. |

Each epic's native sub-issues are the stories listed for it (for `view-140`, its nine work items).

## Not owned here

- **Search** is [search-100](search-100.md). **Notes** are `notes-100` ([#670](https://github.com/bldrs-ai/Share/issues/670)); `view-230` holds the pin and the filtering UI.
- **Engine and rendering work** is track `view-t100`, including the streaming loader ([#1601](https://github.com/bldrs-ai/Share/issues/1601)) and the demand/tiled rendering milestone ([#1613](https://github.com/bldrs-ai/Share/issues/1613)). `view-130` is the user-facing half and has no formal story yet.
- **In-app switching and several models** are [open-205](open-205.md) and [open-210](open-210.md).

**Milestone:** `view-100` to `view-130` are 1xx (MVP); the rest are 2xx and later, post-MVP in roadmap §8. The roadmap keeps `view-100` to `view-120` ✔ and the rest as they were; §6.0 is unchanged. The hypotheses are in the [triage record](view-100-triage.md), with the aliases, inventory and milestone audit. Revise and re-date this snapshot when the motivation or a story list changes.
