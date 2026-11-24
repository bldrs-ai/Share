# `open-t200`: In-app model lifecycle

> **Snapshot, 2026-11-24.** Status, progress and open decisions live in the track issue, [#2315](https://github.com/bldrs-ai/Share/issues/2315). This page changes only when the track's work items do ([tracks rubric](../tracks-rubric.md) §"Docs in the repo").

**Primary:** `open` (`open-205` In-app model switching, #2011; story #2265, leave a model loading and come back to it). **Also serves:** `open-200` (the workspace's models and sessions, #1657), `open-210` (several models in one view, #2192, #2024). **Related track:** `view-t100` (#2300), which owns the engine worker and rendering; this track owns who holds an engine and a scene, and for how long.

## Why

Opening a model used to be a page load, so a model's engine, scene and state lived exactly as long as the page. The in-app switch (#2222) and per-model sessions (#2247) ended that. What is underneath still holds one model: a viewer owns engines and is rebuilt per open, the loader and the viewer import each other, and a load reports and writes through page-wide state.

Keeping a model alive in the background, listing open models in the workspace, and showing two at once need the same things: one owner for every engine, a scene and a state that belong to the model, and a viewer that outlives a switch.

## End state

- **Six layers**, each importing only from those below: engine, model, loader, session, viewer, UI. A lint rule holds them.
- **One `EngineHost`** owns every engine and hands out leases. A lease exposes one format-neutral `Engine`: `WorkerEngine` in a worker, `ConwayEngine` on the page.
- **A `ModelSession` per open model** holds its leases, scene root, state and load report. It can have no engine, and can go through several.
- **One load path**, `load(source, ctx)`, for IFC, STEP and the mesh formats.
- **One viewer for the page.** It attaches and detaches a session's root, and owns no engine.
- **The store shows the bound session's state**, written by one binder.
- Under `?feature=workspace`, **N models stay open** within a memory budget: a background load finishes, an engine is evicted under pressure with its session kept, and it rehydrates on demand.
- The session layer **runs under Node** with no DOM, shown by a test.

## Work items

The sub-issues of #2315, in order: the slices of [layering.md](layering.md) §7, which has what each builds, removes and tests.

| Work item | What becomes possible | Evidence |
|---|---|---|
| [#2316](https://github.com/bldrs-ai/Share/issues/2316) M1: move the model, the engine helpers and the Conway loader; the lint rule | A new upward import fails `bun run lint`. | The boundary test; the move changes only import and path lines. |
| [#2317](https://github.com/bldrs-ai/Share/issues/2317) M2: `viewer/tools/` and the app-level leaves up to the UI | The allowlist is 19 entries, each with a slice that removes it. | As M1. |
| [#2318](https://github.com/bldrs-ai/Share/issues/2318) V: delete the `?view=` rules stack | No viewer is built over an `IfcAPI`'s parser. | A `?view=` link loads in a worker. |
| [#2319](https://github.com/bldrs-ai/Share/issues/2319) 1a: one `Engine` interface, `WorkerEngine`, `ConwayEngine` | One interface on either engine; `IfcAPI` named only in `src/engine`. | A contract test against both engines and both formats. |
| [#2320](https://github.com/bldrs-ai/Share/issues/2320) 1b: `EngineHost` at cap 1, and the lease | One owner for every engine; the viewer owns none. | A → B → C and a theme toggle each leave one worker and one lease. |
| [#2321](https://github.com/bldrs-ai/Share/issues/2321) N: the `ifcAPI` name out of all but the engine | Format-neutral names above the engine. | A static test. |
| [#2322](https://github.com/bldrs-ai/Share/issues/2322) R: a reporter per load | Two loads report at once. | Two reporters keep their lines apart. |
| [#2323](https://github.com/bldrs-ai/Share/issues/2323) 2a: session roots | A model's scene is one `Group` its session holds. | One root in the scene after an IFC, a STEP and a GLB load. |
| [#2324](https://github.com/bldrs-ai/Share/issues/2324) 2b: attach and detach, view state | A viewer shows a root and lets it go without disposing it. | Detach then attach restores camera, planes, hidden and selected sets. |
| [#2325](https://github.com/bldrs-ai/Share/issues/2325) 2c–2e: one viewer for the page | The viewer outlives a switch and a theme change. | The same canvas across both; left models collected. |
| [#2326](https://github.com/bldrs-ai/Share/issues/2326) 3a: session state, the store as its projection, `load(source, ctx)` | A session off screen writes its own state. | The headless test loads an IFC and a STEP under Node. |
| [#2327](https://github.com/bldrs-ai/Share/issues/2327) 3b: cap N under `?feature=workspace` | Leave a model loading and come back to it finished. | Background finish and selection restore, desktop and mobile. |
| [#2328](https://github.com/bldrs-ai/Share/issues/2328) 4: eviction that keeps the session, and rehydrate | Under memory pressure a background model loses its engine and keeps its scene. | The eviction E2E. |

Planned, with no issue yet (lines on #2315 until picked up):

- the ProjectsDrawer showing each session's state and closing one (`open-205` Phase 1b step 3);
- budget tuning with the bench: several engines loading at once, the scene's bytes per model, a real phone.

## Not moved here yet

- **Existing issues keep their parents.** #2031 (`EngineHost`, which the slices implement), #2019 (sessions), #2023 (the memory E2E), #2030 (no blocking calls) and #2250 (the CadView split) stay under `open-205` and its stories. Which of them move here is a reconciliation ([tracks rubric](../tracks-rubric.md) §"Reconciling a track"), and a follow-up.
- **The engine docs stay in `design/new/`.** Moving [engine-worker.md](../../new/engine-worker.md) and [in-app-model-switch.md](../../new/in-app-model-switch.md) here is a follow-up, with `view-t100`'s share of the first to settle.

## Design and code

- [layering.md](layering.md): the layer map and where every file goes, the import graph and its allowlist, the seams, the lint rule, the headless test, the slices, the risks, and the owner's answers.
- [engine-worker.md](../../new/engine-worker.md): §5.2–§5.5, what `EngineHost` does inside (cap, cost, admission, eviction, rehydrate, Reported Conditions); §5.2a, one viewer for the page; §7 step 8, the engine side of slices 3b and 4.
- [in-app-model-switch.md](../../new/in-app-model-switch.md): §0, the owner's decision log (decisions 6–10 are this track's); §4.9, sessions as built; §4.10, the CadView split plan.
- Code at [`3b623a3f`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741):
  - [`src/engine/`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/engine): the worker, its client (`EngineSession.js`, to be `WorkerEngine`), sources and sidecars;
  - [`src/Containers/modelSession.js`](https://github.com/bldrs-ai/Share/blob/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/Containers/modelSession.js): `ModelSession`, `LoadJob`, `ModelSessionHost`;
  - [`src/loader/Loader.js`](https://github.com/bldrs-ai/Share/blob/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/loader/Loader.js): `load()`, which becomes `load(source, ctx)`;
  - [`src/viewer/`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/viewer): the viewer, and the model representation that moves to `src/model/`.
