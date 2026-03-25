# Spec: Viewer Core

## Overview
The 3D model viewer is the central component. It loads IFC, GLB, OBJ, STL, FBX, PDB, XYZ, and BLD files, renders them via Three.js, and provides selection, highlighting, and isolation.

## Architecture

```
CadView.jsx (container)
  └── ViewerContainer.jsx (canvas host)
        └── IfcViewerAPIExtended (extends ThatOpen IfcViewerAPI)
              ├── Three.js renderer, scene, camera
              ├── CustomPostProcessor (EffectComposer + OutlineEffect)
              ├── IfcHighlighter (selection outlines via postprocessing)
              ├── IfcIsolator (hide/show/isolate elements via subsets)
              ├── IfcElementsStyleManager (per-element custom colors)
              └── GlbClipper (GLB-specific clipping with drag arrows)
```

## Key Files
| File | Role |
|------|------|
| `src/Containers/CadView.jsx` | Main container, model loading orchestration, state wiring |
| `src/Containers/viewer.js` | `initViewer()` / `disposeViewer()` — lifecycle |
| `src/Infrastructure/IfcViewerAPIExtended.js` | Extended viewer: selection, floor queries, screenshots |
| `src/Infrastructure/CustomPostProcessor.js` | Three.js EffectComposer + RenderPass + EffectPass |
| `src/Infrastructure/IfcHighlighter.js` | OutlineEffect for selection/preselection highlights |
| `src/Infrastructure/IfcIsolator.js` | Element visibility via createSubset/removeSubset |
| `src/Infrastructure/IfcElementsStyleManager.js` | Per-element color override via parser.streamMesh interception |
| `src/loader/Loader.js` | Multi-format file loading pipeline, OPFS caching |

## Dependencies
- `web-ifc-viewer` v1.0.209 (custom local tarball `web-ifc-viewer-1.0.209-bldrs-7.tgz`)
- `three` 0.135.0
- `postprocessing` 6.29.3
- `@bldrs-ai/conway-web-ifc-adapter` 0.23.954-2 (optional WASM backend)
- `@bldrs-ai/ifclib` 5.3.3 (type-safe IFC schema)

## Viewer Initialization
```javascript
const viewer = new IfcViewerAPIExtended({ container, backgroundColor })
viewer.IFC.setWasmPath('./static/js/')
viewer.clipper.active = true
viewer.clipper.orthogonalY = false  // No orthographic support
```

## WASM Backends
- `USE_WEBIFC_SHIM=true` (default): Conway engine
- `USE_WEBIFC_SHIM=false`: Native web-ifc

## IFC Data Access Pattern
```
viewer.IFC.loader.ifcManager
├── parser                    — WASM parser interface
├── getSpatialStructure()     — IFC hierarchy tree
├── getExpressId()            — Geometry face → expressID
├── createSubset()            — Render filtered element set
├── removeSubset()            — Remove a subset
├── idsByType()               — Query by IFC type
├── getItemProperties()       — Element properties
└── getIfcType()              — expressID → IFC type name
```

## Known Issues
- Module-level `count` and `previousThemeChangeCb` in CadView (should be refs)
- `orthogonalY = false` prevents orthographic plan views
- Old Three.js version (0.135.0) limits available features
