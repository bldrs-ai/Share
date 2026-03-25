# Spec: ThatOpen v2 Floor Plan Architecture (Reference)

## Overview
How ThatOpen (formerly IFC.js) implements architectural-quality floor plans. This is the reference implementation we're comparing bldrs-share against.

## Package Structure
| Package | Scope |
|---------|-------|
| `@thatopen/components` | Core, platform-agnostic: Views, Clipper, OrthoPerspectiveCamera, Classifier |
| `@thatopen/components-front` | Browser-only: ClipStyler, ClipEdges, PostproductionRenderer |
| `@thatopen/fragments` | Low-level geometry engine with Web Workers |

## Floor Plan Pipeline

### Step 1: Create Views from Storeys
```typescript
views.createFromIfcStoreys(config)
```
- Reads IfcBuildingStorey Name + Elevation
- Creates a `View` per storey at `elevation + offset` (default +0.25m above floor)
- Each View has **TWO clipping planes**: `plane` (near) + `farPlane` (far, at `range` distance)
- Each View gets its own `OrthoPerspectiveCamera` set to orthographic + Plan mode

### Step 2: Configure Section Styles
```typescript
clipStyler.createFromView(view, { items: classifiedElements })
```
- Links a `ClipEdges` instance to the view
- Accepts per-IFC-category styles: line material + fill material
- Example: thick blue lines for walls, thin green for doors

### Step 3: Open a Plan View
```typescript
views.open(id)
```
- Enables both clipping planes → GPU clips everything outside the slab
- Swaps camera to the view's orthographic camera
- Camera enters Plan mode (orbit disabled, pan only)
- ClipEdges become visible

### Step 4: Compute Section Geometry
```typescript
ClipEdges.update()
```
- For each style/category: calls `model.getSection(plane, localIds)` in a **Web Worker**
- Worker computes **plane-triangle intersections**
- Returns `Float32Array` of edge line segments + triangulated fill polygon indices
- **Edges**: rendered as `LineSegments2` with `LineMaterial` (GPU thick lines)
- **Fills**: rendered as `THREE.Mesh` with triangulated fill geometry

### Step 5: Post-Processing (Optional)
```typescript
PostproductionRenderer
```
- Renders meshes to vertex-color buffer
- Sobel-like edge detection on depth + normal differences
- Overlays detected edges onto final image

## Key Technical Detail: Geometric Intersection, NOT Stencil
ThatOpen computes actual plane-mesh intersections in a Web Worker. This produces real vector geometry (not GPU stencil tricks):
- Exportable to DXF/SVG
- Per-category line weights
- Per-material fill colors
- Resolution-independent

## Component Reference
| Component | Role |
|-----------|------|
| `Views` | Collection manager for plan/section/elevation views |
| `View` | Single view: 2 planes + dedicated ortho camera |
| `OrthoPerspectiveCamera` | Ortho/perspective toggle with smooth transitions |
| `PlanMode` | Disables orbit, pan-only navigation |
| `Clipper` / `SimplePlane` | Interactive clipping with TransformControls |
| `ClipStyler` | Named styles (LineMaterial + fill Material) per category |
| `ClipEdges` | Computes + renders section edges and fills |
| `Classifier` | Groups elements by IFC category for styling |
| `PostproductionRenderer` | Screen-space edge detection post-processing |
| `FragmentsModel.getSection()` | Web Worker plane-mesh intersection |

## Side-by-Side Summary

| Feature | bldrs-share | ThatOpen v2 |
|---------|------------|-------------|
| Camera | Perspective only | Ortho + perspective toggle |
| Clipping | 1 plane per axis | 2 planes per view (slab) |
| Storey awareness | Data exists, unused | Auto-creates views from IfcBuildingStorey |
| Section fills | None | Geometric fill polygons |
| Section edges | None | LineSegments2 with configurable width |
| Per-category styling | No | Yes (Classifier + ClipStyler) |
| Plan navigation | Standard orbit | Pan-only mode |
| Section computation | GPU clipping only | Web Worker geometric intersection |
| 2D export | No | DXF via geometry |
| URL state sharing | Yes | Not built-in |
| Multi-axis sections | Yes (X+Y+Z simultaneous) | Per-view |
| GLB drag controls | Yes (custom arrows) | TransformControls |
