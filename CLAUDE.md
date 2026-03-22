# Bldrs Share — Fork

Fork of [bldrs-ai/Share](https://github.com/bldrs-ai/Share) with custom extensions.

## Dev Server

```bash
# Production config with real proxy URLs, no MSW mocking
MSW_IS_ENABLED=false SHARE_CONFIG=prod serveHttps=false yarn serve-share-conway
```

After restart, clear site data in Chrome DevTools → Application → Storage.
Enable "Disable cache" in DevTools → Network tab.

## Build Versioning

Build number shown top-center of the viewport. Increment in `src/Containers/RootLandscape.jsx` on each deploy.

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

## Our Changes vs Upstream

Key files changed from upstream `bldrs-ai/Share`:
- `src/Containers/CadView.jsx` — fixed updateLoadedFileInfo, added recent model tracking
- `src/Containers/viewer.js` — disposeViewer() for proper cleanup
- `src/Containers/LeftToolbar.jsx` — new: consolidated vertical toolbar
- `src/Containers/RootLandscape.jsx` — new layout with left toolbar
- `src/Containers/BottomBar.jsx` — simplified (About + Bot only)
- `src/Containers/OperationsGroup.jsx` — simplified (unused in current layout)
- `src/Components/Apps/AppsMessagesHandler.js` — getFileData handler, selection push, dispose()
- `src/Components/Apps/AppsRegistry.json` — Dashboard App, IFC Inspector, IFC Quantities
- `src/Components/Apps/AppIFrame.jsx` — appPrefix URL resolution, channel cleanup
- `src/Components/Apps/AppEntry.jsx` — compact layout with appName
- `src/Components/Apps/AppsListing.jsx` — vertical list layout
- `src/Components/NavCube/NavCube.jsx` — new: orientation cube
- `src/Components/Open/LocalModels.jsx` — new: test model browser
- `src/Components/Open/RecentModels.jsx` — new: recent models
- `src/Components/Open/OpenModelDialog.jsx` — added Recent + Test Models tabs
- `src/Infrastructure/CutPlaneGizmo.ts` — new: grid-pattern section plane visual
- `src/Infrastructure/GlbClipper.js` — unified clipper for IFC + GLB
- `src/Components/CutPlane/CutPlaneMenu.jsx` — simplified, no IFC/GLB branching
- `src/Styles.jsx` — 24px icons
- `src/theme/Components.js` — smaller button sizes
- `src/privacy/firstTime.js` — onboarding disabled
- `public/index.html` — cache-busting headers, SW unregister
- `tools/esbuild/proxy.js` — serves /testdata/ from disk
- `netlify.toml` — SPA fallback redirect

## Upstream Baseline

Branch `upstream-baseline` tracks `bldrs-ai/Share` main exactly.
Compare with: `git diff upstream-baseline --stat -- src/ public/ netlify.toml`

## IFC File Creation

Conway is read-only. For creating IFC files:
- **web-ifc**: `CreateModel()` + `WriteLine()` + `SaveModel()` — WASM-based, entity-level
- **Direct STEP text**: template-based string generation with entity counter + GUID generator
- **IfcOpenShell (Python)**: highest-level API via `ifcopenshell.api`, can be called as subprocess
