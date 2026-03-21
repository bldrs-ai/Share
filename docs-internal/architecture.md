# Bldrs Share — Architecture

## Stack
- React 18 + Material-UI 5 + Zustand 4
- Three.js 0.135 via web-ifc-viewer (custom build)
- Conway WASM geometry engine via conway-web-ifc-adapter
- esbuild bundler, OPFS caching, Netlify deployment

## Directory Map
```
src/
  Components/     UI by feature (CutPlane, NavTree, Properties, Apps, Notes, etc.)
  Containers/     Layout + orchestration (CadView, RootLandscape, selection)
  Infrastructure/ 3D/IFC core (IfcViewerAPIExtended, GlbClipper, IfcIsolator)
  store/          18 Zustand slices
  loader/         Multi-format loading pipeline
  OPFS/           Web Worker caching via Origin Private File System
  net/github/     GitHub API with ETag caching
  routes/         URL→RouteResult (file, GitHub, Google Drive)
  WidgetApi/      iframe MessageChannel integration
```

## Rendering Pipeline
1. URL change → CadView.onModelPath → initViewer (Three.js scene)
2. Loader.js: detect format → OPFS cache check → fetch/proxy → parse
3. IFC: web-ifc WASM → mesh with expressID attributes
4. CadView.onModel: build element tree, setup selection materials, init isolator
5. Continuous render via requestAnimationFrame

## Clipping System (Current)
- IFC models: `viewer.clipper` (web-ifc-viewer's IfcClipper with TransformControls)
- GLB models: `GlbClipper.js` (custom, arrow drag controls)
- State: CutPlanesSlice + URL hash persistence
- Planes: axis-aligned only (x/y/z), no free-form

## Apps/Widget Integration
- AppsRegistry.json defines available apps
- AppIFrame.jsx loads app in iframe
- AppsMessagesHandler.js: MessageChannel with getFileData (OPFS-cached bytes)
- Dashboard App: receives raw IFC bytes, parses independently, shows KPIs

## Key Patterns
- IFC properties: `viewer.IFC.getProperties(modelID, expressID)`
- Selection: double-click → `selectedElement` in store → properties panel
- Hash state: camera, cut planes, selection, visibility persisted in URL
- GitHub proxy: `rawgit.bldrs.dev/model/` for CORS-safe file access
