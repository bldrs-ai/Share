# Bldrs Share — Fork

Fork of [bldrs-ai/Share](https://github.com/bldrs-ai/Share) with custom extensions.

## Dev Server

```bash
# Production config with real proxy URLs, no MSW mocking
MSW_IS_ENABLED=false SHARE_CONFIG=prod serveHttps=false yarn serve-share-conway
```

After restart, clear site data in Chrome DevTools → Application → Storage.
Enable "Disable cache" in DevTools → Network tab.

Port 8080 (frontend) + 8079 (esbuild backend).

## Build Versioning

Build number shown top-center of the viewport. Increment in `src/Containers/TopBar.jsx` on each deploy.

Current build: **060**

| Build | Changes |
|-------|---------|
| 001 | Build version indicator added |
| 002 | Icon size 40px → 24px, button size 3em → 2.25em |
| 003 | Onboarding popup disabled |
| 004 | Help moved to top-right |
| 005 | Cache-busting headers, service worker auto-unregister |
| 006 | All icons in left toolbar, service worker cleanup |
| 007 | Left toolbar with all tools, OperationsGroup removed from center |
| 008 | All controls consolidated in left toolbar |
| 009 | Expand/collapse with section labels |
| 010 | Expand shows inline icon + text labels |
| 011 | Full-height left nav, Bldrs logo at bottom, outlined MUI icons |
| 012 | Marker control removed from left nav |
| 013 | Memory leak fixes: viewer disposal, GPU cleanup, event handler cleanup |
| 014 | Recent Models tab in Open dialog |
| 015 | Test Models tab: browseable local IFC test models from testdata/ |
| 016 | Floor plan view feature |
| 017 | Icons 20px, buttons 2em, stroke-width experiment |
| 018 | All toolbar icons replaced with Lucide React (thin strokes) |
| 019 | Profile + FloorPlan icons switched to Lucide |
| 020 | Fixed Bldrs logo (use img instead of SvgIcon) |
| 021-024 | TopBar, left nav full-height, drawer offsets, resizer thin line |
| 025 | Nav tree: Lucide eye/chevron icons, hover-to-show hide, 13px font |
| 026-028 | z-index fixes, SideDrawer offsets, transparent panel backgrounds |
| 029-030 | Build version in TopBar, nav drawer margin fixes |
| 031 | NavTree spatial/types icons switched to Lucide |
| 032-033 | Selected icon turns bldrs green, transparent background |
| 034 | Open dialog: consistent compact list style across all tabs |
| 035 | Light/shadow toggle, BLDRS skyline model |
| 036 | Individual app icons replace app store, Divider separator |
| 037-038 | PanelLeft toggle icon (Insight style), CSS width transition |
| 039-058 | TopBar, ViewerToolbar, apps drawer, section plane grid, LightManager, NavCube |
| 059 | NavSphere: brighter wireframe, background disc, drag-to-orbit, clickable axis dots |
| 060 | NavSphere arrows (Lucide chevrons), ViewerToolbar/NavCube floor plan offset, floor plan toggle + title bar, app icon toggle + green highlight, Company/Project/Model data layer (IndexedDB + OPFS), ProjectAdmin dialog (Companies/Projects/Models tabs with version control), ProjectSelector breadcrumb + reload, MessageChannel extensions (getProjectContext/loadAppData/saveAppData) |

## UI Architecture (Overlay-based)

The UI uses absolute-positioned overlays on top of the Three.js canvas. A VS Code-style flex layout was attempted (builds 039-048) but caused blank pages because Three.js needs real pixel dimensions at canvas creation time. The flex approach (AppShell.jsx) was abandoned.

**Layout stack (z-index order):**
- `ViewerContainer` — Three.js canvas, absolute top:0 left:0, adjusts width for apps drawer
- `LeftToolbar` — absolute left strip (40px collapsed, 160px expanded), top:40px
- `TopBar` — absolute top bar (40px tall), contains build version + app icons + profile/help
- `ViewerToolbar` — floating pill bar centered below top bar (camera/light/wireframe/projection controls)
- `NavCube` — bottom center, shifts left when apps drawer opens
- `SideDrawer` — right-side panels (NavTree, Properties, Apps, etc.)

**Key state:**
- `isAppsVisible` / `appsDrawerWidth` — controls viewer canvas width + NavCube position
- `selectedElement` — drives Properties panel + selection sync to iframe apps
- `isModelReady` — gates terrain, floor plan, app icons in TopBar

## Our Changes vs Upstream

Key files changed from upstream `bldrs-ai/Share`:

**Layout & containers:**
- `src/Containers/CadView.jsx` — fixed updateLoadedFileInfo, added recent model tracking
- `src/Containers/viewer.js` — disposeViewer() for proper cleanup, ResizeObserver
- `src/Containers/LeftToolbar.jsx` — new: consolidated vertical toolbar (expandable)
- `src/Containers/TopBar.jsx` — new: top bar with build version, app icons, profile/help
- `src/Containers/ViewerToolbar.jsx` — new: floating viewer controls (fit, reset, light, wireframe, projection)
- `src/Containers/ViewerContainer.jsx` — width adjusts for apps drawer, ResizeObserver for resize
- `src/Containers/RootLandscape.jsx` — new layout with all overlay components

**Components:**
- `src/Components/NavCube/NavCube.jsx` — Three.js NavSphere with drag-to-orbit, axis dots, background disc
- `src/Components/Apps/AppsMessagesHandler.js` — getFileData via OPFS, selection sync, dispose()
- `src/Components/Apps/AppsRegistry.json` — 3 apps: Dashboard, IFC Inspector, IFC Quantities
- `src/Components/Apps/AppIFrame.jsx` — appPrefix URL resolution, channel cleanup
- `src/Components/Open/LocalModels.jsx` — browseable test models from testdata/
- `src/Components/Open/RecentModels.jsx` — recent models in localStorage
- `src/Components/Open/OpenModelDialog.jsx` — 5 tabs: Local, Recent, Test, GitHub, Samples
- `src/Components/Terrain/TerrainControl.jsx` — terrain overlay toggle
- `src/Components/FloorPlan/SVGFloorPlan/SVGFloorPlanView.jsx` — floor plan rendering

**Infrastructure:**
- `src/Infrastructure/CutPlaneGizmo.ts` — grid-pattern section plane visual
- `src/Infrastructure/GlbClipper.js` — unified clipper for IFC + GLB
- `src/Infrastructure/LightManager.js` — directional light + shadow toggle

**Store:**
- `src/store/useStore.js` — added TerrainSlice
- `src/store/SideDrawerSlice.jsx` — apps drawer default = 50% screen width
- `src/store/TerrainSlice.js` — terrain state

**Theme & styles:**
- `src/Styles.jsx` — 18px icons, hover-to-show nav tree hide buttons
- `src/theme/Components.js` — 2em buttons, 6px radius, bldrs green (#00ff00) for selected
- `src/privacy/firstTime.js` — onboarding disabled

**Build & deploy:**
- `public/index.html` — cache-busting headers, SW unregister
- `tools/esbuild/proxy.js` — serves /testdata/ from disk
- `netlify.toml` — SPA fallback redirect
- `package.json` — added lucide-react dependency

## Known Issues & Deferred Work

- **VS Code flex layout**: AppShell.jsx exists but is NOT wired in. Three.js needs pixel dimensions at init.
- **Section planes**: Work but could be improved (stencil caps, TransformControls for positioning).
- **Netlify free tier**: Bandwidth can be exhausted by frequent deploys.
- **Style/theme page**: User wants a theme selector (like Insight's Warm/Cool/Yello) — not yet built.
- **Architect agent**: Can generate IFC files via direct STEP text. More building models wanted.

## IFC File Creation

Conway is read-only. For creating IFC files:
- **web-ifc**: `CreateModel()` + `WriteLine()` + `SaveModel()` — WASM-based, entity-level
- **Direct STEP text**: template-based string generation with entity counter + GUID generator
- **IfcOpenShell (Python)**: highest-level API via `ifcopenshell.api`, can be called as subprocess
