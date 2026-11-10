# Design

## Core Application Structure
This is a React-based CAD/BIM model viewer built with:
- **React 18** with React Router for navigation
- **Zustand** for state management (see `src/store/`)
- **Material-UI** for UI components and theming
- **ESBuild** for fast development and production builds
- **Conway/web-ifc-viewer** for IFC model rendering and processing

## Entry Points
- `src/index.jsx` - Main application entry with Auth0, Sentry, and MSW setup
- `src/subscribe/index.jsx` - Separate subscription page entry point
- `src/Share.jsx` - Main application component handling routing and model loading

## Key Directories

### `/src/Components/`
Reusable UI components organized by feature:
- `About/`, `Apps/`, `Auth/` - Feature-specific components
- `Camera/`, `CutPlane/`, `Markers/` - 3D viewer controls
- `NavTree/`, `Notes/`, `Properties/` - Model interaction panels
- `Open/`, `Share/`, `Versions/` - File and collaboration features
- `SideDrawer/` - Collapsible panel system
- Each component directory contains the main component, tests, fixtures, and hash state management

### `/src/Containers/`
High-level layout containers:
- `CadView.jsx` - Main viewer container with model loading logic
- `ViewerContainer.jsx` - 3D viewer wrapper
- `*Drawer.jsx` - Side panel containers for different feature groups
- `RootLandscape.jsx` - Top-level layout coordinator

### `/src/store/`
Zustand state management slices:
- `useStore.js` - Main store combining all slices
- Individual slices for: Apps, Browser, CutPlanes, IFC, NavTree, Notes, Open, Properties, Repository, Search, Share, UI, Versions
- Each slice manages specific application state domain

### `/src/Infrastructure/`
Core 3D viewer and model processing:
- `IfcViewerAPIExtended.js` - Extended IFC viewer with custom functionality
- `IfcHighlighter.js`, `IfcIsolator.js` - Element interaction features
- `CustomPostProcessor.js` - Custom rendering effects
- `PlaceMark.js` - 3D annotations system

### `/src/loader/`
Model file loading and format support:
- `Loader.js` - Main loader orchestration
- `BLDLoader.js` - Core model loading logic
- Format-specific loaders: `glb.js`, `obj.js`, `stl.js`, `pdb.js`, `xyz.js`
- `urls.js` - URL processing and validation

### `/src/OPFS/`
Origin Private File System caching layer for downloaded models:
- `OPFSService.js` - Singleton worker manager; `initializeWorker()` returns one shared Web Worker
- `OPFS.worker.js` - Worker that downloads, caches, and retrieves model files. Sends multiple
  sequential `postMessage` events for a single `downloadModel` request:
  1. `{completed: true, event: 'download', file}` — file fetched but not yet renamed
  2. `{completed: true, event: 'renamed', file, lastModifiedGithub}` — file renamed with commit hash,
     GitHub last-modified epoch ms now available
  - Or a single `{completed: true, event: 'exists', file, lastModifiedGithub}` when fully cached
- `utils.js` - `downloadModel()` wraps the worker with a Promise that resolves on the first
  completed message; an optional `onLastModifiedGithub` callback fires on whichever message
  carries the date (may arrive after the Promise resolves)
- `Cache.js` - HTTP Cache API wrapper; stores custom headers `CommitHash` and
  `LastModifiedGithub` alongside cached responses so they survive browser sessions

### `/src/net/github/`
GitHub API integration for model versioning and collaboration:
- Complete GitHub API wrapper with caching
- Support for repositories, commits, branches, issues, comments
- Authentication and proxy handling

## Build System
- **ESBuild** configuration in `tools/esbuild/`
- Single engine: Conway (web-ifc-shaped API via `@bldrs-ai/conway/web-ifc`; the real-web-ifc comparison build was removed 2026-11-01, see design/new/adapter-removal.md)
- Environment-specific configs: dev, prod, cypress
- Multi-threading support with Conway engine
- Bundle analysis and optimization tools

## Testing Strategy
- **Jest** for unit tests with jsdom environment
  - Common base mock fixtures (MemoryRouter, ThemeProvider, etc.) are in `src/Share.fixture.jsx`
  - Prefer the wrappers in in `src/Share.fixture.jsx` as the React Testing Library `wrapper` when a component needs context providers: helmet, store, router, theme or combinations thereof. Pass them eg: `render(<Component/>, {wrapper: HelmetStoreRouteThemeCtx})` instead of recreating providers.
  - MSW is started globally in `tools/jest/setupTests.js`; do not call `initServer` or `server.listen()` inside individual test files.
- **Playwright** for E2E testing
  - Test specs are defined alongside their corresponding component files in `src/Components/`, eg `src/Components/Bot/{BotChat.jsx,BotChat.spec.tsx}`.
- **React Cosmos** for component development and testing
- **MSW** for API mocking in tests is setup in `src/__mocks__/api-handlers.js`
- Separate test configs for source code and build tools

## State Management Architecture
- Zustand store with slice pattern for feature separation
- Hash-based state persistence for shareable URLs
- Real-time collaboration state synchronization
- Component-level state for UI interactions

## Model Processing Pipeline
1. URL parsing and model path resolution (`Share.jsx`, `src/utils/urlHelpers.js`)
2. File loading through format-specific loaders (`src/loader/`)
3. IFC processing with the Conway engine
4. 3D scene setup and rendering (`Infrastructure/`)
5. UI state synchronization and user interactions

## Render loop & perf monitor

The `requestAnimationFrame` loop is driven by the `web-ifc-viewer` fork.
Each frame the fork calls `renderer.update`, which we replace at startup
with our own closure via `ThreeContext.setRenderUpdate(fn)`
(`src/viewer/three/ThreeContext.js`). That closure is the **only**
per-frame render path we control — there is no second `composer.render()`
or `renderer.render()` callsite in our code.

Today the closure is built in `src/viewer/three/IfcHighlighter.js`
(it needs the `EffectComposer` to drive the outline effect). If/when a
future refactor pulls render-driving out of the highlighter — e.g. into
a dedicated `RenderLoop` module — `setRenderUpdate` is the seam that
moves with it.

**On-demand painting while a model streams in (open-205 #2043).** The
closure consults the viewer's `RenderDemand` (`src/viewer/three/renderDemand.js`,
one per `IfcContext`, `ThreeContext#getRenderDemand`). Outside a load it is
inert and every frame paints, as before. For the length of a load (CadView
opens a scope as the load starts and closes it when the load settles;
`ProgressiveLoadSession` holds a nested one for the parse) the loop keeps
ticking — camera-controls still updates in it — but paints
only when asked: on the next frame for camera moves (all but the load's
camera follow, which snaps inside `runFollowMove` so its updates are told
apart by call), a selection
change (`ShareViewer#setPreviewSelection`), a resize or the load's first
geometry; within a frame budget
(at least 100 ms apart and four times the last paint's cost, measured from
the paint to the next frame, because the draw call itself returns long
before the GPU work behind it is done) for arriving geometry, the camera
follow's refits and a one-second heartbeat. Anything
new that changes the picture *during* a load and must show at once calls
`getRenderDemand().invalidate()`; after the load nothing needs to (unless
the session paints on demand too; next paragraph). Why:
design/new/in-app-model-switch.md §4.2a.

**On-demand painting for the whole session (render-on-demand, story #2055,
on by default since the flip after #2096).** `IfcContext` calls
`RenderDemand#startSession` when `renderOnDemandMode.js#isRenderOnDemandOn`
says so, so between loads the loop still ticks but paints only when
something asks, with no heartbeat and no budget: an idle viewer paints
nothing. That predicate is the only reader of the flags; everything else
that behaves differently on demand reads `RenderDemand#isSession`. With it
off (the switches below) the loop paints every frame between loads, as
before #2055, and the hooks in layer 3 are not installed. A change that
never asks leaves a stale frame up, so asking is layered,
cheapest-to-forget last:

1. The camera: camera-controls `update` (input, damping, transitions:
   ViewCube, fit, permalink pose), window resize. Between loads a
   `controlstart` alone doesn't paint (the move after it does), and the
   camera updates before the renderer in the frame rather than after it
   (`IfcContext#updateAllComponents`), so a frame shows this frame's pose.
   Both cut the first input from idle by a frame.
2. `requestPaint()` (`renderDemand.js`), callable from anywhere, for what
   three gives no signal for: `visible`, material colour, opacity and
   wireframe, outline selections (IfcHighlighter, the isolation outline),
   lights and look parameters, placemark colours, the cut-plane arrows.
   `renderOnDemandSources.test.js` lists every file that makes one of those
   mutations and fails on a new, unaudited one.
3. Hooks on three's own change signals, installed only when the session
   is on demand (`renderDemandHooks.js#installSceneHooks`): `Object3D#add`/`attach`/
   `remove`, the BatchedMesh mutators (`setColorAt`, `setVisibleAt`, …), and
   `needsUpdate` on materials, textures and attributes. They ask for a
   background paint (the next frame between loads, the budget during one),
   and ignore what three mutates while it draws (`runPaint`; BatchedMesh
   rebuilds its indirect texture in `onBeforeRender`).
4. A per-frame probe of what a paint reads that costs microseconds
   (`createSceneProbe`): camera pose and projection, drawing-buffer size and
   pixel ratio, cut planes, scene background/environment/root children,
   tone mapping. Snapshotted at each paint.
5. A settle window (`SETTLE_MS`, 200 ms of painting) after user input on
   the page (not a bare press), a pointer move over the canvas, and any
   store change
   (CadView subscribes): for the change a React effect applies a frame
   after the event. During a load these are background asks.
6. `keepPainting()` for what changes on its own clock: a scene with Spark
   splats paints every frame, since the sort lands asynchronously.

Tests that a source does ask: `renderDemand.test.js`,
`renderDemandHooks.test.js` and the behavioural half of
`renderOnDemandSources.test.js` (hooks off, so only the source's own ask can
pass); `renderOnDemandMode.test.js` (the default, the kill switch, the
rollback beating a URL opt-in); `renderOnDemand.spec.ts` (desktop + mobile,
on the default URL) checks that an idle viewer stops painting, that a drag
(through its damping tail), a selection and a resize repaint, and that a
fresh parse in the engine worker and a GLB cache hit each end on a current
frame, with the last on-demand paint matching a forced fresh one; its
`?feature=disableRenderOnDemand` leg checks that an idle viewer keeps
painting. The E2E `captureRenderedFrame` asks for its own paint, so it works
either way.

**Overlay paints (`?feature=hoverOverlay`, default off).** On a batched
model a hover change used to recolour the hovered instance in place
(`batchedHighlight.js`), which the hooks turn into a full paint: the whole
model redrawn for one element's colour. Measured on an M2 Air (a repaint
probe forcing 60 repaints of a still view; GPU time to a WebGL2 fence after
the draw): Momentum (72 k triangles) 9.2 ms GPU p50, of which ~9 ms is the
screen-size floor at DPR 2; Seestrasse (1.06 M) 21.7 ms; PSB (12.0 M)
47 ms, p95 106 ms, so on PSB the hover landed about three frames late. With
the flag on, `viewer/three/hoverOverlay.js` keeps a copy of the scene's
colour and depth as the RenderPass left them at every full paint, and a
hover change asks for a third kind of paint, `requestOverlayPaint()`
(`RenderDemand#frameKind` returns `PaintKind.OVERLAY`): the frame copies
that cache back into the composer's input buffer instead of running the
scene passes (RenderPass, and the AO NormalPass when on), draws only the
hovered instances on it with their own batch, material and program
(narrowed draw list, colour swapped for the draw and back), depth-tested
LEQUAL against the cached depth, then runs the post passes as any frame
does. A full paint draws the overlay too, so the hover looks the same on
either kind of frame; the one difference from the recolour is that where
another surface lies at the same 16-bit depth code, the hovered one wins.
Where the overlay can't draw a hover (a transparent or transmissive
batch, no per-instance colours) the hover recolours as before. The A/B
is in the PR that added it, and design/new/glb-export-premium.md §1.1d
"What a hover pick costs after it" has the summary.

*The invalidation rule:* a frame is an overlay frame only when the overlay's
ask is the ONLY thing pending in a session between loads. Anything else
makes it a full paint, which re-captures the cache: any `requestPaint()`
(visibility, material colour, outlines, lights, looks, cut-plane arrows,
residency), any hook (`add`/`attach`/`remove`, so model load and unload;
`setColorAt`, so selection and colour modes; `setVisibleAt`, so hide,
isolate and residency; `setMatrixAt` and the rest of `batchedEdit`;
`needsUpdate` on materials, textures and attributes), a camera `update`
(damping included), a resize, a probe change (pose, projection, canvas size
and DPR, cut planes, background, tone mapping), a settle window, a
`keepPainting` hold, a load scope and a restored context. On top of that
`HoverOverlay#canCompose` refuses (and a full paint is drawn) with no
capture yet, after a resize (`setSize` drops the cache) or a context loss,
from a multisampled buffer, or when the camera pose, projection or buffer
size differ from the capture's. `hoverOverlay.test.js` has one test per
source; `renderOnDemandSources.test.js` holds the overlay-only asks to the
one file allowed to make them. With the flag on, a canvas `pointermove` no
longer opens a settle window (it would repaint in full for 200 ms after
every move, and the overlay would save nothing); what a canvas pointer move
changes asks for itself instead (`ShareViewer#highlightIfcItem`, a full
`requestPaint` on every hover path but the overlay's, and
`MeshClipper#setArrowColor`). The flag does nothing while the viewer paints
every frame (`hoverOverlayMode.js`). A throw in the overlay's render path
turns it off for the viewer's life (GA `hover_overlay_disabled {stage}`),
repaints in full and lets the hover recolour. The cache costs one colour +
depth target at drawing-buffer size (~25 MB at 2560×1600).

**Rolling back.** Whether the session paints on demand is one decision,
`viewer/three/renderOnDemandMode.js#paintEveryFrameReason`, read when the
viewer is built (a theme change rebuilds it and reads it again).
- *Prod-wide:* set `disableRenderOnDemand` to `isActive: true` in
  `FeatureFlags.js` and deploy. The predicate reads that static value
  before any URL flag, so every viewer paints every frame between loads,
  including links that still carry `?feature=renderOnDemand`. Loads stay
  on demand (#2043), as they were before #2055.
- *Not* `renderOnDemand: false`. `isFeatureEnabled` ORs a static flag with
  the URL, so that would leave every `?feature=renderOnDemand` link (the
  burn-in links, older bug reports) on demand. The same trap as
  `engineWorker` (engine-worker.md §7.2, Codex review on #2083).
- *One session:* `?feature=disableRenderOnDemand`, the first thing to try
  on a stale-frame report: if the frame is right with it and wrong without,
  a change source isn't asking. Fix it at the source (`requestPaint()`, or
  a hook) and add it to `renderOnDemandSources.test.js`.
- *To confirm which mode a page is in:* `?feature=perf` reads 0 FPS on an
  idle on-demand viewer and the display rate otherwise; from devtools,
  `store.getState().viewer.context.getRenderDemand().isSession`.
  The mode is also on every Sentry event as the `render_mode` tag and
  counted in GA as the `render_mode` event (`reportRenderMode.js`, once per
  page load): `on-demand` or `every-frame:<reason>`.

Perf instrumentation attaches at that seam, not inside the closure:

```js
// IfcHighlighter constructor:
context.setRenderUpdate(withPerf(newUpdateFunction(context, getComposer)))
```

`withPerf` (in `src/utils/PerfMonitor.js`) is gated on the
`?feature=perf` URL flag, evaluated once at module load:

- **Flag off (default):** `withPerf(fn)` returns `fn` unchanged. The
  render closure has no perf code; `window.perf` is not defined; no DOM
  or sampling state is created. Zero per-frame cost.
- **Flag on:** `withPerf` returns a wrapper that brackets `fn()` with
  `monitor.begin()` / `monitor.end(painted)`. The render closure returns
  whether it painted, and only painted frames count toward FPS and MS, so
  a viewer painting on demand reads 0 FPS when idle. The Monitor singleton is built
  at module load but **not** attached to the DOM yet; sampling runs on
  the offscreen canvases regardless. `window.perf` is installed for
  show/hide/toggle from devtools.

The panel is docked in the bottom bar, immediately left of the
Help/Bot control — wrapped with that control in a small sub-stack
inside `src/Containers/BottomBar.jsx` so the outer
`justifyContent='space-between'` doesn't float perf into the middle
of the bar. `src/Components/AppBar.jsx` is *not* used by the running
app (the real chrome is the `ControlsGroup` / `OperationsGroup` /
`BottomBar` trio laid out by `RootLandscape`).

`src/Components/PerfToolbarSlot.jsx` is the only React bridge: it
reads the module-level `isPerfEnabled` exported from `PerfMonitor.js`
(same source of truth as `window.perf` — synchronous, never lags a
render the way `useExistInFeature` would), renders a `<Box ref>`, and
bridges mount/unmount via `mountPerfPanel(slotEl)` /
`unmountPerfPanel()` from `PerfMonitor.js`. No mobile gate — the
panel needs to be visible on mobile (where users can't reach a
devtools console) and the bottom bar has enough lateral room across
form factors.

The panel is **on by default** when `?feature=perf` is set — the
canvas wrapper is created without `display:none` and `mountPerfPanel`
just `appendChild`s it. `window.perf.off()` / `on()` /  `toggle()`
remain available for developers who want to hide/show it without
reloading, and `window.perf.fps()` reads the FPS it shows.

Three panels rotate on click — FPS, frame time (ms), JS heap MB (the
last only where Chromium's `performance.memory` is available). The
module is a minimal port of mrdoob's stats.js — the panel the three.js
examples use.

Offscreen renders (screenshots taken via
`ShareViewer.takeScreenshot()` -> `IfcRenderer.newScreenshot`) are
**not** instrumented; they take a different render path and would
distort steady-state FPS samples.

## Authentication & Collaboration
- Auth0 integration for user authentication
- GitHub integration for model versioning and storage
- Real-time notes and annotations system
- Public/private repository support

## Recent Files & `lastModifiedUtc`

Recent file entries are stored in `localStorage` via `src/connections/persistence.ts`.
Each entry has an `id` which for GitHub files is the **share path**:
`/share/v/gh/{org}/{repo}/{branch}/{filepath}` (with a leading `/` before filepath).

The `lastModifiedUtc` field (epoch ms of the latest commit) is back-filled after load via two paths:

1. **OPFS path** (primary, for OPFS-capable browsers): `Loader.js` passes an `onLastModifiedGithub`
   callback to `downloadModel`. The OPFS worker fetches the latest commit hash/date via
   `fetchLatestCommitHash`, stores it in the HTTP cache as the `LastModifiedGithub` header, and
   includes it in the worker's `postMessage`. The callback fires and calls
   `updateRecentFileLastModified(sharePath, epochMs)`.

2. **Hook path** (fallback): `useGithubLastModified` in `Share.jsx` calls `getCommitsForFile`
   directly and updates the entry.

### `filepath` format contract

`modelPath.filepath` (from the routes layer) has **no leading slash** — it is stripped by
`splitAroundExtensionRemoveFirstSlash`. Functions that build share paths must prepend `/`:

```js
// Correct
navigateBaseOnModelPath(org, repo, branch, `/${modelPath.filepath}`)

// Wrong — produces .../branchfilename with no separator
navigateBaseOnModelPath(org, repo, branch, modelPath.filepath)
```

`navigateBaseOnModelPath` simply concatenates: `` `/share/v/gh/${org}/${repo}/${branch}${filePath}` ``.
Always pass `filePath` with a leading `/`.

This application is a comprehensive CAD/BIM collaboration platform with advanced
3D rendering, real-time collaboration, and extensive model format support.
