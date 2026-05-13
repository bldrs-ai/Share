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
- Dual build targets: Conway engine (default) and web-ifc
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
3. IFC processing with Conway or web-ifc engines
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
  `monitor.begin()` / `monitor.end()`. The Monitor singleton is built
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
reloading.

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
