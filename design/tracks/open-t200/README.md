# `open-t200`: In-app model lifecycle

> **Snapshot, 2026-11-24.** Status, progress and open decisions live in the track issue, [#2315](https://github.com/bldrs-ai/Share/issues/2315). This page changes only when the track's work items do ([tracks rubric](../tracks-rubric.md) §"Docs in the repo").

**Primary:** `open` (`open-205` In-app model switching, #2011; story #2265, leave a model loading and come back to it). **Also serves:** `open-200` (the workspace's models and sessions, #1657), `open-210` (several models in one view, #2192, #2024). **Related track:** `view-t100` (#2300), which owns the engine worker and rendering; this track owns who holds an engine and a scene, and for how long.

## Why

Opening a model used to be a page load, so a model's engine, scene and state lived exactly as long as the page. The in-app switch (#2222) ended that, and what was left underneath does not hold more than one model:

- a viewer owns engines, and is rebuilt per open and per theme change;
- the loader and the viewer import each other, and the loader writes into the store;
- a load reports, publishes its artifact and tracks its selection through page-wide state.

Keeping a model alive in the background, listing open models in the workspace, and showing two at once all need the same things: one owner for every engine, a scene and a state that belong to the model and not to the page, and a viewer that outlives a switch.

## End state

- **Six layers**, each importing only from those below: engine, model, loader, session, viewer, UI. A lint rule holds them.
- **One `EngineHost`** owns every engine and hands out leases. A lease exposes one format-neutral `Engine`, implemented by `WorkerEngine` (in a worker) and `ConwayEngine` (on the page).
- **A `ModelSession` per open model** holds its leases, its scene root, its state and its load report. It can have no engine, and can go through several.
- **One load path**, `load(source, ctx)`, for IFC, STEP and the mesh formats.
- **One viewer for the page.** It attaches a session's root and detaches it, and owns no engine.
- **The store shows the bound session's state**, written by one binder.
- Under `?feature=workspace`, **N models stay open** within a memory budget: a background load finishes, an engine is evicted under pressure and its session kept, and it rehydrates on demand.
- The session layer **runs under Node** with no DOM, shown by a test.

## Work items

These are the sub-issues of #2315: the slices of [layering.md](layering.md) §7, in order.

| Work item | What becomes possible | Evidence that proves it |
|---|---|---|
| [#2316](https://github.com/bldrs-ai/Share/issues/2316) M1: move the model, the engine helpers and the Conway loader; the lint rule | The layers exist as directories, and a new upward import fails `bun run lint`. | The boundary test lints virtual files and fails on a stale allowlist entry. The move is shown to change only import and path lines. |
| [#2317](https://github.com/bldrs-ai/Share/issues/2317) M2: `viewer/tools/` and the app-level leaf files up to the UI | The leaves and the viewer import nothing above them but the entries later slices remove. | As M1; the allowlist goes from 55 entries to 19. |
| [#2318](https://github.com/bldrs-ai/Share/issues/2318) V: delete the `?view=` rules stack | A viewer is no longer built over an `IfcAPI`'s parser. | A `?view=` link loads in a worker, on desktop and mobile; the Widget API handler still answers success. |
| [#2319](https://github.com/bldrs-ai/Share/issues/2319) 1a: one `Engine` interface, `WorkerEngine`, `ConwayEngine` | Readers and the loader talk to one interface on either engine; Conway's `IfcAPI` is named only in `src/engine`. | A contract test run against both engines and both formats; one artifact hash through either; the kill-switch E2Es unchanged. |
| [#2320](https://github.com/bldrs-ai/Share/issues/2320) 1b: `EngineHost` at cap 1, and the lease | One owner for every engine; the viewer owns none. | Host and session unit tests; A → B → C with one worker lease each time; a theme toggle leaves one worker and one lease. |
| [#2321](https://github.com/bldrs-ai/Share/issues/2321) N: the `ifcAPI` name out of everything but the engine | Nothing outside the engine layer is named for IFC when it also serves STEP. | A static test fails on the identifier outside `src/engine`. |
| [#2322](https://github.com/bldrs-ai/Share/issues/2322) R: a reporter per load | Two loads report at once without writing into each other's report. | Two reporters keep their lines apart; a late-ending one leaves the next one's console tee in place. |
| [#2323](https://github.com/bldrs-ai/Share/issues/2323) 2a: session roots | A model's scene is one `Group` its session holds. | After a load, the scene holds the viewer's own objects and exactly one root, for an IFC, a STEP and a GLB. |
| [#2324](https://github.com/bldrs-ai/Share/issues/2324) 2b: attach and detach, view state, `disposeModelRoot` | A viewer shows a root and lets it go without disposing it. | Detach then attach restores camera, planes, hidden and selected sets; dispose frees one root and no other. |
| [#2325](https://github.com/bldrs-ai/Share/issues/2325) 2c–2e: one viewer for the page | The viewer lives for the page, behind `singleViewer`, then on by default. | The same canvas across a theme toggle and across A → B → C; left models collected; a lost WebGL context restored. |
| [#2326](https://github.com/bldrs-ai/Share/issues/2326) 3a: session state, the store as its projection, `load(source, ctx)` | A session that is not on screen writes its own state; the session layer needs no store, viewer or DOM. | The headless test loads an IFC and a STEP under Node; a background write reaches the session and not the store. |
| [#2327](https://github.com/bldrs-ai/Share/issues/2327) 3b: cap N under `?feature=workspace` | A user leaves a model loading and comes back to it finished, with its selection. | Background finish, selection restore, the count cap and backpressure E2Es, on desktop and mobile. |
| [#2328](https://github.com/bldrs-ai/Share/issues/2328) 4: eviction that keeps the session, and rehydrate | Under memory pressure a background model loses its engine and keeps its scene; the engine comes back when a read needs it. | The eviction E2E: worker closed, scene kept, artifact reads, one rehydrate on a nested reference. |

Two pieces of planned work have no issue yet. They stay as lines on #2315 until someone picks them up, and become sub-issues then:

- the ProjectsDrawer showing each session's state and closing one (`open-205` Phase 1b step 3);
- budget tuning with the bench: several engines loading at once, the scene's bytes per model, a real phone.

**Landed:**

- the in-app switch, on by default (#2222);
- per-model sessions with one live session (#2247).

## Not moved here yet

- **Existing issues keep their parents.** #2031 (`EngineHost`, which the slices implement), #2019 (sessions), #2023 (the memory E2E), #2030 (no blocking calls) and #2250 (the CadView split) stay where they are, under `open-205` and its stories. #2315 links them under Related. Deciding which of them move under this track is a reconciliation ([tracks rubric](../tracks-rubric.md) §"Reconciling a track"), and a follow-up.
- **The engine docs stay in `design/new/`.** [engine-worker.md](../../new/engine-worker.md) and [in-app-model-switch.md](../../new/in-app-model-switch.md) govern this track and are not in its directory. Moving them here is a follow-up, with `view-t100`'s share of `engine-worker.md` to settle first.

## Design and code

- [layering.md](layering.md): the layer map and where every file goes, the import graph and its allowlist, the seams (the `Engine` interface, the lease, the load context, the reporter, session state and its projection, attach and detach, the OPFS gate), the lint rule, the headless test, the slices, the risks, and the owner's answers.
- [engine-worker.md](../../new/engine-worker.md): §5.2–§5.5, what `EngineHost` does inside (the cap, what an engine costs, admission, eviction, rehydrate, Reported Conditions); §5.2a, one viewer for the page; §7 step 8, the engine side of slices 3b and 4.
- [in-app-model-switch.md](../../new/in-app-model-switch.md): §0, the owner's decision log (decisions 6–10 are this track's); §4.9, sessions as built; §4.10, the CadView split plan.
- Code at [`3b623a3f`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741):
  - [`src/engine/`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/engine): the worker, its client (`EngineSession.js`, to be `WorkerEngine`), sources and sidecars;
  - [`src/Containers/modelSession.js`](https://github.com/bldrs-ai/Share/blob/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/Containers/modelSession.js): `ModelSession`, `LoadJob`, `ModelSessionHost`;
  - [`src/loader/Loader.js`](https://github.com/bldrs-ai/Share/blob/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/loader/Loader.js): `load()`, which becomes `load(source, ctx)`;
  - [`src/viewer/`](https://github.com/bldrs-ai/Share/tree/3b623a3fc7140cdf0aa15907ccc6700c88fc6741/src/viewer): the viewer, and the model representation that moves to `src/model/`.
