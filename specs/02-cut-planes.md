# Spec: Cut Planes (Section/Plan/Elevation)

## Overview
Three-axis clipping plane system for creating section, plan (floor plan), and elevation views. Supports both IFC and GLB models with URL-shareable state.

## Current Behavior
- **Section** (X-axis): `normal = (-1, 0, 0)` — vertical cut through model
- **Plan** (Y-axis): `normal = (0, -1, 0)` — horizontal cut (floor plan)
- **Elevation** (Z-axis): `normal = (0, 0, -1)` — front/back cut
- Planes positioned at model bounding box center + user offset
- GPU clipping only — no section fills, no edge lines

## Key Files
| File | Role |
|------|------|
| `src/Components/CutPlane/CutPlaneMenu.jsx` | UI menu, plane creation/deletion, offset calculation |
| `src/store/CutPlanesSlice.js` | Zustand state: `cutPlanes[]` of `{direction, offset}` |
| `src/Components/CutPlane/hashState.js` | URL persistence: `#cp:y=17.077,x=-25.551` |
| `src/Infrastructure/GlbClipper.js` | GLB: interactive arrows, raycaster drag, Plane creation |
| `src/Infrastructure/CutPlaneArrowHelper.ts` | Arrow mesh for GLB drag handles |

## State Shape
```javascript
{
  cutPlanes: [{ direction: 'x'|'y'|'z', offset: number }],
  isCutPlaneActive: boolean,
}
```

## URL Hash Format
```
#cp:y=17.077,x=-25.551,z=5.741
```
Prefix: `cp:`, key-value pairs for each active axis.

## IFC vs GLB Implementation
| | IFC | GLB |
|---|---|---|
| Plane creation | `viewer.clipper.createFromNormalAndCoplanarPoint(normal, point)` | `GlbClipper.createPlane(normal, point, direction, offset)` |
| Plane deletion | `viewer.clipper.deleteAllPlanes()` | `GlbClipper.deleteAllPlanes()` |
| Interactive drag | No | Yes (arrow helpers with raycaster) |
| Visual feedback | None | Green arrows, yellow on hover |

## GlbClipper Details
- Raycaster picks arrow meshes on mousedown
- Drag computes movement projected onto plane normal axis
- Updates `THREE.Plane` constant in real-time during drag
- Arrow scale derived from model bounding sphere
- Hover highlighting with color change (green → yellow)
- Depth-test disabled on arrows for always-visible overlay

## What's Missing for True Floor Plans
1. Orthographic camera (currently perspective only)
2. Dual clipping planes (top + bottom slab per storey)
3. Section fill rendering (solid surfaces at cut)
4. Section edge lines (boundary at intersection)
5. Storey-aware automatic positioning (IfcBuildingStorey data exists but unused)
6. Per-category line weight/color differentiation
7. Plan navigation mode (pan-only, no orbit)
