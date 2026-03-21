# xeokit-sdk — Section Planes Analysis for Three.js Porting

## Key Finding
xeokit uses its OWN WebGL2 renderer — NOT Three.js. Plugins cannot be used standalone.
But the architectural patterns port cleanly to Three.js.

## xeokit Clipping Architecture
- SectionPlane: pos (vec3) + dir (vec3) → shader discard
- Shader: `if (dot(-dir, worldPos - pos) > 0) discard;`
- Pre-allocated plane slots to avoid shader recompilation

## Three.js Equivalents
| xeokit | Three.js |
|--------|----------|
| SectionPlane (pos+dir) | THREE.Plane (normal+constant) |
| Custom shader discard | renderer.clippingPlanes (built-in) |
| TransformControl gizmo | THREE.TransformControls |
| Overview canvas | Second WebGLRenderer + synced camera |
| SectionCaps (Earcut) | three-bvh-csg or stencil buffer |
| CrossSections coloring | onBeforeCompile or stencil |

## SectionPlanesPlugin Components
1. **SectionPlanesPlugin**: Creates/manages planes, control pool
2. **Overview**: Separate canvas, camera sync (direction only, dist=7), picking
3. **Plane**: Thin box mesh (0.5×0.5×0.001) in overview, color states
4. **TransformControl**: 3-axis gizmo, screen-size-constant, pickable handles

## Why Our First Attempt Failed
- GlbClipper sets `renderer.clippingPlanes` but IFC uses web-ifc-viewer's
  internal clipper which applies planes to `context.items.ifcModels` and
  `ifcManager.subsets` — completely separate material pipeline
- The IFC clipper (`IfcClipper`) uses `context.addClippingPlane()` and
  `updateMaterials()` which traverses IFC-specific material references
- Our gizmo replaced the arrow but the clipping was never connected

## Correct Approach for Bldrs Share
1. **Keep viewer.clipper** for actual IFC clipping (it works)
2. **Hide its controls**: `ifcPlane.visible = false` after creation
3. **Overlay our gizmo**: CutPlaneGizmo positioned at same point
4. **Sync drag**: On gizmo drag, update `ifcPlane.plane` + `ifcPlane.helper.position`
5. **Call `viewer.clipper.updateMaterials()`** after each drag update

## What the IFC IfcClipper.updateMaterials() Does
```javascript
// Applies to ALL IFC-specific material targets:
context.items.ifcModels.forEach(model => model.material.clippingPlanes = planes)
ifcManager.subsets.getAllSubsets().forEach(subset => subset.mesh.material.clippingPlanes = planes)
```
This is why setting renderer.clippingPlanes alone doesn't work for IFC.

## Phase Plan
Phase 1: Replace arrow visual, add slider (keep IfcClipper for clipping)
Phase 2: Stencil buffer caps, TransformControls
Phase 3: Overview minimap, section box, click-to-create
