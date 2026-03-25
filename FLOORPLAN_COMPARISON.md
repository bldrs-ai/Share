# Floor Plan Feature: bldrs-share vs ThatOpen Comparison

## 1. bldrs-share — Current Floor Plan Implementation

### Architecture
- Built on `web-ifc-viewer` v1.0.209 (custom local tarball: `web-ifc-viewer-1.0.209-bldrs-7.tgz`)
- Extended via `IfcViewerAPIExtended` (inherits from `IfcViewerAPI`)
- Three.js `0.135.0`, `postprocessing` `6.29.3`
- WASM backend: Conway engine (`@bldrs-ai/conway-web-ifc-adapter`) or native `web-ifc`

### How Floor Plans Work Today
The app uses **single-axis clipping planes** to slice the 3D model. There is no dedicated "floor plan" mode.

**Components involved:**
| File | Role |
|------|------|
| `src/Components/CutPlane/CutPlaneMenu.jsx` | UI toggle for X/Y/Z cut planes |
| `src/Infrastructure/GlbClipper.js` | GLB-specific clipping with interactive drag arrows |
| `src/store/CutPlanesSlice.js` | Zustand state: `{direction, offset}` pairs |
| `src/Components/CutPlane/hashState.js` | URL persistence: `cp:y=17.077,x=-25.551,z=5.741` |
| `src/Infrastructure/IfcViewerAPIExtended.js` | `getByFloor(n)` — extracts IfcBuildingStorey data |
| `src/Containers/viewer.js` | Viewer init, `clipper.active = true`, `orthogonalY = false` |

**Plane creation (CutPlaneMenu.jsx:396-427):**
- Section: `normal = new Vector3(-1, 0, 0)` (X-axis)
- Plan: `normal = new Vector3(0, -1, 0)` (Y-axis)
- Elevation: `normal = new Vector3(0, 0, -1)` (Z-axis)
- Position: model bounding box center + user drag offset

**What it produces:** A 3D perspective view with geometry above/below the plane discarded by the GPU. No fills, no edge lines, no orthographic projection.

### What's Missing
1. **No orthographic camera** — `orthogonalY = false` is explicitly set
2. **Single clipping plane** — no top+bottom slab to isolate a storey
3. **No section fills** — cut surfaces show empty space, not solid hatching
4. **No edge/outline rendering at cut** — no visible boundary where the plane intersects geometry
5. **No storey-aware plan mode** — `getByFloor()` exists but isn't connected to the cut plane system
6. **No per-category styling** — walls, doors, slabs all clip the same way
7. **No 2D export** — no DXF or SVG output

---

## 2. ThatOpen v2 — Floor Plan Implementation

### Architecture
- `@thatopen/components` (core, platform-agnostic)
- `@thatopen/components-front` (browser-only, rendering)
- `@thatopen/fragments` (low-level geometry engine with Web Workers)
- Three.js (latest), own post-processing pipeline

### How Floor Plans Work

ThatOpen has a **dedicated multi-component pipeline** for architectural-quality floor plans.

**Components involved:**
| Component | Package | Role |
|-----------|---------|------|
| `Views` | core | Manages plan/section/elevation views per IfcBuildingStorey |
| `View` | core | Single view: two clipping planes + dedicated ortho camera |
| `OrthoPerspectiveCamera` | core | Toggles perspective/orthographic with smooth transitions |
| `PlanMode` | core | Disables orbit, enables pan-only navigation for 2D feel |
| `Clipper` / `SimplePlane` | core | Interactive clipping planes with TransformControls |
| `ClipStyler` | front | Manages named styles (line material + fill material) per category |
| `ClipEdges` | front | Computes + renders section edges and fill polygons |
| `Classifier` | core | Groups elements by IFC category (wall, door, slab, etc.) |
| `PostproductionRenderer` | front | Screen-space edge detection via depth+normal buffers |
| `FragmentsModel.getSection()` | fragments | Web Worker plane-mesh intersection math |

### The Floor Plan Pipeline (step by step)

1. **`views.createFromIfcStoreys(config)`**
   - Reads `IfcBuildingStorey` Name + Elevation from the model
   - Creates a `View` per storey with horizontal clipping plane at `elevation + offset` (default +0.25m)
   - Each `View` has TWO planes: `plane` (near) and `farPlane` (far, at `range` distance, default 15 units)
   - Each `View` gets its own `OrthoPerspectiveCamera` set to orthographic + Plan mode

2. **`clipStyler.createFromView(view, { items })`**
   - Links a `ClipEdges` instance to the view
   - Accepts per-category style config (e.g., thick blue lines for walls, thin green for doors)
   - Auto-updates when view changes, auto-disposes

3. **`views.open(id)`** — Activates a floor plan:
   - Enables both clipping planes on the renderer (GPU clips everything outside the slab)
   - Swaps camera to the view's orthographic camera in Plan mode
   - Makes ClipEdges visible

4. **`ClipEdges.update()`** — Generates section geometry:
   - For each style/category, calls `model.getSection(plane, localIds)` in a **Web Worker**
   - Worker computes **plane-triangle intersections** → returns `Float32Array` of edge segments + fill triangle indices
   - Edges: rendered as `LineSegments2` with `LineMaterial` (GPU thick lines, configurable width)
   - Fills: rendered as `THREE.Mesh` with `BufferGeometry` using triangulated fill polygons

5. **`PostproductionRenderer`** (optional, additive):
   - Renders all meshes to a vertex-color buffer
   - Sobel-like edge detection shader finds boundaries between elements
   - Overlays detected edges onto the final image

### Key Technical Detail: NOT Stencil-Based

ThatOpen computes **actual geometric intersections** (plane vs. mesh triangles) in a Web Worker. This produces real vector line segment geometry and triangulated fill polygons — not a GPU stencil trick. This matters because:
- The geometry is **exportable** (DXF, SVG)
- Line weights can vary **per IFC category**
- Fills can have **different colors** per material type
- Results are **resolution-independent**

---

## 3. Side-by-Side Comparison

| Feature | bldrs-share | ThatOpen v2 |
|---------|------------|-------------|
| **Camera** | Perspective only | Orthographic + perspective toggle |
| **Clipping planes** | 1 plane per axis | 2 planes per view (near + far slab) |
| **Storey awareness** | `getByFloor()` exists but unused by cut planes | `createFromIfcStoreys()` auto-creates views |
| **Section fills** | None | Geometric fill polygons (per-category colors) |
| **Section edges** | None | `LineSegments2` with configurable line width |
| **Per-category styling** | No | Yes, via `Classifier` + `ClipStyler` |
| **Plan navigation** | Standard 3D orbit | Pan-only mode (orbit disabled) |
| **Section computation** | GPU clipping only | Web Worker plane-mesh intersection |
| **Post-processing edges** | `OutlineEffect` (selection only) | Depth+normal edge detection (all geometry) |
| **2D export** | No | Yes (DXF via geometry) |
| **Interactive drag** | Yes (GlbClipper arrows) | Yes (TransformControls) |
| **URL state** | Yes (`cp:y=17.077`) | Not built-in (app-level concern) |
| **GLB support** | Yes (GlbClipper) | Via FragmentsModel |
| **Three.js version** | 0.135.0 | Latest |
| **IFC backend** | web-ifc / Conway WASM | @thatopen/fragments Web Workers |

---

## 4. Gap Analysis

### Must-have to match ThatOpen quality
1. **Orthographic camera for plan mode** — without this, floor plans will always look 3D
2. **Dual clipping planes (slab)** — isolate a storey slice, not just clip from one side
3. **Section edge lines** — visible boundary where the cut plane intersects geometry
4. **Section fills** — solid colored areas for cut surfaces

### Nice-to-have
5. **Per-category styling** — different line weights/colors for walls vs doors vs slabs
6. **Storey-driven plan creation** — auto-position cut from IfcBuildingStorey elevation data
7. **Plan navigation mode** — disable orbit, enable pan-only
8. **Post-processing edge rendering** — architectural outline look for all geometry
9. **2D export (DXF/SVG)** — downstream use in CAD tools

### What bldrs-share has that ThatOpen doesn't (out of the box)
- URL-shareable cut plane state (`cp:` hash params)
- Multi-axis simultaneous sections (X + Y + Z at once)
- GLB-specific interactive clipping with custom arrow helpers

---

## 5. Approach Options

### Option A: Prototype on ThatOpen v2
Build a standalone minimal viewer using `@thatopen/components` + `@thatopen/components-front`. Load the same IFC models. Compare floor plan quality side-by-side. Use findings to decide whether to migrate or backport.

### Option B: Backport techniques into bldrs-share
Keep current `web-ifc-viewer` v1 base. Implement:
1. Ortho camera toggle (Three.js native)
2. Dual clipping planes
3. Section fills via stencil buffer OR geometric intersection
4. Edge line rendering

### Option C: Full migration to ThatOpen v2
Replace `web-ifc-viewer` v1 with `@thatopen/components` v2. Rewrite `IfcViewerAPIExtended` and all Infrastructure code. Get all floor plan features for free.

### Recommendation
**Option A first** (prototype to evaluate), then decide between B and C based on results.
